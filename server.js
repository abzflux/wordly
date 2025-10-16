const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

// --- تنظیمات محیطی ---
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی دیتابیس ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
});

// --- راه‌اندازی ربات تلگرام ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ربات تلگرام فعال شد.');

// --- منطق ربات تلگرام ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = msg.from.first_name || msg.from.username || 'کاربر ناشناس';

    try {
        await pool.query(
            `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
            ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
            [userId, name]
        );
        
        const welcomeMessage = `
سلام ${name}، به بازی Wordly خوش آمدید! 🤖

🎮 **امکانات جدید:**
• بازی کلاسیک کلمه‌سازی
• بازی تیمی
• چالش روزانه
• جدول رتبه‌بندی
• پروفایل شخصی

برای شروع بازی روی دکمه زیر کلیک کنید:
        `;

        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: '🚀 شروع بازی (Mini App)',
                        web_app: { url: FRONTEND_URL }
                    }
                ],
                [
                    {
                        text: '📊 جدول رتبه‌بندی',
                        callback_data: 'leaderboard'
                    },
                    {
                        text: '❓ راهنما',
                        callback_data: 'help'
                    }
                ]
            ]
        };

        bot.sendMessage(chatId, welcomeMessage, { 
            reply_markup: inlineKeyboard,
            parse_mode: 'Markdown' 
        });

        console.log(`🤖 ربات به کاربر ${userId} پاسخ /start داد.`);
        
    } catch (error) {
        console.error('❌ خطای پردازش فرمان /start:', error);
        bot.sendMessage(chatId, 'خطایی در ثبت‌نام شما در دیتابیس رخ داد. لطفا دوباره تلاش کنید.');
    }
});

// پاسخ به دکمه‌های اینلاین
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'leaderboard') {
        try {
            const result = await pool.query(
                'SELECT name, score FROM users ORDER BY score DESC LIMIT 10'
            );
            
            let leaderboardText = '🏆 **جدول رتبه‌بندی برتر:**\n\n';
            result.rows.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} ${user.name} - ${user.score} امتیاز\n`;
            });
            
            bot.sendMessage(chatId, leaderboardText, { parse_mode: 'Markdown' });
        } catch (error) {
            bot.sendMessage(chatId, 'خطا در دریافت جدول رتبه‌بندی.');
        }
    } else if (data === 'help') {
        const helpText = `
🎮 **راهنمای بازی Wordly:**

**بازی کلاسیک:**
• یک کلمه انتخاب کنید و دوستانتان حدس بزنند
• امتیاز بر اساس سرعت و دقت

**بازی تیمی:**
• با دوستانتان تیم تشکیل دهید
• رقابت تیمی برای امتیاز بیشتر

**چالش روزانه:**
• هر روز یک چالش جدید
• امتیاز اضافه برای برندگان

**راهنمایی:**
• می‌توانید از راهنمایی استفاده کنید (۱۵ امتیاز هزینه دارد)
        `;
        bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    }
});

// --- راه‌اندازی دیتابیس ---
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // جدول کاربران (بهبود یافته)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                score INT DEFAULT 0,
                level INT DEFAULT 1,
                games_played INT DEFAULT 0,
                games_won INT DEFAULT 0,
                total_guesses INT DEFAULT 0,
                correct_guesses INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول بازی‌ها (بهبود یافته)
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
                revealed_letters JSONB DEFAULT '{}',
                guessed_letters VARCHAR(1)[] DEFAULT '{}',
                game_type VARCHAR(20) DEFAULT 'classic' CHECK (game_type IN ('classic', 'team', 'daily')),
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
                winner_id BIGINT,
                FOREIGN KEY (guesser_id) REFERENCES users(telegram_id)
            );
        `);

        // جدول جدید: چالش‌های روزانه
        await client.query(`
            CREATE TABLE IF NOT EXISTS daily_challenges (
                id SERIAL PRIMARY KEY,
                challenge_date DATE UNIQUE NOT NULL,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                max_guesses INT NOT NULL,
                participants INT DEFAULT 0,
                winners INT DEFAULT 0
            );
        `);

        // جدول جدید: بازی‌های تیمی
        await client.query(`
            CREATE TABLE IF NOT EXISTS team_games (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                team1_name VARCHAR(100) NOT NULL,
                team2_name VARCHAR(100) NOT NULL,
                team1_score INT DEFAULT 0,
                team2_score INT DEFAULT 0,
                current_turn VARCHAR(10) DEFAULT 'team1',
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ جداول دیتابیس بررسی و ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err.message);
        process.exit(1);
    }
}

// --- راه‌اندازی سرور Express و Socket.io ---
const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST']
}));

app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// --- توابع کمکی ---
const generateGameCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

// تابع جدید: محاسبه سطح کاربر
function calculateUserLevel(score) {
    return Math.floor(score / 100) + 1;
}

