const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- تنظیمات و متغیرهای محیطی ---
// توجه: این مقادیر برای اجرای آزمایشی هستند و در محیط واقعی باید از متغیرهای محیطی امن استفاده شوند.
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ'; // توکن ربات تلگرام
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws'; // آدرس فرانت اند (که مینی‌اپ در آن میزبانی می‌شود)
const PORT = process.env.PORT || 3000;
const MAX_INCORRECT_GUESSES = 6;
const HINT_COST = 15;
const GAME_TIMEOUT_SECONDS = 180; // 3 دقیقه

// --- راه‌اندازی دیتابیس PostgreSQL ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        require: true,
        rejectUnauthorized: false // برای سرویس‌هایی مانند Render ممکن است لازم باشد
    }
});

// --- راه‌اندازی سرور اکسپرس و Socket.io ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL, // محدود کردن دسترسی فقط به آدرس فرانت اند
        methods: ["GET", "POST"]
    }
});

// استفاده از CORS برای ریکوئست‌های استاندارد HTTP (اگرچه Socket.io خودش CORS دارد)
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// -------------------------------------------------------------------
// --- توابع کمکی دیتابیس و منطق بازی ---
// -------------------------------------------------------------------

/**
 * 💣 مهم: پاکسازی، ایجاد مجدد جداول و پر کردن بانک کلمات (درخواست کاربر)
 */
