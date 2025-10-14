const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- Telegram Bot Library ---
const TelegramBot = require('node-telegram-bot-api');
// ---------------------------------

// --- تنظیمات و متغیرهای محیطی ---
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ'; // توکن ربات تلگرام
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws'; // آدرس فرانت اند
const PORT = process.env.PORT || 3000;

// --- تنظیمات لیگ ---
const LEAGUE_SIZE = 5; // تعداد بازیکنان برای شروع یک لیگ
const LEAGUE_WORD_COUNT = 10; // تعداد کلمات در هر لیگ
const LEAGUE_DURATION_SECONDS = 300; // 5 دقیقه برای کل لیگ

// --- فرهنگ لغت فارسی (به منظور پیاده‌سازی لیگ) ---
// کلمات باید با حروف فارسی و حداقل ۳ حرف باشند
const DICTIONARY = {
    'حیوانات': ['شیر', 'ببر', 'پلنگ', 'گربه', 'سگ', 'فیل', 'زرافه', 'گوزن', 'مار', 'خرگوش', 'میمون', 'دلفین', 'پنگوئن', 'آفتابپرست', 'قناری'],
    'میوه‌ها': ['سیب', 'موز', 'پرتقال', 'انگور', 'کیوی', 'نارنگی', 'توتفرنگی', 'انار', 'خرمالو', 'هندوانه', 'طالبی', 'گیلاس', 'آلبالو', 'انبه'],
    'اشیاء': ['کتاب', 'مداد', 'خودکار', 'میز', 'صندلی', 'تلفن', 'لپتاپ', 'کلید', 'پنجره', 'ساعت', 'آینه', 'قاشق', 'بشقاب', 'فرش', 'لامپ'],
    'کشورها': ['ایران', 'آلمان', 'فرانسه', 'چین', 'ژاپن', 'ترکیه', 'ایتالیا', 'برزیل', 'کانادا', 'هند', 'مصر', 'روسیه', 'عراق', 'افغانستان'],
    'عمومی': ['آزادی', 'عدالت', 'مهربانی', 'شجاعت', 'امید', 'تلاش', 'برنامه', 'موفقیت', 'دانش', 'آینده', 'گذشته', 'روشن', 'تاریک', 'دریچه', 'سردخانه']
};
const ALL_WORDS = Object.values(DICTIONARY).flat();

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

// --- منطق ربات تلگرام (پاسخ به /start) ---
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
            
            شما اکنون ثبت‌نام شده‌اید. 
            برای شروع بازی و رقابت با دیگران، لطفاً روی دکمه یا لینک زیر کلیک کنید:
        `;

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

        bot.sendMessage(chatId, `کد کاربری (Telegram ID) شما: \`${userId}\``, { parse_mode: 'Markdown' });

        console.log(`🤖 ربات به کاربر ${userId} پاسخ /start داد.`);
        
    } catch (error) {
        console.error('❌ خطای پردازش فرمان /start:', error);
        bot.sendMessage(chatId, 'خطایی در ثبت‌نام شما در دیتابیس رخ داد. لطفا دوباره تلاش کنید.');
    }
});
// ------------------------------------------

// --- مدیریت لیگ‌ها (فضای نگهداری موقت) ---
// برای سادگی، لیگ‌های فعال را در حافظه سرور نگه می‌داریم. در یک محیط Production واقعی، این باید در دیتابیس یا یک سرویس Redis ذخیره شود.
let waitingLeague = {
    id: generateGameCode(), // یک ID موقت برای اتاق انتظار
    players: [], // { userId: BIGINT, name: STRING }
    status: 'waiting'
};
let activeLeagues = {}; // { leagueId: { players: [...], words: [...], startTime: TIMESTAMP, state: { userId: { wordIndex: 0, guesses: 0, correct: 0, incorrect: 0, time: 0, revealed: {} } } } }

