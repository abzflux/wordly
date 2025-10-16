// WordlyBot Backend Server (Node.js/Express/PostgreSQL/Socket.IO)
// Deployed URL: https://wordlybot.onrender.com

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto'); // Used for mock InitData validation

// --- Configurations (from your project spec) ---
const PORT = 3000;
const DATABASE_URL = "postgresql://abolfazl:4scuYwwndssdrtMHcerfZh0SPb3h9Gy7@dpg-d3ogfobe5dus73antd2g-a.frankfurt-postgres.render.com/wordlydb_zjj5";
const BOT_TOKEN = "8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ";
const FRONTEND_URL = "https://wordlybot.ct.ws"; // Used for CORS

// --- Mock Telegram InitData Validation (!!! SECURITY WARNING !!!) ---
// This is a placeholder. In production, you MUST implement a proper HMAC-SHA256 
// validation against the BOT_TOKEN to prevent unauthorized requests.
function validateInitData(initData, botToken) {
    try {
        // Simple validation check: ensure 'user' data is present
        const data = initData.split('&').reduce((acc, part) => {
            const [key, value] = part.split('=');
            acc[key] = decodeURIComponent(value);
            return acc;
        }, {});

        const userMatch = data.user ? JSON.parse(data.user) : null;
        
        if (userMatch && userMatch.id) {
            // NOTE: In production, check data.hash using HMAC-SHA256(data_check_string, secret_key)
            return { isValid: true, user: userMatch };
        }
        return { isValid: false, error: 'Missing user ID in InitData' };

    } catch (e) {
        console.error("InitData parsing error:", e);
        return { isValid: false, error: 'Malformed InitData' };
    }
}

// --- Database Setup (PostgreSQL Pool) ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        // REQUIRED for Render PostgreSQL connection
        require: true,
        rejectUnauthorized: false 
    }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// --- Server Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL, // Restrict WebSocket connections to frontend URL
        methods: ['GET', 'POST'],
    }
});