// تابع جدید: ایجاد چالش روزانه
async function createDailyChallenge() {
    const today = new Date().toISOString().split('T')[0];
    const dailyWords = [
        { word: 'هواپیما', category: 'حمل و نقل' },
        { word: 'کامپیوتر', category: 'تکنولوژی' },
        { word: 'کتابخانه', category: 'مکان' },
        { word: 'آفتابگردان', category: 'گیاه' },
        { word: 'دلفین', category: 'حیوان' }
    ];
    
    const randomWord = dailyWords[Math.floor(Math.random() * dailyWords.length)];
    
    try {
        await pool.query(
            `INSERT INTO daily_challenges (challenge_date, word, category, max_guesses)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (challenge_date) DO NOTHING`,
            [today, randomWord.word, randomWord.category, 8]
        );
        console.log(`📅 چالش روزانه برای ${today} ایجاد شد: ${randomWord.word}`);
    } catch (error) {
        console.error('❌ خطای ایجاد چالش روزانه:', error);
    }
}

// ایجاد چالش روزانه در صورت نیاز
setInterval(createDailyChallenge, 24 * 60 * 60 * 1000); // هر 24 ساعت
createDailyChallenge(); // برای اولین بار

// --- توابع اصلی (بقیه توابع مانند قبل) ---
async function emitGameState(gameCode) {
    // پیاده‌سازی مشابه قبل
}

async function updateScoreAndEmitLeaderboard(userId, points) {
    await pool.query(
        'UPDATE users SET score = score + $1, level = $2, last_active = CURRENT_TIMESTAMP WHERE telegram_id = $3',
        [points, calculateUserLevel(points), userId]
    );
    await emitLeaderboard();
}

async function emitLeaderboard() {
    try {
        const result = await pool.query(`
            SELECT name, score, level, games_played, games_won 
            FROM users 
            ORDER BY score DESC LIMIT 10
        `);
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

// --- منطق Socket.io (بهبود یافته) ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    let currentUserId = null;
    let currentUserName = null;

    // --- لاگین کاربر ---
    socket.on('user_login', async ({ userId, name }) => {
        try {
            currentUserId = userId;
            currentUserName = name;
            
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name, last_active = CURRENT_TIMESTAMP`,
                [userId, name]
            );

            socket.join(`user:${userId}`);
            console.log(`👤 کاربر وارد شد: ${name} (${userId})`);
            
            // اتصال مجدد به بازی فعال
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
                await emitGameState(gameCode);
            }

            socket.emit('login_success', { name, userId });
            await emitLeaderboard();
            
            // ارسال اطلاعات کاربر
            const userResult = await pool.query(
                'SELECT score, level, games_played, games_won FROM users WHERE telegram_id = $1',
                [userId]
            );
            if (userResult.rows.length > 0) {
                socket.emit('user_profile', userResult.rows[0]);
            }

        } catch (error) {
            console.error('❌ خطای ورود کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ثبت اطلاعات کاربری.' });
        }
    });

    // --- ایجاد بازی (با نوع بازی) ---
    socket.on('create_game', async ({ userId, word, category, gameType = 'classic' }) => {
        if (!userId || !word || !category) return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });

        try {
            const gameCode = generateGameCode();
            const maxGuesses = Math.ceil(word.length * 1.5);
            const revealedLetters = {};
            
            if (!/^[\u0600-\u06FF\s]+$/.test(word) || word.length < 3) {
                 return socket.emit('game_error', { message: 'کلمه وارد شده نامعتبر است. فقط حروف فارسی و حداقل ۳ حرف.' });
            }
            
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, revealed_letters, game_type, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'waiting') RETURNING *`,
                [gameCode, userId, word, category, maxGuesses, maxGuesses, revealedLetters, gameType]
            );
            
            const newGame = result.rows[0];
            socket.join(gameCode);
            socket.emit('game_created', { code: gameCode, gameType });
            console.log(`🎮 بازی ${gameType} جدید ایجاد شد: ${gameCode} توسط ${userId}`);
            await emitGameState(gameCode);
            
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی.' });
        }
    });

    // --- دریافت چالش روزانه ---
    socket.on('get_daily_challenge', async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const result = await pool.query(
                'SELECT * FROM daily_challenges WHERE challenge_date = $1',
                [today]
            );
            
            if (result.rows.length > 0) {
                socket.emit('daily_challenge', result.rows[0]);
            } else {
                socket.emit('daily_challenge', { error: 'چالش روزانه موجود نیست.' });
            }
        } catch (error) {
            console.error('❌ خطای دریافت چالش روزانه:', error);
            socket.emit('game_error', { message: 'خطا در دریافت چالش روزانه.' });
        }
    });

    // --- بقیه event handlerها مشابه قبل ---
    // [list_waiting_games, join_game, submit_guess, request_hint, etc.]

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
