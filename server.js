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

        // جداول لیگ (بدون تغییر)
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
async function emitGameState(gameCode) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        const game = result.rows[0];

        if (game) {
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }

            // --- تغییر برای Requirement 2: ارسال موقعیت فاصله‌ها ---
            const spaceIndices = [];
            if (game.word) {
                for (let i = 0; i < game.word.length; i++) {
                    if (game.word[i] === ' ') {
                        spaceIndices.push(i);
                    }
                }
            }
            // --------------------------------------------------------

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
                guesser: guesser,
                spaceIndices: spaceIndices, // جدید
                // کلمه اصلی فقط برای بازی‌های تمام شده یا لغو شده ارسال می‌شود.
                word: (game.status === 'finished' || game.status === 'cancelled') ? game.word : null
            };
            
            // وضعیت کامل بازی را فقط به اتاق بازی ارسال کنید
            io.to(gameCode).emit('game_update', gameState);
            console.log(`📡 وضعیت جدید بازی ${gameCode} ارسال شد. وضعیت: ${game.status}`);
        } else {
            io.to(gameCode).emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
        }
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت بازی ${gameCode}:`, error);
    }
}

async function updateScoreAndEmitLeaderboard(userId, points) {
    // اطمینان از اینکه فقط در صورتی که userId وجود داشته باشد، عملیات انجام شود
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

        // دریافت کلمه فعلی
        let currentWord = null;
        let currentCategory = null;
        
        if (league.status === 'in_progress') {
            const currentWordResult = await pool.query(`
                SELECT word, category FROM league_words 
                WHERE league_id = $1 AND word_number = $2
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
            currentWord: currentWord,
            currentCategory: currentCategory,
            playerCount: players.length
        };

        // ارسال به تمام بازیکنان لیگ
        io.to(leagueCode).emit('leagueStatus', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد. بازیکنان: ${players.length}`);

    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
    }
}

async function startLeague(leagueCode) {
    try {
        // به‌روزرسانی وضعیت لیگ
        await pool.query(
            'UPDATE leagues SET status = $1, start_time = NOW() WHERE code = $2',
            ['starting', leagueCode]
        );

        // دریافت اطلاعات لیگ
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
                max_guesses: Math.ceil(word.length * 1.5),
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

        // ارسال وضعیت شروع
        await emitLeagueState(leagueCode);

        // شروع اولین کلمه پس از تأخیر
        setTimeout(async () => {
            await pool.query(
                'UPDATE leagues SET status = $1 WHERE code = $2',
                ['in_progress', leagueCode]
            );

            // ارسال وضعیت جدید
            await emitLeagueState(leagueCode);
            // اطلاع‌رسانی شروع لیگ
            io.to(leagueCode).emit('leagueStarted', { code: leagueCode, status: 'in_progress', currentWordNumber: 1, totalWords: 10 });
            console.log(`🎮 لیگ ${leagueCode} شروع شد.`);
        }, 3000);
        
    } catch (error) {
        console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
    }
}

async function startLeagueWord(leagueCode, wordNumber) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        // به‌روزرسانی وضعیت کلمه قبلی
        if (wordNumber > 1) {
            await pool.query(`
                UPDATE league_words SET status = 'completed'
                WHERE league_id = $1 AND word_number = $2
            `, [league.id, wordNumber - 1]);
        }

        // به‌روزرسانی وضعیت کلمه جدید
        await pool.query(`
            UPDATE league_words SET status = 'active'
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        // به‌روزرسانی شماره کلمه فعلی در لیگ
        await pool.query(`
            UPDATE leagues SET current_word_number = $1
            WHERE code = $2
        `, [wordNumber, leagueCode]);

        // ایجاد رکوردهای جدید برای بازیکنان
        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);
        
        const currentWordResult = await pool.query(`
            SELECT word, category, max_guesses FROM league_words
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        const { word, category, max_guesses } = currentWordResult.rows[0];

        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words (league_id, user_id, word_number, word, category, guesses_left, max_guesses, start_time)
                VALUES ($1, $2, $3, $4, $5, $6, $6, NOW())
            `, [league.id, player.user_id, wordNumber, word, category, max_guesses]);
        }

        // ارسال وضعیت جدید لیگ
        await emitLeagueState(leagueCode);
        io.to(leagueCode).emit('leagueWordStarted', { wordNumber, category, wordLength: word.length });
        console.log(`📝 کلمه ${wordNumber} در لیگ ${leagueCode} شروع شد. کلمه: ${word}`);

    } catch (error) {
        console.error(`❌ خطای شروع کلمه لیگ ${leagueCode}:`, error);
    }
}

