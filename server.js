// Add these to the top of SERVER5.js
const https = require('https');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto'); // ماژول لازم برای اعتبارسنجی
const TelegramBot = require('node-telegram-bot-api');

// --- تنظیمات و متغیرهای محیطی ---
// توجه: توکن و URLها باید در محیط واقعی از متغیرهای محیطی لود شوند.
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = 'postgresql://abzx:RsDq7AmdXXj9WOnACP0RTxonFuKIaJki@dpg-d3oj7rmuk2gs73cscc6g-a.frankfurt-postgres.render.com/wordlydb_7vux';
const FRONTEND_URL = 'https://www.wordlybot.xo.je';
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی دیتابیس PostgreSQL ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
});

// --- راه‌اندازی ربات تلگرام ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ربات تلگرام فعال شد.');

// --- تابع امنیتی: اعتبارسنجی داده‌های WebApp تلگرام ---
function verifyTelegramWebAppInitData(initData) {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    params.sort();

    const dataCheckString = Array.from(params.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(BOT_TOKEN)
        .digest();

    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

// --- مجموعه کلمات لیگ (بدون تغییر) ---
const leagueWords = {
    // ... (محتوای کامل leagueWords از فایل اصلی)
    "حیوانات": ["شیر", "فیل", "گربه", "سگ", "خرس", "گرگ", "روباه", "خرگوش", "گاو", "گوسفند", "ببر", "پلنگ", "زرافه", "کرگدن", "اسب", "الاغ", "قوچ", "بز", "شتر", "خوک"],
    "میوه‌ها": ["سیب", "موز", "پرتقال", "نارنگی", "لیمو", "گریپ فروت", "انار", "انگور", "هلو", "زردآلو", "شلیل", "آلو", "گیلاس", "آلبالو", "توت", "تمشک", "شاتوت", "توت فرنگی", "انجیر", "خرمالو"],
    "سبزیجات": ["هویج", "سیب زمینی", "پیاز", "سیر", "کلم", "کاهو", "اسفناج", "جعفری", "نعناع", "تربچه", "شلغم", "چغندر", "کدو", "بادمجان", "فلفل", "گوجه", "خیار", "کرفس", "قارچ", "ذرت"],
    "شهرها": ["تهران", "مشهد", "اصفهان", "شیراز", "تبریز", "کرج", "قم", "اهواز", "کرمانشاه", "ارومیه", "رشت", "زاهدان", "کرمان", "همدان", "یزد", "اردبیل", "بندرعباس", "خرم‌آباد", "ساری", "گرگان"],
    "کشورها": ["ایران", "عراق", "ترکیه", "افغانستان", "پاکستان", "عربستان", "امارات", "قطر", "کویت", "عمان", "یمن", "اردن", "سوریه", "لبنان", "مصر", "مراکش", "الجزایر", "تونس", "لیبی", "سودان"],
    "اشیا": ["میز", "صندلی", "کتاب", "قلم", "دفتر", "مداد", "پاک‌کن", "خط‌کش", "گچ", "تخته", "کامپیوتر", "موبایل", "تبلت", "لپ‌تاپ", "مانیتور", "کیبورد", "ماوس", "هدفون", "اسپیکر", "میکروفون"],
    "حرفه‌ها": ["پزشک", "مهندس", "معلم", "پرستار", "پلیس", "آتش‌نشان", "خلبان", "راننده", "کشاورز", "دامدار", "باغبان", "نجار", "آهنگر", "جوشکار", "برقکار", "لوله‌کش", "نقاش", "مجسمه‌ساز", "عکاس", "فیلمبردار"],
    "ورزش‌ها": ["فوتبال", "والیبال", "بسکتبال", "تنیس", "بدمینتون", "پینگ‌پنگ", "گلف", "هاکی", "کریکت", "بیسبال", "بوکس", "کشتی", "جودو", "کاراته", "تکواندو", "کونگ‌فو", "موای‌تای", "کیک‌بوکسینگ", "مبارزه", "شمشیربازی"],
    "غذاها": ["قورمه‌سبزی", "قیمه", "خورشت", "کباب", "جوجه‌کباب", "چلوکباب", "برنج", "پلو", "چلو", "عدس‌پلو", "لوبیاپلو", "سبزی‌پلو", "ماهی‌پلو", "آلبالوپلو", "زرشک‌پلو", "شویدپلو", "استامبولی", "دلمه", "دلمه‌برگ", "دلمه‌فلفل"],
    "رنگ‌ها": ["قرمز", "نارنجی", "زرد", "سبز", "آبی", "نیلی", "بنفش", "صورتی", "قهوه‌ای", "مشکی", "سفید", "خاکستری", "نقره‌ای", "طلایی", "برنزی", "نقره", "طلا", "مس", "برنج", "آهن"]
};

// --- منطق ربات تلگرام (بدون تغییر) ---
bot.onText(/\/start/, async (msg) => {
    // ... (منطق bot.onText /start از فایل اصلی)
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = msg.from.first_name || msg.from.username || 'کاربر ناشناس';

    try {
        await pool.query(
            `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
            ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
            [userId.toString(), name]
        );
        
        const welcomeMessage = `سلام ${name}، به بازی Wordly خوش آمدید! 🤖`;
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
            reply_markup: inlineKeyboard
        });

        bot.sendMessage(chatId, `کد کاربری شما: ${userId}`);
        console.log(`🤖 ربات به کاربر ${userId} پاسخ /start داد.`);
        
    } catch (error) {
        console.error('❌ خطای پردازش فرمان /start:', error);
        bot.sendMessage(chatId, 'خطایی در ثبت‌نام شما در دیتابیس رخ داد. لطفا دوباره تلاش کنید.');
    }
});

// --- توابع کمکی (بدون تغییر) ---
function generateGameCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getRandomLeagueWord() {
    const categories = Object.keys(leagueWords);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const wordsInCategory = leagueWords[randomCategory];
    const randomWord = wordsInCategory[Math.floor(Math.random() * wordsInCategory.length)];
    
    return {
        word: randomWord,
        category: randomCategory
    };
}

// --- اتصال و ایجاد جداول دیتابیس (بدون تغییر) ---
async function setupDatabase() {
    // ... (منطق کامل setupDatabase از فایل اصلی)
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // جداول کاربران، بازی‌ها، و لیگ...
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                score INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                creator_id VARCHAR(255) NOT NULL REFERENCES users(telegram_id),
                guesser_id VARCHAR(255),
                spectators VARCHAR(255)[] DEFAULT '{}',
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
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished', 'cancelled')),
                winner_id VARCHAR(255),
                FOREIGN KEY (guesser_id) REFERENCES users(telegram_id),
                FOREIGN KEY (winner_id) REFERENCES users(telegram_id)
            );
        `);

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
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id VARCHAR(255) NOT NULL REFERENCES users(telegram_id),
                score INT DEFAULT 0,
                correct_words INT DEFAULT 0,
                total_time INT DEFAULT 0,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(league_id, user_id)
            );
        `);

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

        await client.query(`
            CREATE TABLE IF NOT EXISTS league_player_words (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id VARCHAR(255) NOT NULL REFERENCES users(telegram_id),
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
                time_taken INT DEFAULT 0,
                score_earned INT DEFAULT 0,
                UNIQUE(league_id, user_id, word_number)
            );
        `);

        console.log('✅ جداول دیتابیس بررسی و ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err.message);
        process.exit(1);
    }
}

// --- راه‌اندازی سرور Express و Socket.io (بدون تغییر) ---
const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// --- توابع مدیریت وضعیت (بدون تغییر در منطق کلی) ---
async function emitGameState(gameCode, socketId = null) {
    // ... (منطق کامل emitGameState از فایل اصلی)
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        const game = result.rows[0];

        if (game) {
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }

            const spectators = [];
            for (const specId of game.spectators || []) {
                const specUser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [specId])).rows[0];
                if (specUser) spectators.push(specUser);
            }

            const gameState = {
                code: game.code,
                status: game.status,
                category: game.category,
                wordLength: game.word.replace(/\s/g, '').length,
                maxGuesses: game.max_guesses,
                guessesLeft: game.guesses_left,
                correctGuesses: game.correct_guesses,
                incorrectGuesses: game.incorrect_guesses,
                revealedLetters: game.revealed_letters || {},
                guessedLetters: game.guessed_letters || [],
                startTime: game.start_time,
                creator: creator,
                guesser: guesser,
                spectators: spectators,
                word: (game.status === 'finished' || game.status === 'cancelled') ? game.word : null
            };
            
            if (socketId) {
                io.to(socketId).emit('game_update', gameState);
            } else {
                io.to(gameCode).emit('game_update', gameState);
            }
            console.log(`📡 وضعیت جدید بازی ${gameCode} ارسال شد. وضعیت: ${game.status}`);
        } else {
            // در اینجا بهتر است اگر socketId وجود دارد، پیام خطا فقط به همان کاربر ارسال شود
            if (socketId) {
                io.to(socketId).emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
            } else {
                 io.to(gameCode).emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
            }
        }
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت بازی ${gameCode}:`, error);
        io.to(gameCode).emit('game_error', { message: 'خطا در fetch وضعیت بازی.' });
    }
}

async function updateScoreAndEmitLeaderboard(userId, points) {
    // ... (منطق کامل updateScoreAndEmitLeaderboard از فایل اصلی)
    if (!userId) return; 

    try {
        await pool.query('UPDATE users SET score = score + $1 WHERE telegram_id = $2', [points, userId]);
        await emitLeaderboard();
    } catch (error) {
        console.error(`❌ خطای به‌روزرسانی امتیاز کاربر ${userId}:`, error);
    }
}

async function emitLeaderboard() {
    // ... (منطق کامل emitLeaderboard از فایل اصلی)
    try {
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

// توابع مدیریت لیگ
async function emitLeagueState(leagueCode) {
    // ... (منطق کامل emitLeagueState از فایل اصلی)
    try {
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

        // دریافت وضعیت کلمه فعلی
        let currentWordInfo = null;
        if (league.status === 'in_progress') {
            const currentWordResult = await pool.query(`
                SELECT word, category FROM league_words 
                WHERE league_id = $1 AND word_number = $2 AND status = 'active'
            `, [league.id, league.current_word_number]);
            
            if (currentWordResult.rows.length > 0) {
                currentWordInfo = {
                    word: currentWordResult.rows[0].word,
                    category: currentWordResult.rows[0].category
                };
                
                // دریافت وضعیت کلمه برای هر بازیکن
                for (const player of players) {
                    const playerWordResult = await pool.query(`
                        SELECT guesses_left, correct_guesses, incorrect_guesses, revealed_letters, guessed_letters, status, time_taken, score_earned FROM league_player_words 
                        WHERE league_id = $1 AND user_id = $2 AND word_number = $3
                    `, [league.id, player.telegram_id, league.current_word_number]);
                    
                    if (playerWordResult.rows.length > 0) {
                        player.currentWord = playerWordResult.rows[0];
                    } else {
                         player.currentWord = { status: 'not_started' }; // بازیکن هنوز شروع نکرده
                    }
                }
            }
        }

        // ساخت وضعیت لیگ برای ارسال
        const leagueState = {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            players: players.map(p => ({
                telegram_id: p.telegram_id,
                name: p.name,
                score: p.score,
                correctWords: p.correct_words,
                totalTime: p.total_time,
                currentWordStatus: p.currentWord // شامل وضعیت حدس زدن کلمه فعلی
            })),
            currentCategory: currentWordInfo ? currentWordInfo.category : null,
            playerCount: players.length
        };
        
        io.to(leagueCode).emit('leagueStatus', leagueState);
        console.log(`📡 وضعیت لیگ ${leagueCode} ارسال شد. وضعیت: ${league.status}, بازیکنان: ${players.length}`);
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در fetch وضعیت لیگ.' });
    }
}

// --- شروع لیگ و کلمه (بدون تغییر در منطق کلی) ---
async function startLeague(leagueCode) {
    // ... (منطق کامل startLeague از فایل اصلی)
     try {
        await pool.query(
            'UPDATE leagues SET status = $1, start_time = NOW() WHERE code = $2', 
            ['starting', leagueCode]
        );
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        // تولید 10 کلمه تصادفی برای لیگ
        const words = [];
        for (let i = 1; i <= 10; i++) {
            const { word, category } = getRandomLeagueWord();
            words.push({ 
                league_id: league.id, 
                word_number: i, 
                word: word, 
                category: category, 
                max_guesses: Math.ceil(word.replace(/\s/g, '').length * 1.5), 
                status: i === 1 ? 'active' : 'pending' 
            });
        }

        // ذخیره کلمات در دیتابیس
        for (const wordData of words) {
            await pool.query(`
                INSERT INTO league_words (league_id, word_number, word, category, max_guesses, status) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [wordData.league_id, wordData.word_number, wordData.word, wordData.category, wordData.max_guesses, wordData.status]);
        }

        // ایجاد رکوردهای کلمات برای بازیکنان
        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);
        
        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words (league_id, user_id, word_number, word, category, guesses_left, start_time, status)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress')
                ON CONFLICT (league_id, user_id, word_number) DO UPDATE SET guesses_left = EXCLUDED.guesses_left, start_time = NOW(), status = 'in_progress'
            `, [league.id, player.user_id, 1, words[0].word, words[0].category, words[0].max_guesses]);
        }
        
        await emitLeagueState(leagueCode);

        // شروع اولین کلمه پس از تأخیر
        setTimeout(async () => {
            await pool.query(
                'UPDATE leagues SET status = $1 WHERE code = $2',
                ['in_progress', leagueCode]
            );
            await emitLeagueState(leagueCode);
            io.to(leagueCode).emit('leagueStarted', { code: leagueCode, status: 'in_progress', currentWordNumber: 1, totalWords: 10 });
            console.log(`🎮 لیگ ${leagueCode} شروع شد.`);
        }, 3000);

    } catch (error) {
        console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در شروع لیگ.' });
    }
}

async function startLeagueWord(leagueCode, wordNumber) {
    // ... (منطق کامل startLeagueWord از فایل اصلی)
     try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (wordNumber > league.total_words) {
            // پایان لیگ
            await pool.query(
                'UPDATE leagues SET status = $1, end_time = NOW() WHERE code = $2', 
                ['ended', leagueCode]
            );
            await emitLeagueState(leagueCode);
            io.to(leagueCode).emit('leagueEnded', { code: leagueCode });
            console.log(`🏁 لیگ ${leagueCode} به پایان رسید.`);
            return;
        }

        // کلمه قبلی را کامل کن
        if (wordNumber > 1) {
            await pool.query(`
                UPDATE league_words SET status = 'completed' 
                WHERE league_id = $1 AND word_number = $2
            `, [league.id, wordNumber - 1]);
        }

        // کلمه جدید را فعال کن
        await pool.query(`
            UPDATE leagues SET current_word_number = $1
            WHERE code = $2
        `, [wordNumber, leagueCode]);

        await pool.query(`
            UPDATE league_words SET status = 'active'
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        const wordResult = await pool.query(`
            SELECT word, category, max_guesses FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);
        const { word, category, max_guesses } = wordResult.rows[0];

        // به روز رسانی رکوردهای کلمات برای بازیکنان
        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);

        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words (league_id, user_id, word_number, word, category, guesses_left, start_time, status)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress')
                ON CONFLICT (league_id, user_id, word_number) DO UPDATE SET guesses_left = EXCLUDED.guesses_left, start_time = NOW(), status = 'in_progress'
            `, [league.id, player.user_id, wordNumber, word, category, max_guesses]);
        }

        await emitLeagueState(leagueCode);
        io.to(leagueCode).emit('newLeagueWord', { wordNumber, category, maxGuesses: max_guesses });
        console.log(`➡️ کلمه ${wordNumber} لیگ ${leagueCode} شروع شد.`);

    } catch (error) {
        console.error(`❌ خطای شروع کلمه لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در شروع کلمه جدید لیگ.' });
    }
}

// --- مدیریت اتصال Socket.io و احراز هویت (اصلاح شده) ---
io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUserName = null;
    let currentUserSocketId = socket.id;

    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    // --- (۲) احراز هویت با داده‌های تلگرام (اصلاح حیاتی) ---
    socket.on('authenticate', async (data) => {
        const { initData } = data;

        if (!initData) {
            console.log(`❌ ${socket.id}: تلاش برای احراز هویت بدون initData`);
            socket.emit('authentication_failure', { message: 'داده احراز هویت تلگرام موجود نیست.' });
            return;
        }

        // **گام ۱: اعتبارسنجی امنیتی**
        if (!verifyTelegramWebAppInitData(initData)) {
            console.error(`❌ ${socket.id}: احراز هویت ناموفق. initData نامعتبر است.`);
            socket.emit('authentication_failure', { message: 'داده احراز هویت نامعتبر است. لطفا از داخل ربات تلگرام اقدام کنید.' });
            return;
        }

        // **گام ۲: استخراج user_id و name از initData**
        const params = new URLSearchParams(initData);
        const userParam = params.get('user');
        if (!userParam) {
            socket.emit('authentication_failure', { message: 'اطلاعات کاربری در داده تلگرام یافت نشد.' });
            return;
        }
        
        try {
            const user = JSON.parse(userParam);
            currentUserId = user.id.toString();
            currentUserName = user.first_name || user.username || 'کاربر ناشناس';
            
            // **گام ۳: ثبت/به‌روزرسانی در دیتابیس**
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [currentUserId, currentUserName]
            );

            // **گام ۴: پیوستن به اتاق شخصی (برای ارسال پیام‌های خصوصی)**
            socket.join(currentUserId);

            console.log(`✅ کاربر احراز هویت شد: ${currentUserName} (${currentUserId})`);
            
            // **گام ۵: ارسال موفقیت به کلاینت**
            socket.emit('authentication_success', { 
                userId: currentUserId, 
                name: currentUserName,
                message: 'احراز هویت موفقیت‌آمیز بود.'
            });

            // انتشار جدول رده‌بندی برای همه
            await emitLeaderboard();

        } catch (error) {
            console.error('❌ خطای پردازش احراز هویت:', error);
            socket.emit('authentication_failure', { message: 'خطای داخلی سرور در پردازش احراز هویت.' });
        }
    });

    // --- (۳) ایجاد بازی جدید ---
    socket.on('create_game', async ({ word, category, userId }) => {
         // ... (تغییرات جزئی برای استفاده از currentUserId تأیید شده)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین ایجاد بازی تغییر کرده است.' });
             return;
        }

        if (!word || !category) {
            socket.emit('game_error', { message: 'لطفا کلمه و دسته‌بندی را وارد کنید.' });
            return;
        }
        
        const normalizedWord = word.trim().replace(/\s/g, ''); // کلمه بدون فاصله برای طول و حدس
        if (normalizedWord.length < 3) {
            socket.emit('game_error', { message: 'کلمه باید حداقل 3 حرف باشد.' });
            return;
        }

        const gameCode = generateGameCode();
        const maxGuesses = Math.ceil(normalizedWord.length * 1.5);

        try {
            await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, start_time)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [gameCode, currentUserId, word.trim(), category.trim(), maxGuesses, maxGuesses] // کلمه با فاصله ذخیره می‌شود، اما maxGuesses بر اساس بدون فاصله است.
            );
            
            socket.join(gameCode);
            console.log(`🎉 بازی جدید ${gameCode} توسط ${currentUserName} ساخته شد.`);
            
            // ارسال وضعیت اولیه بازی
            await emitGameState(gameCode, currentUserSocketId);

            // انتشار برای همه: بازی جدید برای پیوستن در دسترس است
            io.emit('new_waiting_game', { code: gameCode, creatorName: currentUserName, category: category, wordLength: normalizedWord.length });

        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی جدید.' });
        }
    });

    // --- (۴) پیوستن به بازی ---
    socket.on('join_game', async ({ gameCode, userId, role = 'guesser' }) => {
         // ... (تغییرات جزئی برای استفاده از currentUserId تأیید شده)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین پیوستن به بازی تغییر کرده است.' });
             return;
        }
        
        // ... (منطق کامل join_game از فایل اصلی)
        try {
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'کد بازی نامعتبر است یا بازی وجود ندارد.' });
                return;
            }

            if (game.creator_id === currentUserId) {
                socket.emit('game_error', { message: 'شما سازنده این بازی هستید.' });
                return;
            }

            if (game.status !== 'waiting' && role === 'guesser') {
                socket.emit('game_error', { message: 'بازی قبلاً شروع شده یا به پایان رسیده است.' });
                return;
            }
            
            if (game.guesser_id === currentUserId || (game.spectators && game.spectators.includes(currentUserId))) {
                 // قبلا عضو بوده است
                 socket.join(gameCode);
                 await emitGameState(gameCode, currentUserSocketId);
                 return;
            }

            if (game.guesser_id && role === 'guesser') {
                role = 'spectator';
            }
            
            let queryText = '';
            let queryParams = [];

            if (role === 'guesser') {
                queryText = 'UPDATE games SET guesser_id = $1, status = $2 WHERE code = $3 RETURNING *';
                queryParams = [currentUserId, 'in_progress', gameCode];
            } else { // spectator
                queryText = 'UPDATE games SET spectators = array_append(spectators, $1) WHERE code = $2 RETURNING *';
                queryParams = [currentUserId, gameCode];
            }
            
            const updateResult = await pool.query(queryText, queryParams);
            const updatedGame = updateResult.rows[0];

            socket.join(gameCode);

            if (role === 'guesser') {
                console.log(`🤝 کاربر ${currentUserName} به عنوان حدس‌زننده به بازی ${gameCode} پیوست و بازی شروع شد.`);
                // ارسال پیام به همه اعضای بازی
                io.to(gameCode).emit('game_message', { 
                    message: `${currentUserName} به عنوان حدس‌زننده به بازی پیوست. بازی شروع شد!`, 
                    type: 'system' 
                });
                // اطلاع به همه: این بازی دیگر در لیست انتظار نیست
                io.emit('game_started', { code: gameCode });
            } else {
                console.log(`👀 کاربر ${currentUserName} به عنوان تماشاچی به بازی ${gameCode} پیوست.`);
                 // ارسال پیام به اعضای بازی (به جز تماشاچی جدید)
                 socket.to(gameCode).emit('game_message', { 
                    message: `${currentUserName} به عنوان تماشاچی به بازی پیوست.`, 
                    type: 'system' 
                });
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error(`❌ خطای پیوستن به بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    // --- (۵) ارسال حدس (کاربر حدس‌زننده) ---
    socket.on('submit_guess', async ({ gameCode, letter, userId }) => {
         // ... (تغییرات جزئی برای استفاده از currentUserId تأیید شده)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین حدس زدن تغییر کرده است.' });
             return;
        }

        if (!letter || letter.length !== 1 || !/^[آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]$/.test(letter)) {
            socket.emit('game_error', { message: 'لطفا یک حرف معتبر فارسی حدس بزنید.' });
            return;
        }

        // ... (منطق کامل submit_guess از فایل اصلی)
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = gameResult.rows[0];
            
            if (!game || game.status !== 'in_progress' || game.guesser_id !== currentUserId) {
                socket.emit('game_error', { message: 'بازی در حال انجام نیست یا شما حدس‌زننده نیستید.' });
                return;
            }

            const client = await pool.connect();
            try {
                // بررسی تکراری بودن حدس
                if (game.guessed_letters && game.guessed_letters.includes(letter)) {
                    socket.emit('game_error', { message: `حرف "${letter}" قبلاً حدس زده شده است.` });
                    return;
                }
                
                // افزودن حرف به لیست حروف حدس زده شده
                await client.query(
                    `UPDATE games SET guessed_letters = array_append(guessed_letters, $1) WHERE code = $2`,
                    [letter, gameCode]
                );

                const word = game.word.trim();
                let isCorrect = false;
                let newRevealedLetters = { ...game.revealed_letters };
                let correctCount = game.correct_guesses;

                // بررسی حدس در کلمه
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === letter && !newRevealedLetters[i]) {
                        newRevealedLetters[i] = letter;
                        isCorrect = true;
                        correctCount++;
                    }
                }

                let newGuessesLeft = game.guesses_left;
                let newIncorrectCount = game.incorrect_guesses;
                let newStatus = game.status;
                let winnerId = null;
                let scoreChange = 0; // امتیاز پایه 

                if (isCorrect) {
                    // حدس درست
                    await client.query(
                        `UPDATE games SET 
                            revealed_letters = $1, 
                            correct_guesses = $2
                            WHERE code = $3`,
                        [newRevealedLetters, correctCount, gameCode]
                    );

                    // بررسی پایان بازی (برد)
                    const normalizedWord = word.replace(/\s/g, '');
                    const revealedCount = Object.keys(newRevealedLetters).length;

                    if (revealedCount === normalizedWord.length) {
                        newStatus = 'finished';
                        winnerId = currentUserId;
                        scoreChange = 5; // امتیاز برای برد
                        io.to(gameCode).emit('game_message', { 
                            message: `حدس‌زننده برنده شد! کلمه "${word}" با موفقیت حدس زده شد.`, 
                            type: 'win' 
                        });
                    } else {
                        io.to(gameCode).emit('game_message', { 
                            message: `حدس درست: حرف "${letter}" در کلمه وجود دارد.`, 
                            type: 'info' 
                        });
                    }
                } else {
                    // حدس غلط
                    newGuessesLeft--;
                    newIncorrectCount++;
                    
                    await client.query(
                        `UPDATE games SET 
                            guesses_left = $1, 
                            incorrect_guesses = $2
                            WHERE code = $3`,
                        [newGuessesLeft, newIncorrectCount, gameCode]
                    );
                    
                    io.to(gameCode).emit('game_message', { 
                        message: `حدس غلط: حرف "${letter}" در کلمه وجود ندارد. ${newGuessesLeft} حدس باقی مانده است.`, 
                        type: 'warning' 
                    });

                    // بررسی پایان بازی (باخت)
                    if (newGuessesLeft <= 0) {
                        newStatus = 'finished';
                        winnerId = game.creator_id; // سازنده برنده می‌شود
                        scoreChange = -3; // کسر امتیاز برای باخت
                        
                        io.to(gameCode).emit('game_message', { 
                            message: `حدس‌های باقی مانده تمام شد! کلمه "${word}" بود.`, 
                            type: 'loss' 
                        });
                    }
                }

                // نهایی کردن وضعیت بازی در صورت پایان
                if (newStatus === 'finished') {
                    await client.query(
                        `UPDATE games SET 
                            status = $1, 
                            end_time = NOW(), 
                            winner_id = $2
                            WHERE code = $3`,
                        [newStatus, winnerId, gameCode]
                    );
                    
                    // به‌روزرسانی امتیازات
                    if (winnerId === currentUserId) {
                        // برد حدس زننده
                        await updateScoreAndEmitLeaderboard(currentUserId, scoreChange);
                        await updateScoreAndEmitLeaderboard(game.creator_id, -2); // کسر امتیاز از بازنده (سازنده)
                    } else if (winnerId === game.creator_id) {
                        // برد سازنده
                        await updateScoreAndEmitLeaderboard(game.creator_id, 3); 
                        await updateScoreAndEmitLeaderboard(currentUserId, scoreChange); // کسر امتیاز از بازنده (حدس زننده)
                    }
                }

            } finally {
                client.release();
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error(`❌ خطای ارسال حدس برای بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });

    // --- (۶) درخواست راهنمایی ---
    socket.on('request_hint', async ({ gameCode, position, userId }) => {
        // ... (تغییرات جزئی برای استفاده از currentUserId تأیید شده)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین درخواست راهنمایی تغییر کرده است.' });
             return;
        }

        // ... (منطق کامل request_hint از فایل اصلی)
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = gameResult.rows[0];

            if (!game || game.status !== 'in_progress' || game.guesser_id !== currentUserId) {
                socket.emit('game_error', { message: 'بازی در حال انجام نیست یا شما حدس‌زننده نیستید.' });
                return;
            }

            const client = await pool.connect();
            try {
                // بررسی امتیاز کاربر برای کسر
                const userScoreResult = await client.query('SELECT score FROM users WHERE telegram_id = $1', [currentUserId]);
                const userScore = userScoreResult.rows[0].score;
                
                if (userScore < 2) { // هزینه راهنمایی 2 امتیاز است
                    socket.emit('game_error', { message: 'امتیاز شما برای دریافت راهنمایی کافی نیست (حداقل ۲ امتیاز نیاز است).' });
                    return;
                }
                
                const word = game.word.trim();
                const wordLength = word.replace(/\s/g, '').length;
                
                if (position < 1 || position > wordLength) {
                    socket.emit('game_error', { message: `موقعیت نامعتبر است. باید بین ۱ تا ${wordLength} باشد.` });
                    return;
                }

                let charIndex = -1; // ایندکس واقعی در رشته word (با در نظر گرفتن فضا)
                let currentWordPos = 0; // موقعیت در کلمه بدون فضا
                for (let i = 0; i < word.length; i++) {
                    if (word[i] !== ' ') {
                        currentWordPos++;
                        if (currentWordPos === position) {
                            charIndex = i;
                            break;
                        }
                    }
                }

                if (charIndex === -1) {
                    socket.emit('game_error', { message: 'خطای داخلی: موقعیت حرف یافت نشد.' });
                    return;
                }

                const letter = word[charIndex];
                let newRevealedLetters = { ...game.revealed_letters };
                let correctCount = game.correct_guesses;

                // اگر حرف قبلا آشکار نشده است
                if (!newRevealedLetters[charIndex]) {
                    newRevealedLetters[charIndex] = letter;
                    correctCount++;
                    
                    // کسر امتیاز و به‌روزرسانی حروف
                    await client.query(
                        `UPDATE users SET score = score - 2 WHERE telegram_id = $1`,
                        [currentUserId]
                    );

                    await client.query(
                        `UPDATE games SET 
                            revealed_letters = $1, 
                            correct_guesses = $2
                            WHERE code = $3`,
                        [newRevealedLetters, correctCount, gameCode]
                    );

                    io.to(gameCode).emit('game_message', { 
                        message: `حدس‌زننده با هزینه ۲ امتیاز، حرف در موقعیت ${position} را آشکار کرد: "${letter}"`, 
                        type: 'hint' 
                    });

                    // بررسی پایان بازی (برد)
                    const normalizedWord = word.replace(/\s/g, '');
                    const revealedCount = Object.keys(newRevealedLetters).length;

                    if (revealedCount === normalizedWord.length) {
                        // در صورت برد با راهنمایی، امتیاز کمتری به حدس‌زننده داده می‌شود
                        await client.query(
                            `UPDATE games SET 
                                status = 'finished', 
                                end_time = NOW(), 
                                winner_id = $1
                                WHERE code = $2`,
                            [currentUserId, gameCode]
                        );
                        // به‌روزرسانی امتیازات: امتیاز پایه برد + ۲ امتیاز کسر شده برای راهنمایی
                        await updateScoreAndEmitLeaderboard(currentUserId, 3); // امتیاز پایه 5 منهای 2 امتیازی که کسر شده بود
                        await updateScoreAndEmitLeaderboard(game.creator_id, -2); // کسر امتیاز از بازنده (سازنده)
                        
                        io.to(gameCode).emit('game_message', { 
                            message: `حدس‌زننده برنده شد! کلمه "${word}" با موفقیت حدس زده شد.`, 
                            type: 'win' 
                        });
                    }

                    await emitGameState(gameCode);
                    await emitLeaderboard();

                } else {
                    socket.emit('game_error', { message: `حرف در موقعیت ${position} قبلاً آشکار شده است.` });
                }

            } finally {
                client.release();
            }

        } catch (error) {
            console.error(`❌ خطای درخواست راهنمایی برای بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در پردازش درخواست راهنمایی.' });
        }
    });

    // --- (۷) پیوستن به بازی تصادفی ---
    socket.on('join_random_game', async ({ userId }) => {
        // ... (تغییرات جزئی برای استفاده از currentUserId تأیید شده)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین پیوستن به بازی تغییر کرده است.' });
             return;
        }

        // ... (منطق کامل join_random_game از فایل اصلی)
        try {
            const waitingGameResult = await pool.query(
                `SELECT code 
                FROM games 
                WHERE status = 'waiting' 
                AND creator_id != $1
                AND guesser_id IS NULL
                ORDER BY start_time ASC 
                LIMIT 1`,
                [currentUserId]
            );

            if (waitingGameResult.rows.length > 0) {
                const gameCode = waitingGameResult.rows[0].code;
                
                // استفاده مجدد از منطق join_game
                socket.emit('join_game', { gameCode, userId: currentUserId, role: 'guesser' }); 

            } else {
                socket.emit('game_error', { message: 'در حال حاضر بازی منتظر حدس‌زننده وجود ندارد.' });
            }

        } catch (error) {
            console.error('❌ خطای پیوستن به بازی تصادفی:', error);
            socket.emit('game_error', { message: 'خطا در جستجوی بازی تصادفی.' });
        }
    });

    // --- (۸) خروج/انصراف از بازی ---
    socket.on('leave_game', async ({ gameCode, userId }) => {
        // ... (منطق کامل leave_game از فایل اصلی)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین خروج از بازی تغییر کرده است.' });
             return;
        }

        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = gameResult.rows[0];

            if (!game) return;

            // خروج از اتاق سوکت
            socket.leave(gameCode);
            let message = `${currentUserName} از بازی خارج شد.`;

            if (game.creator_id === currentUserId) {
                // اگر سازنده است، بازی لغو می‌شود
                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW() WHERE code = $2',
                    ['cancelled', gameCode]
                );
                message = `سازنده (${currentUserName}) بازی را لغو کرد.`;
                io.emit('game_started', { code: gameCode }); // حذف از لیست فعال/انتظار
            } else if (game.guesser_id === currentUserId) {
                // اگر حدس زننده است، بازی به حالت انتظار برمی‌گردد یا باطل می‌شود
                 if (game.status === 'in_progress') {
                     // حدس‌زننده انصراف داد، سازنده برنده می‌شود و بازی تمام می‌شود
                     await pool.query(
                        'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                        ['finished', game.creator_id, gameCode]
                    );
                     // کسر امتیاز از حدس‌زننده و جایزه به سازنده
                    await updateScoreAndEmitLeaderboard(currentUserId, -5); 
                    await updateScoreAndEmitLeaderboard(game.creator_id, 3);
                    
                    message = `حدس‌زننده (${currentUserName}) از بازی انصراف داد. سازنده برنده شد.`;
                    io.emit('game_started', { code: gameCode });
                 } else {
                     // در حالت انتظار، حدس‌زننده حذف می‌شود
                     await pool.query(
                        'UPDATE games SET guesser_id = NULL, status = $1 WHERE code = $2',
                        ['waiting', gameCode]
                    );
                    message = `حدس‌زننده (${currentUserName}) از بازی خارج شد. بازی به حالت انتظار بازگشت.`;
                    io.emit('new_waiting_game', { code: gameCode, creatorName: game.creator_id, category: game.category, wordLength: game.word.replace(/\s/g, '').length });
                 }
            } else { 
                // اگر تماشاچی است
                await pool.query(
                    'UPDATE games SET spectators = array_remove(spectators, $1) WHERE code = $2',
                    [currentUserId, gameCode]
                );
                message = `تماشاچی (${currentUserName}) از بازی خارج شد.`;
            }
            
            // ارسال به‌روزرسانی به بقیه اعضای بازی
            io.to(gameCode).emit('game_message', { message, type: 'system' });
            await emitGameState(gameCode);

            // ارسال پیام موفقیت به خود کاربر
            socket.emit('leave_game_success', { message: 'شما با موفقیت از بازی خارج شدید.' });

        } catch (error) {
            console.error(`❌ خطای خروج از بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در خروج از بازی.' });
        }
    });

    // --- (۹) دریافت وضعیت یک بازی خاص (برای ورود مستقیم) ---
    socket.on('get_game_status', async ({ gameCode, userId }) => {
        // ... (منطق کامل get_game_status از فایل اصلی)
        if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین درخواست وضعیت بازی تغییر کرده است.' });
             return;
        }

        try {
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                 socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
                 return;
            }
            
            // بررسی نقش کاربر در بازی
            const isCreator = game.creator_id === currentUserId;
            const isGuesser = game.guesser_id === currentUserId;
            const isSpectator = game.spectators && game.spectators.includes(currentUserId);

            if (!isCreator && !isGuesser && !isSpectator) {
                // اگر عضو بازی نیست و بازی در حال انتظار است، اجازه پیوستن بده
                if (game.status === 'waiting') {
                    socket.emit('can_join_game', { gameCode, role: 'guesser' });
                } else {
                    // بازی شروع شده است، به عنوان تماشاچی پیشنهاد بده
                    socket.emit('can_join_game', { gameCode, role: 'spectator' });
                }
                return;
            }

            // اگر عضو است، به اتاق بپیوندد و وضعیت را ارسال کن
            socket.join(gameCode);
            await emitGameState(gameCode, currentUserSocketId);
            
        } catch (error) {
            console.error(`❌ خطای دریافت وضعیت بازی ${gameCode}:`, error);
            socket.emit('game_error', { message: 'خطا در دریافت وضعیت بازی.' });
        }
    });

    // --- (۱۰) دریافت لیست بازی‌های منتظر (تغییر جزئی در انتخاب فیلدها) ---
    socket.on('get_waiting_games', async () => {
        try {
            const waitingGamesResult = await pool.query(`
                SELECT g.code, u.name as creatorName, g.category, g.word, g.start_time
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.guesser_id IS NULL
                ORDER BY g.start_time DESC
                LIMIT 10
            `);
            
            const games = waitingGamesResult.rows.map(g => ({
                code: g.code,
                creatorName: g.creatorname,
                category: g.category,
                wordLength: g.word.replace(/\s/g, '').length,
                startTime: g.start_time
            }));

            socket.emit('waiting_games_list', games);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌های منتظر:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های منتظر.' });
        }
    });

    // --- (۱۱) دریافت لیست بازی‌های فعال کاربر ---
    socket.on('get_active_games', async ({ userId }) => {
        // ... (منطق کامل get_active_games از فایل اصلی)
         if (currentUserId !== userId) {
             socket.emit('game_error', { message: 'خطای احراز هویت: کاربر در حین درخواست بازی‌های فعال تغییر کرده است.' });
             return;
        }

        try {
            const activeGamesResult = await pool.query(`
                SELECT 
                    g.code,
                    g.category,
                    g.status,
                    CASE 
                        WHEN g.creator_id = $1 THEN 'creator'
                        WHEN g.guesser_id = $1 THEN 'guesser'
                        ELSE 'spectator'
                    END as role
                FROM games g
                WHERE (g.creator_id = $1 OR g.guesser_id = $1 OR $1 = ANY(g.spectators))
                AND g.status IN ('waiting', 'in_progress')
                ORDER BY g.start_time DESC
            `, [currentUserId]); // استفاده از currentUserId تأیید شده
            
            const games = activeGamesResult.rows;
            socket.emit('active_games_list', games);
        } catch (error) {
            console.error('❌ خطای دریافت بازی‌های فعال:', error);
            socket.emit('game_error', { message: 'خطا در دریافت بازی‌های فعال.' });
        }
    });
    
    // --- (۱۲) قطع اتصال ---
    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id} (${currentUserName || 'ناشناس'})`);
    });
});

// --- شروع سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور در پورت ${PORT} فعال شد.`);
        // Emit initial leaderboard on startup
        emitLeaderboard();
    });
}).catch(err => {
    console.error('❌ سرور به دلیل خطای دیتابیس شروع نشد:', err);
    process.exit(1);
});
