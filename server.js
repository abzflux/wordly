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

// --- راه‌اندازی ربات تلگرام ---
// در محیط‌های Production بهتر است از Webhook استفاده شود، اما برای سادگی از Polling استفاده می‌کنیم.
// توجه: اگر توکن واقعی ربات را اینجا قرار ندهید، این بخش کار نخواهد کرد.
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ربات تلگرام فعال شد.');

// --- مجموعه کلمات لیگ ---
const leagueWords = {
    "حیوانات": [
        "شیر", "فیل", "گربه", "سگ", "خرس", "گرگ", "روباه", "خرگوش", "گاو", "گوسفند",
    ],
    "میوه‌ها": [
        "سیب", "موز", "پرتقال", "نارنگی", "لیمو", "گریپ فروت", "انار", "انگور", "هلو", "زردآلو",
    ],
    "سبزیجات": [
        "هویج", "سیب زمینی", "پیاز", "سیر", "کلم", "کاهو", "اسفناج", "جعفری", "نعناع", "تربچه",
    ],
    "شهرها": [
        "تهران", "مشهد", "اصفهان", "شیراز", "تبریز", "کرج", "قم", "اهواز", "کرمانشاه", "ارومیه",
       
    ],
    "کشورها": [
        "ایران", "عراق", "ترکیه", "افغانستان", "پاکستان", "عربستان", "امارات", "قطر", "کویت", "عمان",
      
    ],
    "اشیا": [
        "میز", "صندلی", "کتاب", "قلم", "دفتر", "مداد", "پاک‌کن", "خط‌کش", "گچ", "تخته",
        
    ],
    "حرفه‌ها": [
        "پزشک", "مهندس", "معلم", "پرستار", "پلیس", "آتش‌نشان", "خلبان", "راننده", "کشاورز", "دامدار",
        "باغبان", "نجار", "آهنگر", "جوشکار", "برقکار", "لوله‌کش", "نقاش", "مجسمه‌ساز", "عکاس", "فیلمبردار",
      
    ],
    "ورزش‌ها": [
        "فوتبال", "والیبال", "بسکتبال", "تنیس", "بدمینتون", "پینگ‌پنگ", "گلف", "هاکی", "کریکت", "بیسبال",
        "بوکس", "کشتی", "جودو", "کاراته", "تکواندو", "کونگ‌فو", "موای‌تای", "کیک‌بوکسینگ", "مبارزه", "شمشیربازی",],
     
    "غذاها": [
        "قورمه‌سبزی", "قیمه", "خورشت", "کباب", "جوجه‌کباب", "چلوکباب", "برنج", "پلو", "چلو", "عدس‌پلو",
        "لوبیاپلو", "سبزی‌پلو", "ماهی‌پلو", "آلبالوپلو", "زرشک‌پلو", "شویدپلو", "استامبولی", "دلمه", "دلمه‌برگ", "دلمه‌فلفل",],
     
    "رنگ‌ها": [
        "قرمز", "نارنجی", "زرد", "سبز", "آبی", "نیلی", "بنفش", "صورتی", "قهوه‌ای", "مشکی",
    ]
};

