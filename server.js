const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- تنظیمات و متغیرهای محیطی ---
// توجه: در محیط رندر (render.com)، متغیرهای محیطی باید به درستی تنظیم شوند.
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ'; // استفاده نشده اما برای مرجع نگه داشته شده
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws'; // آدرس فرانت اند
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی دیتابیس PostgreSQL ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    // FIX START: تنظیمات SSL برای رفع خطای "Connection terminated unexpectedly"
    ssl: {
        // اطمینان از اینکه SSL باید استفاده شود
        require: true,
        // اجازه دادن به گواهی‌های بدون اعتبار (خود امضا شده) که در محیط‌های ابری رایج است
        rejectUnauthorized: false
    }
    // FIX END
});

// اتصال و اطمینان از وجود جداول
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // جدول کاربران
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

        console.log('✅ جداول دیتابیس بررسی و ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err.message);
        // اگر نتوانستیم به دیتابیس متصل شویم، ادامه نمی‌دهیم
        process.exit(1);
    }
}

// --- راه‌اندازی سرور Express و Socket.io ---
const app = express();
const server = http.createServer(app);

// فعال‌سازی CORS برای ارتباط بین فرانت و بک
app.use(cors({
    origin: FRONTEND_URL, // فقط فرانت اند مشخص شده
    methods: ['GET', 'POST']
}));

// استفاده از JSON در درخواست‌ها
app.use(express.json());

// راه‌اندازی Socket.io
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// --- توابع کمکی ---
const generateGameCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

/**
 * وضعیت بازی را به کلاینت‌ها ارسال می‌کند
 * @param {string} gameCode کد بازی
 */
