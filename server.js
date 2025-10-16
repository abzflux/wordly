// server-leauge.js (نسخهٔ سازگار با index gameTab.html)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- NEW: Telegram Bot Library ---
const TelegramBot = require('node-telegram-bot-api');
// ---------------------------------

// --- تنظیمات و متغیرهای محیطی ---
// توجه: در محیط رندر (render.com)، متغیرهای محیطی باید به درستی تنظیم شوند.
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ'; // توکن ربات تلگرام
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6Te...q8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws'; // آدرس فرانت اند

const PORT = process.env.PORT || 3000;

// اتصال به دیتابیس PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// تنظیمات Express و Socket.io
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// --- مقداردهی اولیه ربات تلگرام (اختیاری) ---
let bot = null;
try {
    bot = new TelegramBot(BOT_TOKEN, { polling: false });
} catch (e) {
    console.warn('Telegram bot initialization skipped or failed:', e.message);
}

// --- توابع کمکی ---
function generateGameCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function setupDatabase() {
    const client = await pool.connect();
    try {
        // ایجاد جداول پایه در صورت عدم وجود
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                score INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول بازی‌ها
        await client.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                creator_id BIGINT NOT NULL REFERENCES users(telegram_id),
                guesser_id BIGINT,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                max_guesses INT NOT NULL,
                guesses_left INT NOT NULL,
                correct_guesses INT DEFAULT 0,
                incorrect_guesses INT DEFAULT 0,
                revealed_letters JSONB DEFAULT '{}', -- { "حرف": [اندیس1, اندیس2] }
                guessed_letters VARCHAR(1)[] DEFAULT '{}', -- آرایه‌ای از حروف حدس زده شده
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
                winner_id BIGINT,
                FOREIGN KEY (guesser_id) REFERENCES users(telegram_id)
            );
        `);

        // --- NEW: جدول لیگ‌ها ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS leagues (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'in_progress', 'ended')),
                current_word_number INT DEFAULT 1,
                total_words INT DEFAULT 10,
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS league_players (
                id SERIAL PRIMARY KEY,
                league_id INT REFERENCES leagues(id),
                user_id BIGINT REFERENCES users(telegram_id),
                score INT DEFAULT 0,
                position INT,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS league_words (
                id SERIAL PRIMARY KEY,
                league_id INT REFERENCES leagues(id),
                word_number INT,
                word VARCHAR(255),
                category VARCHAR(100)
            );
        `);

    } catch (error) {
        console.error('❌ خطا در راه‌اندازی دیتابیس:', error);
    } finally {
        client.release();
    }
}

// --- توابع انتشار وضعیت‌ها ---
async function emitLeaderboard() {
    try {
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

async function emitGameState(gameCode) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        if (result.rows.length === 0) return;
        const game = result.rows[0];
        io.to(gameCode).emit('game_update', game);
    } catch (error) {
        console.error('❌ خطای ارسال وضعیت بازی:', error);
    }
}

// لیگ
async function emitLeagueState(leagueCode) {
    try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        if (leagueResult.rows.length === 0) return;
        const league = leagueResult.rows[0];
        // وضعیت ساده لیگ
        io.to(leagueCode).emit('leagueStatus', league);
    } catch (error) {
        console.error('❌ خطای ارسال وضعیت لیگ:', error);
    }
}

// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    // نگهداری اطلاعات کاربر متصل شده
    let currentUserId = null;
    let currentUserName = null;

    // --- (۱) ورود و ثبت‌نام کارب
    socket.on('user_login', async ({ userId, name }) => {
        try {
            currentUserId = userId;
            currentUserName = name;
            
            // ثبت یا به‌روزرسانی کاربر (در این مرحله مجدداً اطمینان حاصل می‌شود که کاربر ثبت شده است)
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [userId, name]
            );

            socket.join(`user:${userId}`);
            console.log(`👤 کاربر وارد شد: ${name} (${userId})`);
            
            // --- منطق اتصال مجدد خودکار به بازی فعال ---
            const activeGamesResult = await pool.query(
                `SELECT code FROM games 
                WHERE (creator_id = $1 OR guesser_id = $1) 
                AND status IN ('waiting', 'in_progress')`, 
                [userId]
            );

            if (activeGamesResult.rows.length > 0) {
                const gameCode = activeGamesResult.rows[0].code;
                socket.join(gameCode);
                console.log(`🔗 کاربر ${userId} به بازی فعال ${gameCode} ملحق شد.`);
                
                // ارسال وضعیت بازی برای کلاینت متصل شده
                await emitGameState(gameCode); 
            }

            // --- NEW: منطق اتصال مجدد خودکار به لیگ فعال ---
            const activeLeaguesResult = await pool.query(`
                SELECT l.code 
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
            `, [userId]);

            if (activeLeaguesResult.rows.length > 0) {
                const leagueCode = activeLeaguesResult.rows[0].code;
                socket.join(leagueCode);
                console.log(`🔗 کاربر ${userId} به لیگ فعال ${leagueCode} ملحق شد.`);
                
                // ارسال وضعیت لیگ برای کلاینت متصل شده
                await emitLeagueState(leagueCode);
            }
            // --- END NEW LOGIC ---

            // ارسال وضعیت خوشامدگویی
            socket.emit('login_success', { name, userId });

            // ارسال جدول رتبه‌بندی اولیه
            await emitLeaderboard();

            // --- NEW: ارسال وضعیت لیگ‌های فعال ---
            const waitingLeaguesResult = await pool.query(`
                SELECT l.code, l.status, COUNT(lp.user_id) as player_count
                FROM leagues l
                LEFT JOIN league_players lp ON l.id = lp.league_id
                WHERE l.status IN ('waiting', 'starting', 'in_progress')
     
             GROUP BY l.code, l.status
            `);

            socket.emit('leagueStatus', {
                status: 'waiting',
                players: [],
                currentLeagues: waitingLeaguesResult.rows
            });

        } catch (error) {
            console.error('❌ خطای ورود کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ثبت اطلاعات کاربری.' });
        }
    });

    // --- (۲) ایجاد بازی ---
    socket.on('create_game', async ({ userId, word, category }) => {
        if (!userId || !word || !category) return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });

        try {
            const gameCode = generateGameCode();
            const maxGuesses = Math.ceil(word.length * 1.5);
            const revealedLetters = {};
            
            // کلمه باید با حروف فارسی و حداقل 3 حرف باشد
            if (!/^[\u0600-\u06FF\s]+$/.test(word) || word.length < 3) {
                 return socket.emit('game_error', { message: 'کلمه وارد شده نامعتبر است. فقط حروف فارسی و حداقل ۳ حرف.' });
            }
            
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, revealed_letters, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'waiting') RETURNING *`,
                [gameCode, userId, word, category, maxGuesses, maxGuesses, revealedLetters]
            );
            
            const newGame = result.rows[0];
            socket.join(gameCode);
            socket.emit('game_created', { code: gameCode });
            console.log(`🎮 بازی جدید ایجاد شد: ${gameCode} توسط ${userId}`);
            await emitGameState(gameCode); // ارسال وضعیت اولیه
            
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی.' });
        }
    });

    // --- (۳) لیست بازی‌ها در انتظار ---
    socket.on('list_waiting_games', async ({ userId }) => {
        try {
            const result = await pool.query(`
                SELECT g.code, g.creator_id, u.name as creator_name, g.category, g.created_at
                FROM games g
                LEFT JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.creator_id != $1
                ORDER BY g.created_at DESC
                LIMIT 50
            `, [userId]);

            socket.emit('waiting_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌ها:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌ها.' });
        }
    });

    // --- (۳.۱) لیست بازی‌های ساخته شده توسط کاربر ---
    socket.on('list_my_created_games', async ({ userId }) => {
        try {
            if (!userId) return socket.emit('game_error', { message: 'اطلاعات کاربر ناقص است.' });
            const result = await pool.query(
                `SELECT code, status, guesser_id, created_at, category FROM games WHERE creator_id = $1 ORDER BY created_at DESC`,
                [userId]
            );
            socket.emit('my_created_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطا در دریافت لیست بازی‌های ساخته‌شده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های ساخته‌شده.' });
        }
    });

    // --- (۳.۲) لیست بازی‌هایی که کاربر در نقش حدس‌زننده است ---
    socket.on('list_my_guessing_games', async ({ userId }) => {
        try {
            if (!userId) return socket.emit('game_error', { message: 'اطلاعات کاربر ناقص است.' });
            const result = await pool.query(
                `SELECT code, status, creator_id, created_at, category FROM games WHERE guesser_id = $1 ORDER BY created_at DESC`,
                [userId]
            );
            socket.emit('my_guessing_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطا در دریافت لیست بازی‌های حدس‌زده شده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های حدس‌زده شده.' });
        }
    });

    // --- (۳.۳) درخواست جدول رتبه‌بندی (فقط برای کلاینت) ---
    socket.on('request_leaderboard', async () => {
        try {
            const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
            socket.emit('leaderboard_update', result.rows);
        } catch (error) {
            console.error('❌ خطا در سرو درخواست جدول رتبه‌بندی:', error);
            socket.emit('game_error', { message: 'خطا در دریافت جدول رتبه‌بندی.' });
        }
    });

    // --- (۴) پیوستن به بازی ---
    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2 AND creator_id != $3', [gameCode, 'waiting', userId]);
            const game = gameResult.rows[0];

            if (!game) {
                return socket.emit('game_error', { message: 'بازی پیدا نشد یا قبلاً شروع شده است.' });
            }

            // به‌روزرسانی بازی: تعیین حدس زننده و شروع زمان
            await pool.query(
                'UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3',
                [userId, 'in_progress', gameCode]
            );

            socket.join(gameCode);
            socket.emit('game_joined', { code: gameCode });
            
            // اطلاع به هر دو کاربر (سازنده و حدس زننده)
            io.to(`user:${game.creator_id}`).socketsLeave(`user:${game.creator_id}`);
            io.to(`user:${userId}`).socketsLeave(`user:${userId}`);
            
            // کلاینت‌ها باید به اتاق بازی جوین شوند و وضعیت جدید را دریافت کنند
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    // --- (۵) ارسال حدس ---
    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];

            if (!game || game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به ارسال حدس در این بازی نیستید.' });
            }

            const normalizedLetter = letter.trim();
            if (!normalizedLetter) return socket.emit('game_error', { message: 'حرف نامعتبر است.' });

            if (game.guessed_letters.includes(normalizedLetter)) {
                 // اطلاع به هر دو کاربر که حرف تکراری است
                io.to(gameCode).emit('message', { 
                    type: 'warning', 
                    text: `⚠️ حرف \"${normalizedLetter}\" قبلاً حدس زده شده است.` 
                });
                return;
            }

            let isCorrect = false;
            let newRevealed = { ...game.revealed_letters };
            let indices = [];
            
            // پیدا کردن تمام موقعیت‌های حرف در کلمه
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === normalizedLetter) {
                    indices.push(i);
                }
            }
            
            if (indices.length > 0) {
                isCorrect = true;
                newRevealed[normalizedLetter] = indices;
            }

            const newGuessesLeft = game.guesses_left - 1;
            const newCorrectGuesses = game.correct_guesses + (isCorrect ? indices.length : 0);
            const newIncorrectGuesses = game.incorrect_guesses + (isCorrect ? 0 : 1);
            
            let gameStatus = 'in_progress';
            if (newCorrectGuesses >= game.word.length) {
                gameStatus = 'finished';
            } else if (newGuessesLeft <= 0) {
                gameStatus = 'finished';
            }

            await pool.query(`
                UPDATE games SET 
                guesses_left = $1,
                correct_guesses = $2,
                incorrect_guesses = $3,
                revealed_letters = $4,
                guessed_letters = array_append(guessed_letters, $5),
                status = $6,
                end_time = CASE WHEN $6 = 'finished' THEN NOW() ELSE end_time END
                WHERE code = $7
            `, [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, normalizedLetter, gameStatus, gameCode]);

            if (gameStatus === 'finished') {
                // تعیین برنده در صورت وجود
                let winnerId = null;
                if (newCorrectGuesses >= game.word.length) {
                    winnerId = userId; // حدس زننده برنده شد
                }
                await pool.query('UPDATE games SET winner_id = $1 WHERE code = $2', [winnerId, gameCode]);
                io.to(gameCode).emit('game_finished', { code: gameCode, winner: winnerId });
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای حدس زدن:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });
    
    // --- (۶) راهنمایی (Hint) ---
    socket.on('request_hint', async ({ userId, gameCode, letterPosition }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];

            if (!game || game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به درخواست راهنمایی در این بازی نیستید.' });
            }

            // چک کردن اینکه کاربر قبلاً چند راهنمایی استفاده کرده
            // نکته: منطق صحیح برای دو راهنمایی باید در سمت کلاینت/دیتابیس کنترل شود، اما اینجا یک کنترل ساده گذاشته شده است
            // برای سادگی، فعلاً فقط اجازه دو درخواست راهنمایی از هر کاربر داده می‌شود.
            // این بخش در حال حاضر فیلتر خاصی بر اساس تعداد استفاده شده ندارد، اما هر بار ۱۵ امتیاز کم می‌شود.
            
            const requestedIndex = parseInt(letterPosition);
            if (requestedIndex < 0 || requestedIndex >= game.word.length || isNaN(requestedIndex)) {
                return socket.emit('game_error', { message: 'موقعیت حرف نامعتبر است.' });
            }

            const letter = game.word[requestedIndex];
            
            // افشا کردن حرف در revealed_letters
            let newRevealed = { ...game.revealed_letters };
            newRevealed[letter] = newRevealed[letter] || [];
            if (!newRevealed[letter].includes(requestedIndex)) newRevealed[letter].push(requestedIndex);

            await pool.query(`
                UPDATE games SET revealed_letters = $1 WHERE code = $2
            `, [newRevealed, gameCode]);

            io.to(gameCode).emit('message', { type: 'info', text: `راهنمایی: حرف در موقعیت ${requestedIndex} افشا شد.` });
            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در ارائه راهنمایی.' });
        }
    });

    // --- NEW: منطق لیگ ---

    // --- (۸) پیوستن به لیگ ---
    socket.on('joinLeague', async ({ userId, userName }) => {
        try {
            if (!userId || !userName) {
                return socket.emit('game_error', { message: 'اطلاعات کاربر کامل نیست.' });
            }

           
            // پیدا کردن لیگ در حال انتظار
            const waitingLeagueResult = await pool.query(`
                SELECT l.*, COUNT(lp.user_id) as player_count
                FROM leagues l
                LEFT JOIN league_players lp ON l.id = lp.league_id
                WHERE l.status = 'waiting'
                GROUP BY l.id
                HAVING COUNT(lp.user_id) < 5
                ORDER BY l.created_at ASC
                LIMIT 1
            `);

            let league;
            
            if (waitingLeagueResult.rows.length > 0) {
                // پیوستن به لیگ موجود
                league = waitingLeagueResult.rows[0];
            } else {
                // ایجاد لیگ جدید
                const leagueCode = generateGameCode();
                const createRes = await pool.query(
                    `INSERT INTO leagues (code, status, total_words) VALUES ($1, $2, $3) RETURNING *`,
                    [leagueCode, 'waiting', 10]
                );
                league = createRes.rows[0];
            }

            // ثبت بازیکن در لیگ
            await pool.query(`INSERT INTO league_players (league_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [league.id, userId]);

            // عضویت سوکت در روم لیگ
            socket.join(league.code);

            // اطلاع‌رسانی به همه اعضای لیگ
            io.to(league.code).emit('leaguePlayerJoined', { userId, userName });

            // ارسال وضعیت لیگ فعلی به کاربر
            await emitLeagueState(league.code);

        } catch (error) {
            console.error('❌ خطا در پیوستن به لیگ:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به لیگ.' });
        }
    });

    // --- handle joining game room (compatible with frontend payload) ---
    socket.on('join_game_room', async (payload) => {
        try {
            const gameCode = (typeof payload === 'string') ? payload : (payload && payload.gameCode) ? payload.gameCode : payload;
            if (!gameCode) return socket.emit('game_error', { message: 'کد بازی نامعتبر است.' });
            socket.join(gameCode);
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطا در پیوستن به اتاق بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به اتاق بازی.' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🌐 سرور روی پورت ${PORT} در حال اجراست.`);
    });
});
