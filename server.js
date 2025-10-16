// server.js

// Import required modules
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://wordlybot.ct.ws';
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-for-testing';

// PostgreSQL Pool Setup
const pool = new Pool({
    connectionString: DATABASE_URL,
    // Required SSL config for Render PostgreSQL deployment
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// Telegraf Bot Setup (Used only for sending notifications)
const bot = new Telegraf(BOT_TOKEN);

// --- EXPRESS & SOCKET.IO SETUP ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());
app.use(express.static('public')); // Serve frontend files

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).send('WordlyBot is running!');
});

// Telegram Webhook Endpoint (Minimal setup, as bot only sends notifications)
app.post('/webhook/telegram', async (req, res) => {
    // This bot ignores incoming updates, as all commands are handled by the Mini App.
    console.log('Received Telegram update (ignored):', req.body.update_id);
    res.status(200).send('OK');
});

// --- CORE GAME STATE MANAGEMENT (In-memory cache for fast access) ---
// In a real production app, this should be purely DB-driven or use Redis for scalability.
const activeGames = {}; // { game_id: { ...state } }
const userSockets = {}; // { user_id: [socket_id1, socket_id2] }
const socketToUser = {}; // { socket_id: user_id }

// --- DATABASE FUNCTIONS ---

const TABLES_SCHEMA = `
    DROP TABLE IF EXISTS rounds;
    DROP TABLE IF EXISTS games;
    DROP TABLE IF EXISTS leaderboard;
    DROP TABLE IF EXISTS reports;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS words;

    CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT UNIQUE,
        username TEXT,
        display_name TEXT,
        rating INTEGER DEFAULT 1000,
        coins INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE words (
        id SERIAL PRIMARY KEY,
        word TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        language TEXT DEFAULT 'fa',
        category TEXT DEFAULT 'general'
    );

    CREATE TABLE games (
        id TEXT PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        type TEXT,
        state JSONB,
        created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE rounds (
        id SERIAL PRIMARY KEY,
        game_id TEXT REFERENCES games(id),
        round_no INTEGER,
        word_id INTEGER REFERENCES words(id),
        result_json JSONB,
        duration INTEGER
    );

    CREATE TABLE leaderboard (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        points INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id),
        target_id INTEGER REFERENCES users(id),
        reason TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
    );
`;

const SEED_WORDS = [
    { word: 'تهران', difficulty: 'easy', category: 'city' },
    { word: 'برنامه‌نویسی', difficulty: 'hard', category: 'programming' },
    { word: 'توسعه وب', difficulty: 'medium', category: 'programming' },
    { word: 'خورشید گرفتگی', difficulty: 'medium', category: 'nature' }
];