async function setupDatabase() {
    console.log('🔄 در حال راه‌اندازی و پاکسازی پایگاه داده...');

    // بانک کلمات فارسی (حداقل ۴ حرف)
    const initialWords = [
        'آرمان', 'استقلال', 'افغانستان', 'باغچه', 'پدرام', 'تجارت', 'تکنولوژی', 'جوهر', 'چراغ', 'خانواده',
        'دانه', 'دریا', 'دلار', 'ذرت', 'رایانه', 'زبان', 'ساحل', 'سرباز', 'شیرین', 'صندلی',
        'طوطی', 'طبیعت', 'ظروف', 'عینک', 'غزال', 'فضا', 'فرهنگ', 'قلم', 'کتاب', 'گلدان',
        'لپتاپ', 'مردم', 'مدرسه', 'نوروز', 'هواپیما', 'یادگار', 'تیمسار', 'استوار', 'قهرمان', 'تندیس'
    ].filter(w => w.length >= 4); 

    try {
        // --- (۱) پاکسازی جداول موجود (درخواست کاربر) ---
        console.log('🔥 پاکسازی جداول...');
        // استفاده از CASCADE برای حذف ردیف‌هایی که وابستگی دارند
        await pool.query('DROP TABLE IF EXISTS users CASCADE;');
        await pool.query('DROP TABLE IF EXISTS games CASCADE;');
        await pool.query('DROP TABLE IF EXISTS leaderboard CASCADE;');
        await pool.query('DROP TABLE IF EXISTS words CASCADE;');
        console.log('✅ پاکسازی جداول با موفقیت انجام شد.');

        // --- (۲) ایجاد جدول کلمات ---
        await pool.query(`
            CREATE TABLE words (
                id SERIAL PRIMARY KEY,
                word VARCHAR(50) NOT NULL UNIQUE,
                length INTEGER NOT NULL,
                used_count INTEGER DEFAULT 0
            );
        `);
        console.log('✅ جدول words ایجاد شد.');

        // --- (۳) ایجاد سایر جداول ---
        await pool.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                telegram_id VARCHAR(50) UNIQUE NOT NULL,
                username VARCHAR(100),
                score INTEGER DEFAULT 100
            );
        `);
        console.log('✅ جدول users ایجاد شد.');

        await pool.query(`
            CREATE TABLE games (
                code VARCHAR(10) PRIMARY KEY,
                creator_id INTEGER REFERENCES users(id),
                opponent_id INTEGER REFERENCES users(id),
                word VARCHAR(50) NOT NULL,
                word_length INTEGER NOT NULL,
                current_guess TEXT DEFAULT '[]'::text, -- JSON array of guessed letters
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished', 'cancelled')),
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                incorrect_guesses INTEGER DEFAULT 0,
                hint_cost INTEGER DEFAULT 0, 
                winner_id INTEGER REFERENCES users(id)
            );
        `);
        console.log('✅ جدول games ایجاد شد.');

        await pool.query(`
            CREATE TABLE leaderboard (
                user_id INTEGER REFERENCES users(id) UNIQUE,
                score INTEGER DEFAULT 100
            );
        `);
        console.log('✅ جدول leaderboard ایجاد شد.');

        // --- (۴) پر کردن جدول کلمات ---
        console.log('📝 در حال پر کردن جدول کلمات...');
        let insertQuery = `INSERT INTO words (word, length) VALUES `;
        const values = [];
        let valueIndex = 1;
        
        initialWords.forEach(word => {
            insertQuery += `($${valueIndex++}, $${valueIndex++}), `;
            values.push(word, word.length);
        });
        
        insertQuery = insertQuery.slice(0, -2) + ' ON CONFLICT (word) DO NOTHING;';
        
        await pool.query(insertQuery, values);
        console.log(`✅ ${initialWords.length} کلمه اولیه به جدول اضافه شد.`);

    } catch (error) {
        console.error('❌ خطای بحرانی در راه‌اندازی پایگاه داده:', error);
        // توقف برنامه در صورت عدم موفقیت در راه‌اندازی دیتابیس
        // process.exit(1); 
    }
}


/**
 * کلمه‌ای تصادفی را از جدول words انتخاب می‌کند.
 * @returns {Promise<string>} کلمه جدید.
 */
async function getNewWord() {
    try {
        // انتخاب تصادفی یک کلمه که کمترین استفاده را داشته است 
        const result = await pool.query(
            'SELECT word FROM words ORDER BY used_count ASC, RANDOM() LIMIT 1'
        );
        
        if (result.rows.length === 0) {
            console.error('⚠️ بانک کلمات خالی است.');
            return 'بحران'; 
        }
        
        const newWord = result.rows[0].word;
        
        // افزایش شمارنده استفاده (used_count)
        await pool.query(
            'UPDATE words SET used_count = used_count + 1 WHERE word = $1',
            [newWord]
        );
        
        return newWord;
    } catch (error) {
        console.error('❌ خطای دریافت کلمه جدید از دیتابیس:', error);
        return 'دیتابیس';
    }
}

/**
 * یک کد تصادفی و منحصر به فرد برای بازی تولید می‌کند.
 */
function generateGameCode(length = 6) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * وضعیت فعلی بازی را به کلاینت‌ها ارسال می‌کند.
 */
async function emitGameState(gameCode) {
    try {
        const gameResult = await pool.query(
            `SELECT 
                g.code, g.word_length, g.current_guess, g.status, g.incorrect_guesses, g.start_time, g.hint_cost,
                uc.username AS creator_username, uc.telegram_id AS creator_telegram_id, uc.score AS creator_score,
                uo.username AS opponent_username, uo.telegram_id AS opponent_telegram_id, uo.score AS opponent_score
            FROM games g
            JOIN users uc ON g.creator_id = uc.id
            LEFT JOIN users uo ON g.opponent_id = uo.id
            WHERE g.code = $1`,
            [gameCode]
        );

        if (gameResult.rows.length === 0) {
            io.to(gameCode).emit('game_not_found', { message: 'بازی یافت نشد.' });
            return;
        }

        const game = gameResult.rows[0];
        const currentGuesses = JSON.parse(game.current_guess || '[]');
        const maskedWord = game.status === 'finished' ? game.word : [...game.word].map((char, index) => {
            return currentGuesses[index] || (index < game.word_length ? '' : null);
        }).filter(c => c !== null); // اطمینان از حذف خانه های اضافی در صورت خطا

        // ساخت آبجکت وضعیت برای ارسال به فرانت اند
        const gameState = {
            code: game.code,
            wordLength: game.word_length,
            status: game.status,
            maskedWord: maskedWord,
            incorrectGuesses: game.incorrect_guesses,
            hintCost: game.hint_cost,
            startTime: game.start_time ? game.start_time.toISOString() : null,
            creator: {
                username: game.creator_username,
                telegramId: game.creator_telegram_id,
                score: game.creator_score,
            },
            opponent: game.opponent_username ? {
                username: game.opponent_username,
                telegramId: game.opponent_telegram_id,
                score: game.opponent_score,
            } : null,
            maxIncorrectGuesses: MAX_INCORRECT_GUESSES,
            gameTimeoutSeconds: GAME_TIMEOUT_SECONDS,
        };

        io.to(gameCode).emit('game_state_update', gameState);
    } catch (error) {
        console.error('❌ خطای ارسال وضعیت بازی:', error);
    }
}

/**
 * امتیاز کاربر را به‌روز کرده و جدول امتیازات را به همه ارسال می‌کند.
 */
async function updateScoreAndEmitLeaderboard(userId, pointsChange) {
    try {
        // ۱. به‌روزرسانی امتیاز در جدول کاربران و جدول امتیازات
        const newScore = await pool.query(
            'UPDATE users SET score = score + $1 WHERE id = $2 RETURNING score',
            [pointsChange, userId]
        );
        
        await pool.query(
            'INSERT INTO leaderboard (user_id, score) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET score = EXCLUDED.score',
            [userId, newScore.rows[0].score]
        );

        // ۲. ارسال جدول امتیازات
        const leaderboardResult = await pool.query(`
            SELECT u.username, l.score 
            FROM leaderboard l 
            JOIN users u ON l.user_id = u.id 
            ORDER BY l.score DESC 
            LIMIT 10
        `);

        io.emit('leaderboard_update', leaderboardResult.rows);
    } catch (error) {
        console.error('❌ خطای به‌روزرسانی امتیازات:', error);
    }
}

/**
 * لیست بازی‌های در انتظار را به سوکت ارسال می‌کند.
 */
async function emitWaitingGamesList(socket = io) {
    try {
        const result = await pool.query(`
            SELECT g.code, u.username AS creator_username, g.word_length
            FROM games g
            JOIN users u ON g.creator_id = u.id
            WHERE g.status = 'waiting'
            ORDER BY g.start_time DESC
        `);
        socket.emit('waiting_games_list', result.rows);
    } catch (error) {
        console.error('❌ خطای دریافت لیست بازی‌های در انتظار:', error);
    }
}

// -------------------------------------------------------------------
// --- API Routes (برای ربات تلگرام) ---
// -------------------------------------------------------------------

// تست ساده برای بررسی سلامت سرور
app.get('/', (req, res) => {
    res.send('Wordly Mini App Backend is running.');
});

// -------------------------------------------------------------------
// --- Socket.io Handlers ---
// -------------------------------------------------------------------

io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    // --- (۱) لاگین و بازیابی وضعیت کاربر/بازی ---
    socket.on('user_login', async ({ telegramId, username }) => {
        try {
            let userId;
            let currentUserName = username;

            // ۱. کاربر را در دیتابیس پیدا یا ایجاد کن
            let userResult = await pool.query('SELECT id, username, score FROM users WHERE telegram_id = $1', [telegramId]);

            if (userResult.rows.length === 0) {
                // اگر کاربر جدید است، ایجاد کن
                userResult = await pool.query(
                    'INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING id, username, score',
                    [telegramId, username]
                );
            } else if (userResult.rows[0].username !== username) {
                // اگر نام کاربری تغییر کرده، به‌روزرسانی کن
                await pool.query('UPDATE users SET username = $1 WHERE telegram_id = $2', [username, telegramId]);
                currentUserName = username; // به‌روزرسانی نام کاربری فعلی
            }
            
            userId = userResult.rows[0].id;

            // ۲. ارسال اطلاعات کاربر
            socket.emit('login_success', { 
                userId: userId, 
                username: currentUserName, 
                score: userResult.rows[0].score 
            });

            // ۳. بررسی بازی‌های فعال (Rejoin Logic)
            const activeGameResult = await pool.query(
                `SELECT code 
                 FROM games 
                 WHERE (creator_id = $1 OR opponent_id = $1) 
                 AND status IN ('waiting', 'in_progress')`,
                [userId]
            );

            if (activeGameResult.rows.length > 0) {
                const gameCode = activeGameResult.rows[0].code;
                socket.join(gameCode);
                await emitGameState(gameCode);
            } else {
                // اگر بازی فعال ندارد، لیست بازی‌ها را ارسال کن
                emitWaitingGamesList(socket); 
                // همچنین جدول امتیازات را ارسال کن
                await updateScoreAndEmitLeaderboard(userId, 0); 
            }

        } catch (error) {
            console.error('❌ خطای لاگین کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ورود به سیستم.' });
        }
    });

    // --- (۲) ایجاد بازی جدید ---
    socket.on('create_game', async ({ userId }) => {
        try {
            const newWord = await getNewWord();
            let gameCode;
            let isCodeUnique = false;

            // اطمینان از منحصر به فرد بودن کد بازی
            while (!isCodeUnique) {
                gameCode = generateGameCode();
                const existingGame = await pool.query('SELECT code FROM games WHERE code = $1', [gameCode]);
                if (existingGame.rows.length === 0) {
                    isCodeUnique = true;
                }
            }

            await pool.query(
                `INSERT INTO games (code, creator_id, word, word_length, start_time) 
                 VALUES ($1, $2, $3, $4, NOW())`,
                [gameCode, userId, newWord, newWord.length, new Date()]
            );

            // جوین شدن به اتاق و ارسال وضعیت
            socket.join(gameCode);
            await emitGameState(gameCode);
            emitWaitingGamesList(); // به‌روزرسانی لیست برای همه

        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی جدید.' });
        }
    });

    // --- (۳) جوین شدن به بازی ---
    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query(
                'SELECT status, creator_id, word_length FROM games WHERE code = $1',
                [gameCode]
            );

            if (gameResult.rows.length === 0) {
                return socket.emit('game_error', { message: 'کد بازی نامعتبر است.' });
            }

            const game = gameResult.rows[0];

            if (game.creator_id == userId) {
                 // اگر خود سازنده دوباره وصل شده
                 socket.join(gameCode);
                 return await emitGameState(gameCode);
            }

            if (game.status === 'waiting') {
                // تبدیل وضعیت بازی به 'in_progress' و افزودن حریف
                await pool.query(
                    `UPDATE games SET opponent_id = $1, status = 'in_progress', start_time = NOW() WHERE code = $2`,
                    [userId, gameCode]
                );

                socket.join(gameCode);
                await emitGameState(gameCode);
                emitWaitingGamesList(); // به‌روزرسانی لیست برای همه

            } else {
                socket.emit('game_error', { message: 'بازی در حال انجام یا تمام شده است.' });
            }

        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در اتصال به بازی.' });
        }
    });

    // --- (۴) ارسال حدس (Guess) ---
    socket.on('submit_guess', async ({ userId, gameCode, guess }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            if (gameResult.rows.length === 0 || gameResult.rows[0].status !== 'in_progress') {
                return socket.emit('game_error', { message: 'بازی در حال انجام نیست.' });
            }

            const game = gameResult.rows[0];
            const currentGuesses = JSON.parse(game.current_guess || '[]');
            const word = game.word;
            const guessChar = guess.trim()[0]; 

            // ۱. بررسی نوبت
            const isCreatorTurn = (game.incorrect_guesses + currentGuesses.filter(c => c).length) % 2 === 0;
            const isMyTurn = isCreatorTurn ? (game.creator_id == userId) : (game.opponent_id == userId);

            if (!isMyTurn) {
                return socket.emit('game_error', { message: 'صبر کن، نوبت حریف است!' });
            }

            // ۲. بررسی تکراری بودن حرف
            if (currentGuesses.includes(guessChar)) {
                return socket.emit('guess_result', { isCorrect: false, message: `حرف "${guessChar}" قبلا حدس زده شده است.` });
            }

            // ۳. پردازش حدس
            if (word.includes(guessChar)) {
                // حدس صحیح
                const newGuesses = [...currentGuesses];
                let allGuessed = true;
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === guessChar) {
                        newGuesses[i] = guessChar;
                    }
                    if (!newGuesses[i] && word[i] !== ' ') { // بررسی اینکه هنوز جای خالی وجود دارد
                        allGuessed = false;
                    }
                }

                await pool.query(
                    'UPDATE games SET current_guess = $1 WHERE code = $2',
                    [JSON.stringify(newGuesses), gameCode]
                );

                // پایان بازی در صورت حدس کامل
                if (allGuessed) {
                    const now = new Date();
                    const startTime = new Date(game.start_time);
                    const timeTaken = (now.getTime() - startTime.getTime()) / 1000; // زمان بر حسب ثانیه
                    const userNameResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
                    const currentUserName = userNameResult.rows[0].username;

                    // محاسبه امتیاز (امتیاز بر اساس سختی کلمه، سرعت و کسر راهنما)
                    const pointsGained = Math.max(1, Math.floor(
                        (100 + (10 * word.length)) - (5 * game.incorrect_guesses) - (timeTaken / 10) - game.hint_cost
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


            } else {
                // حدس غلط
                const newIncorrect = game.incorrect_guesses + 1;
                await pool.query(
                    'UPDATE games SET incorrect_guesses = $1 WHERE code = $2',
                    [newIncorrect, gameCode]
                );

                // پایان بازی در صورت تعداد حدس غلط بیش از حد
                if (newIncorrect >= MAX_INCORRECT_GUESSES) {
                    // بازنده کسی است که حدس غلط را زده
                    const loserId = userId; 
                    const winnerId = (loserId == game.creator_id) ? game.opponent_id : game.creator_id;
                    const winnerResult = await pool.query('SELECT username FROM users WHERE id = $1', [winnerId]);
                    const winnerName = winnerResult.rows[0].username;

                    // امتیاز بازنده کسر و امتیاز برنده افزایش می‌یابد
                    await updateScoreAndEmitLeaderboard(loserId, -50); 
                    await updateScoreAndEmitLeaderboard(winnerId, 50);

                    await pool.query(
                        'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                        ['finished', winnerId, gameCode]
                    );

                    io.to(gameCode).emit('game_finished', { 
                        winnerName: winnerName, 
                        points: 50, // امتیاز برنده
                        word: game.word,
                        isHangmanWin: true // برنده با مکانیزم آویز (اشتباهات)
                    });
                }
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای ارسال حدس:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });

    // --- (۵) درخواست لیست بازی‌ها ---
    socket.on('request_waiting_games_list', () => {
        emitWaitingGamesList(socket);
    });

    // --- (۶) درخواست راهنما (Hint) ---
    socket.on('request_hint', async ({ userId, gameCode, letterPosition }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            if (gameResult.rows.length === 0 || gameResult.rows[0].status !== 'in_progress') {
                return socket.emit('game_error', { message: 'بازی در حال انجام نیست.' });
            }

            const game = gameResult.rows[0];
            const currentGuesses = JSON.parse(game.current_guess || '[]');
            const word = game.word;

            if (letterPosition < 0 || letterPosition >= word.length) {
                return socket.emit('game_error', { message: 'موقعیت حرف نامعتبر است.' });
            }
            
            // ۱. بررسی اینکه حرف قبلاً حدس زده شده باشد
            if (currentGuesses[letterPosition]) {
                 return socket.emit('guess_result', { isCorrect: false, message: 'این حرف قبلاً مشخص شده است.' });
            }

            // ۲. پیدا کردن حرف
            const hintChar = word[letterPosition];
            
            // ۳. اعمال هزینه
            const newHintCost = game.hint_cost + HINT_COST;
            await pool.query(
                'UPDATE games SET hint_cost = $1 WHERE code = $2',
                [newHintCost, gameCode]
            );
            
            // ۴. نمایش حرف در تمام موقعیت‌هایش (مانند حدس صحیح)
            const newGuesses = [...currentGuesses];
            let allGuessed = true;
            for (let i = 0; i < word.length; i++) {
                if (word[i] === hintChar) {
                    newGuesses[i] = hintChar;
                }
                if (!newGuesses[i] && word[i] !== ' ') {
                    allGuessed = false;
                }
            }

            await pool.query(
                'UPDATE games SET current_guess = $1 WHERE code = $2',
                [JSON.stringify(newGuesses), gameCode]
            );

             // کسر امتیاز از کاربر
            await updateScoreAndEmitLeaderboard(userId, -HINT_COST);
            
            // اگر بازی تمام شد
            if (allGuessed) {
                const now = new Date();
                const startTime = new Date(game.start_time);
                const timeTaken = (now.getTime() - startTime.getTime()) / 1000;
                const userNameResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
                const currentUserName = userNameResult.rows[0].username;

                // محاسبه امتیاز با کسر نهایی هزینه راهنما
                const pointsGained = Math.max(1, Math.floor(
                    (100 + (10 * word.length)) - (5 * game.incorrect_guesses) - (timeTaken / 10) - newHintCost
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

    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی دیتابیس و سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور در پورت ${PORT} اجرا شد.`);
        console.log(`📡 URL فرانت‌اند: ${FRONTEND_URL}`);
    });
});