async function emitGameState(gameCode) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        const game = result.rows[0];

        if (game) {
            // دریافت اطلاعات کامل سازنده و حدس زننده
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }

            // وضعیت فیلتر شده بازی (کلمه اصلی مخفی می‌شود)
            const gameState = {
                code: game.code,
                status: game.status,
                category: game.category,
                wordLength: game.word.length,
                maxGuesses: game.max_guesses,
                guessesLeft: game.guesses_left,
                correctGuesses: game.correct_guesses,
                incorrectGuesses: game.incorrect_guesses,
                revealedLetters: game.revealed_letters,
                guessedLetters: game.guessed_letters,
                startTime: game.start_time,
                creator: creator,
                guesser: guesser
            };

            io.to(gameCode).emit('game_update', gameState);
            console.log(`📡 وضعیت جدید بازی ${gameCode} ارسال شد.`);
        } else {
            io.to(gameCode).emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
        }
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت بازی ${gameCode}:`, error);
    }
}

/**
 * امتیاز کاربر را به‌روزرسانی کرده و جدول رتبه‌بندی را بروزرسانی می‌کند
 * @param {bigint} userId آیدی تلگرام کاربر برنده
 * @param {number} points امتیاز
 */
async function updateScoreAndEmitLeaderboard(userId, points) {
    await pool.query('UPDATE users SET score = score + $1 WHERE telegram_id = $2', [points, userId]);
    await emitLeaderboard();
}

/**
 * جدول رتبه‌بندی را به تمامی کلاینت‌ها ارسال می‌کند
 */
async function emitLeaderboard() {
    try {
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    // نگهداری اطلاعات کاربر متصل شده
    let currentUserId = null;
    let currentUserName = null;

    // --- (۱) ورود و ثبت‌نام کاربر ---
    socket.on('user_login', async ({ userId, name }) => {
        try {
            currentUserId = userId;
            currentUserName = name;
            
            // ثبت یا به‌روزرسانی کاربر
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [userId, name]
            );

            socket.join(`user:${userId}`);
            console.log(`👤 کاربر وارد شد: ${name} (${userId})`);
            
            // ارسال وضعیت خوشامدگویی
            socket.emit('login_success', { name, userId });

            // ارسال جدول رتبه‌بندی اولیه
            await emitLeaderboard();
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

    // --- (۳) لیست بازی‌های منتظر ---
    socket.on('list_waiting_games', async () => {
        try {
            const result = await pool.query(`
                SELECT g.code, g.category, u.name as creator_name, g.word, g.max_guesses
                FROM games g JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.creator_id != $1
            `, [currentUserId]);
            
            // کلمه اصلی را در اینجا فیلتر می‌کنیم
            const waitingGames = result.rows.map(game => ({
                code: game.code,
                category: game.category,
                creatorName: game.creator_name,
                wordLength: game.word.length,
                maxGuesses: game.max_guesses
            }));
            
            socket.emit('waiting_games_list', waitingGames);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌ها:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌ها.' });
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
            
            console.log(`🔗 کاربر ${userId} به بازی ${gameCode} پیوست.`);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });
    
    // --- (۵) مدیریت بازی (حدس زدن) ---
    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];
            
            if (!game || game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به حدس زدن در این بازی نیستید.' });
            }
            
            const normalizedLetter = letter.trim().toLowerCase();
            
            if (normalizedLetter.length !== 1 || !/^[\u0600-\u06FF]$/.test(normalizedLetter)) {
                return socket.emit('game_error', { message: 'لطفا فقط یک حرف فارسی وارد کنید.' });
            }
            
            if (game.guessed_letters.includes(normalizedLetter)) {
                 // اطلاع به هر دو کاربر که حرف تکراری است
                io.to(gameCode).emit('message', { 
                    type: 'warning', 
                    text: `⚠️ حرف "${normalizedLetter}" قبلاً حدس زده شده است.` 
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
            let winnerId = null;
            let pointsGained = 0;
            
            // به‌روزرسانی وضعیت در دیتابیس
            await pool.query(
                `UPDATE games SET 
                guesses_left = $1, 
                correct_guesses = $2, 
                incorrect_guesses = $3, 
                revealed_letters = $4,
                guessed_letters = array_append(guessed_letters, $5)
                WHERE code = $6`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, normalizedLetter, gameCode]
            );

            // ارسال پیام به هر دو کاربر
            const messageType = isCorrect ? 'success' : 'error';
            io.to(gameCode).emit('message', { 
                type: messageType, 
                text: `${currentUserName} حدس زد: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` 
            });

            // بررسی پایان بازی (تمام شدن حدس‌ها یا تکمیل کلمه)
            const allLetters = Array.from(new Set(game.word.split('')));
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount === game.word.length) {
                gameStatus = 'finished';
                winnerId = userId;
                
                const timeTaken = (Date.now() - game.start_time) / 1000; // ثانیه
                
                // فرمول امتیازدهی: 1000 - (10 * غلط) - (1 * زمان) + (50 * تعداد حرف)
                pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * newIncorrectGuesses) - (timeTaken) + (50 * game.word.length)
                ));
                
                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                    [gameStatus, winnerId, gameCode]
                );
                await updateScoreAndEmitLeaderboard(winnerId, pointsGained);
            } else if (newGuessesLeft <= 0) {
                gameStatus = 'finished';
                // کسی برنده نشد یا امتیاز منفی ناچیز به حدس زننده
                pointsGained = -5; // امتیاز منفی برای بازی باخته
                winnerId = null;
                
                 await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW() WHERE code = $2',
                    [gameStatus, gameCode]
                );
                await updateScoreAndEmitLeaderboard(userId, pointsGained); // کسر امتیاز
            }

            // ارسال به‌روزرسانی نهایی یا مرحله‌ای
            if (gameStatus === 'finished') {
                io.to(gameCode).emit('game_finished', { 
                    winnerName: winnerId ? currentUserName : 'هیچکس', 
                    points: pointsGained,
                    word: game.word
                });
            }
            
            // وضعیت بازی برای همه ارسال شود
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
            const currentHints = Object.keys(game.revealed_letters).filter(key => game.word.indexOf(key) === parseInt(letterPosition));
            if (currentHints.length >= 2) {
                return socket.emit('game_error', { message: 'شما از هر ۲ راهنمایی مجاز استفاده کرده‌اید.' });
            }
            
            const requestedIndex = parseInt(letterPosition);
            if (requestedIndex < 0 || requestedIndex >= game.word.length || isNaN(requestedIndex)) {
                return socket.emit('game_error', { message: 'موقعیت حرف نامعتبر است.' });
            }

            const letter = game.word[requestedIndex];
            
            // اگر حرف قبلاً پیدا شده باشد، نباید امتیاز کم شود.
            if (game.revealed_letters && game.revealed_letters[letter] && game.revealed_letters[letter].includes(requestedIndex)) {
                return socket.emit('message', { type: 'info', text: '⚠️ این حرف قبلاً در این موقعیت مشخص شده است.' });
            }

            // کسر امتیاز
            const hintCost = 15;
            await updateScoreAndEmitLeaderboard(userId, -hintCost); // کسر امتیاز

            // اضافه کردن حرف به حروف کشف شده
            let newRevealed = { ...game.revealed_letters };
            let indices = newRevealed[letter] || [];
            
            // پیدا کردن تمام موقعیت‌های این حرف
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === letter && !indices.includes(i)) {
                    indices.push(i);
                }
            }
            newRevealed[letter] = indices.sort((a, b) => a - b);
            
            // به‌روزرسانی دیتابیس
            await pool.query(
                `UPDATE games SET 
                revealed_letters = $1
                WHERE code = $2`,
                [newRevealed, gameCode]
            );

            io.to(gameCode).emit('message', { 
                type: 'hint', 
                text: `${currentUserName} درخواست راهنمایی کرد (-${hintCost} امتیاز) و حرف در موقعیت ${requestedIndex + 1} کشف شد.` 
            });
            
            // بررسی برد پس از راهنمایی (اگر کلمه تکمیل شد)
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount === game.word.length) {
                const timeTaken = (Date.now() - game.start_time) / 1000;
                let pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * game.incorrect_guesses) - (timeTaken) + (50 * game.word.length) - (2 * hintCost) // کسر مضاعف به دلیل استفاده از راهنما
                ));
                
                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                    ['finished', userId, gameCode]
                );
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
                
                io.to(gameCode).emit('game_finished', { 
                    winnerName: currentUserName, 
                    points: pointsGained,
                    word: game.word
                });
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در ارائه راهنمایی.' });
        }
    });

    // --- (۷) جوین شدن به اتاق بازی برای سازنده ---
    socket.on('join_game_room', async (gameCode) => {
        socket.join(gameCode);
        await emitGameState(gameCode);
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