// --- منطق ربات تلگرام (پاسخ به /start) ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = msg.from.first_name || msg.from.username || 'کاربر ناشناس';

    try {
        // ثبت یا به‌روزرسانی کاربر در دیتابیس
        await pool.query(
            `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
            ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
            [userId, name]
        );
        
        // ارسال پیام خوشامدگویی با لینک بازی
        const welcomeMessage = `
            سلام ${name}، به بازی Wordly خوش آمدید! 🤖
            
            شما اکنون ثبت‌نام شده‌اید. 
            برای شروع بازی و رقابت با دیگران، لطفاً روی دکمه یا لینک زیر کلیک کنید:
        `;

        // دکمه شیشه‌ای (Inline Keyboard) برای هدایت به Mini App
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: 'شروع بازی (Mini App)',
                        web_app: { url: FRONTEND_URL }
                    }
                ]
            ]
        };

        bot.sendMessage(chatId, welcomeMessage, { 
            reply_markup: inlineKeyboard,
            parse_mode: 'Markdown' 
        });

        // پیام راهنمایی برای نمایش آیدی
        bot.sendMessage(chatId, `کد کاربری (Telegram ID) شما: \`${userId}\``, { parse_mode: 'Markdown' });

        console.log(`🤖 ربات به کاربر ${userId} پاسخ /start داد.`);
        
    } catch (error) {
        console.error('❌ خطای پردازش فرمان /start:', error);
        bot.sendMessage(chatId, 'خطایی در ثبت‌نام شما در دیتابیس رخ داد. لطفا دوباره تلاش کنید.');
    }
});
// ------------------------------------------

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

        // --- NEW: جدول بازیکنان لیگ ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_players (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                score INT DEFAULT 0,
                correct_words INT DEFAULT 0,
                total_time INT DEFAULT 0, -- زمان کل صرف شده برای تمام کلمات (ثانیه)
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(league_id, user_id)
            );
        `);

        // --- NEW: جدول کلمات لیگ ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_words (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                word_number INT NOT NULL,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                max_guesses INT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed'))
            );
        `);

        // --- NEW: جدول وضعیت بازیکنان در کلمات لیگ ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_player_words (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                word_number INT NOT NULL,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                guesses_left INT NOT NULL,
                correct_guesses INT DEFAULT 0,
                incorrect_guesses INT DEFAULT 0,
                revealed_letters JSONB DEFAULT '{}',
                guessed_letters VARCHAR(1)[] DEFAULT '{}',
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
                time_taken INT DEFAULT 0, -- زمان صرف شده برای این کلمه (ثانیه)
                score_earned INT DEFAULT 0,
                UNIQUE(league_id, user_id, word_number)
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

// --- NEW: توابع کمکی لیگ ---
/**
 * تولید کلمه تصادفی برای لیگ
 * @returns {Object} شیء حاوی کلمه و دسته‌بندی
 */
function getRandomLeagueWord() {
    const categories = Object.keys(leagueWords);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const wordsInCategory = leagueWords[randomCategory];
    const randomWord = wordsInCategory[Math.floor(Math.random() * wordsInCategory.length)];
    return { word: randomWord, category: randomCategory };
}

/**
 * ارسال وضعیت لیگ به تمام بازیکنان
 * @param {string} leagueCode کد لیگ
 */
async function emitLeagueState(leagueCode) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];
        if (!league) return;

        // دریافت بازیکنان لیگ
        const playersResult = await pool.query(`
            SELECT u.telegram_id, u.name, lp.score, lp.correct_words, lp.total_time
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = $1
            ORDER BY lp.score DESC
        `, [league.id]);
        const players = playersResult.rows;

        // دریافت کلمه فعلی
        let currentWord = null;
        let currentCategory = null;
        if (league.status === 'in_progress') {
            const currentWordResult = await pool.query(`
                SELECT word, category FROM league_words WHERE league_id = $1 AND word_number = $2
            `, [league.id, league.current_word_number]);
            if (currentWordResult.rows.length > 0) {
                currentWord = currentWordResult.rows[0].word;
                currentCategory = currentWordResult.rows[0].category;
            }
        }

        // ساخت وضعیت لیگ برای ارسال
        const leagueState = {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            players: players,
            currentWord: currentWord, // ارسال کلمه اصلی فقط برای بررسی منطق
            currentCategory: currentCategory
        };

        // ارسال به تمام بازیکنان لیگ
        io.to(leagueCode).emit('leagueStatus', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد.`);
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ:`, error);
    }
}
// --- پایان توابع کمکی ---

