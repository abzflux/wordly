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
async function emitGameState(gameCode) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        const game = result.rows[0];

        if (game) {
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            let winner = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }
            if (game.winner_id) {
                 winner = (await pool.query('SELECT name FROM users WHERE telegram_id = $1', [game.winner_id])).rows[0];
            }

            const gameState = {
                code: game.code,
                status: game.status,
                category: game.category,
                wordLength: game.word.replace(/\s/g, '').length, // طول کلمه بدون احتساب فاصله
                maxGuesses: game.max_guesses,
                guessesLeft: game.guesses_left,
                correctGuesses: game.correct_guesses,
                incorrectGuesses: game.incorrect_guesses,
                revealedLetters: game.revealed_letters,
                guessedLetters: game.guessed_letters,
                startTime: game.start_time,
                creator: creator,
                guesser: guesser,
                word: game.word, // اضافه کردن کلمه اصلی به وضعیت بازی
                winner_id: game.winner_id,
                winnerName: winner ? winner.name : null
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

async function updateScoreAndEmitLeaderboard(userId, points) {
    await pool.query('UPDATE users SET score = score + $1 WHERE telegram_id = $2', [points, userId]);
    await emitLeaderboard();
}

async function emitLeaderboard() {
    try {
        const result = await pool.query('SELECT name, score, telegram_id FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

// --- توابع مدیریت لیگ ---
async function emitLeagueState(leagueCode) {
    try {
        const leagueResult = await pool.query('SELECT id, code, status, current_word_number, total_words FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) return;

        // دریافت بازیکنان لیگ
        const playersResult = await pool.query(`
            SELECT 
                u.telegram_id, 
                u.name, 
                lp.score, 
                lp.correct_words, 
                lp.total_time 
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = $1
            ORDER BY lp.score DESC
        `, [league.id]);
        const players = playersResult.rows;

        // دریافت کلمه فعلی و جزئیات آن
        let currentWord = null;
        let currentCategory = null;
        let currentMaxGuesses = 0;
        
        const currentWordResult = await pool.query(`
            SELECT word, category, max_guesses 
            FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, league.current_word_number]);

        if (currentWordResult.rows.length > 0) {
            currentWord = currentWordResult.rows[0].word;
            currentCategory = currentWordResult.rows[0].category;
            currentMaxGuesses = currentWordResult.rows[0].max_guesses;
        }

        // دریافت وضعیت کلمه برای هر بازیکن
        let playerWordStates = {};
        if (league.status === 'in_progress') {
             const playerWordsResult = await pool.query(`
                SELECT 
                    user_id, 
                    guesses_left, 
                    correct_guesses, 
                    incorrect_guesses, 
                    revealed_letters, 
                    guessed_letters, 
                    status
                FROM league_player_words
                WHERE league_id = $1 AND word_number = $2
             `, [league.id, league.current_word_number]);
            
             playerWordStates = playerWordsResult.rows.reduce((acc, row) => {
                acc[row.user_id] = {
                    guessesLeft: row.guesses_left,
                    correctGuesses: row.correct_guesses,
                    incorrectGuesses: row.incorrect_guesses,
                    revealedLetters: row.revealed_letters,
                    guessedLetters: row.guessed_letters,
                    status: row.status,
                    wordLength: currentWord ? currentWord.length : 0,
                    maxGuesses: currentMaxGuesses
                };
                return acc;
             }, {});
        }


        // ساخت وضعیت لیگ برای ارسال
        const leagueState = {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            players: players,
            currentCategory: currentCategory,
            playerCount: players.length,
            playerWordStates: playerWordStates, // وضعیت کلمه هر بازیکن
            currentWord: currentWord // برای استفاده در آپدیت فرانت (به خصوص برای محاسبه طول کلمه)
        };

        // ارسال به تمام بازیکنان لیگ
        io.to(leagueCode).emit('leagueStatus', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد. بازیکنان: ${players.length}`);
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
    }
}

async function startLeagueWord(leagueCode, wordNumber) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const leagueResult = await client.query('SELECT id, code FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];
        if (!league) {
            await client.query('ROLLBACK');
            return;
        }

        // به‌روزرسانی کلمه فعال در جدول league_words
        await client.query(
            'UPDATE league_words SET status = $1 WHERE league_id = $2 AND word_number = $3', 
            ['active', league.id, wordNumber]
        );
        
        // به‌روزرسانی کلمه فعلی لیگ در جدول leagues
        await client.query(
            'UPDATE leagues SET current_word_number = $1 WHERE id = $2', 
            [wordNumber, league.id]
        );

        // دریافت کلمه و جزئیات
        const wordDataResult = await client.query(
            'SELECT word, category, max_guesses FROM league_words WHERE league_id = $1 AND word_number = $2',
            [league.id, wordNumber]
        );
        const wordData = wordDataResult.rows[0];
        const { word, category, max_guesses } = wordData;
        
        // دریافت تمام بازیکنان لیگ
        const playersResult = await client.query(
            'SELECT user_id FROM league_players WHERE league_id = $1', 
            [league.id]
        );
        const players = playersResult.rows;

        // ایجاد ورودی برای هر بازیکن در جدول league_player_words
        for (const player of players) {
            await client.query(`
                INSERT INTO league_player_words (
                    league_id, user_id, word_number, word, category, guesses_left, start_time, max_guesses
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
                ON CONFLICT (league_id, user_id, word_number) DO NOTHING
            `, [
                league.id, 
                player.user_id, 
                wordNumber, 
                word, 
                category, 
                max_guesses,
                max_guesses
            ]);
        }
        
        await client.query('COMMIT');
        
        // ارسال وضعیت جدید لیگ
        await emitLeagueState(leagueCode);
        io.to(leagueCode).emit('league_message', { message: `کلمه جدید شروع شد: ${category} (کلمه ${wordNumber} از ۱۰). حدس بزنید!`, type: 'system' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ خطای شروع کلمه لیگ ${leagueCode}، کلمه ${wordNumber}:`, error);
    } finally {
        client.release();
    }
}

async function endLeague(leagueCode) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const leagueResult = await client.query('SELECT id FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];
        if (!league) {
             await client.query('ROLLBACK');
             return;
        }

        // به‌روزرسانی وضعیت لیگ
        await client.query(
            'UPDATE leagues SET status = $1, end_time = NOW() WHERE id = $2', 
            ['ended', league.id]
        );
        
        // اعلام پایان لیگ
        await client.query('COMMIT');
        await emitLeagueState(leagueCode);
        io.to(leagueCode).emit('league_message', { message: '🏆 لیگ پایان یافت. برای دیدن نتایج نهایی به جدول رتبه‌بندی سر بزنید.', type: 'system' });

        // به روزرسانی امتیازات کلی کاربران بر اساس امتیازات لیگ
        const finalScores = await pool.query(`
            SELECT lp.user_id, lp.score, u.name FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE league_id = $1 ORDER BY lp.score DESC
        `, [league.id]);
        
        if (finalScores.rows.length > 0) {
            
            // دادن امتیاز جایزه به نفرات برتر
            const pointsMap = { 0: 10, 1: 5, 2: 3 }; // نفر اول: +10، دوم: +5، سوم: +3

            for (let i = 0; i < finalScores.rows.length; i++) {
                const { user_id, score } = finalScores.rows[i];
                let totalPoints = score;
                if (pointsMap[i]) {
                    totalPoints += pointsMap[i];
                }
                
                await updateScoreAndEmitLeaderboard(user_id, totalPoints);
            }
            io.to(leagueCode).emit('league_message', { message: `🎉 ${finalScores.rows[0].name} با ${finalScores.rows[0].score} امتیاز برنده لیگ شد!`, type: 'success' });
        }


    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ خطای پایان لیگ ${leagueCode}:`, error);
    } finally {
        client.release();
    }
}

async function startLeague(leagueCode) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // به‌روزرسانی وضعیت لیگ
        await client.query(
            'UPDATE leagues SET status = $1, start_time = NOW() WHERE code = $2', 
            ['starting', leagueCode]
        );

        // دریافت اطلاعات لیگ
        const leagueResult = await client.query('SELECT id FROM leagues WHERE code = $1', [leagueCode]);
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
                max_guesses: Math.ceil(word.replace(/\s/g, '').length * 1.5), // حدس‌ها بر اساس تعداد حروف بدون فاصله
                status: 'pending'
            });
        }

        // ذخیره کلمات در دیتابیس
        for (const wordData of words) {
            await client.query(`
                INSERT INTO league_words (league_id, word_number, word, category, max_guesses, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [wordData.league_id, wordData.word_number, wordData.word, wordData.category, wordData.max_guesses, wordData.status]);
        }
        
        await client.query('COMMIT');
        
        // ارسال وضعیت شروع
        await emitLeagueState(leagueCode);
        io.to(leagueCode).emit('league_message', { message: '⚙️ لیگ شروع خواهد شد. منتظر بمانید...', type: 'system' });

        // شروع اولین کلمه پس از تأخیر
        setTimeout(async () => {
             // انتقال وضعیت لیگ به in_progress در دیتابیس
            await pool.query(
                'UPDATE leagues SET status = $1 WHERE id = $2',
                ['in_progress', league.id]
            );
            
            await startLeagueWord(leagueCode, 1);
        }, 5000); // 5 ثانیه تأخیر برای شروع کلمه اول

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
        io.to(leagueCode).emit('league_error', { message: 'خطا در شروع لیگ.' });
    } finally {
        client.release();
    }
}


// --- توابع احراز هویت و اتصال مجدد ---
async function findUserGameOrLeague(userId) {
    // بررسی بازی در حال انجام
    const gameResult = await pool.query(
        'SELECT code FROM games WHERE (creator_id = $1 OR guesser_id = $1) AND status = $2',
        [userId, 'in_progress']
    );
    if (gameResult.rows.length > 0) {
        return { rejoinGameCode: gameResult.rows[0].code };
    }
    
    // بررسی لیگ در حال انجام/انتظار
    const leagueResult = await pool.query(
        'SELECT l.code FROM leagues l JOIN league_players lp ON l.id = lp.league_id WHERE lp.user_id = $1 AND l.status IN ($2, $3)',
        [userId, 'waiting', 'in_progress']
    );
    if (leagueResult.rows.length > 0) {
        return { rejoinLeagueCode: leagueResult.rows[0].code };
    }

    return {};
}

// --- هندلر سوکت اصلی ---
io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUserName = null;
    
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    // --- (۱) احراز هویت ---
    socket.on('authenticate', async (data) => {
        const { userId, name } = data;
        
        if (!userId || !name) {
            socket.emit('app_error', { message: 'اطلاعات احراز هویت ناقص است.' });
            socket.disconnect(true);
            return;
        }

        currentUserId = userId;
        currentUserName = name;
        
        try {
             // ثبت یا به‌روزرسانی کاربر
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [userId, name]
            );
            
            // بررسی بازی یا لیگ فعال برای اتصال مجدد
            const rejoinData = await findUserGameOrLeague(userId);

            socket.emit('authenticated', rejoinData);
            
            if (rejoinData.rejoinGameCode) {
                socket.join(rejoinData.rejoinGameCode);
                console.log(`↩️ کاربر ${name} به بازی ${rejoinData.rejoinGameCode} متصل شد.`);
                await emitGameState(rejoinData.rejoinGameCode);
            } else if (rejoinData.rejoinLeagueCode) {
                 socket.join(rejoinData.rejoinLeagueCode);
                 console.log(`↩️ کاربر ${name} به لیگ ${rejoinData.rejoinLeagueCode} متصل شد.`);
                 await emitLeagueState(rejoinData.rejoinLeagueCode);
            }
            
            await emitLeaderboard();

        } catch (error) {
            console.error('❌ خطای احراز هویت:', error);
            socket.emit('app_error', { message: 'خطا در احراز هویت و اتصال به سرور.' });
            socket.disconnect(true);
        }
    });

    // --- (۲) ساخت بازی ---
    socket.on('create_game', async (data) => {
        const { word, category, creatorId } = data;
        const code = generateGameCode();
        const normalizedWord = word.trim().replace(/\s+/g, ' '); // حذف فواصل اضافه
        const maxGuesses = Math.ceil(normalizedWord.replace(/\s/g, '').length * 1.5); // حدس‌ها بر اساس تعداد حروف بدون فاصله

        try {
            await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [code, creatorId, normalizedWord, category, maxGuesses, maxGuesses]
            );

            socket.join(code);
            console.log(`➕ بازی جدید ساخته شد: ${code} توسط ${currentUserName}`);
            
            // اطلاع به همه کاربران که لیست بازی‌های جدید را بگیرند
            io.emit('new_game_created'); 
            
            await emitGameState(code);

        } catch (error) {
            console.error('❌ خطای ساخت بازی:', error);
            socket.emit('app_error', { message: 'خطا در ایجاد بازی.' });
        }
    });

    // --- (۳) پیوستن به بازی ---
    socket.on('join_game', async (data) => {
        const { gameCode, userId } = data;
        
        try {
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'کد بازی نامعتبر است.' });
                return;
            }

            if (game.status !== 'waiting') {
                socket.emit('game_error', { message: 'این بازی قابل پیوستن نیست یا در حال انجام است.' });
                return;
            }
            
            if (game.creator_id === userId) {
                // سازنده دوباره وارد شده
                socket.join(gameCode);
                console.log(`↩️ سازنده ${currentUserName} به بازی ${gameCode} متصل شد.`);
                await emitGameState(gameCode);
                return;
            }

            // پیوستن به عنوان حدس‌زننده
            await pool.query(
                'UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3',
                [userId, 'in_progress', gameCode]
            );

            socket.join(gameCode);
            console.log(`🔗 کاربر ${currentUserName} به بازی ${gameCode} پیوست.`);
            
            // حذف بازی از لیست انتظار برای همه
            io.emit('game_started', { gameCode });

            // ارسال پیام به سازنده و حدس‌زننده
            io.to(gameCode).emit('game_message', { message: `کاربر ${currentUserName} به بازی پیوست. بازی شروع شد!`, type: 'system' });
            
            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    // --- (۴) دریافت بازی‌های منتظر ---
    socket.on('get_waiting_games', async () => {
        try {
            const result = await pool.query(`
                SELECT 
                    g.code, 
                    g.category, 
                    g.word, 
                    u.name AS creatorName 
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = $1 AND g.creator_id <> $2
            `, ['waiting', currentUserId]);

            const waitingGames = result.rows.map(game => ({
                code: game.code,
                category: game.category,
                creatorName: game.creatorname,
                wordLength: game.word.replace(/\s/g, '').length // تعداد حروف بدون احتساب فاصله
            }));

            socket.emit('waiting_games_list', waitingGames);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌ها:', error);
            socket.emit('app_error', { message: 'خطا در دریافت لیست بازی‌های منتظر.' });
        }
    });

    // --- (۵) حدس زدن حرف ---
    socket.on('make_guess', async (data) => {
        const { gameCode, userId, guess } = data;
        
        try {
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];
            
            if (!game || game.status !== 'in_progress' || game.guesser_id !== userId) {
                 socket.emit('game_error', { message: 'اجازه حدس زدن ندارید.' });
                 return;
            }
            
            if (game.guesses_left <= 0) {
                 io.to(gameCode).emit('game_message', { message: `حدس‌های شما تمام شده است!`, type: 'error' });
                 return;
            }
            
            if (game.guessed_letters.includes(guess)) {
                 io.to(gameCode).emit('game_message', { message: `شما قبلاً حرف "${guess}" را حدس زده‌اید.`, type: 'info' });
                 return;
            }
            
            const word = game.word;
            const isCorrect = word.includes(guess);
            let updateQuery, updateParams;
            let messageText = '';
            
            // آماده‌سازی برای به‌روزرسانی حروف کشف شده
            let newRevealedLetters = game.revealed_letters || {};
            let newCorrectCount = game.correct_guesses;
            let isWordGuessed = true;
            let correctPositions = [];
            
            if (isCorrect) {
                 // یافتن تمام موقعیت‌های حرف حدس زده شده
                 for (let i = 0; i < word.length; i++) {
                     if (word[i] === guess) {
                         // اگر قبلاً کشف نشده، آن را اضافه کن
                         if (!newRevealedLetters[i]) {
                             newRevealedLetters[i] = guess;
                             newCorrectCount++;
                             correctPositions.push(i);
                         }
                     }
                 }
                 
                 // بررسی اتمام بازی
                 let totalLetters = 0;
                 for (let i = 0; i < word.length; i++) {
                     if (word[i] !== ' ') {
                         totalLetters++;
                         if (!newRevealedLetters[i]) {
                             isWordGuessed = false;
                         }
                     }
                 }
                 
                 messageText = `حدس درست! حرف "${guess}" در ${correctPositions.length} جایگاه وجود دارد.`;
                 
                 if (isWordGuessed) {
                      // بازی برنده شد
                      const scoreEarned = game.guesses_left * 5 + 10;
                      updateQuery = `
                        UPDATE games SET 
                            correct_guesses = $1, 
                            revealed_letters = $2, 
                            guessed_letters = array_append(guessed_letters, $3),
                            status = $4,
                            end_time = NOW(),
                            winner_id = $5
                        WHERE code = $6
                        RETURNING *
                      `;
                      updateParams = [newCorrectCount, newRevealedLetters, guess, 'finished', userId, gameCode];
                      
                      // به‌روزرسانی امتیاز کاربر و اعلام برنده
                      await updateScoreAndEmitLeaderboard(userId, scoreEarned);
                      io.to(gameCode).emit('game_message', { message: `🎉 تبریک! کلمه "${word}" پیدا شد! شما ${scoreEarned} امتیاز گرفتید.`, type: 'success' });

                 } else {
                     // حدس درست معمولی
                      updateQuery = `
                        UPDATE games SET 
                            correct_guesses = $1, 
                            revealed_letters = $2, 
                            guessed_letters = array_append(guessed_letters, $3)
                        WHERE code = $4
                        RETURNING *
                      `;
                      updateParams = [newCorrectCount, newRevealedLetters, guess, gameCode];
                      io.to(gameCode).emit('game_message', { message: messageText, type: 'success' });
                 }

            } else {
                 // حدس غلط
                 const newGuessesLeft = game.guesses_left - 1;
                 const newIncorrectCount = game.incorrect_guesses + 1;
                 messageText = `حدس غلط. حرف "${guess}" در کلمه وجود ندارد.`;

                 if (newGuessesLeft <= 0) {
                      // بازی باخت
                      updateQuery = `
                        UPDATE games SET 
                            guesses_left = $1,
                            incorrect_guesses = $2,
                            guessed_letters = array_append(guessed_letters, $3),
                            status = $4,
                            end_time = NOW()
                        WHERE code = $5
                        RETURNING *
                      `;
                      updateParams = [newGuessesLeft, newIncorrectCount, guess, 'finished', gameCode];
                       io.to(gameCode).emit('game_message', { message: `🙁 حدس‌های شما تمام شد. کلمه "${word}" بود.`, type: 'error' });

                 } else {
                     // حدس غلط معمولی
                     updateQuery = `
                        UPDATE games SET 
                            guesses_left = $1,
                            incorrect_guesses = $2,
                            guessed_letters = array_append(guessed_letters, $3)
                        WHERE code = $4
                        RETURNING *
                      `;
                      updateParams = [newGuessesLeft, newIncorrectCount, guess, gameCode];
                      io.to(gameCode).emit('game_message', { message: messageText, type: 'error' });
                 }
            }
            
            await pool.query(updateQuery, updateParams);
            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای حدس زدن:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });

    // --- (۶) درخواست راهنمایی ---
    socket.on('request_hint', async (data) => {
        const { gameCode, userId, position } = data; // position 1-indexed
        
        try {
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];
            
            if (!game || game.guesser_id !== userId || game.status !== 'in_progress') {
                 socket.emit('game_error', { message: 'اجازه درخواست راهنمایی ندارید.' });
                 return;
            }
            
            // بررسی امتیاز کاربر برای کسر 2 امتیاز
            const userScoreResult = await pool.query('SELECT score FROM users WHERE telegram_id = $1', [userId]);
            const userScore = userScoreResult.rows[0].score;
            if (userScore < 2) {
                 io.to(gameCode).emit('game_message', { message: `امتیاز شما برای درخواست راهنمایی کافی نیست (نیاز به ۲ امتیاز).`, type: 'error' });
                 return;
            }

            const word = game.word;
            const letterIndex = position - 1;

            // اعتبارسنجی موقعیت
            if (letterIndex < 0 || letterIndex >= word.length || word[letterIndex] === ' ') {
                io.to(gameCode).emit('game_message', { message: `موقعیت ${position} یک حرف معتبر نیست.`, type: 'error' });
                return;
            }
            
            let revealedLetters = game.revealed_letters || {};
            
            if (revealedLetters[letterIndex]) {
                 io.to(gameCode).emit('game_message', { message: `حرف موقعیت ${position} قبلاً کشف شده است.`, type: 'info' });
                 return;
            }
            
            const hintLetter = word[letterIndex];
            let newCorrectCount = game.correct_guesses;
            let isWordGuessed = true;
            
            // کشف حرف در آن موقعیت و تمام موقعیت‌های دیگر
            for (let i = 0; i < word.length; i++) {
                 if (word[i] === hintLetter && !revealedLetters[i]) {
                     revealedLetters[i] = hintLetter;
                     newCorrectCount++;
                 }
                 // فقط برای حروف غیرفاصله چک می‌کنیم که آیا کلمه کامل شده است
                 if (word[i] !== ' ' && !revealedLetters[i]) {
                     isWordGuessed = false;
                 }
            }
            
            // کسر امتیاز
            await updateScoreAndEmitLeaderboard(userId, -2);
            
            let updateQuery, updateParams;
            if (isWordGuessed) {
                // بازی برنده شد
                updateQuery = `
                    UPDATE games SET 
                        correct_guesses = $1, 
                        revealed_letters = $2, 
                        status = $3,
                        end_time = NOW(),
                        winner_id = $4
                    WHERE code = $5
                    RETURNING *
                `;
                updateParams = [newCorrectCount, revealedLetters, 'finished', userId, gameCode];
                io.to(gameCode).emit('game_message', { message: `🎉 راهنمایی فعال شد: حرف "${hintLetter}" در موقعیت ${position}. کلمه کامل شد!`, type: 'success' });
            } else {
                 // راهنمایی معمولی
                 updateQuery = `
                    UPDATE games SET 
                        correct_guesses = $1, 
                        revealed_letters = $2
                    WHERE code = $3
                    RETURNING *
                `;
                updateParams = [newCorrectCount, revealedLetters, gameCode];
                io.to(gameCode).emit('game_message', { message: `💡 راهنمایی فعال شد: حرف "${hintLetter}" در موقعیت ${position} و سایر موقعیت‌ها فاش شد. (-2 امتیاز)`, type: 'info' });
            }
            
            await pool.query(updateQuery, updateParams);
            await emitGameState(gameCode);
            
        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در پردازش درخواست راهنمایی.' });
        }
    });
    
    // --- (۷) مدیریت لیگ‌ها ---
    
    // ساخت لیگ
    socket.on('create_league', async (data) => {
        const { creatorId } = data;
        const code = generateGameCode();
        
        try {
            const leagueResult = await pool.query(
                `INSERT INTO leagues (code, status) VALUES ($1, $2) RETURNING id`,
                [code, 'waiting']
            );
            const leagueId = leagueResult.rows[0].id;
            
            await pool.query(
                `INSERT INTO league_players (league_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [leagueId, creatorId]
            );
            
            socket.join(code);
            console.log(`➕ لیگ جدید ساخته شد: ${code} توسط ${currentUserName}`);
            
            await emitLeagueState(code);
            io.emit('new_league_created'); 
            
        } catch (error) {
            console.error('❌ خطای ساخت لیگ:', error);
            socket.emit('app_error', { message: 'خطا در ایجاد لیگ.' });
        }
    });
    
    // پیوستن به لیگ
    socket.on('join_league', async (data) => {
        const { leagueCode, userId } = data;
        
        try {
            const leagueResult = await pool.query('SELECT id, status, code FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league) {
                socket.emit('league_error', { message: 'کد لیگ نامعتبر است.' });
                return;
            }

            if (league.status !== 'waiting') {
                socket.emit('league_error', { message: 'این لیگ در حال انجام است و نمی‌توانید به آن بپیوندید.' });
                return;
            }
            
            const playerResult = await pool.query('SELECT * FROM league_players WHERE league_id = $1 AND user_id = $2', [league.id, userId]);
            
            if (playerResult.rows.length > 0) {
                 // قبلاً پیوسته است
                 socket.join(leagueCode);
                 console.log(`↩️ کاربر ${currentUserName} به لیگ ${leagueCode} متصل شد.`);
                 await emitLeagueState(leagueCode);
                 return;
            }
            
            // بررسی تعداد بازیکنان
            const countResult = await pool.query('SELECT COUNT(*) FROM league_players WHERE league_id = $1', [league.id]);
            if (parseInt(countResult.rows[0].count) >= 5) {
                 socket.emit('league_error', { message: 'ظرفیت لیگ کامل است.' });
                 return;
            }
            
            // پیوستن
            await pool.query(
                `INSERT INTO league_players (league_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [league.id, userId]
            );

            socket.join(leagueCode);
            console.log(`🔗 کاربر ${currentUserName} به لیگ ${leagueCode} پیوست.`);

            io.to(leagueCode).emit('league_message', { message: `کاربر ${currentUserName} به لیگ پیوست.`, type: 'system' });
            
            await emitLeagueState(leagueCode);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پیوستن به لیگ.' });
        }
    });

    // شروع لیگ
    socket.on('start_league', async (data) => {
        const { leagueCode, userId } = data;
        
        try {
            const leagueResult = await pool.query('SELECT id, status FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league || league.status !== 'waiting') {
                socket.emit('league_error', { message: 'امکان شروع لیگ وجود ندارد (وضعیت نامناسب).' });
                return;
            }
            
            // بررسی اینکه آیا کاربر شروع‌کننده، اولین بازیکن (سازنده) است.
            const firstPlayerResult = await pool.query('SELECT user_id FROM league_players WHERE league_id = $1 ORDER BY joined_at ASC LIMIT 1', [league.id]);
            const isCreator = firstPlayerResult.rows.length > 0 && firstPlayerResult.rows[0].user_id === userId;
            
            if (!isCreator) {
                 socket.emit('league_error', { message: 'فقط سازنده لیگ می‌تواند آن را شروع کند.' });
                 return;
            }
            
            // بررسی حداقل بازیکن
            const playersResult = await pool.query('SELECT user_id FROM league_players WHERE league_id = $1', [league.id]);
            if (playersResult.rows.length < 2) {
                 socket.emit('league_error', { message: 'برای شروع، حداقل ۲ بازیکن لازم است.' });
                 return;
            }
            
            await startLeague(leagueCode);

        } catch (error) {
            console.error('❌ خطای شروع لیگ:', error);
            socket.emit('league_error', { message: 'خطا در شروع لیگ.' });
        }
    });
    
    // حدس زدن در لیگ
    socket.on('league_make_guess', async (data) => {
        const { leagueCode, userId, guess } = data;
        
        try {
            // دریافت اطلاعات لیگ و کلمه فعلی
            const leagueResult = await pool.query('SELECT id, current_word_number, status FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league || league.status !== 'in_progress') {
                 socket.emit('league_error', { message: 'لیگ در حال انجام نیست.' });
                 return;
            }
            
            // دریافت وضعیت کلمه بازیکن
            const playerWordResult = await pool.query(`
                SELECT * FROM league_player_words
                WHERE league_id = $1 AND user_id = $2 AND word_number = $3
            `, [league.id, userId, league.current_word_number]);
            const playerWord = playerWordResult.rows[0];
            
            if (!playerWord) {
                 socket.emit('league_error', { message: 'شما در این کلمه فعال نیستید.' });
                 return;
            }
            
            if (playerWord.status !== 'in_progress') {
                 io.to(leagueCode).emit('league_message', { message: `${currentUserName}: شما این کلمه را قبلاً کامل کرده‌اید یا حدس‌هایتان تمام شده است.`, type: 'info' });
                 return;
            }

            if (playerWord.guesses_left <= 0) {
                 io.to(leagueCode).emit('league_message', { message: `${currentUserName}: حدس‌های شما برای این کلمه تمام شده است!`, type: 'error' });
                 return;
            }
            
            if (playerWord.guessed_letters.includes(guess)) {
                 io.to(leagueCode).emit('league_message', { message: `${currentUserName}: شما قبلاً حرف "${guess}" را حدس زده‌اید.`, type: 'info' });
                 return;
            }
            
            const word = playerWord.word;
            const isCorrect = word.includes(guess);
            let updateQuery, updateParams;
            
            let newRevealedLetters = playerWord.revealed_letters || {};
            let newCorrectCount = playerWord.correct_guesses;
            let isWordGuessed = true;
            let messageType = 'info';
            
            if (isCorrect) {
                 // حدس درست
                 let positionsFound = 0;
                 for (let i = 0; i < word.length; i++) {
                     if (word[i] === guess) {
                         if (!newRevealedLetters[i]) {
                             newRevealedLetters[i] = guess;
                             newCorrectCount++;
                             positionsFound++;
                         }
                     }
                 }
                 
                 // بررسی اتمام کلمه
                 for (let i = 0; i < word.length; i++) {
                     if (word[i] !== ' ' && !newRevealedLetters[i]) {
                         isWordGuessed = false;
                     }
                 }
                 
                 let finalStatus = 'in_progress';
                 let scoreEarned = 0;
                 let messageText = `${currentUserName}: حرف "${guess}" را در ${positionsFound} جایگاه درست حدس زد!`;
                 messageType = 'success';
                 
                 if (isWordGuessed) {
                      finalStatus = 'completed';
                      scoreEarned = playerWord.guesses_left * 5 + 10;
                      messageText = `${currentUserName} 🎉 کلمه را پیدا کرد و ${scoreEarned} امتیاز گرفت!`;
                      messageType = 'success';
                 }
                 
                 updateQuery = `
                    UPDATE league_player_words SET 
                        correct_guesses = $1, 
                        revealed_letters = $2, 
                        guessed_letters = array_append(guessed_letters, $3),
                        status = $4
                    WHERE id = $5
                    RETURNING *
                  `;
                  updateParams = [newCorrectCount, newRevealedLetters, guess, finalStatus, playerWord.id];
                  
                  if (finalStatus === 'completed') {
                      // به‌روزرسانی امتیاز لیگ بازیکن و زمان
                       await pool.query(
                            `UPDATE league_players SET score = score + $1, correct_words = correct_words + 1 WHERE league_id = $2 AND user_id = $3`,
                            [scoreEarned, league.id, userId]
                        );
                        // ذخیره امتیاز کسب شده
                        updateQuery = `
                            UPDATE league_player_words SET 
                                correct_guesses = $1, 
                                revealed_letters = $2, 
                                guessed_letters = array_append(guessed_letters, $3),
                                status = $4,
                                end_time = NOW(),
                                time_taken = EXTRACT(EPOCH FROM (NOW() - start_time)),
                                score_earned = $6
                            WHERE id = $5
                            RETURNING *
                        `;
                         updateParams = [newCorrectCount, newRevealedLetters, guess, finalStatus, playerWord.id, scoreEarned];
                  }

                 io.to(leagueCode).emit('league_message', { message: messageText, type: messageType });

            } else {
                 // حدس غلط
                 const newGuessesLeft = playerWord.guesses_left - 1;
                 const newIncorrectCount = playerWord.incorrect_guesses + 1;
                 let finalStatus = 'in_progress';
                 let messageText = `${currentUserName}: حرف "${guess}" غلط بود. ${newGuessesLeft} حدس باقی ماند.`;
                 messageType = 'error';

                 if (newGuessesLeft <= 0) {
                      // شکست در کلمه
                      finalStatus = 'failed';
                      messageText = `${currentUserName} 🙁 تمام حدس‌های خود را از دست داد. کلمه این بود: "${word}"`;
                      messageType = 'error';
                 }
                 
                 updateQuery = `
                    UPDATE league_player_words SET 
                        guesses_left = $1,
                        incorrect_guesses = $2,
                        guessed_letters = array_append(guessed_letters, $3),
                        status = $4
                    WHERE id = $5
                    RETURNING *
                  `;
                  updateParams = [newGuessesLeft, newIncorrectCount, guess, finalStatus, playerWord.id];
                  
                  if (finalStatus === 'failed') {
                      // به‌روزرسانی زمان اتمام
                      updateQuery = `
                        UPDATE league_player_words SET 
                            guesses_left = $1,
                            incorrect_guesses = $2,
                            guessed_letters = array_append(guessed_letters, $3),
                            status = $4,
                            end_time = NOW(),
                            time_taken = EXTRACT(EPOCH FROM (NOW() - start_time))
                        WHERE id = $5
                        RETURNING *
                      `;
                      updateParams = [newGuessesLeft, newIncorrectCount, guess, finalStatus, playerWord.id];
                  }
                  
                 io.to(leagueCode).emit('league_message', { message: messageText, type: messageType });
            }
            
            await pool.query(updateQuery, updateParams);
            await emitLeagueState(leagueCode);
            
            
            // بررسی اتمام کلمه لیگ برای همه بازیکنانی که در آن کلمه فعال هستند
            const remainingPlayersResult = await pool.query(`
                SELECT COUNT(*) FROM league_player_words
                WHERE league_id = $1 AND word_number = $2 AND status = $3
            `, [league.id, league.current_word_number, 'in_progress']);
            
            const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);
            
            if (remainingPlayers === 0) {
                // تمام بازیکنان این کلمه را تمام کرده‌اند
                io.to(leagueCode).emit('league_message', { message: '⏳ منتظر اتمام کلمه فعلی برای همه بازیکنان...', type: 'system' });
                
                // حرکت به کلمه بعدی
                const nextWordNumber = league.current_word_number + 1;
                
                if (nextWordNumber <= league.total_words) {
                    setTimeout(() => {
                        startLeagueWord(leagueCode, nextWordNumber);
                    }, 3000); // 3 ثانیه مکث بین کلمات
                } else {
                    // پایان لیگ
                    setTimeout(() => {
                        endLeague(leagueCode);
                    }, 5000); // 5 ثانیه مکث برای اعلام نتایج نهایی
                }
            }
            
        } catch (error) {
            console.error('❌ خطای حدس زدن در لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پردازش حدس.' });
        }
    });

    // --- (۸) دریافت وضعیت لیگ ---
    socket.on('get_league_status', async ({ leagueCode }) => {
        await emitLeagueState(leagueCode);
    });

    // --- (۹) دریافت جدول رتبه‌بندی ---
    socket.on('get_leaderboard', async () => {
        await emitLeaderboard();
    });

    // --- (۱۰) قطع اتصال ---
    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id} (${currentUserName || 'ناشناس'})`);
    });
});

// --- راه‌اندازی سرور ---\
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور روی پورت ${PORT} در حال اجرا است.`);
    });
});