// --- تابع انتخاب تصادفی کلمات ---
function getRandomWords(count) {
    const shuffled = ALL_WORDS.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// اتصال و اطمینان از وجود جداول
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // جدول کاربران (بدون تغییر)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                score INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول بازی‌ها (بدون تغییر)
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
        
        // --- جدول نتایج لیگ (جدید) ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_results (
                id SERIAL PRIMARY KEY,
                league_id VARCHAR(100) NOT NULL, -- شناسایی لیگ
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                total_score INT DEFAULT 0,
                correct_words INT DEFAULT 0,
                total_guesses INT DEFAULT 0,
                time_taken_seconds INT DEFAULT 0,
                completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (league_id, user_id)
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

/**
 * وضعیت بازی انفرادی را به کلاینت‌ها ارسال می‌کند
 * @param {string} gameCode کد بازی
 */
async function emitGameState(gameCode) {
    // ... (منطق emitGameState قبلی)
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
    // ...
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
 * جدول رتبه‌بندی کلی را به تمامی کلاینت‌ها ارسال می‌کند
 */
async function emitLeaderboard() {
    try {
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

/**
 * جدول رتبه‌بندی لیگ را به تمامی کلاینت‌ها ارسال می‌کند
 */
async function emitLeagueLeaderboard() {
    try {
        const result = await pool.query(`
            SELECT u.name, SUM(lr.total_score) as total_league_score, COUNT(lr.league_id) as total_leagues_played
            FROM league_results lr
            JOIN users u ON lr.user_id = u.telegram_id
            GROUP BY u.name
            ORDER BY total_league_score DESC 
            LIMIT 10
        `);
        io.emit('league_leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی لیگ:', error);
    }
}


// --- منطق لیگ (جدید) ---

/**
 * وضعیت فعلی لیگ فعال برای یک کاربر خاص را ارسال می‌کند
 * @param {string} leagueId
 * @param {bigint} userId
 */
function emitLeaguePlayerState(leagueId, userId) {
    const league = activeLeagues[leagueId];
    if (!league) return;

    const playerState = league.state[userId];
    const currentWord = league.words[playerState.wordIndex];

    const stateToEmit = {
        leagueId: leagueId,
        status: league.status,
        wordIndex: playerState.wordIndex,
        totalWords: league.words.length,
        currentWordLength: currentWord.word.length,
        guessesLeft: currentWord.maxGuesses - playerState.incorrect,
        correctGuesses: playerState.correct,
        incorrectGuesses: playerState.incorrect,
        revealedLetters: playerState.revealed,
        guessedLetters: playerState.guessedLetters,
        category: currentWord.category,
        players: league.players.map(p => ({
            userId: p.userId,
            name: p.name,
            currentWordIndex: league.state[p.userId].wordIndex,
            isFinished: league.state[p.userId].isFinished || false
        })),
        startTime: league.startTime,
        // نکته: زمان باقیمانده بهتر است در کلاینت محاسبه شود.
    };

    io.to(`user:${userId}`).emit('league_game_update', stateToEmit);
}

/**
 * پردازش یک حدس در حالت لیگ
 * @param {string} leagueId 
 * @param {bigint} userId 
 * @param {string} letter 
 */
async function processLeagueGuess(leagueId, userId, letter) {
    const league = activeLeagues[leagueId];
    if (!league || league.status !== 'in_progress') return;

    const playerState = league.state[userId];
    const currentWordData = league.words[playerState.wordIndex];
    const currentWord = currentWordData.word;
    const maxGuesses = currentWordData.maxGuesses;
    
    if (playerState.isFinished) return; // اگر کاربر قبلاً تمام کرده، ادامه نده

    const normalizedLetter = letter.trim().toLowerCase();
    
    if (playerState.guessedLetters.includes(normalizedLetter)) {
        io.to(`user:${userId}`).emit('message', { 
            type: 'warning', 
            text: `⚠️ حرف "${normalizedLetter}" قبلاً حدس زده شده است.` 
        });
        return;
    }
    
    playerState.guessedLetters.push(normalizedLetter);
    playerState.guesses++;
    
    let isCorrect = false;
    let indices = [];

    for (let i = 0; i < currentWord.length; i++) {
        if (currentWord[i] === normalizedLetter) {
            indices.push(i);
        }
    }

    if (indices.length > 0) {
        isCorrect = true;
        playerState.revealed[normalizedLetter] = indices;
        playerState.correct += indices.length;
    } else {
        playerState.incorrect++;
    }

    const totalRevealed = Object.values(playerState.revealed).flat().length;

    // بررسی پایان کلمه فعلی
    if (totalRevealed === currentWord.length) {
        playerState.correctWords++;

        // رفتن به کلمه بعدی
        playerState.wordIndex++;
        
        // اگر کلمات تمام شد
        if (playerState.wordIndex >= league.words.length) {
            playerState.isFinished = true;
            playerState.time = (Date.now() - league.startTime) / 1000;
            
            await calculateLeagueScoreAndEnd(leagueId, userId);
        } else {
             // بازنشانی وضعیت برای کلمه جدید
            playerState.revealed = {};
            playerState.guessedLetters = [];
            playerState.correct = 0;
            playerState.incorrect = 0;
            playerState.guesses = 0;
        }

        io.to(`user:${userId}`).emit('message', { 
            type: 'success', 
            text: `🎉 کلمه ${playerState.wordIndex} به درستی حدس زده شد!` 
        });
        
    } else if (playerState.incorrect >= maxGuesses) {
        // کلمه باخته شد
        playerState.wordIndex++;
        
        // اگر کلمات تمام شد
        if (playerState.wordIndex >= league.words.length) {
            playerState.isFinished = true;
            playerState.time = (Date.now() - league.startTime) / 1000;
            
            await calculateLeagueScoreAndEnd(leagueId, userId);
        } else {
            // بازنشانی وضعیت برای کلمه جدید
            playerState.revealed = {};
            playerState.guessedLetters = [];
            playerState.correct = 0;
            playerState.incorrect = 0;
            playerState.guesses = 0;
        }

        io.to(`user:${userId}`).emit('message', { 
            type: 'error', 
            text: `😔 کلمه ${playerState.wordIndex} حدس زده نشد. کلمه جدید شروع شد.` 
        });
    } else {
         io.to(`user:${userId}`).emit('message', { 
            type: isCorrect ? 'success' : 'error', 
            text: `حدس: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` 
        });
    }
    
    emitLeaguePlayerState(leagueId, userId); // وضعیت جدید برای کاربر ارسال شود
    io.to(leagueId).emit('league_progress_update', { // وضعیت کلی برای همه ارسال شود
        userId: userId,
        wordIndex: playerState.wordIndex,
        isFinished: playerState.isFinished || false
    });
    
    // بررسی پایان کلی لیگ (اگر همه تمام کردند)
    checkLeagueEnd(leagueId);
}

/**
 * محاسبه امتیاز و ثبت نتیجه لیگ
 * @param {string} leagueId 
 * @param {bigint} userId 
 */
async function calculateLeagueScoreAndEnd(leagueId, userId) {
    const league = activeLeagues[leagueId];
    const playerState = league.state[userId];
    
    // فرمول امتیازدهی لیگ (مثال): 
    // 1000 * (تعداد کلمات صحیح) - (زمان در ثانیه) - (تعداد کل حدس‌های غلط)
    const totalIncorrectGuesses = Object.values(league.state).reduce((sum, state) => sum + state.incorrect, 0);
    
    let totalScore = Math.max(0, Math.floor(
        1000 * playerState.correctWords - playerState.time - totalIncorrectGuesses
    ));
    
    // اگر کاربر در زمان مقرر تمام نکرد، امتیازش صفر است
    if (playerState.time > LEAGUE_DURATION_SECONDS) {
        totalScore = 0;
        playerState.isFinished = true;
    }
    
    playerState.finalScore = totalScore;
    
    io.to(`user:${userId}`).emit('league_game_finished', {
        score: totalScore,
        correctWords: playerState.correctWords,
        time: playerState.time
    });
    
    // ثبت نتیجه در دیتابیس
    await pool.query(
        `INSERT INTO league_results (league_id, user_id, total_score, correct_words, total_guesses, time_taken_seconds)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [leagueId, userId, totalScore, playerState.correctWords, playerState.guesses, playerState.time]
    );
    
    await emitLeagueLeaderboard(); // به‌روزرسانی جدول رتبه‌بندی لیگ
}

/**
 * بررسی اینکه آیا همه بازیکنان لیگ را تمام کرده‌اند
 * @param {string} leagueId 
 */
function checkLeagueEnd(leagueId) {
    const league = activeLeagues[leagueId];
    if (!league || league.status !== 'in_progress') return;

    const allFinished = league.players.every(p => league.state[p.userId].isFinished);
    
    if (allFinished) {
        league.status = 'finished';
        io.to(leagueId).emit('league_finished_global', { 
            message: '🎉 لیگ به پایان رسید. نتایج نهایی را بررسی کنید.' 
        });
        
        // حذف لیگ از حافظه پس از مدتی
        setTimeout(() => {
            io.socketsLeave(leagueId); // خروج همه از اتاق
            delete activeLeagues[leagueId];
            console.log(`🗑️ لیگ ${leagueId} حذف شد.`);
        }, 15000); // ۱۵ ثانیه برای دیدن نتایج
    }
}

/**
 * راه‌اندازی لیگ جدید
 */
function startNewLeague() {
    if (waitingLeague.players.length < LEAGUE_SIZE) return;

    const leagueId = generateGameCode();
    const words = getRandomWords(LEAGUE_WORD_COUNT).map(word => ({
        word: word,
        category: Object.keys(DICTIONARY).find(cat => DICTIONARY[cat].includes(word)), // پیدا کردن دسته
        maxGuesses: Math.ceil(word.length * 1.5)
    }));
    
    const newLeague = {
        id: leagueId,
        players: waitingLeague.players,
        words: words,
        startTime: Date.now(),
        status: 'in_progress',
        state: {} // وضعیت کلمه فعلی هر بازیکن
    };
    
    newLeague.players.forEach(p => {
        // جوین شدن به اتاق جدید لیگ
        const userSocketId = io.sockets.adapter.rooms.get(`user:${p.userId}`)?.values().next().value;
        if (userSocketId) {
            io.sockets.sockets.get(userSocketId)?.join(leagueId);
        } else {
             // اگر سنگی وجود ندارد، بعداً هنگام ورود جوین شود
        }
        
        newLeague.state[p.userId] = {
            wordIndex: 0,
            guesses: 0,
            correct: 0,
            incorrect: 0,
            time: 0,
            revealed: {},
            guessedLetters: [],
            correctWords: 0,
            isFinished: false,
        };
        
        // اطلاع رسانی به کاربر در تلگرام
        bot.sendMessage(p.userId, `🎉 لیگ جدید با کد ${leagueId} شروع شد! به Mini App برگردید و رقابت کنید.`, { 
            reply_markup: {
                inline_keyboard: [[{ text: 'بازگشت به بازی', web_app: { url: FRONTEND_URL } }]]
            }
        });
        
        // ارسال وضعیت اولیه برای شروع بازی
        emitLeaguePlayerState(leagueId, p.userId);
    });

    activeLeagues[leagueId] = newLeague;
    console.log(`🏆 لیگ جدید ${leagueId} با ${newLeague.players.length} بازیکن شروع شد.`);
    
    // تنظیم تایمر برای پایان لیگ
    setTimeout(async () => {
        if (activeLeagues[leagueId] && activeLeagues[leagueId].status === 'in_progress') {
            io.to(leagueId).emit('message', { type: 'error', text: '⏱️ زمان لیگ به پایان رسید. امتیازدهی شروع می‌شود.' });
            
            // پایان دادن به بازی برای همه بازیکنانی که هنوز تمام نکرده‌اند
            for (const p of newLeague.players) {
                if (!newLeague.state[p.userId].isFinished) {
                    newLeague.state[p.userId].isFinished = true;
                    newLeague.state[p.userId].time = LEAGUE_DURATION_SECONDS + 1; // برای صفر شدن امتیاز
                    await calculateLeagueScoreAndEnd(leagueId, p.userId);
                }
            }
            newLeague.status = 'finished';
            checkLeagueEnd(leagueId); // بررسی پایان نهایی
        }
    }, LEAGUE_DURATION_SECONDS * 1000);


    // بازنشانی لیگ انتظار
    waitingLeague = {
        id: generateGameCode(),
        players: [],
        status: 'waiting'
    };
    io.emit('waiting_league_update', { count: 0, required: LEAGUE_SIZE }); // به روز رسانی لیست انتظار
}

// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    let currentUserId = null;
    let currentUserName = null;
    let currentUserActiveGameCode = null;

    // --- (۱) ورود و ثبت‌نام کاربر ---
    socket.on('user_login', async ({ userId, name }) => {
        // ... (منطق user_login قبلی)
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
            
            // --- اتصال مجدد خودکار به بازی فعال (انفرادی) ---
            const activeGamesResult = await pool.query(
                `SELECT code FROM games 
                WHERE (creator_id = $1 OR guesser_id = $1) 
                AND status IN ('waiting', 'in_progress')`, 
                [userId]
            );

            if (activeGamesResult.rows.length > 0) {
                currentUserActiveGameCode = activeGamesResult.rows[0].code;
                socket.join(currentUserActiveGameCode);
                console.log(`🔗 کاربر ${userId} به بازی فعال ${currentUserActiveGameCode} ملحق شد.`);
                await emitGameState(currentUserActiveGameCode); 
            }
            // --- اتصال مجدد به لیگ فعال (جدید) ---
            const activeLeague = Object.values(activeLeagues).find(
                league => league.players.some(p => p.userId === userId) && league.status === 'in_progress'
            );
            
            if (activeLeague) {
                socket.join(activeLeague.id);
                console.log(`🔗 کاربر ${userId} به لیگ فعال ${activeLeague.id} ملحق شد.`);
                // ارسال وضعیت بازی برای کلاینت متصل شده
                emitLeaguePlayerState(activeLeague.id, userId);
            }
            // --- END NEW LOGIC ---

            socket.emit('login_success', { name, userId });
            await emitLeaderboard();
            await emitLeagueLeaderboard(); // ارسال جدول رتبه‌بندی لیگ
            
            // وضعیت لیگ انتظار را نیز ارسال کنید
            socket.emit('waiting_league_update', { 
                count: waitingLeague.players.length, 
                required: LEAGUE_SIZE,
                isPlayerWaiting: waitingLeague.players.some(p => p.userId === userId)
            });
            
        } catch (error) {
            console.error('❌ خطای ورود کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ثبت اطلاعات کاربری.' });
        }
        // ...
    });

    // --- (۲) ایجاد بازی (انفرادی) ---
    socket.on('create_game', async ({ userId, word, category }) => {
        // ... (منطق create_game قبلی)
        if (!userId || !word || !category) return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });

        try {
            const gameCode = generateGameCode();
            const maxGuesses = Math.ceil(word.length * 1.5);
            const revealedLetters = {};
            
            if (!/^[\u0600-\u06FF\s]+$/.test(word) || word.length < 3) {
                 return socket.emit('game_error', { message: 'کلمه وارد شده نامعتبر است. فقط حروف فارسی و حداقل ۳ حرف.' });
            }
            
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, revealed_letters, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'waiting') RETURNING *`,
                [gameCode, userId, word, category, maxGuesses, maxGuesses, revealedLetters]
            );
            
            const newGame = result.rows[0];
            currentUserActiveGameCode = gameCode;
            socket.join(gameCode);
            socket.emit('game_created', { code: gameCode });
            console.log(`🎮 بازی جدید ایجاد شد: ${gameCode} توسط ${userId}`);
            await emitGameState(gameCode);
            
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی.' });
        }
        // ...
    });

    // --- (۳) لیست بازی‌های منتظر (انفرادی) ---
    socket.on('list_waiting_games', async () => {
        // ... (منطق list_waiting_games قبلی)
        try {
            const result = await pool.query(`
                SELECT g.code, g.category, u.name as creator_name, g.word, g.max_guesses
                FROM games g JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.creator_id != $1
            `, [currentUserId]);
            
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
        // ...
    });

    // --- (۴) پیوستن به بازی (انفرادی) ---
    socket.on('join_game', async ({ userId, gameCode }) => {
        // ... (منطق join_game قبلی)
         try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2 AND creator_id != $3', [gameCode, 'waiting', userId]);
            const game = gameResult.rows[0];

            if (!game) {
                return socket.emit('game_error', { message: 'بازی پیدا نشد یا قبلاً شروع شده است.' });
            }

            await pool.query(
                'UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3',
                [userId, 'in_progress', gameCode]
            );

            // خروج از اتاق کاربر
            io.to(`user:${game.creator_id}`).socketsLeave(`user:${game.creator_id}`);
            io.to(`user:${userId}`).socketsLeave(`user:${userId}`);
            
            currentUserActiveGameCode = gameCode;
            socket.join(gameCode);
            socket.emit('game_joined', { code: gameCode });
            
            await emitGameState(gameCode);
            
            console.log(`🔗 کاربر ${userId} به بازی ${gameCode} پیوست.`);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
        // ...
    });
    
    // --- (۵) مدیریت بازی (حدس زدن - انفرادی/لیگ) ---
    socket.on('submit_guess', async ({ userId, gameCode, letter, mode = 'solo' }) => {
        if (!userId || !letter) return;
        
        // اگر حالت لیگ است
        if (mode === 'league') {
            const activeLeague = Object.values(activeLeagues).find(league => league.players.some(p => p.userId === userId));
            if (activeLeague) {
                return processLeagueGuess(activeLeague.id, userId, letter);
            }
            return socket.emit('game_error', { message: 'شما در هیچ لیگ فعالی نیستید.' });
        }

        // اگر حالت انفرادی است
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

            io.to(gameCode).emit('message', { 
                type: isCorrect ? 'success' : 'error', 
                text: `${currentUserName} حدس زد: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` 
            });

            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount === game.word.length) {
                gameStatus = 'finished';
                winnerId = userId;
                
                const timeTaken = (Date.now() - game.start_time) / 1000;
                
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
                pointsGained = -5;
                winnerId = null;
                
                 await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW() WHERE code = $2',
                    [gameStatus, gameCode]
                );
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
            }

            if (gameStatus === 'finished') {
                io.to(gameCode).emit('game_finished', { 
                    winnerName: winnerId ? currentUserName : 'هیچکس', 
                    points: pointsGained,
                    word: game.word
                });
                currentUserActiveGameCode = null; // بازی انفرادی تمام شد
            }
            
            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای حدس زدن:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });
    
    // --- (۶) راهنمایی (Hint - فقط انفرادی) ---
    socket.on('request_hint', async ({ userId, gameCode, letterPosition }) => {
        // ... (منطق request_hint قبلی)
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
            
            if (game.revealed_letters && game.revealed_letters[letter] && game.revealed_letters[letter].includes(requestedIndex)) {
                return socket.emit('message', { type: 'info', text: '⚠️ این حرف قبلاً در این موقعیت مشخص شده است.' });
            }

            const hintCost = 15;
            await updateScoreAndEmitLeaderboard(userId, -hintCost);

            let newRevealed = { ...game.revealed_letters };
            let indices = newRevealed[letter] || [];
            
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === letter && !indices.includes(i)) {
                    indices.push(i);
                }
            }
            newRevealed[letter] = indices.sort((a, b) => a - b);
            
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
            
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount === game.word.length) {
                const timeTaken = (Date.now() - game.start_time) / 1000;
                let pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * game.incorrect_guesses) - (timeTaken) + (50 * game.word.length) - (2 * hintCost)
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
                currentUserActiveGameCode = null; // بازی انفرادی تمام شد
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در ارائه راهنمایی.' });
        }
        // ...
    });
    
    // --- (۷) جوین شدن به اتاق بازی برای سازنده (فقط برای اطمینان در مورد بازی های قدیمی - انفرادی) ---
    socket.on('join_game_room', async (gameCode) => {
        socket.join(gameCode);
        await emitGameState(gameCode);
    });
    
    // --- (۸) پیوستن به لیگ (جدید) ---
    socket.on('join_league_queue', () => {
        if (!currentUserId) return socket.emit('login_error', { message: 'لطفا ابتدا وارد شوید.' });
        
        // اگر قبلاً در لیگ انتظار است
        if (waitingLeague.players.some(p => p.userId === currentUserId)) {
            return socket.emit('message', { type: 'info', text: 'شما در صف انتظار لیگ هستید.' });
        }
        
        // اگر در یک بازی انفرادی فعال است، اجازه نده
        if (currentUserActiveGameCode) {
             return socket.emit('game_error', { message: 'شما در حال حاضر در یک بازی انفرادی فعال هستید. ابتدا آن را تمام کنید.' });
        }
        
        // اگر در یک لیگ فعال است
        const activeLeague = Object.values(activeLeagues).find(league => league.players.some(p => p.userId === currentUserId));
        if (activeLeague) {
            socket.join(activeLeague.id);
            emitLeaguePlayerState(activeLeague.id, currentUserId);
            return socket.emit('message', { type: 'info', text: `شما به لیگ فعال ${activeLeague.id} ملحق شدید.` });
        }

        // اضافه کردن به صف
        waitingLeague.players.push({ userId: currentUserId, name: currentUserName });
        socket.join(waitingLeague.id); // جوین شدن به اتاق انتظار
        
        const count = waitingLeague.players.length;
        console.log(`👤 کاربر ${currentUserName} به صف لیگ پیوست. (تعداد: ${count}/${LEAGUE_SIZE})`);

        // اعلان به همه کاربران منتظر و فرانت‌اند برای به‌روزرسانی UI
        io.to(waitingLeague.id).emit('waiting_league_update', { 
            count: count, 
            required: LEAGUE_SIZE,
            isPlayerWaiting: true,
            message: `📣 بازیکن جدید: ${currentUserName}. منتظر ${LEAGUE_SIZE - count} نفر دیگر...`
        });
        
        // اعلان به خود کاربر
        socket.emit('message', { type: 'success', text: `✅ شما به صف انتظار لیگ اضافه شدید. منتظر شروع لیگ باشید.` });

        // اعلان عمومی به تلگرام (اختیاری)
        bot.sendMessage(currentUserId, `📣 شما به صف انتظار لیگ اضافه شدید. (تعداد: ${count}/${LEAGUE_SIZE})`);


        // اگر تعداد به حد نصاب رسید، لیگ را شروع کن
        if (count >= LEAGUE_SIZE) {
            io.to(waitingLeague.id).emit('message', { type: 'info', text: '🔔 تعداد بازیکنان کافی است. لیگ در حال شروع...' });
            io.socketsLeave(waitingLeague.id); // خروج از اتاق انتظار
            startNewLeague();
        }
    });

    // --- (۹) ترک صف انتظار لیگ (جدید) ---
    socket.on('leave_league_queue', () => {
        if (!currentUserId) return;
        
        const initialCount = waitingLeague.players.length;
        
        waitingLeague.players = waitingLeague.players.filter(p => p.userId !== currentUserId);
        
        if (waitingLeague.players.length < initialCount) {
            socket.leave(waitingLeague.id);
            const count = waitingLeague.players.length;
            
            // اعلان به همه کاربران منتظر
            io.to(waitingLeague.id).emit('waiting_league_update', { 
                count: count, 
                required: LEAGUE_SIZE,
                isPlayerWaiting: false,
                message: `📣 ${currentUserName} صف انتظار را ترک کرد. (تعداد: ${count}/${LEAGUE_SIZE})`
            });
            
            socket.emit('message', { type: 'info', text: '❌ شما صف انتظار لیگ را ترک کردید.' });
        }
    });


    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
        
        // اگر کاربر در صف انتظار بود، او را حذف کن
        if (currentUserId && waitingLeague.players.some(p => p.userId === currentUserId)) {
            waitingLeague.players = waitingLeague.players.filter(p => p.userId !== currentUserId);
            const count = waitingLeague.players.length;
            io.to(waitingLeague.id).emit('waiting_league_update', { 
                count: count, 
                required: LEAGUE_SIZE,
                isPlayerWaiting: false,
                message: `📣 ${currentUserName} قطع شد و صف را ترک کرد.`
            });
        }
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🌐 سرور روی پورت ${PORT} در حال اجراست.`);
    });
});
