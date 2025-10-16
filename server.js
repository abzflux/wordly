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
// NOTE: FRONTEND_URL is critical for CORS setup
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://wordlybot.ct.ws';
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-for-testing';

console.log(`Backend starting... PORT: ${PORT}, FRONTEND_URL: ${FRONTEND_URL}`);

// PostgreSQL Pool Setup
const pool = new Pool({
    connectionString: DATABASE_URL,
    // Required SSL config for Render PostgreSQL deployment
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// Test DB Connection
pool.query('SELECT NOW()').then(() => {
    console.log('Database connection successful at:', new Date().toISOString());
}).catch(err => {
    console.error('Database connection failed! Check DATABASE_URL and SSL config:', err.message);
    // It's crucial to check this error if registration fails.
});


// Telegraf Bot Setup (Used only for sending notifications)
const bot = new Telegraf(BOT_TOKEN);

// --- EXPRESS & SOCKET.IO SETUP ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: FRONTEND_URL, // Crucial for allowing connection from the Mini App domain
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
    console.log('Received Telegram update (ignored):', req.body.update_id);
    res.status(200).send('OK');
});

// --- CORE GAME STATE MANAGEMENT (In-memory cache for fast access) ---
const activeGames = {}; // { game_id: { ...state } }
const userSockets = {}; // { user_id: [socket_id1, socket_id2] }
const socketToUser = {}; // { socket_id: user_id }

// --- DATABASE FUNCTIONS ---

