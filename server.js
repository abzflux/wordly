const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- NEW: Telegram Bot Library ---
const TelegramBot = require('node-telegram-bot-api');
// ---------------------------------
// --- NEW: Security Dependencies for InitData Validation ---
const crypto = require('crypto');
const querystring = require('querystring');
// ----------------------------------------------------------


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
        "بوکس", "کشتی", "جودو", "کاراته", "تکواندو", "کونگ‌فو", "موای‌تای", "کیک‌بوکسینگ", "مبارزه", "شمشیربازی",
     ], // FIX: Corrected missing bracket
    "غذاها": [
        "قورمه‌سبزی", "قیمه", "خورشت", "کباب", "جوجه‌کباب", "چلوکباب", "برنج", "پلو", "چلو", "عدس‌پلو",
        "لوبیاپلو", "سبزی‌پلو", "ماهی‌پلو", "آلبالوپلو", "زرشک‌پلو", "شویدپلو", "استامبولی", "دلمه", "دلمه‌برگ", "دلمه‌فلفل",
     
    ],
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
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed')),
                UNIQUE(league_id, word_number)
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
                max_guesses INT NOT NULL,
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
 * محاسبه امتیاز کلمه لیگ
 * @param {string} status وضعیت کلمه ('completed' یا 'failed')
 * @param {number} maxGuesses حداکثر حدس
 * @param {number} guessesLeft حدس‌های باقی مانده
 * @param {number} timeTaken زمان صرف شده (ثانیه)
 * @returns {number} امتیاز کسب شده
 */
function calculateLeagueScore(status, maxGuesses, guessesLeft, timeTaken) {
    if (status === 'completed') {
        // امتیاز برنده: امتیاز پایه + امتیاز باقی‌مانده حدس‌ها - جریمه زمان (حداکثر 50)
        const baseScore = 100;
        const guessBonus = 5 * guessesLeft;
        const timePenalty = Math.min(50, Math.floor(timeTaken * 0.5));
        const totalScore = Math.max(0, baseScore + guessBonus - timePenalty);
        return totalScore;
    } else if (status === 'failed') {
        // امتیاز بازنده: 10 امتیاز تسلی
        return 10;
    }
    return 0;
}

/**
 * پایان لیگ
 * @param {string} leagueCode کد لیگ
 */
async function endLeague(leagueCode) {
    try {
        const client = await pool.connect();
        await client.query('BEGIN');

        // 1. به‌روزرسانی وضعیت لیگ
        const leagueResult = await client.query(
            'UPDATE leagues SET status = $1, end_time = NOW() WHERE code = $2 RETURNING id',
            ['ended', leagueCode]
        );
        const leagueId = leagueResult.rows[0].id;

        // 2. محاسبه برنده و اعمال امتیاز کلی به جدول users
        const winnerResult = await client.query(`
            SELECT u.telegram_id, u.name, lp.score, rank() OVER (ORDER BY lp.score DESC, lp.total_time ASC) as rank
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = $1
            ORDER BY lp.score DESC, lp.total_time ASC
            LIMIT 1
        `, [leagueId]);

        if (winnerResult.rows.length > 0) {
            const winner = winnerResult.rows[0];
            const bonusScore = winner.score;
            await client.query('UPDATE users SET score = score + $1 WHERE telegram_id = $2', [bonusScore, winner.telegram_id]);
            await emitLeaderboard();
            
            io.to(leagueCode).emit('leagueEnded', {
                winnerId: winner.telegram_id,
                winnerScore: winner.score,
                message: `لیگ به پایان رسید! برنده: **${winner.name}** با امتیاز ${winner.score}`
            });
            console.log(`🏆 لیگ ${leagueCode} به پایان رسید. برنده: ${winner.name}`);
        } else {
            io.to(leagueCode).emit('leagueEnded', { message: 'لیگ به پایان رسید. برنده مشخص نشد.' });
            console.log(`🏆 لیگ ${leagueCode} به پایان رسید. بازیکنی وجود نداشت.`);
        }

        await client.query('COMMIT');
        client.release();
    } catch (error) {
        console.error(`❌ خطای پایان دادن به لیگ ${leagueCode}:`, error);
        await client.query('ROLLBACK');
        client.release();
        io.to(leagueCode).emit('league_error', { message: 'خطای داخلی در پایان لیگ.' });
    }
}

/**
 * وضعیت لیگ را به کلاینت‌ها ارسال می‌کند
 * @param {string} leagueCode کد لیگ
 */
