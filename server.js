const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- Telegram Bot Library ---
const TelegramBot = require('node-telegram-bot-api');


// --- تنظیمات و متغیرهای محیطی ---
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = 'postgresql://abzx:RsDq7AmdXXj9WOnACP0RTxonFuKIaJki@dpg-d3oj7rmuk2gs73cscc6g-a.frankfurt-postgres.render.com/wordlydb_7vux';
const FRONTEND_URL = 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی دیتابیس PostgreSQL ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// --- راه‌اندازی ربات تلگرام ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ربات تلگرام فعال شد.');

// --- مجموعه کلمات لیگ ---
const leagueWords = {
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

// --- منطق ربات تلگرام ---
bot.onText(/\/start/, async (msg) => {
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

// --- توابع کمکی ---
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

// --- اتصال و ایجاد جداول دیتابیس ---
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // جدول کاربران
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id VARCHAR(255) UNIQUE NOT NULL,
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
                creator_id VARCHAR(255) NOT NULL REFERENCES users(telegram_id),
                guesser_id VARCHAR(255),
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

        // جداول لیگ
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

// --- توابع مدیریت وضعیت ---
async function emitGameState(gameCode, socketId = null) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        const game = result.rows[0];

        if (game) {
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }

            const gameState = {
                code: game.code,
                status: game.status,
                category: game.category,
                wordLength: game.word.replace(/\s/g, '').length,  // بهبود: طول بدون فضا
                maxGuesses: game.max_guesses,
                guessesLeft: game.guesses_left,
                correctGuesses: game.correct_guesses,
                incorrectGuesses: game.incorrect_guesses,
                revealedLetters: game.revealed_letters || {},
                guessedLetters: game.guessed_letters || [],
                startTime: game.start_time,
                creator: creator,
                guesser: guesser,
                word: (game.status === 'finished' || game.status === 'cancelled') ? game.word : null
            };
            
            if (socketId) {
                io.to(socketId).emit('game_update', gameState);
            } else {
                io.to(gameCode).emit('game_update', gameState);
            }
            console.log(`📡 وضعیت جدید بازی ${gameCode} ارسال شد. وضعیت: ${game.status}`);
        } else {
            io.to(gameCode).emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
        }
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت بازی ${gameCode}:`, error);
        io.to(gameCode).emit('game_error', { message: 'خطا در fetch وضعیت بازی.' });
    }
}

async function updateScoreAndEmitLeaderboard(userId, points) {
    if (!userId) return; 

    try {
        await pool.query('UPDATE users SET score = score + $1 WHERE telegram_id = $2', [points, userId]);
        await emitLeaderboard();
    } catch (error) {
        console.error(`❌ خطای به‌روزرسانی امتیاز کاربر ${userId}:`, error);
    }
}

async function emitLeaderboard() {
    try {
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

// --- توابع مدیریت لیگ ---
async function emitLeagueState(leagueCode) {
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
                        SELECT * FROM league_player_words 
                        WHERE league_id = $1 AND user_id = $2 AND word_number = $3
                    `, [league.id, player.telegram_id, league.current_word_number]);
                    
                    if (playerWordResult.rows.length > 0) {
                        player.currentWord = playerWordResult.rows[0];
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
            players: players,
            currentWord: currentWordInfo ? currentWordInfo.word : null,
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

async function startLeague(leagueCode) {
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
                max_guesses: Math.ceil(word.replace(/\s/g, '').length * 1.5),  // بهبود: طول بدون فضا
                status: i === 1 ? 'active' : 'pending'
            });
        }

        // ذخیره کلمات در دیتابیس
        for (const wordData of words) {
            await pool.query(`
                INSERT INTO league_words (league_id, word_number, word, category, max_guesses, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [wordData.league_id, wordData.word_number, wordData.word, wordData.category, 
                wordData.max_guesses, wordData.status]);
        }

        // ایجاد رکوردهای کلمات برای بازیکنان
        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);

        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words 
                (league_id, user_id, word_number, word, category, guesses_left, start_time, status)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress')
                ON CONFLICT (league_id, user_id, word_number) DO UPDATE SET
                    guesses_left = EXCLUDED.guesses_left,
                    start_time = NOW(),
                    status = 'in_progress'
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
            
            io.to(leagueCode).emit('leagueStarted', {
                code: leagueCode,
                status: 'in_progress',
                currentWordNumber: 1,
                totalWords: 10
            });

            console.log(`🎮 لیگ ${leagueCode} شروع شد.`);
            
        }, 3000);

    } catch (error) {
        console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در شروع لیگ.' });
    }
}

async function startLeagueWord(leagueCode, wordNumber) {
    try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (wordNumber > 1) {
            await pool.query(`
                UPDATE league_words SET status = 'completed' 
                WHERE league_id = $1 AND word_number = $2
            `, [league.id, wordNumber - 1]);
        }

        await pool.query(`
            UPDATE league_words SET status = 'active' 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        await pool.query(`
            UPDATE leagues SET current_word_number = $1 
            WHERE code = $2
        `, [wordNumber, leagueCode]);

        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);

        const currentWordResult = await pool.query(`
            SELECT word, category, max_guesses FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        if (currentWordResult.rows.length === 0) {
            console.error(`❌ کلمه ${wordNumber} برای لیگ ${leagueCode} یافت نشد.`);
            return;
        }

        const currentWord = currentWordResult.rows[0];

        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words 
                (league_id, user_id, word_number, word, category, guesses_left, start_time, status)
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress')
                ON CONFLICT (league_id, user_id, word_number) 
                DO UPDATE SET 
                    guesses_left = EXCLUDED.guesses_left,
                    start_time = NOW(),
                    status = 'in_progress',
                    revealed_letters = '{}',
                    guessed_letters = '{}',
                    correct_guesses = 0,
                    incorrect_guesses = 0
            `, [league.id, player.user_id, wordNumber, currentWord.word, 
                currentWord.category, currentWord.max_guesses]);
        }

        await emitLeagueState(leagueCode);

        io.to(leagueCode).emit('leagueWordStarted', {
            code: leagueCode,
            currentWordNumber: wordNumber,
            totalWords: 10,
            currentCategory: currentWord.category
        });

        console.log(`📝 کلمه ${wordNumber} در لیگ ${leagueCode} شروع شد.`);

    } catch (error) {
        console.error(`❌ خطای شروع کلمه جدید در لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در شروع کلمه جدید.' });
    }
}

async function endLeague(leagueCode) {
    try {
        await pool.query(
            'UPDATE leagues SET status = $1, end_time = NOW() WHERE code = $2',
            ['ended', leagueCode]
        );

        const winnerResult = await pool.query(`
            SELECT u.telegram_id, u.name, lp.score
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = (SELECT id FROM leagues WHERE code = $1)
            ORDER BY lp.score DESC
            LIMIT 1
        `, [leagueCode]);

        const winner = winnerResult.rows[0];

        await emitLeagueState(leagueCode);

        io.to(leagueCode).emit('leagueEnded', {
            code: leagueCode,
            status: 'ended',
            winner: winner
        });

        console.log(`🏆 لیگ ${leagueCode} به پایان رسید. برنده: ${winner?.name || 'نامشخص'}`);

    } catch (error) {
        console.error(`❌ خطای پایان لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در پایان لیگ.' });
    }
}

// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    let currentUserId = null;
    let currentUserName = null;

    // --- (۱) ورود و ثبت‌نام کاربر ---
    socket.on('user_login', async ({ userId, name }) => {
        try {
            currentUserId = userId;
            currentUserName = name;
            
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
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

            for (const game of activeGamesResult.rows) {
                socket.join(game.code);
                console.log(`🔗 کاربر ${userId} به بازی فعال ${game.code} ملحق شد.`);
                await emitGameState(game.code, socket.id);  // فقط به این سوکت بفرست
            }

            // اتصال مجدد به لیگ فعال
            const activeLeaguesResult = await pool.query(`
                SELECT l.code 
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
            `, [userId]);

            for (const league of activeLeaguesResult.rows) {
                socket.join(league.code);
                console.log(`🔗 کاربر ${userId} به لیگ فعال ${league.code} ملحق شد.`);
                await emitLeagueState(league.code);
            }

            socket.emit('login_success', { name, userId });
            await emitLeaderboard();

        } catch (error) {
            console.error('❌ خطای ورود کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ثبت اطلاعات کاربری.' });
        }
    });

    // --- (۲) ایجاد بازی ---
    socket.on('create_game', async ({ userId, word, category }) => {
        if (!userId || !word || !category) {
            return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });
        }

        try {
            const gameCode = generateGameCode();
            const wordWithoutSpaces = word.replace(/\s/g, '');
            const maxGuesses = Math.ceil(wordWithoutSpaces.length * 1.5);
            
            if (!/^[\u0600-\u06FF\s]+$/.test(word) || wordWithoutSpaces.length < 3) {
                 return socket.emit('game_error', { message: 'کلمه باید فقط شامل حروف فارسی و فاصله باشد و حداقل ۳ حرف داشته باشد.' });
            }
            
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, revealed_letters, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'waiting') RETURNING *`,
                [gameCode, userId, word.toLowerCase(), category, maxGuesses, maxGuesses, {}]
            );
            
            const newGame = result.rows[0];
            socket.join(gameCode);
            socket.emit('game_created', { code: gameCode });
            console.log(`🎮 بازی جدید ایجاد شد: ${gameCode} توسط ${userId} - کلمه: "${word}"`);
            await emitGameState(gameCode);
            
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
                WHERE g.status = 'waiting'
            `);
            
            const waitingGames = result.rows.map(game => ({
                code: game.code,
                category: game.category,
                creatorName: game.creator_name,
                word: game.word,
                maxGuesses: game.max_guesses
            }));
            
            socket.emit('waiting_games_list', waitingGames);
            
        } catch (error) {
            console.error('❌ خطای لیست بازی‌های منتظر:', error);
            socket.emit('game_error', { message: 'خطا در fetch لیست بازی‌ها.' });
        }
    });

    // --- لیست بازی‌های فعال کاربر ---
    socket.on('get_active_games', async ({ userId }) => {
        try {
            const result = await pool.query(`
                SELECT g.code, g.category, g.status, creator.name as creator_name, guesser.name as guesser_name
                FROM games g
                LEFT JOIN users creator ON g.creator_id = creator.telegram_id
                LEFT JOIN users guesser ON g.guesser_id = guesser.telegram_id
                WHERE (g.creator_id = $1 OR g.guesser_id = $1)
                AND g.status IN ('waiting', 'in_progress')
                ORDER BY g.start_time DESC
            `, [userId]);
            
            const activeGames = result.rows.map(game => ({
                code: game.code,
                category: game.category,
                status: game.status === 'waiting' ? 'منتظر' : 'در حال انجام',
                guesserName: game.guesser_name
            }));
            
            socket.emit('active_games_list', activeGames);
            
        } catch (error) {
            console.error('❌ خطای دریافت بازی‌های فعال:', error);
            socket.emit('game_error', { message: 'خطا در دریافت بازی‌های فعال.' });
        }
    });

    // --- (۴) پیوستن به بازی ---
    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query(
                'SELECT * FROM games WHERE code = $1 AND status = $2', 
                [gameCode, 'waiting']
            );
            const game = gameResult.rows[0];

            if (!game) {
                return socket.emit('game_error', { message: 'بازی پیدا نشد یا قبلاً شروع شده است.' });
            }

            if (game.creator_id === userId) {
                return socket.emit('game_error', { message: 'شما نمی‌توانید به بازی خودتان بپیوندید.' });
            }

            await pool.query(
                'UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3',
                [userId, 'in_progress', gameCode]
            );

            socket.join(gameCode);
            socket.emit('game_joined', { code: gameCode });
            
            await emitGameState(gameCode);
            
            // ارسال نوتیفیکیشن به creator
            io.to(`user:${game.creator_id}`).emit('game_started', { code: gameCode });
            bot.sendMessage(game.creator_id, `بازی شما با کد ${gameCode} شروع شد! یک بازیکن به آن پیوست. وضعیت را چک کنید.`);

            console.log(`🔗 کاربر ${userId} به بازی ${gameCode} پیوست.`);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    // --- (۴-الف) پیوستن به بازی تصادفی ---
    socket.on('join_random_game', async ({ userId }) => {
        try {
            const randomGameResult = await pool.query(`
                SELECT g.code 
                FROM games g 
                WHERE g.status = 'waiting' 
                AND g.creator_id != $1 
                ORDER BY RANDOM() 
                LIMIT 1
            `, [userId]);
            
            if (randomGameResult.rows.length === 0) {
                return socket.emit('game_error', { message: 'هیچ بازی منتظری برای پیوستن وجود ندارد.' });
            }
            
            const gameCode = randomGameResult.rows[0].code;
            
            const gameResult = await pool.query(
                'SELECT * FROM games WHERE code = $1 AND status = $2', 
                [gameCode, 'waiting']
            );
            const game = gameResult.rows[0];

            if (!game) {
                return socket.emit('game_error', { message: 'بازی پیدا نشد یا قبلاً شروع شده است.' });
            }

            await pool.query(
                'UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3',
                [userId, 'in_progress', gameCode]
            );

            socket.join(gameCode);
            socket.emit('game_joined', { code: gameCode });
            
            await emitGameState(gameCode);
            
            // ارسال نوتیفیکیشن به creator
            io.to(`user:${game.creator_id}`).emit('game_started', { code: gameCode });
            bot.sendMessage(game.creator_id, `بازی شما با کد ${gameCode} شروع شد! یک بازیکن به آن پیوست. وضعیت را چک کنید.`);

            console.log(`🔗 کاربر ${userId} به بازی تصادفی ${gameCode} پیوست.`);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی تصادفی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی تصادفی.' });
        }
    });

    // --- (۴-ب) دریافت تاریخچه بازی‌های کاربر ---
    socket.on('get_game_history', async ({ userId }) => {
        try {
            const historyResult = await pool.query(`
                SELECT 
                    g.code,
                    g.word,
                    g.category,
                    g.status,
                    g.start_time,
                    g.end_time,
                    g.winner_id,
                    creator.name as creator_name,
                    guesser.name as guesser_name,
                    CASE 
                        WHEN g.creator_id = $1 THEN 'creator'
                        WHEN g.guesser_id = $1 THEN 'guesser'
                    END as user_role,
                    CASE 
                        WHEN g.winner_id = $1 THEN 'win'
                        WHEN g.winner_id IS NOT NULL AND g.winner_id != $1 THEN 'loss'
                        ELSE 'draw'
                    END as result
                FROM games g
                LEFT JOIN users creator ON g.creator_id = creator.telegram_id
                LEFT JOIN users guesser ON g.guesser_id = guesser.telegram_id
                WHERE (g.creator_id = $1 OR g.guesser_id = $1)
                AND g.status = 'finished'
                ORDER BY g.end_time DESC
                LIMIT 20
            `, [userId]);
            
            const gameHistory = historyResult.rows.map(game => ({
                code: game.code,
                word: game.word,
                category: game.category,
                status: game.status,
                startTime: game.start_time,
                endTime: game.end_time,
                creatorName: game.creator_name,
                guesserName: game.guesser_name,
                userRole: game.user_role,
                result: game.result,
                opponentName: game.user_role === 'creator' ? game.guesser_name : game.creator_name
            }));
            
            socket.emit('game_history', gameHistory);
            
        } catch (error) {
            console.error('❌ خطای دریافت تاریخچه بازی:', error);
            socket.emit('game_error', { message: 'خطا در دریافت تاریخچه بازی.' });
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
				io.to(gameCode).emit('message', { 
					type: 'warning', 
					text: `⚠️ حرف "${normalizedLetter}" قبلاً حدس زده شده است.` 
				});
				return;
			}

			let isCorrect = false;
			let newRevealed = { ...game.revealed_letters };
			let indices = [];
			
			
			for (let i = 0; i < game.word.length; i++) {
				if (game.word[i] !== ' ' && game.word[i] === normalizedLetter) {
					indices.push(i);
				}
			}
			
			if (indices.length > 0) {
				isCorrect = true;
				newRevealed[normalizedLetter] = [...(newRevealed[normalizedLetter] || []), ...indices];
			}

			const newGuessesLeft = game.guesses_left - 1;
			const newCorrectGuesses = game.correct_guesses + (isCorrect ? indices.length : 0);
			const newIncorrectGuesses = game.incorrect_guesses + (isCorrect ? 0 : 1);
			
			let gameStatus = 'in_progress';
			let winnerId = null;
			let pointsGained = 0;
			
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

			const messageType = isCorrect ? 'success' : 'error';
			io.to(gameCode).emit('message', { 
				type: messageType, 
				text: `${currentUserName} حدس زد: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` 
			});

			const wordWithoutSpacesLength = game.word.replace(/\s/g, '').length;
			const revealedCount = Object.values(newRevealed).reduce((acc, arr) => acc + arr.length, 0);  // بهبود محاسبه

			if (revealedCount === wordWithoutSpacesLength) {
				gameStatus = 'finished';
				winnerId = userId;
				
				const timeTaken = (Date.now() - new Date(game.start_time).getTime()) / 1000;
				
				pointsGained = Math.max(10, Math.floor(
					1000 - (10 * newIncorrectGuesses) - (timeTaken) + (50 * wordWithoutSpacesLength)
				));
				
				await pool.query(
					'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
					[gameStatus, winnerId, gameCode]
				);
				await updateScoreAndEmitLeaderboard(winnerId, pointsGained);
			} else if (newGuessesLeft <= 0) {
				gameStatus = 'finished';
				pointsGained = -5;
				winnerId = game.creator_id;
				
				await pool.query(
					'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
					[gameStatus, winnerId, gameCode]
				);
				await updateScoreAndEmitLeaderboard(userId, pointsGained);
				await updateScoreAndEmitLeaderboard(winnerId, 10);
			}

			if (gameStatus === 'finished') {
				 const winnerName = (await pool.query('SELECT name FROM users WHERE telegram_id = $1', [winnerId])).rows[0]?.name || 'نامشخص';
				 io.to(gameCode).emit('game_finished', { 
					winnerName: winnerName, 
					points: winnerId === userId ? pointsGained : 10,
					forfeit: false,
					word: game.word
				});
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
            
            const requestedIndex = parseInt(letterPosition);
            if (requestedIndex < 0 || requestedIndex >= game.word.length || isNaN(requestedIndex)) {
                return socket.emit('game_error', { message: 'موقعیت حرف نامعتبر است.' });
            }
            
            const letter = game.word[requestedIndex];
            
            if (letter === ' ') {
                return socket.emit('game_error', { message: 'این موقعیت مربوط به فاصله است.' });
            }
            
            const isAlreadyRevealed = game.revealed_letters && 
                game.revealed_letters[letter] && 
                game.revealed_letters[letter].includes(requestedIndex);
                
            if (isAlreadyRevealed) {
                return socket.emit('game_error', { message: 'این حرف قبلاً حدس زده شده است.' });
            }
            
            const pointsCost = 2;
            const updateScoreResult = await pool.query('UPDATE users SET score = score - $1 WHERE telegram_id = $2 AND score >= $1 RETURNING score', [pointsCost, userId]);
            
            if (updateScoreResult.rowCount === 0) {
                 return socket.emit('game_error', { message: 'امتیاز شما برای استفاده از راهنمایی کافی نیست.' });
            }

            const newRevealed = { ...(game.revealed_letters || {}) };
            if (!newRevealed[letter]) {
                newRevealed[letter] = [];
            }
            newRevealed[letter].push(requestedIndex);
            
            await pool.query(
                'UPDATE games SET revealed_letters = $1 WHERE code = $2',
                [newRevealed, gameCode]
            );
            
            io.to(gameCode).emit('message', { 
                type: 'info', 
                text: `💡 ${currentUserName} از راهنمایی استفاده کرد و حرف "${letter}" در موقعیت ${requestedIndex + 1} را دریافت کرد.` 
            });
            
            await emitGameState(gameCode);
            await emitLeaderboard();
            
        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در پردازش درخواست راهنمایی.' });
        }
    });

    // --- (۷) مدیریت ترک/لغو بازی ---
    socket.on('leave_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = gameResult.rows[0];

            if (!game) {
                return socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
            }
            
            socket.leave(gameCode);

            if (game.status === 'waiting' && game.creator_id === userId) {
                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW() WHERE code = $2',
                    ['cancelled', gameCode]
                );
                
                io.to(gameCode).emit('game_cancelled', { 
                    message: `بازی ${gameCode} توسط سازنده لغو شد.` 
                });
                console.log(`❌ بازی ${gameCode} توسط سازنده (${userId}) لغو شد.`);
                return;
            } 
            
            else if (game.status === 'in_progress' && (game.creator_id === userId || game.guesser_id === userId)) {
                
                const isCreator = game.creator_id === userId;
                const winnerId = isCreator ? game.guesser_id : game.creator_id;
                const loserId = userId;
                const loserName = currentUserName;

                if (!winnerId) {
                     await pool.query(
                        'UPDATE games SET status = $1, end_time = NOW() WHERE code = $2',
                        ['cancelled', gameCode]
                    );
                    io.to(gameCode).emit('game_cancelled', { 
                        message: `بازی به دلیل خروج بازیکن لغو شد.` 
                    });
                    return;
                }

                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                    ['finished', winnerId, gameCode]
                );
                
                const winnerName = (await pool.query('SELECT name FROM users WHERE telegram_id = $1', [winnerId])).rows[0]?.name || 'حریف';
                await updateScoreAndEmitLeaderboard(winnerId, 10);
                await updateScoreAndEmitLeaderboard(loserId, -5);

                io.to(gameCode).emit('game_finished', { 
                    winnerName: winnerName, 
                    points: 10,
                    forfeit: true,
                    forfeiterName: loserName,
                    word: game.word
                });
                
                socket.emit('game_finished', { 
                    winnerName: winnerName, 
                    points: -5,
                    forfeit: true,
                    forfeiterName: loserName,
                    word: game.word
                });
                
                console.log(`⚔️ بازی ${gameCode} توسط ${loserName} باخت اعلام شد. برنده: ${winnerName}`);
                return;
            }
            
            socket.emit('game_error', { message: 'عملیات ترک بازی غیرمجاز است.' });

        } catch (error) {
            console.error('❌ خطای ترک بازی:', error);
            socket.emit('game_error', { message: 'خطا در پردازش ترک بازی.' });
        }
    });

    // --- (۸) مدیریت لیگ ---
    socket.on('create_league', async ({ userId }) => {
        try {
            const leagueCode = generateGameCode();
            
            await pool.query(`
                INSERT INTO leagues (code, status, total_words) 
                VALUES ($1, 'waiting', 10)
            `, [leagueCode]);
            
            const leagueResult = await pool.query('SELECT id FROM leagues WHERE code = $1', [leagueCode]);
            const leagueId = leagueResult.rows[0].id;
            
            await pool.query(`
                INSERT INTO league_players (league_id, user_id, score, correct_words, total_time)
                VALUES ($1, $2, 0, 0, 0)
            `, [leagueId, userId]);
            
            socket.join(leagueCode);
            socket.emit('league_created', { code: leagueCode });
            console.log(`🏆 لیگ جدید ایجاد شد: ${leagueCode} توسط ${userId}`);
            
            await emitLeagueState(leagueCode);
            
        } catch (error) {
            console.error('❌ خطای ایجاد لیگ:', error);
            socket.emit('league_error', { message: 'خطا در ایجاد لیگ.' });
        }
    });

    socket.on('join_league', async ({ userId, leagueCode }) => {
        try {
            const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1 AND status = $2', [leagueCode, 'waiting']);
            const league = leagueResult.rows[0];
            
            if (!league) {
                return socket.emit('league_error', { message: 'لیگ پیدا نشد یا قبلاً شروع شده است.' });
            }
            
            const existingPlayer = await pool.query(`
                SELECT * FROM league_players 
                WHERE league_id = $1 AND user_id = $2
            `, [league.id, userId]);
            
            if (existingPlayer.rows.length > 0) {
                return socket.emit('league_error', { message: 'شما قبلاً در این لیگ عضو شده‌اید.' });
            }
            
            await pool.query(`
                INSERT INTO league_players (league_id, user_id, score, correct_words, total_time)
                VALUES ($1, $2, 0, 0, 0)
            `, [league.id, userId]);
            
            socket.join(leagueCode);
            socket.emit('league_joined', { code: leagueCode });
            
            console.log(`🔗 کاربر ${userId} به لیگ ${leagueCode} پیوست.`);
            
            await emitLeagueState(leagueCode);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پیوستن به لیگ.' });
        }
    });

    socket.on('start_league', async ({ userId, leagueCode }) => {
        try {
            const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];
            
            if (!league) {
                return socket.emit('league_error', { message: 'لیگ پیدا نشد.' });
            }
            
            const creatorCheck = await pool.query(`
                SELECT * FROM league_players 
                WHERE league_id = $1 AND user_id = $2
            `, [league.id, userId]);
            
            if (creatorCheck.rows.length === 0 || creatorCheck.rows[0].joined_at !== league.created_at) {  // چک سازنده
                return socket.emit('league_error', { message: 'فقط سازنده لیگ می‌تواند آن را شروع کند.' });
            }
            
            const playerCountResult = await pool.query(`
                SELECT COUNT(*) FROM league_players WHERE league_id = $1
            `, [league.id]);
            
            const playerCount = parseInt(playerCountResult.rows[0].count);
            
            if (playerCount < 2) {
                return socket.emit('league_error', { message: 'برای شروع لیگ حداقل ۲ بازیکن نیاز است.' });
            }
            
            await startLeague(leagueCode);
            
        } catch (error) {
            console.error('❌ خطای شروع لیگ:', error);
            socket.emit('league_error', { message: 'خطا در شروع لیگ.' });
        }
    });

    socket.on('submit_league_guess', async ({ userId, leagueCode, letter }) => {
        try {
            const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1 AND status = $2', [leagueCode, 'in_progress']);
            const league = leagueResult.rows[0];
            
            if (!league) {
                return socket.emit('league_error', { message: 'لیگ فعال پیدا نشد.' });
            }
            
            const currentWordResult = await pool.query(`
                SELECT * FROM league_player_words 
                WHERE league_id = $1 AND user_id = $2 AND word_number = $3 AND status = 'in_progress'
            `, [league.id, userId, league.current_word_number]);
            
            if (currentWordResult.rows.length === 0) {
                console.log(`❌ کلمه فعال برای کاربر ${userId} در لیگ ${leagueCode} پیدا نشد.`);
                return socket.emit('league_error', { message: 'کلمه فعال پیدا نشد. لطفا صفحه را رفرش کنید.' });
            }
            
            const currentWord = currentWordResult.rows[0];
            const normalizedLetter = letter.trim().toLowerCase();
            
            if (normalizedLetter.length !== 1 || !/^[\u0600-\u06FF]$/.test(normalizedLetter)) {
                return socket.emit('league_error', { message: 'لطفا فقط یک حرف فارسی وارد کنید.' });
            }
            
            if (currentWord.guessed_letters.includes(normalizedLetter)) {
                return socket.emit('league_error', { message: 'این حرف قبلاً حدس زده شده است.' });
            }

            let isCorrect = false;
            let newRevealed = { ...(currentWord.revealed_letters || {}) };
            let indices = [];
            
            for (let i = 0; i < currentWord.word.length; i++) {
                if (currentWord.word[i] !== ' ' && currentWord.word[i] === normalizedLetter) {
                    indices.push(i);
                }
            }
            
            if (indices.length > 0) {
                isCorrect = true;
                if (!newRevealed[normalizedLetter]) {
                    newRevealed[normalizedLetter] = [];
                }
                newRevealed[normalizedLetter] = [...new Set([...newRevealed[normalizedLetter], ...indices])];
            }

            const newGuessesLeft = currentWord.guesses_left - 1;
            const newCorrectGuesses = currentWord.correct_guesses + (isCorrect ? indices.length : 0);
            const newIncorrectGuesses = currentWord.incorrect_guesses + (isCorrect ? 0 : 1);
            
            let wordStatus = 'in_progress';
            let scoreEarned = 0;
            let timeTaken = 0;
            
            await pool.query(`
                UPDATE league_player_words SET 
                guesses_left = $1, 
                correct_guesses = $2, 
                incorrect_guesses = $3, 
                revealed_letters = $4,
                guessed_letters = array_append(guessed_letters, $5)
                WHERE league_id = $6 AND user_id = $7 AND word_number = $8
            `, [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, normalizedLetter, 
                league.id, userId, league.current_word_number]);

            const wordWithoutSpacesLength = currentWord.word.replace(/\s/g, '').length;
            const revealedCount = Object.values(newRevealed).reduce((acc, arr) => acc + arr.length, 0);  // بهبود محاسبه

            if (revealedCount === wordWithoutSpacesLength) {
                wordStatus = 'completed';
                
                timeTaken = Math.floor((Date.now() - new Date(currentWord.start_time).getTime()) / 1000);
                
                scoreEarned = Math.max(10, Math.floor(
                    1000 - (10 * newIncorrectGuesses) - (timeTaken) + (50 * wordWithoutSpacesLength)
                ));
                
                await pool.query(`
                    UPDATE league_player_words SET 
                    status = $1, end_time = NOW(), time_taken = $2, score_earned = $3
                    WHERE league_id = $4 AND user_id = $5 AND word_number = $6
                `, [wordStatus, timeTaken, scoreEarned, league.id, userId, league.current_word_number]);
                
                await pool.query(`
                    UPDATE league_players SET 
                    score = score + $1, 
                    correct_words = correct_words + 1,
                    total_time = total_time + $2
                    WHERE league_id = $3 AND user_id = $4
                `, [scoreEarned, timeTaken, league.id, userId]);
                
                io.to(leagueCode).emit('league_message', {
                    text: `🎉 ${currentUserName} کلمه "${currentWord.word}" را با موفقیت حدس زد! (+${scoreEarned} امتیاز)`
                });
                
            } else if (newGuessesLeft <= 0) {
                wordStatus = 'failed';
                
                await pool.query(`
                    UPDATE league_player_words SET 
                    status = $1, end_time = NOW()
                    WHERE league_id = $2 AND user_id = $3 AND word_number = $4
                `, [wordStatus, league.id, userId, league.current_word_number]);
                
                io.to(leagueCode).emit('league_message', {
                    text: `❌ ${currentUserName} نتوانست کلمه "${currentWord.word}" را حدس بزند.`
                });
            }

            await emitLeagueState(leagueCode);

            if (wordStatus === 'completed' || wordStatus === 'failed') {
                const remainingPlayersResult = await pool.query(`
                    SELECT COUNT(*) FROM league_player_words
                    WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'
                `, [league.id, league.current_word_number]);
                
                const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);
                
                if (remainingPlayers === 0) {
                    const nextWordNumber = league.current_word_number + 1;
                    
                    if (nextWordNumber <= league.total_words) {
                        setTimeout(() => {
                            startLeagueWord(leagueCode, nextWordNumber);
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            endLeague(leagueCode);
                        }, 5000);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ خطای حدس زدن در لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پردازش حدس.' });
        }
    });

    // --- (۹) دریافت وضعیت لیگ ---
    socket.on('get_league_status', async ({ leagueCode }) => {
        await emitLeagueState(leagueCode);
    });

    // --- (۱۰) دریافت جدول رتبه‌بندی ---
    socket.on('get_leaderboard', async () => {
        await emitLeaderboard();
    });

    // --- (۱۱) قطع اتصال ---
    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id} (${currentUserName || 'ناشناس'})`);
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور در پورت ${PORT} اجرا شد.`);
    });
});