const TABLES_SCHEMA = `
    DROP TABLE IF EXISTS rounds CASCADE;
    DROP TABLE IF EXISTS games CASCADE;
    DROP TABLE IF EXISTS leaderboard CASCADE;
    DROP TABLE IF EXISTS reports CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS words CASCADE;

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
        console.error('FATAL: Database setup error. Check connection string and environment variables:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// --- TELEGRAM NOTIFICATION FUNCTION ---
async function notifyUser(telegramId, message) {
    if (!telegramId) return;
    try {
        // Mocking the Telegraf call
        // In a real app, you would use: await bot.telegram.sendMessage(telegramId, message);
        console.log(`[TELEGRAM NOTIFY] To ${telegramId}: ${message}`);
        
    } catch (error) {
        console.error(`Failed to send Telegram notification to ${telegramId}:`, error.message);
    }
}

// --- UTILITY FUNCTIONS ---

function maskWord(word, revealedLetters) {
    const revealedSet = new Set(revealedLetters.map(l => l.toLowerCase()));
    
    return Array.from(word).map(char => {
        const isLetter = /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/i.test(char);
        
        if (isLetter && !revealedSet.has(char.toLowerCase())) {
            return '_';
        } else if (char === ' ') {
            return ' ';
        }
        return char;
    }).join('');
}

function broadcastGameState(gameId) {
    const game = activeGames[gameId];
    if (!game) return;

    pool.query('UPDATE games SET state = $1 WHERE id = $2', [game.state, gameId]).catch(err => {
        console.error(`Failed to save game ${gameId} state:`, err.message);
    });

    io.to(gameId).emit('state_update', { gameId, state: game.state });
}

// --- SOCKET.IO EVENT HANDLERS ---

io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // --- 1. Register User ---
    socket.on('register', async ({ telegram_id, username, display_name }) => {
        console.log(`[SOCKET] Attempting to register TG ID: ${telegram_id}`);
        if (!telegram_id) return socket.emit('error', { message: 'شناسه تلگرام ضروری است.' });

        try {
            // Find or create user in DB
            let result = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegram_id]);
            let user = result.rows[0];

            if (!user) {
                console.log(`[DB] Creating new user for TG ID: ${telegram_id}`);
                result = await pool.query(
                    `INSERT INTO users (telegram_id, username, display_name) 
                     VALUES ($1, $2, $3) RETURNING *`,
                    [telegram_id, username || 'ناشناس', display_name || 'کاربر جدید']
                );
                user = result.rows[0];
            } else {
                console.log(`[DB] User found: ${user.display_name} (ID: ${user.id})`);
            }

            // Map socket to user
            socketToUser[socket.id] = user.id;
            userSockets[user.id] = userSockets[user.id] || [];
            userSockets[user.id].push(socket.id);

            socket.join(`user:${user.id}`); // Private room for notifications
            
            socket.emit('registered', { user: { id: user.id, display_name: user.display_name, coins: user.coins } });
            console.log(`[SOCKET] User successfully registered and 'registered' event sent.`);

        } catch (error) {
            console.error('FATAL: Registration error. DB operation failed:', error.message);
            socket.emit('error', { message: 'خطا در ثبت کاربر (خطای دیتابیس): ' + error.message });
        }
    });

    const getUserId = () => socketToUser[socket.id];

    // --- 2. Create Game ---
    socket.on('create_game', async ({ type, settings = {} }) => {
        const userId = getUserId();
        if (!userId) return socket.emit('error', { message: 'لطفاً ابتدا ثبت نام کنید.' });

        try {
            const wordRes = await pool.query(`SELECT id, word FROM words WHERE difficulty = $1 ORDER BY RANDOM() LIMIT 1`, ['medium']);
            if (wordRes.rows.length === 0) return socket.emit('error', { message: 'کلمه‌ای برای بازی یافت نشد.' });
            
            const selectedWord = wordRes.rows[0];
            const gameId = uuidv4();
            
            const userRes = await pool.query('SELECT id, display_name, telegram_id FROM users WHERE id = $1', [userId]);
            const user = userRes.rows[0];

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
                currentTurn: userId 
            };

            await pool.query(
                'INSERT INTO games (id, owner_id, type, state) VALUES ($1, $2, $3, $4)',
                [gameId, userId, type, initialState]
            );

            activeGames[gameId] = { state: initialState, wordId: selectedWord.id };
            socket.join(gameId);
            
            socket.emit('game_created', { gameId, state: initialState });
            
            notifyUser(user.telegram_id, `بازی حدس کلمه جدیدی توسط شما ساخته شد. شناسه: ${gameId.substring(0, 8)}`);

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
            activeGames[game_id] = game; 

            broadcastGameState(game_id);
            
            game.state.players.forEach(p => {
                if (p.userId !== userId) {
                    const playerSocket = userSockets[p.userId]?.[0];
                    if(playerSocket) io.to(playerSocket).emit('notification', { message: `${user.display_name} به لابی پیوست.` });
                }
            });
            notifyUser(user.telegram_id, `شما به بازی ${game_id.substring(0, 8)} پیوستید.`);

        } catch (error) {
            console.error('Join game error:', error.message);
            socket.emit('error', { message: 'خطا در پیوستن به بازی: ' + error.message });
        }
    });

    // ... (Remaining Socket.IO handlers: start_game, guess_letter, guess_word, request_hint, disconnect, leave_game are unchanged from previous version but included here for completeness)
    
    // --- 4. Start Game (Owner only) ---
    socket.on('start_game', ({ game_id }) => {
        const userId = getUserId();
        const game = activeGames[game_id];

        if (!game || game.state.status !== 'LOBBY') return socket.emit('error', { message: 'بازی یا یافت نشد یا در وضعیت شروع نیست.' });
        if (game.state.ownerId !== userId) return socket.emit('error', { message: 'فقط سازنده بازی می‌تواند آن را شروع کند.' });

        game.state.status = 'IN_PROGRESS';
        
        broadcastGameState(game_id);
        io.to(game_id).emit('game_started', { gameId: game_id, state: game.state });

        game.state.players.forEach(async (p) => {
            const userRes = await pool.query('SELECT telegram_id FROM users WHERE id = $1', [p.userId]);
            if (userRes.rows.length) {
                notifyUser(userRes.rows[0].telegram_id, `بازی ${game_id.substring(0, 8)} شروع شد! نوبت ${game.state.players.find(pl => pl.userId === game.state.currentTurn)?.displayName} است.`);
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
            
            const revealedCount = game.state.maskedWord.split('').filter((c, i) => c !== '_' && currentMaskedWord[i] === '_').length;
            game.state.players[playerIndex].score += 5 * revealedCount;
            
            if (!game.state.maskedWord.includes('_')) {
                game.state.status = 'FINISHED';
                game.state.players[playerIndex].score += 50; 
                io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: userId, message: `کلمه حدس زده شد! 🎉 برنده: ${game.state.players[playerIndex].displayName}` } });
                delete activeGames[game_id];
            } else {
                io.to(game_id).emit('notification', { message: `${game.state.players[playerIndex].displayName} حرف "${normalizedLetter}" را به درستی حدس زد.` });
            }
            
        } else {
            // Wrong guess
            game.state.failedGuesses += 1;
            game.state.players[playerIndex].score -= 2; 
            
            if (game.state.failedGuesses >= game.state.maxFailedGuesses) {
                 // Game lost
                game.state.status = 'FINISHED';
                io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: null, message: `متأسفانه حدس‌ها تمام شد! کلمه: ${game.state.word}` } });
                delete activeGames[game_id];
            } else {
                 io.to(game_id).emit('notification', { message: `${game.state.players[playerIndex].displayName} حرف "${normalizedLetter}" را اشتباه حدس زد. (${game.state.maxFailedGuesses - game.state.failedGuesses} فرصت باقیست)` });
            }
        }
        
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
            delete activeGames[game_id];
            
        } else {
            // Wrong word guess
            game.state.failedGuesses += 2; // Higher penalty
            game.state.players[playerIndex].score -= 10;
            
            if (game.state.failedGuesses >= game.state.maxFailedGuesses) {
                 // Game lost
                game.state.status = 'FINISHED';
                io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: null, message: `متأسفانه حدس‌ها تمام شد! کلمه: ${game.state.word}` } });
                delete activeGames[game_id];
            } else {
                 io.to(game_id).emit('notification', { message: `${game.state.players[playerIndex].displayName} کلمه "${normalizedWord}" را اشتباه حدس زد. (${game.state.maxFailedGuesses - game.state.failedGuesses} فرصت باقیست)` });
            }
        }
        
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
        
        const userRes = await pool.query('SELECT coins, telegram_id FROM users WHERE id = $1', [userId]);
        const user = userRes.rows[0];
        if (!user || user.coins < hintCost) {
            return socket.emit('error', { message: `برای دریافت راهنما حداقل ${hintCost} سکه لازم است.` });
        }
        
        const unrevealed = Array.from(game.state.word).filter(char => 
            /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/i.test(char) && !game.state.guessedLetters.includes(char.toLowerCase())
        );

        if (unrevealed.length === 0) {
            return socket.emit('error', { message: 'حرف ناگشوده‌ای باقی نمانده است.' });
        }
        
        const hintLetter = unrevealed[Math.floor(Math.random() * unrevealed.length)].toLowerCase();

        await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2 RETURNING coins', [hintCost, userId]);
        
        game.state.guessedLetters.push(hintLetter);
        game.state.maskedWord = maskWord(game.state.word, game.state.guessedLetters);
        
        if (!game.state.maskedWord.includes('_')) {
            game.state.status = 'FINISHED';
            io.to(game_id).emit('round_result', { gameId: game_id, result: { winner: userId, message: `کلمه با کمک راهنما حدس زده شد! 🎉` } });
            delete activeGames[game_id];
        } else {
             io.to(game_id).emit('notification', { message: `حرف راهنما ("${hintLetter}") با کسر ${hintCost} سکه آشکار شد.` });
        }
        
        broadcastGameState(game_id);
        
        const updatedCoinsRes = await pool.query('SELECT coins FROM users WHERE id = $1', [userId]);
        io.to(`user:${userId}`).emit('registered', { user: { id: userId, coins: updatedCoinsRes.rows[0].coins } });
    });

    // --- 8. Disconnection ---
    socket.on('disconnect', () => {
        const userId = socketToUser[socket.id];
        
        if (userId) {
            userSockets[userId] = userSockets[userId].filter(id => id !== socket.id);
            if (userSockets[userId].length === 0) {
                delete userSockets[userId];
            }
            delete socketToUser[socket.id];
            console.log(`[SOCKET] User ${userId} disconnected.`);
        } else {
            console.log(`[SOCKET] Unregistered socket disconnected: ${socket.id}`);
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
    });
});

// --- START SERVER ---

setupDb()
    .then(() => {
        httpServer.listen(PORT, () => {
            console.log(`Server listening on port ${PORT}`);
        });
    })
    .catch(error => {
        console.error('Fatal error during startup. Exiting.', error);
        process.exit(1);
    });