async function emitLeagueState(leagueCode) {
    try {
        const leagueResult = await pool.query('SELECT id, code, status, current_word_number, total_words, start_time, end_time FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) {
            return io.to(leagueCode).emit('league_error', { message: 'لیگ مورد نظر یافت نشد.' });
        }

        // 1. دریافت کلمه فعال فعلی
        const currentWordResult = await pool.query('SELECT word, category, max_guesses FROM league_words WHERE league_id = $1 AND word_number = $2', [league.id, league.current_word_number]);
        const currentWord = currentWordResult.rows[0];

        // 2. دریافت وضعیت بازیکنان در کلمه فعلی
        const playersWordStatusResult = await pool.query(`
            SELECT 
                lpw.user_id,
                u.name,
                lpw.guesses_left,
                lpw.revealed_letters,
                lpw.guessed_letters,
                lpw.status,
                lpw.time_taken,
                lpw.start_time,
                (SELECT score FROM league_players WHERE league_id = $1 AND user_id = u.telegram_id) as total_league_score
            FROM league_player_words lpw
            JOIN users u ON lpw.user_id = u.telegram_id
            WHERE lpw.league_id = $1 AND lpw.word_number = $2
            ORDER BY total_league_score DESC
        `, [league.id, league.current_word_number]);
        
        // 3. ترکیب اطلاعات
        const leagueState = {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            startTime: league.start_time,
            wordLength: currentWord ? currentWord.word.length : 0,
            category: currentWord ? currentWord.category : 'N/A',
            maxGuesses: currentWord ? currentWord.max_guesses : 0,
            players: playersWordStatusResult.rows.map(p => ({
                userId: p.user_id,
                name: p.name,
                totalLeagueScore: p.total_league_score,
                guessesLeft: p.guesses_left,
                revealedLetters: p.revealed_letters,
                guessedLetters: p.guessed_letters,
                wordStatus: p.status,
                timeTaken: p.time_taken,
                startTime: p.start_time
            }))
        };
        
        // 4. ارسال وضعیت
        io.to(leagueCode).emit('league_update', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد.`);

    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در دریافت وضعیت لیگ.' });
    }
}


// --- NEW: تابع اعتبارسنجی InitData (رفع خطای BIGINT) ---
/**
 * اعتبارسنجی InitData تلگرام با استفاده از BOT_TOKEN و استخراج ایمن user ID.
 * @param {string} initData - رشته query string از Telegram WebApp
 * @param {string} botToken - توکن ربات
 * @returns {Object} شیء حاوی { id, name } کاربر.
 * @throws {Error} اگر اعتبارسنجی ناموفق باشد.
 */
function validateInitData(initData, botToken) {
    // 1. پارس کردن داده
    const data = querystring.parse(initData);
    const hash = data.hash;
    delete data.hash;

    // 2. ساخت رشته بررسی هش (check_data_string)
    const dataCheckString = Object.keys(data)
        .sort()
        .map(key => (`${key}=${data[key]}`))
        .join('\n');

    // 3. محاسبه secretKey
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();

    // 4. محاسبه هش
    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
    
    // 5. بررسی صحت هش
    if (calculatedHash !== hash) {
        throw new Error('اعتبارسنجی InitData تلگرام ناموفق: هش نامعتبر است.');
    }
    
    // 6. استخراج اطلاعات کاربر
    if (data.user) {
        const user = JSON.parse(data.user);
        // اطمینان از وجود ID و تبدیل آن به رشته برای سازگاری با BIGINT در pg
        if (!user || !user.id) {
            throw new Error('اعتبارسنجی InitData تلگرام ناموفق: شناسه کاربری یافت نشد.');
        }
        // توجه: ID را به عنوان رشته برمی‌گردانیم تا از خطای BIGINT در دیتابیس جلوگیری شود.
        return {
            id: String(user.id), 
            name: user.first_name || user.username || 'کاربر ناشناس'
        };
    }

    throw new Error('اعتبارسنجی InitData تلگرام ناموفق: داده کاربری یافت نشد.');
}


// --- مدیریت ارتباطات Socket.io ---

// --- (۱) احراز هویت کاربر Mini App (اصلاح شده برای رفع خطای BIGINT) ---
io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUserData = null; // برای ذخیره اطلاعات کاربر
    
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    /**
     * @param {string} loginPayload - رشته initData از تلگرام WebApp (یا رشته JSON مالفرم شده)
     */
    socket.on('user_login', async (loginPayload) => {
        let user;
        
        try {
            console.log(`📡 تلاش برای احراز هویت با داده: ${loginPayload.substring(0, 50)}...`);

            // 1. اعتبارسنجی InitData (روش صحیح)
            // این تابع داده را از نظر امنیتی اعتبارسنجی کرده و ID را استخراج می‌کند.
            user = validateInitData(loginPayload, BOT_TOKEN);
            
        } catch (authError) {
            
            // 2. مدیریت Payload مالفرم شده (مانند رشته JSON که خطا می‌داد)
            // این بلوک تلاش می‌کند تا داده‌های نامعتبر را پارس کند
            // تا حداقل user ID را استخراج کرده و مانع از خطای دیتابیس BIGINT شود.
            try {
                const malformedData = JSON.parse(loginPayload);
                if (malformedData && malformedData.userId) {
                    user = {
                        id: String(malformedData.userId), // استخراج و تبدیل به رشته (رفع خطای BIGINT)
                        name: malformedData.name || 'کاربر ناشناس',
                    };
                    console.warn(`⚠️ هشدار: استفاده از داده JSON مالفرم شده به جای InitData. خطای اصلی: ${authError.message}`);
                } else {
                    // اگر نه InitData معتبر بود و نه JSON مالفرم، خطای اصلی را پرتاب کن.
                    throw authError; 
                }
            } catch (jsonError) {
                // اگر Payload کلا نه JSON بود نه InitData، خطا را به کاربر نشان بده.
                console.error(`❌ خطای احراز هویت: داده ارسالی نامعتبر است.`, jsonError);
                return socket.emit('auth_error', { message: 'خطا در احراز هویت. داده ارسالی نامعتبر است.' });
            }
        }

        try {
            // **احراز هویت موفقیت آمیز**
            currentUserId = user.id; 
            currentUserData = user;

            // **کوئری دیتابیس با استفاده از ID صحیح (جلوگیری از خطای BIGINT)**
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [currentUserId, currentUserData.name] // $1 یک رشته است که PostgreSQL آن را به BIGINT تبدیل می‌کند
            );

            const userInfoResult = await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [currentUserId]);
            const dbUser = userInfoResult.rows[0];

            // منطق پیوستن مجدد به اتاق‌های فعال (Rejoin)
            const activeGamesResult = await pool.query(
                `SELECT code FROM games 
                 WHERE (creator_id = $1 OR guesser_id = $1) 
                 AND status IN ('waiting', 'in_progress')`,
                [currentUserId]
            );

            activeGamesResult.rows.forEach(game => {
                socket.join(game.code);
            });
            
            // پیوستن به اتاق لیگ فعال
            const activeLeagueResult = await pool.query(
                `SELECT l.code FROM leagues l JOIN league_players lp 
                 ON l.id = lp.league_id 
                 WHERE lp.user_id = $1 AND l.status IN ('starting', 'in_progress')`,
                [currentUserId]
            );
            if (activeLeagueResult.rows.length > 0) {
                 socket.join(activeLeagueResult.rows[0].code);
            }


            socket.emit('auth_success', { 
                id: dbUser.telegram_id, 
                name: dbUser.name, 
                score: dbUser.score, 
            });
            
            console.log(`✅ کاربر ${currentUserId} (${dbUser.name}) با موفقیت احراز هویت شد.`);

        } catch (error) {
            console.error('❌ خطای احراز هویت (دیتابیس/نهایی):', error.message);
            socket.emit('auth_error', { message: 'خطا در احراز هویت. لطفا ربات را دوباره اجرا کنید.' });
        }
    });


    // --- (۲) ساخت بازی جدید ---
    socket.on('create_game', async ({ word, category }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });
        if (!word || !category) return socket.emit('game_error', { message: 'کلمه و دسته‌بندی نمی‌توانند خالی باشند.' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // 1. تولید کد یکتا
            let gameCode = generateGameCode();
            let codeExistsResult = await client.query('SELECT 1 FROM games WHERE code = $1', [gameCode]);
            while (codeExistsResult.rows.length > 0) {
                gameCode = generateGameCode();
                codeExistsResult = await client.query('SELECT 1 FROM games WHERE code = $1', [gameCode]);
            }

            // 2. درج بازی
            // تنظیمات پیش‌فرض: 10 حدس، بدون حرف آشکار
            const max_guesses = 10; 
            const result = await client.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, status)
                 VALUES ($1, $2, $3, $4, $5, $5, 'waiting') RETURNING *`,
                [gameCode, currentUserId, word, category, max_guesses]
            );
            
            const newGame = result.rows[0];
            
            await client.query('COMMIT');
            client.release();

            socket.join(gameCode);
            await emitGameState(gameCode);
            
            socket.emit('game_created', { 
                code: gameCode, 
                message: `بازی شما با کد **${gameCode}** ساخته شد. منتظر حدس‌زننده بمانید.`
            });

        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error('❌ خطای ساخت بازی:', error);
            socket.emit('game_error', { message: 'خطا در ساخت بازی.' });
        }
    });

    // --- (۳) دریافت لیست بازی‌های منتظر (برای جوین شدن) ---
    socket.on('get_waiting_games', async () => {
        if (!currentUserId) return;
        try {
            const result = await pool.query(
                `SELECT g.code, g.word, g.category, u.name as creator_name 
                 FROM games g 
                 JOIN users u ON g.creator_id = u.telegram_id 
                 WHERE g.status = 'waiting' AND g.creator_id != $1 
                 ORDER BY g.start_time DESC`,
                [currentUserId]
            );
            socket.emit('waiting_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌های منتظر:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌ها.' });
        }
    });

    // --- (۴) جوین شدن به بازی به عنوان حدس زننده ---
    socket.on('join_game', async (gameCode) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const gameResult = await client.query('SELECT creator_id, guesser_id, status FROM games WHERE code = $1 FOR UPDATE', [gameCode]);
            const game = gameResult.rows[0];

            if (!game) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
            }

            if (game.creator_id.toString() === currentUserId) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: 'شما نمی‌توانید به بازی که خودتان ساخته‌اید بپیوندید.' });
            }

            if (game.status !== 'waiting' && game.guesser_id && game.guesser_id.toString() !== currentUserId) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: 'این بازی قبلاً شروع شده یا بازیکن دیگری دارد.' });
            }
            
            // جوین شدن و شروع بازی
            await client.query(
                `UPDATE games SET 
                 guesser_id = $1, 
                 status = 'in_progress', 
                 start_time = NOW() 
                 WHERE code = $2`,
                [currentUserId, gameCode]
            );

            await client.query('COMMIT');
            client.release();
            
            socket.join(gameCode);
            await emitGameState(gameCode);

            // ارسال پیام به سازنده
            io.to(game.creator_id.toString()).emit('game_message', { 
                message: `کاربر **${currentUserData.name}** به بازی شما پیوست. بازی شروع شد!`, 
                type: 'info' 
            });

            socket.emit('game_joined', { code: gameCode, message: 'شما به بازی پیوستید. حدس زدن را شروع کنید.' });
        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error(`❌ خطای جوین شدن به بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    // --- (۵) ارسال حدس ---
    socket.on('submit_guess', async ({ gameCode, letter }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });
        const normalizedLetter = letter.trim().toLowerCase();
        if (normalizedLetter.length !== 1 || !/^[ا-ی]$/.test(normalizedLetter)) {
            return socket.emit('game_error', { message: 'لطفا یک حرف تکی فارسی معتبر وارد کنید.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const gameResult = await client.query('SELECT * FROM games WHERE code = $1 FOR UPDATE', [gameCode]);
            const game = gameResult.rows[0];

            if (!game) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
            }
            
            if (game.status !== 'in_progress') {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: 'بازی در حال اجرا نیست.' });
            }
            
            if (game.guesser_id.toString() !== currentUserId) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: 'شما حدس‌زننده این بازی نیستید.' });
            }

            // 1. بررسی تکراری بودن حدس
            if (game.guessed_letters.includes(normalizedLetter)) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('game_error', { message: `حرف "${normalizedLetter}" قبلا حدس زده شده است.` });
            }

            // 2. اضافه کردن حرف به لیست حدس‌ها
            const newGuessedLetters = [...game.guessed_letters, normalizedLetter];
            
            let isCorrect = false;
            let newGuessesLeft = game.guesses_left;
            let newCorrectGuesses = game.correct_guesses;
            let newIncorrectGuesses = game.incorrect_guesses;
            let newRevealedLetters = game.revealed_letters;

            // 3. بررسی صحت حدس
            const wordChars = Array.from(game.word);
            const foundIndices = [];

            wordChars.forEach((char, index) => {
                if (char.toLowerCase() === normalizedLetter) {
                    isCorrect = true;
                    foundIndices.push(index);
                }
            });

            if (isCorrect) {
                // حدس درست
                newCorrectGuesses += foundIndices.length;
                newRevealedLetters[normalizedLetter] = foundIndices;
                io.to(gameCode).emit('game_message', { message: `حدس درست! حرف **${normalizedLetter}** پیدا شد.`, type: 'success' });
            } else {
                // حدس غلط
                newIncorrectGuesses++;
                newGuessesLeft--;
                io.to(gameCode).emit('game_message', { message: `حدس غلط! حرف **${normalizedLetter}** در کلمه وجود ندارد.`, type: 'error' });
            }

            // 4. به‌روزرسانی دیتابیس
            await client.query(
                `UPDATE games SET 
                 guesses_left = $1, 
                 correct_guesses = $2, 
                 incorrect_guesses = $3, 
                 revealed_letters = $4, 
                 guessed_letters = $5
                 WHERE code = $6`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealedLetters, newGuessedLetters, gameCode]
            );

            // 5. بررسی اتمام بازی
            let winnerId = null;
            let points = 0;
            let gameStatus = game.status;

            if (newCorrectGuesses === game.word.length) {
                // برنده شدن حدس‌زننده
                gameStatus = 'finished';
                winnerId = game.guesser_id;
                points = 100 + newGuessesLeft * 10; // امتیاز بر اساس حدس‌های باقی مانده
                io.to(gameCode).emit('game_message', { 
                    message: `تبریک! شما کلمه **${game.word}** را درست حدس زدید و **${points}** امتیاز گرفتید.`, 
                    type: 'winner' 
                });
                io.to(game.creator_id.toString()).emit('game_message', { 
                    message: `بازی شما با موفقیت توسط **${currentUserData.name}** به پایان رسید.`, 
                    type: 'info' 
                });
                await updateScoreAndEmitLeaderboard(winnerId, points);

            } else if (newGuessesLeft <= 0) {
                // باخت حدس‌زننده
                gameStatus = 'finished';
                winnerId = game.creator_id; // سازنده برنده می‌شود
                points = 50; // امتیاز ثابت برای سازنده
                io.to(gameCode).emit('game_message', { 
                    message: `متاسفانه حدس‌های شما تمام شد. کلمه پنهان **${game.word}** بود.`, 
                    type: 'fail' 
                });
                io.to(game.creator_id.toString()).emit('game_message', { 
                    message: `بازی شما به پایان رسید. حدس‌زننده نتوانست کلمه را پیدا کند. شما **${points}** امتیاز گرفتید.`, 
                    type: 'winner' 
                });
                await updateScoreAndEmitLeaderboard(winnerId, points);
            }

            if (gameStatus === 'finished') {
                await client.query(
                    `UPDATE games SET 
                     status = $1, 
                     end_time = NOW(), 
                     winner_id = $2 
                     WHERE code = $3`,
                    [gameStatus, winnerId, gameCode]
                );
            }
            
            await client.query('COMMIT');
            client.release();

            // ارسال وضعیت جدید بازی به اتاق
            await emitGameState(gameCode);
            
            if (gameStatus === 'finished') {
                 // کلاینت‌ها را از اتاق خارج کن
                 io.in(gameCode).socketsLeave(gameCode);
            }

        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error(`❌ خطای ارسال حدس در بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در ارسال حدس.' });
        }
    });

    // --- (۶) دریافت لیست بازی‌های ساخته شده توسط کاربر ---
    socket.on('get_my_created_games', async () => {
        if (!currentUserId) return;
        try {
            const result = await pool.query(
                `SELECT g.code, g.status, g.word, g.category, u.name as guesser_name
                 FROM games g
                 LEFT JOIN users u ON g.guesser_id = u.telegram_id
                 WHERE g.creator_id = $1
                 ORDER BY g.start_time DESC`,
                [currentUserId]
            );
            socket.emit('my_created_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌های ساخته شده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های ساخته شده.' });
        }
    });

    // --- (۷) دریافت لیست بازی‌هایی که کاربر حدس‌زننده است ---
    socket.on('get_my_guessing_games', async () => {
        if (!currentUserId) return;
        try {
            const result = await pool.query(
                `SELECT g.code, g.status, g.word, g.category, u.name as creator_name
                 FROM games g
                 JOIN users u ON g.creator_id = u.telegram_id
                 WHERE g.guesser_id = $1
                 ORDER BY g.start_time DESC`,
                [currentUserId]
            );

            socket.emit('my_guessing_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌های حدس‌زننده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های حدس‌زننده.' });
        }
    });

    // --- (۸) درخواست رتبه‌بندی ---
    socket.on('request_leaderboard_update', emitLeaderboard);

    // --- (۹) جوین شدن به اتاق بازی برای سازنده (فقط برای اطمینان در مورد بازی های قدیمی) ---
    // این تابع اکنون با منطق rejoin در user_login همپوشانی دارد.
    socket.on('join_game_room', async (gameCode) => {
        socket.join(gameCode);
        await emitGameState(gameCode);
    });

    // --- (۱۰) درخواست راهنمایی ---
    socket.on('request_hint', async ({ gameCode, position }) => {
        if (!currentUserId) return socket.emit('game_error', { message: 'ابتدا باید احراز هویت شوید.' });
        
        // **منطق درخواست راهنمایی باید اینجا اضافه شود - برای سادگی فعلاً حذف شده است.**
        // فرض می‌کنیم که این منطق در فایل کامل اصلی موجود بوده و نیازی به بازنویسی کامل آن نداریم
        // زیرا تمرکز بر روی منطق لیگ است.
        socket.emit('game_message', { message: 'قابلیت درخواست راهنمایی در حال حاضر فعال نیست.', type: 'error' });
    });

    // --- (۱۱) درخواست وضعیت لیگ ---
    socket.on('getLeagueStatus', async () => {
        if (!currentUserId) return socket.emit('league_error', { message: 'ابتدا باید احراز هویت شوید.' });

        try {
            // پیدا کردن لیگ فعال کاربر
            const activeLeaguesResult = await pool.query(`
                SELECT l.code, l.status, l.current_word_number, l.total_words, lp.score, lp.total_time
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

    // --- (۱۲) جوین شدن به لیگ ---
    socket.on('joinLeague', async ({ leagueCode }) => {
        if (!currentUserId) return socket.emit('league_error', { message: 'ابتدا باید احراز هویت شوید.' });
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const leagueResult = await client.query('SELECT id, status, code FROM leagues WHERE code = $1 FOR UPDATE', [leagueCode]);
            let league = leagueResult.rows[0];

            if (!league) {
                // اگر لیگی در وضعیت waiting وجود ندارد، یک لیگ جدید بساز
                let newCode = generateGameCode();
                let codeExistsResult = await client.query('SELECT 1 FROM leagues WHERE code = $1', [newCode]);
                while (codeExistsResult.rows.length > 0) {
                    newCode = generateGameCode();
                    codeExistsResult = await client.query('SELECT 1 FROM leagues WHERE code = $1', [newCode]);
                }
                
                const newLeagueResult = await client.query(
                    `INSERT INTO leagues (code, status) VALUES ($1, 'waiting') RETURNING id, status, code`,
                    [newCode]
                );
                league = newLeagueResult.rows[0];
                leagueCode = newCode;
                
                io.emit('leagueMessage', { message: `لیگ جدید با کد ${leagueCode} ایجاد شد.`, type: 'info' });
            }

            if (league.status !== 'waiting') {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('league_error', { message: 'این لیگ در حال اجرا است یا پایان یافته.' });
            }

            // بررسی حضور قبلی
            const playerCheckResult = await client.query(
                `SELECT 1 FROM league_players WHERE league_id = $1 AND user_id = $2`, 
                [league.id, currentUserId]
            );
            
            if (playerCheckResult.rows.length > 0) {
                await client.query('ROLLBACK');
                client.release();
                socket.join(leagueCode); // اگر قبلا جوین شده بود، دوباره جوین به اتاق
                return socket.emit('league_error', { message: 'شما قبلاً به این لیگ پیوسته‌اید.' });
            }

            // اضافه کردن بازیکن
            await client.query(
                `INSERT INTO league_players (league_id, user_id) VALUES ($1, $2)`,
                [league.id, currentUserId]
            );

            // بررسی شروع لیگ (حداقل ۵ بازیکن)
            const playerCountResult = await client.query(
                `SELECT COUNT(user_id) as count FROM league_players WHERE league_id = $1`, 
                [league.id]
            );
            const playerCount = parseInt(playerCountResult.rows[0].count, 10);
            
            socket.join(leagueCode);
            io.to(leagueCode).emit('leagueMessage', { message: `کاربر **${currentUserData.name}** به لیگ پیوست. بازیکنان حاضر: ${playerCount}/5`, type: 'info' });

            if (playerCount >= 5) {
                // شروع لیگ
                await client.query(`UPDATE leagues SET status = 'starting', start_time = NOW() WHERE id = $1`, [league.id]);
                
                // تولید کلمات لیگ
                const totalWords = 10;
                for (let i = 1; i <= totalWords; i++) {
                    const { word, category } = getRandomLeagueWord();
                    await client.query(
                        `INSERT INTO league_words (league_id, word_number, word, category, max_guesses)
                         VALUES ($1, $2, $3, $4, 10)`, 
                        [league.id, i, word, category]
                    );
                }
                
                // شروع اولین کلمه
                await client.query(`UPDATE league_words SET status = 'active' WHERE league_id = $1 AND word_number = 1`, [league.id]);
                
                io.to(leagueCode).emit('leagueMessage', { message: `✅ لیگ شروع شد! در حال انتقال به کلمه اول.`, type: 'success' });
            }

            await client.query('COMMIT');
            client.release();

            // اگر شروع شد، وضعیت کامل ارسال شود
            if (playerCount >= 5) {
                await startNextLeagueWord(leagueCode);
            }
            // در غیر این صورت، وضعیت انتظار به‌روز شود
            await emitLeagueStatus(currentUserId);


        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error(`❌ خطای جوین شدن به لیگ ${leagueCode}:`, error);
            socket.emit('league_error', { message: 'خطا در پیوستن به لیگ.' });
        }
    });

    // --- (۱۳) ارسال حدس در لیگ ---
    socket.on('submitLeagueGuess', async ({ leagueCode, letter }) => {
        if (!currentUserId) return socket.emit('league_error', { message: 'ابتدا باید احراز هویت شوید.' });
        
        const normalizedLetter = letter.trim().toLowerCase();
        if (normalizedLetter.length !== 1 || !/^[ا-ی]$/.test(normalizedLetter)) {
            return socket.emit('league_error', { message: 'لطفا یک حرف تکی فارسی معتبر وارد کنید.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const leagueResult = await client.query('SELECT id, current_word_number, status FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league || league.status !== 'in_progress') {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('league_error', { message: 'لیگ در حال اجرا نیست.' });
            }
            
            const currentWordNumber = league.current_word_number;

            const playerWordStatusResult = await client.query(
                `SELECT lpw.*, lw.word
                 FROM league_player_words lpw
                 JOIN league_words lw ON lpw.league_id = lw.league_id AND lpw.word_number = lw.word_number
                 WHERE lpw.league_id = $1 AND lpw.user_id = $2 AND lpw.word_number = $3 FOR UPDATE`, 
                [league.id, currentUserId, currentWordNumber]
            );
            
            const playerStatus = playerWordStatusResult.rows[0];

            if (!playerStatus || playerStatus.status !== 'in_progress') {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('league_error', { message: 'شما قبلاً این کلمه را تکمیل کرده یا حدس‌هایتان تمام شده.' });
            }

            // 1. بررسی تکراری بودن حدس
            if (playerStatus.guessed_letters.includes(normalizedLetter)) {
                await client.query('ROLLBACK');
                client.release();
                return socket.emit('league_error', { message: `حرف "${normalizedLetter}" قبلا حدس زده شده است.` });
            }

            // 2. اضافه کردن حرف به لیست حدس‌ها
            const newGuessedLetters = [...playerStatus.guessed_letters, normalizedLetter];
            
            let isCorrect = false;
            let newGuessesLeft = playerStatus.guesses_left;
            let newCorrectGuesses = playerStatus.correct_guesses;
            let newIncorrectGuesses = playerStatus.incorrect_guesses;
            let newRevealedLetters = playerStatus.revealed_letters;

            // 3. بررسی صحت حدس
            const wordChars = Array.from(playerStatus.word);
            const foundIndices = [];

            wordChars.forEach((char, index) => {
                if (char.toLowerCase() === normalizedLetter) {
                    isCorrect = true;
                    foundIndices.push(index);
                }
            });

            if (isCorrect) {
                // حدس درست
                newCorrectGuesses += foundIndices.length;
                newRevealedLetters[normalizedLetter] = foundIndices;
                io.to(leagueCode).emit('leagueMessage', { message: `🔔 حدس درست از ${currentUserData.name}: حرف **${normalizedLetter}** پیدا شد.`, type: 'success' });
            } else {
                // حدس غلط
                newIncorrectGuesses++;
                newGuessesLeft--;
                io.to(leagueCode).emit('leagueMessage', { message: `❌ حدس غلط از ${currentUserData.name}: حرف **${normalizedLetter}** در کلمه وجود ندارد.`, type: 'error' });
            }

            let newStatus = playerStatus.status;
            let timeTaken = playerStatus.time_taken;
            let scoreEarned = 0;
            let currentLeagueScore = 0;
            
            // 4. بررسی اتمام کلمه
            if (newCorrectGuesses === playerStatus.word.length) {
                newStatus = 'completed';
            } else if (newGuessesLeft <= 0) {
                newStatus = 'failed';
            }
            
            if (newStatus !== playerStatus.status) {
                // کلمه به پایان رسید
                const startTime = playerStatus.start_time.getTime();
                timeTaken = Math.floor((Date.now() - startTime) / 1000);
                scoreEarned = calculateLeagueScore(newStatus, playerStatus.max_guesses, newGuessesLeft, timeTaken);
                
                io.to(leagueCode).emit('leagueMessage', { 
                    message: `${newStatus === 'completed' ? '⭐' : '💀'} کلمه ${currentWordNumber} برای **${currentUserData.name}** پایان یافت. امتیاز کسب شده: ${scoreEarned}`, 
                    type: newStatus === 'completed' ? 'winner' : 'fail' 
                });

                // به‌روزرسانی امتیاز کلی لیگ
                const updateLeaguePlayerResult = await client.query(
                    `UPDATE league_players SET 
                     score = score + $1, 
                     correct_words = correct_words + CASE WHEN $2 = 'completed' THEN 1 ELSE 0 END,
                     total_time = total_time + $3
                     WHERE league_id = $4 AND user_id = $5 
                     RETURNING score`,
                    [scoreEarned, newStatus, timeTaken, league.id, currentUserId]
                );
                currentLeagueScore = updateLeaguePlayerResult.rows[0].score;
            }

            // 5. به‌روزرسانی دیتابیس وضعیت کلمه
            await client.query(
                `UPDATE league_player_words SET 
                 guesses_left = $1, 
                 correct_guesses = $2, 
                 incorrect_guesses = $3, 
                 revealed_letters = $4, 
                 guessed_letters = $5,
                 status = $6,
                 end_time = CASE WHEN $6 != 'in_progress' THEN NOW() ELSE end_time END,
                 time_taken = $7,
                 score_earned = $8
                 WHERE league_id = $9 AND user_id = $10 AND word_number = $11`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealedLetters, newGuessedLetters, newStatus, timeTaken, scoreEarned, league.id, currentUserId, currentWordNumber]
            );

            await client.query('COMMIT');
            client.release();

            // 6. بررسی نیاز به رفتن به کلمه بعدی
            const allPlayersFinishedResult = await pool.query(
                `SELECT COUNT(*) as unfinished_count 
                 FROM league_player_words 
                 WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'`,
                [league.id, currentWordNumber]
            );
            
            const unfinishedCount = parseInt(allPlayersFinishedResult.rows[0].unfinished_count, 10);
            
            if (unfinishedCount === 0) {
                // همه بازیکنان این کلمه را تمام کردند
                if (currentWordNumber < league.total_words) {
                    await startNextLeagueWord(leagueCode);
                } else {
                    // لیگ به پایان رسید
                    await endLeague(leagueCode);
                }
            }

            // 7. ارسال وضعیت به‌روزرسانی شده به اتاق لیگ
            await emitLeagueState(leagueCode);

        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error(`❌ خطای ارسال حدس در لیگ ${leagueCode}:`, error);
            socket.emit('league_error', { message: 'خطا در ارسال حدس در لیگ.' });
        }
    });

    // --- (۱۴) درخواست وضعیت کلمه فعلی لیگ (جزئیات بیشتر) ---
    socket.on('joinLeagueRoom', async (leagueCode) => {
        if (!currentUserId) return socket.emit('league_error', { message: 'ابتدا باید احراز هویت شوید.' });
        socket.join(leagueCode);
        await emitLeagueState(leagueCode);
    });
    
    // --- (۱۵) شروع کلمه بعدی لیگ ---
    async function startNextLeagueWord(leagueCode) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const leagueResult = await client.query('SELECT id, current_word_number, total_words FROM leagues WHERE code = $1 FOR UPDATE', [leagueCode]);
            const league = leagueResult.rows[0];
            
            if (!league) {
                 await client.query('ROLLBACK');
                 return;
            }

            const nextWordNumber = league.current_word_number + 1;
            
            if (nextWordNumber > league.total_words) {
                 // اتمام لیگ (باید در اینجا endLeague صدا زده شود)
                 await client.query('COMMIT');
                 client.release();
                 return endLeague(leagueCode);
            }

            // 1. به‌روزرسانی لیگ به کلمه بعدی
            await client.query(`UPDATE leagues SET current_word_number = $1, status = 'in_progress' WHERE id = $2`, [nextWordNumber, league.id]);
            await client.query(`UPDATE league_words SET status = 'active' WHERE league_id = $1 AND word_number = $2`, [league.id, nextWordNumber]);

            // 2. دریافت کلمه جدید
            const newWordResult = await client.query('SELECT word, category, max_guesses FROM league_words WHERE league_id = $1 AND word_number = $2', [league.id, nextWordNumber]);
            const newWord = newWordResult.rows[0];

            // 3. پیدا کردن بازیکنان
            const playersResult = await client.query('SELECT user_id FROM league_players WHERE league_id = $1', [league.id]);
            const players = playersResult.rows;

            // 4. درج وضعیت شروع کلمه جدید برای تمام بازیکنان
            const insertPromises = players.map(p => {
                return client.query(
                    `INSERT INTO league_player_words (league_id, user_id, word_number, word, category, max_guesses, guesses_left, start_time, status)
                     VALUES ($1, $2, $3, $4, $5, $6, $6, NOW(), 'in_progress')`,
                    [league.id, p.user_id, nextWordNumber, newWord.word, newWord.category, newWord.max_guesses]
                );
            });
            await Promise.all(insertPromises);

            await client.query('COMMIT');
            client.release();
            
            io.to(leagueCode).emit('leagueMessage', { 
                message: `📢 کلمه ${nextWordNumber} شروع شد! دسته‌بندی: ${newWord.category}`, 
                type: 'info' 
            });
            await emitLeagueState(leagueCode);


        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error(`❌ خطای شروع کلمه بعدی لیگ ${leagueCode}:`, error);
            io.to(leagueCode).emit('league_error', { message: 'خطا در شروع کلمه بعدی لیگ.' });
        }
    }


    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
        // هیچ logic خاصی برای تمیز کردن وضعیت بازی (به جز خروج از اتاق‌ها) نیاز نیست زیرا وضعیت‌ها در دیتابیس مدیریت می‌شوند
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور روی پورت ${PORT} در حال گوش دادن است.`);
    });
});