async function setupDb() {
    console.log('--- Initializing Database: Dropping and creating tables... ---');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(TABLES_SCHEMA);
        
        // Seed words
        for (const { word, difficulty, category } of SEED_WORDS) {
            await client.query(
                `INSERT INTO words (word, difficulty, category) 
                 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                [word, difficulty, category]
            );
        }
        
        await client.query('COMMIT');
        console.log('--- Database setup complete. Tables created and seeded. ---');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Database setup error:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// --- TELEGRAM NOTIFICATION FUNCTION ---

/**
 * Sends a textual notification to a user's Telegram ID.
 * @param {string} telegramId - The user's Telegram ID.
 * @param {string} message - The message to send.
 */
async function notifyUser(telegramId, message) {
    if (!telegramId) return;

    try {
        // Mocking the Telegraf call to avoid actual API key dependency in this demo
        // In a real app, you would use:
        // await bot.telegram.sendMessage(telegramId, message);
        
        console.log(`[TELEGRAM NOTIFY] To ${telegramId}: ${message}`);
        
    } catch (error) {
        console.error(`Failed to send Telegram notification to ${telegramId}:`, error.message);
    }
}

// --- UTILITY FUNCTIONS ---

/**
 * Generates the masked version of a word based on the masking policy.
 * Letters are masked with '_', spaces with ' ', and other characters are revealed.
 * @param {string} word - The original word.
 * @param {string[]} revealedLetters - Array of letters already revealed.
 * @returns {string} The masked word.
 */
function maskWord(word, revealedLetters) {
    const revealedSet = new Set(revealedLetters.map(l => l.toLowerCase()));
    
    return Array.from(word).map(char => {
        // Use a simple regex check for Persian/Arabic letters (covers most cases)
        const isLetter = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/i.test(char);
        
        if (isLetter && !revealedSet.has(char.toLowerCase())) {
            return '_';
        } else if (char === ' ') {
            return ' ';
        }
        // Reveal non-letter and already guessed letters
        return char;
    }).join('');
}

/**
 * Broadcasts the current game state to all players in the game.
 * @param {string} gameId - The ID of the game.
 */
function broadcastGameState(gameId) {
    const game = activeGames[gameId];
    if (!game) return;

    // Save state to DB (Asynchronous, non-blocking)
    pool.query('UPDATE games SET state = $1 WHERE id = $2', [game.state, gameId]).catch(err => {
        console.error(`Failed to save game ${gameId} state:`, err.message);
    });

    // Broadcast update
    io.to(gameId).emit('state_update', { gameId, state: game.state });
}

// --- SOCKET.IO EVENT HANDLERS ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- 1. Register User ---
    socket.on('register', async ({ telegram_id, username, display_name }) => {
        if (!telegram_id) return socket.emit('error', { message: 'شناسه تلگرام ضروری است.' });

        try {
            // Find or create user in DB
            let result = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegram_id]);
            let user = result.rows[0];

            if (!user) {
                result = await pool.query(
                    `INSERT INTO users (telegram_id, username, display_name) 
                     VALUES ($1, $2, $3) RETURNING *`,
                    [telegram_id, username || 'ناشناس', display_name || 'کاربر جدید']
                );
                user = result.rows[0];
            }

            // Map socket to user
            socketToUser[socket.id] = user.id;
            userSockets[user.id] = userSockets[user.id] || [];
            userSockets[user.id].push(socket.id);

            socket.join(`user:${user.id}`); // Private room for notifications
            
            socket.emit('registered', { user: { id: user.id, display_name: user.display_name, coins: user.coins } });
            console.log(`User registered: ${user.display_name} (ID: ${user.id})`);

        } catch (error) {
            console.error('Registration error:', error.message);
            socket.emit('error', { message: 'خطا در ثبت کاربر: ' + error.message });
        }
    });

    // Helper to check user authentication
    const getUserId = () => socketToUser[socket.id];

    // --- 2. Create Game ---
    socket.on('create_game', async ({ type, settings = {} }) => {
        const userId = getUserId();
        if (!userId) return socket.emit('error', { message: 'لطفاً ابتدا ثبت نام کنید.' });

        try {
            // Fetch word (for simplicity, selecting a random medium word)
            const wordRes = await pool.query(`SELECT id, word FROM words WHERE difficulty = $1 ORDER BY RANDOM() LIMIT 1`, ['medium']);
            if (wordRes.rows.length === 0) return socket.emit('error', { message: 'کلمه‌ای برای بازی یافت نشد.' });
            
            const selectedWord = wordRes.rows[0];
            const gameId = uuidv4();
            
            // Get user details for player list
            const userRes = await pool.query('SELECT id, display_name FROM users WHERE id = $1', [userId]);
            const user = userRes.rows[0];

            // Initial Game State
            const initialState = {
                word: selectedWord.word,
                maskedWord: maskWord(selectedWord.word, []),
                ownerId: userId,
                wordId: selectedWord.id,
                type: type,
                status: 'LOBBY',
                players: [{ userId: userId, displayName: user.display_name, score: 0, guesses: [], isOwner: true }],
                guessedLetters: [],
                failedGuesses: 0,
                maxFailedGuesses: 8,
                hintCost: 5,
                currentTurn: userId // Owner starts
            };

            // Insert into DB
            await pool.query(
                'INSERT INTO games (id, owner_id, type, state) VALUES ($1, $2, $3, $4)',
                [gameId, userId, type, initialState]
            );

            // Add to in-memory cache and socket room
            activeGames[gameId] = { state: initialState, wordId: selectedWord.id };
            socket.join(gameId);
            
            socket.emit('game_created', { gameId, state: initialState });
            
            // Notify Telegram (Owner)
            notifyUser(user.telegram_id, `بازی حدس کلمه جدیدی توسط شما ساخته شد. شناسه: ${gameId}`);

        } catch (error) {
            console.error('Create game error:', error.message);
            socket.emit('error', { message: 'خطا در ساخت بازی: ' + error.message });
        }
    });

    // --- 3. Join Game ---
    socket.on('join_game', async ({ game_id }) => {
        const userId = getUserId();
        if (!userId) return socket.emit('error', { message: 'لطفاً ابتدا ثبت نام کنید.' });
        if (!activeGames[game_id]) return socket.emit('error', { message: 'بازی با این شناسه یافت نشد یا پایان یافته است.' });

        const game = activeGames[game_id];
        
        // Check if already joined
        if (game.state.players.some(p => p.userId === userId)) {
             socket.join(game_id);
             return socket.emit('state_update', { gameId: game_id, state: game.state });
        }
        
        if (game.state.status !== 'LOBBY') {
            return socket.emit('error', { message: 'بازی قبلاً شروع شده است.' });
        }

        try {
            const userRes = await pool.query('SELECT id, display_name, telegram_id FROM users WHERE id = $1', [userId]);
            const user = userRes.rows[0];

            const newPlayer = { userId: userId, displayName: user.display_name, score: 0, guesses: [], isOwner: false };
            game.state.players.push(newPlayer);

            socket.join(game_id);
            activeGames[game_id] = game; // Update cache

            broadcastGameState(game_id);
            
            // Notify Telegram (All players)
            game.state.players.forEach(p => {
                if (p.userId !== userId) {
                    const playerSocket = userSockets[p.userId]?.[0];
                    if(playerSocket) io.to(playerSocket).emit('notification', { message: `${user.display_name} به لابی پیوست.` });
                }
                
                // Fetch telegramId for notification
                // NOTE: In a real app, you'd fetch all telegram_ids in one query for efficiency.
                // For simplicity here, we assume user object has been enriched or we skip notification for others.
            });
            notifyUser(user.telegram_id, `شما به بازی ${game_id} پیوستید.`);

        } catch (error) {
            console.error('Join game error:', error.message);
            socket.emit('error', { message: 'خطا در پیوستن به بازی: ' + error.message });
        }
    });

    // --- 4. Start Game (Owner only) ---
    socket.on('start_game', ({ game_id }) => {
        const userId = getUserId();
        const game = activeGames[game_id];

        if (!game || game.state.status !== 'LOBBY') return socket.emit('error', { message: 'بازی یا یافت نشد یا در وضعیت شروع نیست.' });
        if (game.state.ownerId !== userId) return socket.emit('error', { message: 'فقط سازنده بازی می‌تواند آن را شروع کند.' });

        // Logic to transition to IN_PROGRESS
        game.state.status = 'IN_PROGRESS';
        
        broadcastGameState(game_id);
        io.to(game_id).emit('game_started', { gameId: game_id, state: game.state });

        // Notify Telegram (All players)
        game.state.players.forEach(async (p) => {
            const userRes = await pool.query('SELECT telegram_id FROM users WHERE id = $1', [p.userId]);
            if (userRes.rows.length) {
                notifyUser(userRes.rows[0].telegram_id, `بازی ${game_id} شروع شد! نوبت ${game.state.players.find(pl => pl.userId === game.state.currentTurn)?.displayName} است.`);
            }
        });
    });

    // --- 5. Guess Letter ---
    socket.on('guess_letter', async ({ game_id, letter }) => {
        const userId = getUserId();
        const game = activeGames[game_id];
        
        const normalizedLetter = (letter || '').trim().toLowerCase();
        
        if (!game || game.state.status !== 'IN_PROGRESS') return socket.emit('error', { message: 'بازی در حال اجرا نیست.' });
        if (game.state.currentTurn !== userId) return socket.emit('error', { message: 'نوبت شما نیست.' });
        if (!normalizedLetter || normalizedLetter.length !== 1) return socket.emit('error', { message: 'حدس باید یک حرف باشد.' });
        if (game.state.guessedLetters.includes(normalizedLetter)) return socket.emit('error', { message: 'این حرف قبلاً حدس زده شده است.' });
        
        const word = game.state.word.toLowerCase();
        game.state.guessedLetters.push(normalizedLetter);
        
        const playerIndex = game.state.players.findIndex(p => p.userId === userId);

        if (word.includes(normalizedLetter)) {
            // Correct guess
            const currentMaskedWord = game.state.maskedWord;
            game.state.maskedWord = maskWord(game.state.word, game.state.guessedLetters);
            
            // Calculate score (simple: 5 points per correct letter/guess)
            const revealedCount = game.state.maskedWord.split('').filter((c, i) => c !== '_' && currentMaskedWord[i] === '_').length;
            game.state.players[playerIndex].score += 5 * revealedCount;
            
            // Check for win
            if (!game.state.maskedWord.includes('_')) {
                game.state.status = 'FINISHED';
                game.state.players[playerIndex].score += 50; // Bonus
                io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: userId, message: `کلمه حدس زده شد! 🎉 برنده: ${game.state.players[playerIndex].displayName}` } });
                // Notify Telegram (All players)
                // ... (Notification logic)
                delete activeGames[game_id];
            } else {
                // Letter revealed notification
                io.to(game_id).emit('notification', { message: `${game.state.players[playerIndex].displayName} حرف "${normalizedLetter}" را به درستی حدس زد.` });
            }
            
        } else {
            // Wrong guess
            game.state.failedGuesses += 1;
            game.state.players[playerIndex].score -= 2; // Penalty
            
            if (game.state.failedGuesses >= game.state.maxFailedGuesses) {
                 // Game lost
                game.state.status = 'FINISHED';
                io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: null, message: `متأسفانه حدس‌ها تمام شد! کلمه: ${game.state.word}` } });
                // Notify Telegram (All players)
                // ... (Notification logic)
                delete activeGames[game_id];
            } else {
                 io.to(game_id).emit('notification', { message: `${game.state.players[playerIndex].displayName} حرف "${normalizedLetter}" را اشتباه حدس زد. (${game.state.maxFailedGuesses - game.state.failedGuesses} فرصت باقیست)` });
            }
        }
        
        // Move to next turn (simple sequential round robin)
        const nextPlayerIndex = (playerIndex + 1) % game.state.players.length;
        game.state.currentTurn = game.state.players[nextPlayerIndex].userId;
        
        broadcastGameState(game_id);
    });

    // --- 6. Guess Word ---
    socket.on('guess_word', async ({ game_id, word }) => {
        const userId = getUserId();
        const game = activeGames[game_id];
        
        const normalizedWord = (word || '').trim();
        
        if (!game || game.state.status !== 'IN_PROGRESS') return socket.emit('error', { message: 'بازی در حال اجرا نیست.' });
        if (game.state.currentTurn !== userId) return socket.emit('error', { message: 'نوبت شما نیست.' });
        if (normalizedWord.length === 0) return socket.emit('error', { message: 'کلمه حدس زده شده نباید خالی باشد.' });
        
        const playerIndex = game.state.players.findIndex(p => p.userId === userId);
        
        if (normalizedWord.toLowerCase() === game.state.word.toLowerCase()) {
            // Correct word guess
            game.state.status = 'FINISHED';
            game.state.maskedWord = game.state.word; // Reveal all
            game.state.players[playerIndex].score += 100; // Big bonus
            
            io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: userId, message: `کلمه حدس زده شد! 🏆 برنده: ${game.state.players[playerIndex].displayName}` } });
            // Notify Telegram (All players)
            // ... (Notification logic)
            delete activeGames[game_id];
            
        } else {
            // Wrong word guess
            game.state.failedGuesses += 2; // Higher penalty
            game.state.players[playerIndex].score -= 10;
            
            if (game.state.failedGuesses >= game.state.maxFailedGuesses) {
                 // Game lost
                game.state.status = 'FINISHED';
                io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: null, message: `متأسفانه حدس‌ها تمام شد! کلمه: ${game.state.word}` } });
                // Notify Telegram (All players)
                // ... (Notification logic)
                delete activeGames[game_id];
            } else {
                 io.to(game_id).emit('notification', { message: `${game.state.players[playerIndex].displayName} کلمه "${normalizedWord}" را اشتباه حدس زد. (${game.state.maxFailedGuesses - game.state.failedGuesses} فرصت باقیست)` });
            }
        }
        
        // Move to next turn
        const nextPlayerIndex = (playerIndex + 1) % game.state.players.length;
        game.state.currentTurn = game.state.players[nextPlayerIndex].userId;
        
        broadcastGameState(game_id);
    });

    // --- 7. Request Hint (Costly) ---
    socket.on('request_hint', async ({ game_id }) => {
        const userId = getUserId();
        const game = activeGames[game_id];
        
        if (!game || game.state.status !== 'IN_PROGRESS') return socket.emit('error', { message: 'بازی در حال اجرا نیست.' });
        
        const hintCost = game.state.hintCost;
        
        // Check user coins
        const userRes = await pool.query('SELECT coins, telegram_id FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user || user.coins < hintCost) {
            return socket.emit('error', { message: `برای دریافت راهنما حداقل ${hintCost} سکه لازم است.` });
        }
        
        // Find a random unrevealed letter
        const unrevealed = Array.from(game.state.word).filter(char => 
            /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/i.test(char) && !game.state.guessedLetters.includes(char.toLowerCase())
        );

        if (unrevealed.length === 0) {
            return socket.emit('error', { message: 'حرف ناگشوده‌ای باقی نمانده است.' });
        }
        
        const hintLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)].toLowerCase();

        // Deduct coins and reveal letter
        await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2 RETURNING coins', [hintCost, userId]);
        
        // Apply the hint as a successful guess
        game.state.guessedLetters.push(hintLetter);
        game.state.maskedWord = maskWord(game.state.word, game.state.guessedLetters);
        
        // Check for win after hint
        if (!game.state.maskedWord.includes('_')) {
            game.state.status = 'FINISHED';
            io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: userId, message: `کلمه با کمک راهنما حدس زده شد! 🎉` } });
            delete activeGames[game_id];
        } else {
             io.to(game_id).emit('notification', { message: `حرف راهنما ("${hintLetter}") با کسر ${hintCost} سکه آشکار شد.` });
        }
        
        // Next turn logic (Hint does not count as a turn but costs resources) - optional rule, sticking to "no turn change" for hint
        
        broadcastGameState(game_id);
        
        // Update user coins on their personal socket
        const updatedCoinsRes = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
        io.to(`user:${userId}`).emit('registered', { user: { id: userId, coins: updatedCoinsRes.rows[0].coins } });
    });

    // --- 8. Disconnection ---
    socket.on('disconnect', () => {
        const userId = socketToUser[socket.id];
        
        if (userId) {
            // Remove socket ID from userSockets array
            userSockets[userId] = userSockets[userId].filter(id => id !== socket.id);
            if (userSockets[userId].length === 0) {
                delete userSockets[userId];
            }
            delete socketToUser[socket.id];
            console.log(`User ${userId} disconnected. Remaining sockets: ${userSockets[userId]?.length || 0}`);
        } else {
            console.log(`Unregistered socket disconnected: ${socket.id}`);
        }
    });

    // --- 9. Leave Game (Basic implementation) ---
    socket.on('leave_game', ({ game_id }) => {
        const userId = getUserId();
        const game = activeGames[game_id];

        if (!game) return;

        game.state.players = game.state.players.filter(p => p.userId !== userId);
        socket.leave(game_id);
        
        io.to(game_id).emit('notification', { message: 'یک بازیکن لابی را ترک کرد.' });
        broadcastGameState(game_id);

        if (game.state.players.length === 0) {
            delete activeGames[game_id];
            pool.query('DELETE FROM games WHERE id = $1', [game_id]).catch(err => console.error(err));
        }
        // Handle owner transfer logic if needed (omitted for brevity)
    });
});

// --- START SERVER ---

setupDb()
    .then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server listening on port ${PORT}`);
            // Set up Telegram Webhook (if needed, but not required for command-less bot)
            // bot.telegram.setWebhook(WEBHOOK_URL).catch(e => console.error('Webhook set error:', e.message));
        });
    })
    .catch(error => {
        console.error('Fatal error during startup. Exiting.', error);
        process.exit(1);
    });