// --- مدیریت اتصالات Socket.io ---
io.on('connection', (socket) => {
    let currentUserId = null;
    let currentSocketId = socket.id;

    console.log(`➕ کاربر جدید متصل شد: ${currentSocketId}`);

    // --- (۱) احراز هویت و ورود کاربر ---
    socket.on('user_login', async (data) => {
        const { userId, userName } = data;
        
        if (!userId) {
            socket.emit('auth_error', { message: 'شناسه کاربری (userId) معتبر نیست.' });
            return;
        }

        currentUserId = userId;
        
        try {
            // ثبت یا به‌روزرسانی کاربر
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [userId, userName]
            );

            // دریافت اطلاعات کاربر
            const userResult = await pool.query('SELECT name, score FROM users WHERE telegram_id = $1', [userId]);
            const user = userResult.rows[0];

            socket.emit('user_login_success', {
                userId: userId,
                userName: user.name,
                score: user.score
            });

            console.log(`✅ کاربر احراز هویت شد: ${user.name} (${userId})`);

            // --- Rejoin Logic: بررسی بازی‌های در حال انجام که کاربر در آن حضور دارد ---
            const activeGamesResult = await pool.query(`
                SELECT code FROM games 
                WHERE (creator_id = $1 OR guesser_id = $1) 
                  AND status = 'in_progress'
            `, [userId]);

            activeGamesResult.rows.forEach(game => {
                socket.join(game.code);
                emitGameState(game.code);
                console.log(`🔁 کاربر ${userId} به اتاق بازی ${game.code} پیوست.`);
            });
            
            // ارسال جدول رتبه‌بندی پس از ورود موفق
            await emitLeaderboard();
            
        } catch (error) {
            console.error('❌ خطای احراز هویت:', error);
            socket.emit('auth_error', { message: 'خطا در احراز هویت و ثبت کاربر در دیتابیس.' });
        }
    });

    // --- (۲) شروع یک بازی جدید ---
    socket.on('create_game', async ({ word, category, maxGuesses }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });
        if (!word || !category || !maxGuesses || maxGuesses < 1) {
            return socket.emit('game_error', { message: 'لطفاً تمام فیلدها را به درستی پر کنید.' });
        }
        
        const gameCode = generateGameCode();

        try {
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, start_time, status)
                 VALUES ($1, $2, $3, $4, $5, $5, CURRENT_TIMESTAMP, 'waiting') RETURNING *`,
                [gameCode, currentUserId, word, category, maxGuesses]
            );

            // سازنده به اتاق بازی خود می‌پیوندد و وضعیت اولیه را دریافت می‌کند
            socket.join(gameCode);
            await emitGameState(gameCode);
            
            socket.emit('game_created', { gameCode });
            
            // درخواست به‌روزرسانی لیست بازی‌های در انتظار برای همه
            io.emit('request_waiting_games_update');
            
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی در دیتابیس.' });
        }
    });

    // --- (۳) پیوستن به بازی ---
    socket.on('join_game', async ({ gameCode }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });

        try {
            // ۱. بررسی و به‌روزرسانی بازی
            const result = await pool.query(
                `UPDATE games SET guesser_id = $1, status = 'in_progress', start_time = CURRENT_TIMESTAMP
                 WHERE code = $2 AND status = 'waiting' AND creator_id != $1 RETURNING *`,
                [currentUserId, gameCode]
            );

            if (result.rows.length === 0) {
                return socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد یا در وضعیت شروع نیست، یا شما سازنده آن هستید.' });
            }

            // ۲. حدس زننده به اتاق بازی می‌پیوندد
            socket.join(gameCode);
            
            // ۳. به‌روزرسانی وضعیت بازی برای همه بازیکنان (سازنده و حدس زننده)
            await emitGameState(gameCode);
            
            socket.emit('game_joined', { gameCode });
            
            // ۴. درخواست به‌روزرسانی لیست بازی‌های در انتظار برای همه (جهت حذف بازی شروع شده)
            io.emit('request_waiting_games_update');

        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    // --- (۴) حدس زدن ---
    socket.on('submit_guess', async ({ gameCode, guess }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });
        if (!guess || guess.length !== 1 || !/^[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]$/.test(guess)) {
            return socket.emit('game_error', { message: 'لطفاً یک حرف معتبر فارسی وارد کنید.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN'); // شروع تراکنش

            // ۱. دریافت و قفل کردن رکورد بازی
            const gameResult = await client.query('SELECT * FROM games WHERE code = $1 FOR UPDATE', [gameCode]);
            const game = gameResult.rows[0];

            if (!game || game.status !== 'in_progress') {
                await client.query('ROLLBACK');
                return socket.emit('game_error', { message: 'بازی یافت نشد یا در حال انجام نیست.' });
            }
            
            // فقط حدس زننده می‌تواند حدس بزند
            if (game.guesser_id.toString() !== currentUserId.toString()) {
                 await client.query('ROLLBACK');
                return socket.emit('game_error', { message: 'شما حدس زننده این بازی نیستید.' });
            }

            const normalizedGuess = guess.trim(); 
            const word = game.word;
            let guessesLeft = game.guesses_left;
            let correctGuesses = game.correct_guesses;
            let incorrectGuesses = game.incorrect_guesses;
            let revealedLetters = game.revealed_letters;
            let guessedLetters = game.guessed_letters || [];
            let status = game.status;
            let winnerId = game.winner_id;
            let pointsAwarded = 0;

            if (guessedLetters.includes(normalizedGuess)) {
                await client.query('ROLLBACK');
                return socket.emit('game_message', { message: `حرف "${normalizedGuess}" قبلاً حدس زده شده است.`, type: 'info' });
            }
            
            guessedLetters.push(normalizedGuess);

            // ۲. بررسی حدس
            let isCorrect = false;
            let newRevealedCount = 0;
            const newIndices = [];

            for (let i = 0; i < word.length; i++) {
                if (word[i] === normalizedGuess) {
                    isCorrect = true;
                    newIndices.push(i);
                    newRevealedCount++;
                }
            }

            if (isCorrect) {
                correctGuesses++;
                revealedLetters[normalizedGuess] = newIndices;
                
                // بررسی برد (پایان بازی)
                const allRevealedIndices = Object.values(revealedLetters).flat().length;
                if (allRevealedIndices === word.length) {
                    status = 'finished';
                    winnerId = currentUserId;
                    // محاسبه امتیاز: مثلاً ۱۰ امتیاز برای هر حدس باقی‌مانده + پاداش برد (۵۰ امتیاز)
                    pointsAwarded = (guessesLeft * 10) + 50; 
                    socket.emit('game_message', { message: 'شما برنده شدید! کلمه را به طور کامل کشف کردید.', type: 'success' });
                } else {
                     socket.emit('game_message', { message: `آفرین! حرف "${normalizedGuess}" درست بود.`, type: 'success' });
                }

            } else {
                guessesLeft--;
                incorrectGuesses++;
                
                // بررسی باخت (پایان بازی)
                if (guessesLeft <= 0) {
                    status = 'finished';
                    winnerId = game.creator_id; // سازنده برنده می‌شود
                    // امتیاز: مثلاً ۵۰ امتیاز برای سازنده در صورت شکست حدس‌زننده
                    pointsAwarded = 50; 
                    socket.emit('game_message', { message: 'متأسفانه حدس‌های شما تمام شد. بازی پایان یافت.', type: 'error' });
                    // همچنین باید به سازنده هم اطلاع داده شود که حدس‌زننده شکست خورد
                    io.to(game.creator_id).emit('game_message', { message: `حدس‌زننده در بازی ${gameCode} شکست خورد. ۵۰ امتیاز به شما افزوده شد.`, type: 'success' });
                } else {
                    socket.emit('game_message', { message: `اشتباه بود. حرف "${normalizedGuess}" در کلمه نیست.`, type: 'error' });
                }
            }

            // ۳. به‌روزرسانی دیتابیس
            await client.query(
                `UPDATE games 
                 SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3, 
                     revealed_letters = $4, guessed_letters = $5, status = $6, winner_id = $7, 
                     end_time = CASE WHEN $6 = 'finished' THEN CURRENT_TIMESTAMP ELSE end_time END
                 WHERE id = $8`,
                [guessesLeft, correctGuesses, incorrectGuesses, revealedLetters, guessedLetters, status, winnerId, game.id]
            );
            
            // ۴. به‌روزرسانی امتیاز برنده (در صورت اتمام بازی)
            if (status === 'finished' && winnerId) {
                 await client.query(
                    `UPDATE users SET score = score + $1 WHERE telegram_id = $2`,
                    [pointsAwarded, winnerId]
                );
            }

            await client.query('COMMIT'); // پایان تراکنش

            // ۵. ارسال وضعیت جدید
            await emitGameState(gameCode);
            if (status === 'finished') {
                await emitLeaderboard();
            }

        } catch (error) {
            await client.query('ROLLBACK'); // در صورت خطا، بازگشت تراکنش
            console.error('❌ خطای ارسال حدس:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس در دیتابیس.' });
        } finally {
            client.release();
        }
    });

    // --- (۵) دریافت لیست بازی‌های در انتظار ---
    socket.on('get_waiting_games', async () => {
        try {
            // دریافت لیست بازی‌های در انتظار که کاربر در آن‌ها سازنده نیست
            const result = await pool.query(`
                SELECT g.code, g.category, u.name AS creator_name
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.creator_id != $1
                ORDER BY g.start_time DESC
            `, [currentUserId]); 

            socket.emit('waiting_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌ها:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های منتظر.' });
        }
    });

    // --- (۶) دریافت وضعیت لیگ ---
    socket.on('getLeagueStatus', async () => {
        // ... (Existing logic for getLeagueStatus)
        if (!currentUserId) return;
        try {
            // پیدا کردن لیگ‌های فعال کاربر (جهت نمایش وضعیت بازی)
            const activeLeaguesResult = await pool.query(`
                SELECT l.code, l.status, l.current_word_number, l.total_words
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
            `, [currentUserId]);

            // پیدا کردن لیگ‌های در حال انتظار
            const waitingLeaguesResult = await pool.query(`
                SELECT l.code, l.status, COUNT(lp.user_id) as player_count
                FROM leagues l
                LEFT JOIN league_players lp ON l.id = lp.league_id
                WHERE l.status = 'waiting'
                GROUP BY l.code, l.status
            `);

            socket.emit('leagueStatus', {
                userLeagues: activeLeaguesResult.rows,
                waitingLeagues: waitingLeaguesResult.rows
            });

        } catch (error) {
            console.error('❌ خطای دریافت وضعیت لیگ:', error);
            socket.emit('game_error', { message: 'خطا در دریافت وضعیت لیگ.' });
        }
    });
    
    // ------------------------------------------------------------------
    // --- NEW: منطق بازی‌های من (My Games) ---
    // ------------------------------------------------------------------

    // --- (۷) دریافت لیست بازی‌های کاربر (ایجاد شده و قابل شرکت) ---
    socket.on('get_my_games', async () => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });

        try {
            // بازی‌های ایجاد شده توسط کاربر
            const createdGamesResult = await pool.query(`
                SELECT g.code, g.status, g.category, u_guesser.name AS guesser_name
                FROM games g
                LEFT JOIN users u_guesser ON g.guesser_id = u_guesser.telegram_id
                WHERE g.creator_id = $1
                ORDER BY g.status, g.start_time DESC
            `, [currentUserId]);

            // بازی‌هایی که کاربر در آن‌ها حدس زننده است یا می‌تواند بپیوندد
            // وضعیت 'waiting' و creator_id != $1 (بازی‌های قابل پیوستن)
            // وضعیت 'in_progress' و guesser_id = $1 (بازی‌های در حال انجام که در آن‌ها حدس‌زننده است)
            const joinableAndGuessingGamesResult = await pool.query(`
                SELECT g.code, g.status, g.category, u_creator.name AS creator_name
                FROM games g
                JOIN users u_creator ON g.creator_id = u_creator.telegram_id
                WHERE (g.guesser_id = $1 AND g.status = 'in_progress') 
                   OR (g.status = 'waiting' AND g.creator_id != $1)
                ORDER BY g.status, g.start_time DESC
            `, [currentUserId]); 

            socket.emit('my_games_list', {
                created: createdGamesResult.rows,
                joinable: joinableAndGuessingGamesResult.rows
            });

        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌های من:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های من.' });
        }
    });

    // --- (۸) انصراف از بازی (فقط توسط سازنده) و اعطای امتیاز کامل ---
    socket.on('cancel_game', async ({ gameCode }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN'); // شروع تراکنش

            // ۱. بررسی مالکیت و وضعیت بازی
            const gameResult = await client.query('SELECT creator_id, status FROM games WHERE code = $1 FOR UPDATE', [gameCode]);
            const game = gameResult.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
                return;
            }

            if (game.creator_id.toString() !== currentUserId.toString()) {
                socket.emit('game_error', { message: 'شما سازنده این بازی نیستید و نمی‌توانید آن را لغو کنید.' });
                return;
            }

            if (game.status !== 'waiting') {
                socket.emit('game_error', { message: 'فقط بازی‌های در حال انتظار را می‌توان لغو کرد.' });
                return;
            }

            // ۲. اتمام بازی و اعطای امتیاز کامل (۱۰۰ امتیاز)
            const FULL_SCORE_FOR_CREATOR = 100; 

            await client.query(
                `UPDATE games SET status = 'finished', end_time = CURRENT_TIMESTAMP, winner_id = $1
                 WHERE code = $2`,
                [currentUserId, gameCode]
            );

            // ۳. به‌روزرسانی امتیاز سازنده
            await client.query(
                `UPDATE users SET score = score + $1 WHERE telegram_id = $2`,
                [FULL_SCORE_FOR_CREATOR, currentUserId]
            );

            await client.query('COMMIT'); // پایان تراکنش

            // ۴. ارسال پیام موفقیت و به‌روزرسانی وضعیت‌ها
            socket.emit('game_message', { message: `بازی ${gameCode} با موفقیت لغو شد و ${FULL_SCORE_FOR_CREATOR} امتیاز به شما افزوده شد.`, type: 'success' });
            
            // به‌روزرسانی لیست‌های بازی و جدول رتبه‌بندی
            await emitLeaderboard();
            // ارسال به‌روزرسانی به همه کسانی که ممکن است منتظر این بازی باشند
            io.to(gameCode).emit('game_update', { 
                code: gameCode, 
                status: 'cancelled', 
                message: 'بازی توسط سازنده لغو شد.' 
            });
            // درخواست به‌روزرسانی لیست بازی‌های منتظر برای همه (جهت حذف بازی لغو شده)
            io.emit('request_waiting_games_update');

        } catch (error) {
            await client.query('ROLLBACK'); // در صورت خطا، بازگشت تراکنش
            console.error('❌ خطای لغو بازی:', error);
            socket.emit('game_error', { message: 'خطا در لغو بازی در دیتابیس.' });
        } finally {
            client.release();
        }
    });
    
    // ------------------------------------------------------------------

    // --- (۹) جوین شدن به اتاق بازی برای سازنده یا حدس زننده فعلی ---
    socket.on('join_game_room', async (gameCode) => {
        socket.join(gameCode);
        await emitGameState(gameCode);
    });

    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی اولیه ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور فعال شد و روی پورت ${PORT} گوش می‌دهد.`);
    });
});