async function endLeague(leagueCode) {
    try {
        await pool.query(
            'UPDATE leagues SET status = $1, end_time = NOW() WHERE code = $2',
            ['ended', leagueCode]
        );

        // به‌روزرسانی امتیازات نهایی لیگ به جدول کاربران
        const finalScoresResult = await pool.query(`
            SELECT user_id, score FROM league_players WHERE league_id = (SELECT id FROM leagues WHERE code = $1)
        `, [leagueCode]);

        for (const scoreData of finalScoresResult.rows) {
            await updateScoreAndEmitLeaderboard(scoreData.user_id, scoreData.score);
        }

        io.to(leagueCode).emit('leagueEnded', { code: leagueCode, message: 'لیگ به پایان رسید!' });
        await emitLeagueState(leagueCode);
        console.log(`🏁 لیگ ${leagueCode} به پایان رسید.`);
    } catch (error) {
        console.error(`❌ خطای پایان لیگ ${leagueCode}:`, error);
    }
}

// --- مدیریت اتصال Socket.io ---
io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUserName = null;

    console.log(`➕ کاربر متصل شد: ${socket.id}`);

    // --- (۰) احراز هویت ---
    socket.on('authenticate', async ({ userId }) => {
        try {
            const userResult = await pool.query('SELECT name FROM users WHERE telegram_id = $1', [userId]);
            if (userResult.rows.length > 0) {
                currentUserId = userId;
                currentUserName = userResult.rows[0].name;
                socket.emit('authenticated', { 
                    userId: currentUserId, 
                    name: currentUserName,
                    message: 'احراز هویت موفقیت‌آمیز بود.'
                });
                console.log(`✅ احراز هویت کاربر: ${currentUserId} (${currentUserName})`);

                // پیوستن به اتاق‌های بازی و لیگ فعال در صورت وجود
                await rejoinActiveRooms(currentUserId, socket);
                
                // ارسال جدول رتبه‌بندی
                await emitLeaderboard();

            } else {
                socket.emit('auth_error', { message: 'کاربر در دیتابیس یافت نشد.' });
            }
        } catch (error) {
            console.error('❌ خطای احراز هویت:', error);
            socket.emit('auth_error', { message: 'خطا در احراز هویت.' });
        }
    });

    // --- (۰-ب) پیوستن مجدد به اتاق‌های فعال ---
    async function rejoinActiveRooms(userId, socket) {
        try {
            // بازی‌های فعال
            const gamesResult = await pool.query(
                `SELECT code FROM games WHERE (creator_id = $1 OR guesser_id = $1) AND status = 'in_progress'`,
                [userId]
            );
            gamesResult.rows.forEach(game => {
                socket.join(game.code);
                socket.emit('rejoin_game', { gameCode: game.code });
                console.log(`↩️ کاربر ${userId} به بازی ${game.code} پیوست.`);
            });

            // لیگ‌های فعال
            const leagueResult = await pool.query(`
                SELECT l.code FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('starting', 'in_progress')
            `, [userId]);
            
            leagueResult.rows.forEach(league => {
                socket.join(league.code);
                socket.emit('rejoin_league', { leagueCode: league.code });
                console.log(`↩️ کاربر ${userId} به لیگ ${league.code} پیوست.`);
            });
        } catch (error) {
            console.error('❌ خطای پیوستن مجدد به اتاق‌ها:', error);
        }
    }


    // --- (۱) ساخت بازی ---
    socket.on('create_game', async ({ userId, word, category }) => {
        if (!userId) return socket.emit('create_error', { message: 'لطفاً ابتدا احراز هویت شوید.' });
        if (!word || !category) return socket.emit('create_error', { message: 'کلمه و دسته‌بندی اجباری هستند.' });

        // اعتبارسنجی کلمه و طول حدس‌ها
        const max_guesses = Math.ceil(word.length * 1.5);
        if (max_guesses < 3) return socket.emit('create_error', { message: 'کلمه شما برای یک بازی عادلانه خیلی کوتاه است.' });

        let gameCode;
        let unique = false;
        let attempts = 0;
        
        while (!unique && attempts < 10) {
            gameCode = generateGameCode();
            const check = await pool.query('SELECT code FROM games WHERE code = $1', [gameCode]);
            if (check.rows.length === 0) {
                unique = true;
            }
            attempts++;
        }

        if (!unique) return socket.emit('create_error', { message: 'خطا در تولید کد یکتا برای بازی.' });

        try {
            await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left)
                 VALUES ($1, $2, $3, $4, $5, $5)`,
                [gameCode, userId, word, category, max_guesses]
            );

            socket.join(gameCode);
            socket.emit('game_created', { gameCode });
            console.log(`➕ بازی جدید ایجاد شد: ${gameCode} توسط ${userId}`);
            await emitGameState(gameCode);
            io.emit('waiting_games_update'); // اطلاع‌رسانی به همه برای به‌روزرسانی لیست
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('create_error', { message: 'خطا در ذخیره بازی در دیتابیس.' });
        }
    });

    // --- (۲) پیوستن به بازی ---
    socket.on('join_game', async ({ gameCode, userId }) => {
        if (!userId) {
            return socket.emit('auth_error', { message: 'برای پیوستن به بازی باید احراز هویت شوید.' });
        }
        
        // --- تغییر برای Requirement 1: انتخاب بازی تصادفی در صورت خالی بودن کد ---
        let actualGameCode = gameCode;
        if (!actualGameCode) {
            const waitingGame = await pool.query(`
                SELECT code FROM games 
                WHERE status = 'waiting' AND creator_id != $1 
                ORDER BY RANDOM() 
                LIMIT 1
            `, [userId]);
            
            if (waitingGame.rows.length > 0) {
                actualGameCode = waitingGame.rows[0].code;
                console.log(`💡 کاربر ${userId} به بازی تصادفی ${actualGameCode} پیوست.`);
            } else {
                return socket.emit('join_error', { message: 'بازی در حال انتظار برای پیوستن یافت نشد.' });
            }
        }
        // -----------------------------------------------------------------------

        try {
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [actualGameCode]);
            const game = result.rows[0];

            if (!game) {
                return socket.emit('join_error', { message: 'کد بازی نامعتبر است یا بازی یافت نشد.' });
            }

            if (game.status !== 'waiting') {
                return socket.emit('join_error', { message: `بازی ${actualGameCode} در حال حاضر ${game.status === 'in_progress' ? 'در حال انجام است' : 'به پایان رسیده است'}.` });
            }

            if (game.creator_id === userId) {
                return socket.emit('join_error', { message: 'شما نمی‌توانید به بازی که خودتان ایجاد کرده‌اید، به عنوان حدس‌زننده بپیوندید.' });
            }

            // به‌روزرسانی جدول games
            await pool.query(
                `UPDATE games 
                 SET guesser_id = $1, status = 'in_progress', start_time = NOW()
                 WHERE code = $2`,
                [userId, actualGameCode]
            );

            socket.join(actualGameCode);
            console.log(`🤝 کاربر ${userId} به بازی ${actualGameCode} پیوست.`);
            
            // ارسال پیام به هر دو بازیکن
            const guesserName = currentUserName || 'حدس‌زننده ناشناس';
            io.to(actualGameCode).emit('game_joined', { gameCode: actualGameCode, message: `کاربر ${guesserName} به عنوان حدس‌زننده به بازی پیوست. بازی شروع شد!` });

            // ارسال وضعیت جدید بازی
            await emitGameState(actualGameCode);
            
            // حذف بازی از لیست بازی‌های منتظر برای همه
            io.emit('game_started', { gameCode: actualGameCode });

        } catch (error) {
            console.error(`❌ خطای پیوستن به بازی ${actualGameCode}:`, error);
            socket.emit('join_error', { message: 'خطا در پردازش پیوستن به بازی.' });
        }
    });

    // --- (۳) لیست بازی‌های منتظر ---
    socket.on('get_waiting_games', async () => {
        try {
            const result = await pool.query(`
                SELECT g.code, u.name as creator_name, g.word, g.category, g.max_guesses
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting'
                ORDER BY g.start_time DESC
                LIMIT 10
            `);
            const games = result.rows.map(row => ({
                code: row.code,
                creator: row.creator_name,
                category: row.category,
                wordLength: row.word.length,
                maxGuesses: row.max_guesses
            }));
            socket.emit('waiting_games_list', { games });
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌های منتظر:', error);
        }
    });

    // --- (۴) حدس زدن حرف در بازی تک‌نفره ---
    socket.on('make_guess', async ({ gameCode, userId, guess }) => {
        // ... (منطق make_guess) ...
        if (!userId || !gameCode || !guess || guess.length !== 1) {
            return socket.emit('guess_result', { gameCode, message: 'حدس نامعتبر است.', isCorrect: false });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const gameResult = await client.query('SELECT * FROM games WHERE code = $1 FOR UPDATE', [gameCode]);
            const game = gameResult.rows[0];

            if (!game || game.status !== 'in_progress' || game.guesser_id !== userId) {
                await client.query('ROLLBACK');
                return socket.emit('guess_result', { gameCode, message: 'شما اجازه حدس زدن در این بازی را ندارید یا بازی در حال انجام نیست.', isCorrect: false });
            }

            // بررسی حدس تکراری
            if (game.guessed_letters.includes(guess)) {
                await client.query('ROLLBACK');
                return socket.emit('guess_result', { gameCode, message: `حرف "${guess}" قبلاً حدس زده شده است.`, isCorrect: false });
            }

            const word = game.word;
            let isCorrect = false;
            let correctCount = 0;
            const newRevealedLetters = { ...game.revealed_letters };

            // بررسی حدس
            for (let i = 0; i < word.length; i++) {
                if (word[i] === guess) {
                    newRevealedLetters[i] = guess;
                    isCorrect = true;
                    correctCount++;
                }
            }

            // به‌روزرسانی دیتابیس
            let newGuessesLeft = game.guesses_left;
            let newCorrectGuesses = game.correct_guesses;
            let newIncorrectGuesses = game.incorrect_guesses;
            let newStatus = game.status;
            let winnerId = null;
            let scoreChange = 0;
            let message = '';

            if (isCorrect) {
                newCorrectGuesses += correctCount;
                message = `✅ حرف "${guess}" درست است!`;
            } else {
                newGuessesLeft -= 1;
                newIncorrectGuesses += 1;
                message = `❌ حرف "${guess}" در کلمه وجود ندارد.`;
            }

            // به‌روزرسانی لیست حروف حدس زده شده
            const updatedGuessedLetters = [...game.guessed_letters, guess];

            // بررسی اتمام بازی (پیروزی)
            const allLettersRevealed = Object.keys(newRevealedLetters).length === word.replace(/\s/g, '').length;
            if (allLettersRevealed) {
                newStatus = 'finished';
                winnerId = userId;
                // محاسبه امتیاز: 10 امتیاز پایه + (حدس‌های باقی مانده * 2)
                scoreChange = 10 + (newGuessesLeft * 2); 
                message = `🎉 تبریک! کلمه را حدس زدید: "${word}"`;
                // امتیاز به حدس‌زننده
                await updateScoreAndEmitLeaderboard(userId, scoreChange);
            } 
            // بررسی اتمام بازی (شکست)
            else if (newGuessesLeft <= 0) {
                newStatus = 'finished';
                winnerId = game.creator_id; // سازنده برنده می‌شود
                // امتیاز به سازنده
                scoreChange = 5; // امتیاز پایه برای شکست حدس‌زننده
                message = `💔 متأسفانه حدس‌های شما تمام شد. کلمه عبارت بود از: "${word}"`;
                await updateScoreAndEmitLeaderboard(game.creator_id, scoreChange);
            }

            // ذخیره تغییرات
            await client.query(
                `UPDATE games 
                 SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3, 
                     revealed_letters = $4, guessed_letters = $5, status = $6, winner_id = $7,
                     end_time = CASE WHEN $6 = 'finished' THEN NOW() ELSE NULL END
                 WHERE code = $8`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealedLetters, updatedGuessedLetters, newStatus, winnerId, gameCode]
            );

            await client.query('COMMIT');

            // ارسال نتیجه به حدس‌زننده
            socket.emit('guess_result', { gameCode, message, isCorrect, final: newStatus === 'finished', scoreChange });
            // ارسال وضعیت جدید به همه در اتاق بازی
            await emitGameState(gameCode);

            // اگر بازی تمام شد، لیست بازی‌های منتظر را به‌روز کن (اگر قبلاً در آن لیست بوده)
            if (newStatus === 'finished') {
                io.emit('waiting_games_update');
            }

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ خطای حدس زدن:', error);
            socket.emit('guess_result', { gameCode, message: 'خطا در پردازش حدس.', isCorrect: false });
        } finally {
            client.release();
        }
    });

    // --- (۴-ب) درخواست راهنمایی ---
    socket.on('request_hint', async ({ gameCode, userId, position }) => {
        // ... (منطق request_hint) ...
        if (!userId || !gameCode || !position || position < 1) {
            return socket.emit('hint_result', { gameCode, message: 'درخواست راهنمایی نامعتبر است.', success: false });
        }
    
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
    
            const gameResult = await client.query('SELECT * FROM games WHERE code = $1 FOR UPDATE', [gameCode]);
            const game = gameResult.rows[0];
            const positionIndex = position - 1;
    
            if (!game || game.status !== 'in_progress' || game.guesser_id !== userId) {
                await client.query('ROLLBACK');
                return socket.emit('hint_result', { gameCode, message: 'شما اجازه درخواست راهنمایی ندارید یا بازی در حال انجام نیست.', success: false });
            }
            
            // بررسی امتیاز کاربر
            const userScoreResult = await client.query('SELECT score FROM users WHERE telegram_id = $1', [userId]);
            const userScore = userScoreResult.rows[0].score;
            const hintCost = 2; // هزینه راهنمایی
    
            if (userScore < hintCost) {
                await client.query('ROLLBACK');
                return socket.emit('hint_result', { gameCode, message: `امتیاز شما (${userScore}) برای درخواست راهنمایی کافی نیست (هزینه: ${hintCost}).`, success: false });
            }
    
            // بررسی موقعیت و عدم تکرار
            if (positionIndex < 0 || positionIndex >= game.word.length) {
                await client.query('ROLLBACK');
                return socket.emit('hint_result', { gameCode, message: 'موقعیت راهنمایی نامعتبر است.', success: false });
            }
    
            const letter = game.word[positionIndex];
            const newRevealedLetters = { ...game.revealed_letters };
    
            if (letter === ' ') {
                await client.query('ROLLBACK');
                return socket.emit('hint_result', { gameCode, message: 'این موقعیت یک فاصله است! موقعیت دیگری را انتخاب کنید.', success: false });
            }
            
            if (newRevealedLetters[positionIndex.toString()]) {
                await client.query('ROLLBACK');
                return socket.emit('hint_result', { gameCode, message: `حرف موقعیت ${position} قبلاً کشف شده است: "${letter}"`, success: false });
            }
    
            // اعمال راهنمایی
            newRevealedLetters[positionIndex.toString()] = letter;
    
            // کسر امتیاز
            await client.query('UPDATE users SET score = score - $1 WHERE telegram_id = $2', [hintCost, userId]);
            await emitLeaderboard(); // به‌روزرسانی رتبه‌بندی
    
            // به‌روزرسانی correct_guesses (اگر این حرف قبلاً از طریق حدس حرف کشف نشده باشد)
            let correctCountIncrease = 1;
            
            // بررسی اتمام بازی (پیروزی به دلیل راهنمایی آخر)
            let newStatus = game.status;
            let winnerId = null;
            let message = `💡 راهنمایی: حرف موقعیت ${position} عبارت است از "${letter}". (-${hintCost} امتیاز)`;

            const allLettersRevealed = Object.keys(newRevealedLetters).length === game.word.replace(/\s/g, '').length;
            if (allLettersRevealed) {
                newStatus = 'finished';
                winnerId = userId;
                // امتیازدهی فقط بابت راهنمایی، چون از حدس به پایان نرسیده است
                message = `🎉 کلمه با کمک راهنمایی کامل شد: "${game.word}". (-${hintCost} امتیاز)`;
            }
            
            // به‌روزرسانی دیتابیس بازی
            await client.query(
                `UPDATE games 
                 SET revealed_letters = $1, correct_guesses = correct_guesses + $2, 
                     status = $3, winner_id = $4,
                     end_time = CASE WHEN $3 = 'finished' THEN NOW() ELSE NULL END
                 WHERE code = $5`,
                [newRevealedLetters, correctCountIncrease, newStatus, winnerId, gameCode]
            );
    
            await client.query('COMMIT');
    
            // ارسال نتیجه
            socket.emit('hint_result', { 
                gameCode, 
                message, 
                success: true, 
                letter: letter, 
                position: position, 
                final: newStatus === 'finished' 
            });
            // ارسال وضعیت جدید به همه در اتاق بازی
            await emitGameState(gameCode);
            
            if (newStatus === 'finished') {
                io.emit('waiting_games_update');
            }

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('hint_result', { gameCode, message: 'خطا در پردازش درخواست راهنمایی.', success: false });
        } finally {
            client.release();
        }
    });

    // --- (۵) مدیریت وضعیت بازی ---
    socket.on('get_game_status', async ({ gameCode }) => {
        if (gameCode) {
            await emitGameState(gameCode);
        }
    });

    // --- (۶) ایجاد لیگ ---
    socket.on('create_league', async ({ userId }) => {
        // ... (منطق create_league) ...
        if (!userId) return socket.emit('league_error', { message: 'لطفاً ابتدا احراز هویت شوید.' });
        
        // اطمینان از اینکه کاربر در لیگ فعال دیگری نیست
        const activeLeagueCheck = await pool.query(`
            SELECT l.code FROM leagues l
            JOIN league_players lp ON l.id = lp.league_id
            WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
        `, [userId]);

        if (activeLeagueCheck.rows.length > 0) {
            return socket.emit('league_error', { message: `شما قبلاً در لیگ ${activeLeagueCheck.rows[0].code} عضو شده‌اید.` });
        }
        
        let leagueCode;
        let unique = false;
        let attempts = 0;
        
        while (!unique && attempts < 10) {
            leagueCode = generateGameCode();
            const check = await pool.query('SELECT code FROM leagues WHERE code = $1', [leagueCode]);
            if (check.rows.length === 0) {
                unique = true;
            }
            attempts++;
        }

        if (!unique) return socket.emit('league_error', { message: 'خطا در تولید کد یکتا برای لیگ.' });

        try {
            const result = await pool.query(
                `INSERT INTO leagues (code, status) VALUES ($1, 'waiting') RETURNING id`,
                [leagueCode]
            );
            const leagueId = result.rows[0].id;
            
            // اضافه کردن سازنده به عنوان بازیکن
            await pool.query(
                `INSERT INTO league_players (league_id, user_id) VALUES ($1, $2)`,
                [leagueId, userId]
            );

            socket.join(leagueCode);
            socket.emit('leagueCreated', { leagueCode, message: 'لیگ با موفقیت ایجاد شد.' });
            console.log(`➕ لیگ جدید ایجاد شد: ${leagueCode} توسط ${userId}`);
            await emitLeagueState(leagueCode);
            
        } catch (error) {
            console.error('❌ خطای ایجاد لیگ:', error);
            socket.emit('league_error', { message: 'خطا در ذخیره لیگ در دیتابیس.' });
        }
    });

    // --- (۷) پیوستن به لیگ ---
    socket.on('join_league', async ({ leagueCode, userId }) => {
        // ... (منطق join_league) ...
        if (!userId) return socket.emit('league_error', { message: 'لطفاً ابتدا احراز هویت شوید.' });

        try {
            const leagueResult = await pool.query('SELECT id, status FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league) {
                return socket.emit('league_error', { message: 'کد لیگ نامعتبر است یا لیگ یافت نشد.' });
            }

            if (league.status !== 'waiting') {
                return socket.emit('league_error', { message: 'این لیگ در حال حاضر شروع شده یا به پایان رسیده است.' });
            }
            
            // بررسی عضویت تکراری
            const playerCheck = await pool.query(
                `SELECT * FROM league_players WHERE league_id = $1 AND user_id = $2`,
                [league.id, userId]
            );
            
            if (playerCheck.rows.length > 0) {
                 socket.join(leagueCode); // اگر قبلا عضو بوده، فقط به اتاق بپیوندد
                 await emitLeagueState(leagueCode);
                 return socket.emit('leagueJoined', { leagueCode, message: 'شما قبلاً عضو این لیگ هستید.' });
            }

            // اضافه کردن بازیکن به لیگ
            await pool.query(
                `INSERT INTO league_players (league_id, user_id) VALUES ($1, $2)`,
                [league.id, userId]
            );

            socket.join(leagueCode);
            const userName = currentUserName || 'بازیکن جدید';
            io.to(leagueCode).emit('leagueJoined', { leagueCode, message: `بازیکن ${userName} به لیگ پیوست.` });
            console.log(`🤝 کاربر ${userId} به لیگ ${leagueCode} پیوست.`);
            await emitLeagueState(leagueCode);

        } catch (error) {
            console.error(`❌ خطای پیوستن به لیگ ${leagueCode}:`, error);
            socket.emit('league_error', { message: 'خطا در پردازش پیوستن به لیگ.' });
        }
    });

    // --- (۸) شروع لیگ ---
    socket.on('start_league', async ({ leagueCode, userId }) => {
        // ... (منطق start_league) ...
        if (!userId) return; 

        try {
            const leagueResult = await pool.query('SELECT id, status FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league || league.status !== 'waiting') {
                return socket.emit('league_error', { message: 'لیگ نامعتبر است یا در حال انتظار نیست.' });
            }

            // بررسی تعداد بازیکنان
            const playersResult = await pool.query(`
                SELECT count(*) FROM league_players WHERE league_id = $1
            `, [league.id]);

            const playerCount = parseInt(playersResult.rows[0].count);

            if (playerCount < 2) {
                return socket.emit('league_error', { message: 'برای شروع لیگ حداقل ۲ بازیکن لازم است.' });
            }

            await startLeague(leagueCode);

        } catch (error) {
            console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
            socket.emit('league_error', { message: 'خطا در پردازش شروع لیگ.' });
        }
    });

    // --- (۸-ب) حدس زدن در لیگ ---
    socket.on('make_league_guess', async ({ leagueCode, userId, guess }) => {
        // ... (منطق make_league_guess) ...
        if (!userId || !leagueCode || !guess || guess.length !== 1) {
            return socket.emit('league_guess_result', { leagueCode, message: 'حدس نامعتبر است.', isCorrect: false });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // دریافت اطلاعات لیگ و کلمه فعال
            const leagueResult = await client.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];
            
            if (!league || league.status !== 'in_progress') {
                await client.query('ROLLBACK');
                return socket.emit('league_error', { message: 'لیگ در حال انجام نیست.' });
            }

            const wordNumber = league.current_word_number;

            // دریافت وضعیت بازیکن در کلمه فعلی
            const playerWordResult = await client.query(`
                SELECT * FROM league_player_words 
                WHERE league_id = $1 AND user_id = $2 AND word_number = $3 FOR UPDATE
            `, [league.id, userId, wordNumber]);
            
            const playerWord = playerWordResult.rows[0];

            if (!playerWord || playerWord.status !== 'in_progress') {
                await client.query('ROLLBACK');
                return socket.emit('league_error', { message: 'شما این کلمه را قبلاً کامل کرده‌اید یا مجاز به حدس نیستید.' });
            }

            // بررسی حدس تکراری
            if (playerWord.guessed_letters.includes(guess)) {
                await client.query('ROLLBACK');
                return socket.emit('league_guess_result', { leagueCode, message: `حرف "${guess}" قبلاً حدس زده شده است.`, isCorrect: false });
            }

            const word = playerWord.word;
            let isCorrect = false;
            let correctCount = 0;
            const newRevealedLetters = { ...playerWord.revealed_letters };

            // بررسی حدس
            for (let i = 0; i < word.length; i++) {
                if (word[i] === guess) {
                    newRevealedLetters[i] = guess;
                    isCorrect = true;
                    correctCount++;
                }
            }

            // به‌روزرسانی دیتابیس
            let newGuessesLeft = playerWord.guesses_left;
            let newCorrectGuesses = playerWord.correct_guesses;
            let newIncorrectGuesses = playerWord.incorrect_guesses;
            let newStatus = playerWord.status;
            let timeTaken = playerWord.time_taken;
            let scoreEarned = playerWord.score_earned;
            let message = '';
            
            const startTime = new Date(playerWord.start_time).getTime();

            if (isCorrect) {
                newCorrectGuesses += correctCount;
                message = `✅ حرف "${guess}" درست است!`;
            } else {
                newGuessesLeft -= 1;
                newIncorrectGuesses += 1;
                message = `❌ حرف "${guess}" در کلمه وجود ندارد.`;
            }

            // به‌روزرسانی لیست حروف حدس زده شده
            const updatedGuessedLetters = [...playerWord.guessed_letters, guess];

            // بررسی اتمام کلمه (پیروزی یا شکست)
            const allLettersRevealed = Object.keys(newRevealedLetters).length === word.replace(/\s/g, '').length;
            if (allLettersRevealed) {
                newStatus = 'completed';
                timeTaken = Math.floor((Date.now() - startTime) / 1000); // زمان برحسب ثانیه
                // امتیاز لیگ: 10 امتیاز پایه + (حدس‌های باقی مانده * 1) + (امتیاز زمان: 300 - زمان سپری شده) (حداقل 0)
                const timeScore = Math.max(0, 300 - timeTaken);
                scoreEarned = 10 + (newGuessesLeft * 1) + Math.floor(timeScore / 10);
                message = `🎉 کلمه ${wordNumber} لیگ را حدس زدید: "${word}". (+${scoreEarned} امتیاز)`;
            } else if (newGuessesLeft <= 0) {
                newStatus = 'failed';
                message = `💔 حدس‌های شما برای کلمه ${wordNumber} تمام شد. کلمه عبارت بود از: "${word}"`;
                scoreEarned = 0;
            }

            // ذخیره تغییرات
            await client.query(
                `UPDATE league_player_words 
                 SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3, 
                     revealed_letters = $4, guessed_letters = $5, status = $6,
                     end_time = CASE WHEN $6 != 'in_progress' THEN NOW() ELSE NULL END,
                     time_taken = $7, score_earned = $8
                 WHERE league_id = $9 AND user_id = $10 AND word_number = $11`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealedLetters, updatedGuessedLetters, newStatus, timeTaken, scoreEarned, league.id, userId, wordNumber]
            );

            // به‌روزرسانی امتیاز کلی بازیکن در لیگ
            if (newStatus !== 'in_progress') {
                await client.query(`
                    UPDATE league_players 
                    SET score = score + $1, 
                        correct_words = correct_words + CASE WHEN $2 = 'completed' THEN 1 ELSE 0 END,
                        total_time = total_time + $3
                    WHERE league_id = $4 AND user_id = $5
                `, [scoreEarned, newStatus, timeTaken, league.id, userId]);
            }

            await client.query('COMMIT');

            // ارسال نتیجه به حدس‌زننده
            socket.emit('league_guess_result', { leagueCode, message, isCorrect, final: newStatus !== 'in_progress', word: newStatus !== 'in_progress' ? word : null, scoreEarned });
            // ارسال وضعیت جدید لیگ به همه در اتاق
            await emitLeagueState(leagueCode);

            // بررسی اتمام کلمه برای همه بازیکنان در لیگ
            if (newStatus !== 'in_progress') {
                const remainingPlayersResult = await pool.query(`
                    SELECT count(*) FROM league_player_words 
                    WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'
                `, [league.id, wordNumber]);

                const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);
                
                if (remainingPlayers === 0) {
                    // حرکت به کلمه بعدی
                    const nextWordNumber = league.current_word_number + 1;
                    
                    if (nextWordNumber <= league.total_words) {
                        // صبر برای شروع کلمه بعدی
                        io.to(leagueCode).emit('leagueNextWordStarting', { nextWordNumber });
                        setTimeout(() => {
                            startLeagueWord(leagueCode, nextWordNumber);
                        }, 5000);
                    } else {
                        // پایان لیگ
                        io.to(leagueCode).emit('leagueEnding', {});
                        setTimeout(() => {
                            endLeague(leagueCode);
                        }, 5000);
                    }
                }
            }
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ خطای حدس زدن در لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پردازش حدس.' });
        } finally {
            client.release();
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

    // --- (۱۱) مدیریت تاریخچه بازی‌ها (جدید برای Requirement 3) ---
    socket.on('get_my_games', async ({ userId }) => {
        if (!userId) return socket.emit('my_games_history', { games: [], error: 'احراز هویت لازم است.' });
        try {
            const result = await pool.query(`
                SELECT 
                    g.code, 
                    g.status, 
                    g.start_time,
                    g.end_time,
                    g.creator_id,
                    g.guesser_id,
                    u_creator.name AS creator_name,
                    u_guesser.name AS guesser_name
                FROM games g
                LEFT JOIN users u_creator ON g.creator_id = u_creator.telegram_id
                LEFT JOIN users u_guesser ON g.guesser_id = u_guesser.telegram_id
                WHERE g.creator_id = $1 OR g.guesser_id = $1
                ORDER BY g.start_time DESC
            `, [userId]);

            const games = result.rows.map(game => {
                let opponentName;
                let role;
                
                if (game.creator_id === userId) {
                    // کاربر سازنده است. حریف guesser است.
                    opponentName = game.guesser_id ? game.guesser_name : 'در انتظار حریف';
                    role = 'سازنده';
                } else if (game.guesser_id === userId) {
                    // کاربر حدس‌زننده است. حریف creator است.
                    opponentName = game.creator_name; 
                    role = 'حدس‌زننده';
                } else {
                    opponentName = 'خطا';
                    role = 'نامشخص';
                }
                
                return {
                    code: game.code,
                    status: game.status,
                    opponent: opponentName,
                    role: role,
                    startTime: game.start_time,
                    endTime: game.end_time,
                };
            });

            socket.emit('my_games_history', { games });
        } catch (error) {
            console.error('❌ خطای دریافت تاریخچه بازی‌ها:', error);
            socket.emit('my_games_history', { games: [], error: 'خطا در بارگذاری تاریخچه بازی‌ها.' });
        }
    });


    // --- (۱۲) قطع اتصال ---
    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id} (${currentUserName || 'ناشناس'})`);
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور فعال شد در پورت ${PORT}`);
    });
}).catch(err => {
    console.error('❌ خطای راه‌اندازی سرور:', err);
});