// --- Middleware & Optimizations ---
app.use(compression()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Simple CORS for testing/deployment
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', FRONTEND_URL);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Rate Limiter for Guess Endpoint (Max 3 requests per 5 seconds)
const guessLimiter = rateLimit({
    windowMs: 5000, 
    max: 3, 
    message: { error: "Anti-cheat mechanism triggered: Too many guesses. Please slow down." },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- API Routes ---

// 1. Authentication and User Sync (Upsert)
app.post('/api/auth', async (req, res) => {
    const { initData } = req.body;
    
    const validationResult = validateInitData(initData, BOT_TOKEN);

    if (!validationResult.isValid) {
        return res.status(401).json({ error: 'Invalid Telegram InitData or missing hash check' });
    }

    const tgUser = validationResult.user;
    
    try {
        // Upsert user data: Insert if new, Update username if exists
        const result = await pool.query(
            `INSERT INTO users (telegram_user_id, username, created_at) 
             VALUES ($1, $2, NOW())
             ON CONFLICT (telegram_user_id) DO UPDATE 
             SET username = $2
             RETURNING telegram_user_id, username, total_score;`,
            [tgUser.id, tgUser.username || tgUser.first_name]
        );

        // In a real app, generate and return a session token/JWT here
        res.json({ success: true, user: result.rows[0], token: 'SESSION_TOKEN_MOCK' });

    } catch (error) {
        console.error('Database error during user upsert:', error);
        res.status(500).json({ error: 'Failed to authenticate user.' });
    }
});

// 2. Game Creation
app.post('/api/games', async (req, res) => {
    const { targetWord, creatorId } = req.body;
    
    if (!targetWord || targetWord.length < 3) {
        return res.status(400).json({ error: 'Target word must be at least 3 characters long.' });
    }

    // Max Guesses = floor(1.5 * length(target_word without spaces))
    const wordLength = targetWord.replace(/\s/g, '').length;
    const maxGuesses = Math.floor(1.5 * wordLength);
    
    try {
        const result = await pool.query(
            `INSERT INTO games (creator_id, target_word, status, max_guesses, created_at)
             VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *;`,
            [creatorId, targetWord.toUpperCase(), maxGuesses]
        );
        res.status(201).json({ success: true, game: result.rows[0] });
    } catch (error) {
        console.error('Database error during game creation:', error);
        res.status(500).json({ error: 'Could not create game.' });
    }
});

// 3. Fetch Games for Guessing Tab ('pending' or 'in_progress' by others)
app.get('/api/games/available/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            `SELECT * FROM games 
             WHERE creator_id != $1 
               AND (status = 'pending' OR (status = 'in_progress' AND guesser_id = $1)) 
             ORDER BY created_at DESC;`,
            [userId]
        );
        res.json({ success: true, games: result.rows });
    } catch (error) {
        console.error('Error fetching available games:', error);
        res.status(500).json({ error: 'Failed to fetch games.' });
    }
});

// 4. Submit Guess (The core game logic)
app.post('/api/games/:gameId/guess', guessLimiter, async (req, res) => {
    const { gameId } = req.params;
    const { guesserId, guessedLetter } = req.body;
    const letter = guessedLetter.toUpperCase();

    if (!letter || letter.length !== 1 || !/^[A-Z]$/.test(letter)) {
         return res.status(400).json({ error: 'Invalid guess. Must be a single letter.' });
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // Fetch game state and lock the row (FOR UPDATE)
        const gameRes = await client.query(
            `SELECT * FROM games WHERE id = $1 FOR UPDATE;`,
            [gameId]
        );

        const game = gameRes.rows[0];
        if (!game) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Game not found.' }); }

        // --- Game State Checks ---
        if (game.status === 'completed' || game.status === 'cancelled') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Game is already finished.' });
        }

        // Check if guesser is allowed (set guesser_id if pending)
        if (game.status === 'pending') {
            await client.query(
                `UPDATE games SET status = 'in_progress', guesser_id = $1, start_time = NOW() WHERE id = $2;`,
                [guesserId, gameId]
            );
            game.guesser_id = guesserId;
            game.status = 'in_progress';
            // 💬 Notify Creator/Others about new player join (via Socket.IO or Bot)
            // io.to(`user-${game.creator_id}`).emit('notification', { message: 'New player joined your game!' }); 
        } else if (game.guesser_id !== guesserId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'This game is currently in progress by another user.' });
        }


        // --- Core Guess Logic ---
        const targetWordNoSpaces = game.target_word.replace(/\s/g, '');
        const targetWordChars = game.target_word.split('');
        const isCorrect = targetWordChars.includes(letter);
        
        // Check if letter was already guessed (prevents redundant DB entries)
        const existingGuessRes = await client.query(
            `SELECT COUNT(*) FROM guesses WHERE game_id = $1 AND guessed_letter = $2;`,
            [gameId, letter]
        );
        if (parseInt(existingGuessRes.rows[0].count) > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Letter already guessed.' });
        }

        // Record the guess
        await client.query(
            `INSERT INTO guesses (game_id, guesser_id, guessed_letter, is_correct, timestamp)
             VALUES ($1, $2, $3, $4, NOW());`,
            [gameId, guesserId, letter, isCorrect]
        );
        
        // --- Calculate Current State (Simplified Logic for Response) ---
        const allGuessesRes = await client.query(
            `SELECT guessed_letter, is_correct FROM guesses WHERE game_id = $1;`,
            [gameId]
        );
        const allGuesses = allGuessesRes.rows;
        
        const correctLetters = allGuesses.filter(g => g.is_correct).map(g => g.guessed_letter);
        const wrongGuessesCount = allGuesses.filter(g => !g.is_correct).length;
        
        let displayWord = targetWordChars.map(char => {
            if (char === ' ') return ' ';
            return correctLetters.includes(char) ? char : '_';
        }).join('');

        // --- Check Win/Loss Condition ---
        let newStatus = game.status;
        let score = 0;

        if (!displayWord.includes('_')) {
            newStatus = 'completed'; // Win
            // Calculate Score (Simple Example: Base 1000 - 100 * wrong guesses)
            score = Math.max(0, 1000 - (wrongGuessesCount * 100)); 
            
            // 🏆 Update Guesser's Total Score
            await client.query(
                `UPDATE users SET total_score = total_score + $1 WHERE telegram_user_id = $2;`,
                [score, guesserId]
            );
        } else if (wrongGuessesCount >= game.max_guesses) {
            newStatus = 'completed'; // Loss - Creator wins the point
            score = 200; // Small score for creator
            
            // 🏆 Update Creator's Total Score (as the guesser failed)
            await client.query(
                `UPDATE users SET total_score = total_score + $1 WHERE telegram_user_id = $2;`,
                [score, game.creator_id]
            );
            score = 0; // Guesser gets 0
        }
        
        // Update Game Status and End Time
        if (newStatus !== game.status) {
            await client.query(
                `UPDATE games SET status = $1, end_time = NOW() WHERE id = $2;`,
                [newStatus, gameId]
            );
        }

        await client.query('COMMIT');

        // 5. 🚀 Real-time Update via WebSocket (Broadcast to all connected players/viewers)
        io.to(`game-${gameId}`).emit('newGuess', {
            gameId: parseInt(gameId),
            letter: letter,
            isCorrect: isCorrect,
            displayWord: displayWord,
            wrongGuessesCount: wrongGuessesCount,
            maxGuesses: game.max_guesses,
            status: newStatus,
            score: score,
        });

        res.json({ 
            success: true, 
            is_correct: isCorrect, 
            displayWord: displayWord,
            wrongGuessesCount: wrongGuessesCount,
            status: newStatus
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Transaction failed during guess:', error);
        res.status(500).json({ error: 'Failed to process guess due to server error.' });
    } finally {
        client.release();
    }
});

// 5. Leaderboard Fetch
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT username, total_score FROM users ORDER BY total_score DESC LIMIT 10;`
        );
        res.json({ success: true, leaderboard: result.rows });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});


// --- WebSocket Handlers ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Clients join a room based on the game they are viewing
    socket.on('joinGame', (gameId) => {
        socket.join(`game-${gameId}`);
        console.log(`Socket ${socket.id} joined room game-${gameId}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// --- Start Server ---
server.listen(PORT, () => {
    console.log(`WordlyBot backend running on http://localhost:${PORT}`);
});
