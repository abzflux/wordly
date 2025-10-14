const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

// --- تنظیمات و متغیرهای محیطی ---
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// --- (NEW) LEAGUE SETTINGS ---
const LEAGUE_REQUIRED_PLAYERS = 5;
const LEAGUE_TOTAL_ROUNDS = 10;
const LEAGUE_ROUND_DURATION_SECONDS = 60; // 1 دقیقه برای هر راند

// --- (NEW) In-Memory State for League ---
let leagueQueue = []; // Array of { userId, name, socketId }
let activeLeagues = {}; // Object to store active league games by leagueId

// --- (NEW) LEAGUE WORD DATABASE (Server-side) ---
const leagueWords = {
    "میوه": ["سیب", "پرتقال", "موز", "گیلاس", "آلبالو", "هلو", "شلیل", "زردآلو", "آلو", "گلابی", "انار", "انگور", "خیار", "طالبی", "هندوانه", "خربزه", "توت", "شاه‌توت", "تمشک", "زغال‌اخته", "کیوی", "آناناس", "انبه", "نارگیل", "لیمو", "نارنگی", "گریپ‌فروت", "انجیر", "خرمالو", "به", "ازگیل", "گوجه‌سبز"],
    "حیوان": ["اسب", "شیر", "پلنگ", "ببر", "گرگ", "روباه", "خرس", "فیل", "زرافه", "گورخر", "کرگدن", "میمون", "گوریل", "شامپانزه", "سگ", "گربه", "موش", "خرگوش", "همستر", "سنجاب", "گوسفند", "بز", "گاو", "خوک", "مرغ", "خروس", "بوقلمون", "اردک", "غاز", "کبوتر", "عقاب", "شاهین", "جغد", "طوطی", "پنگوئن", "شتر", "لاما", "کانگورو", "کوالا", "پاندا", "تمساح", "مار", "لاک‌پشت", "قورباغه", "ماهی", "کوسه", "نهنگ", "دلفین", "آهو", "گوزن"],
    "کشور": ["ایران", "آلمان", "فرانسه", "ایتالیا", "اسپانیا", "پرتغال", "انگلیس", "روسیه", "چین", "ژاپن", "کره", "هند", "پاکستان", "افغانستان", "ترکیه", "عراق", "عربستان", "مصر", "برزیل", "آرژانتین", "کانادا", "آمریکا", "مکزیک", "استرالیا", "نیوزلند", "اندونزی", "مالزی", "تایلند", "سوئد", "نروژ", "فنلاند", "هلند", "بلژیک", "سوئیس", "اتریش", "لهستان", "یونان", "اوکراین", "شیلی", "پرو", "کلمبیا", "نیجریه", "کنیا", "مراکش", "قطر", "امارات", "کویت", "اردن", "لبنان", "سوریه", "گرجستان", "ارمنستان", "آذربایجان"],
    "ورزش": ["فوتبال", "بسکتبال", "والیبال", "هندبال", "تنیس", "بدمینتون", "شنا", "ژیمناستیک", "کشتی", "وزنه‌برداری", "بوکس", "کاراته", "تکواندو", "جودو", "دوچرخه‌سواری", "اسکی", "هاکی", "بیسبال", "راگبی", "گلف", "قایقرانی", "تیراندازی", "سوارکاری", "شطرنج", "واترپلو", "شمشیربازی"],
    "شغل": ["پزشک", "مهندس", "معلم", "پرستار", "وکیل", "قاضی", "پلیس", "سرباز", "خلبان", "راننده", "آشپز", "نانوا", "خیاط", "نجار", "نقاش", "معمار", "عکاس", "خبرنگار", "نویسنده", "مترجم", "بازیگر", "کارگردان", "خواننده", "ورزشکار", "مربی", "دانشمند", "محقق", "استاد", "کشاورز", "کارگر", "فروشنده", "حسابدار", "مدیر", "منشی", "برنامه‌نویس", "طراح", "گرافیست", "مکانیک", "آرایشگر"],
    "شهر": ["تهران", "مشهد", "اصفهان", "شیراز", "تبریز", "کرج", "اهواز", "قم", "کرمانشاه", "ارومیه", "رشت", "زاهدان", "کرمان", "همدان", "یزد", "اردبیل", "بندرعباس", "اراک", "زنجان", "سنندج", "قزوین", "خرم‌آباد", "گرگان", "ساری", "کاشان", "دزفول", "نیشابور", "سبزوار", "بجنورد", "بوشهر", "بیرجند", "ایلام", "شهرکرد", "سمنان", "یاسوج"],
    "اشیاء": ["میز", "صندلی", "کتاب", "دفتر", "مداد", "خودکار", "تلفن", "موبایل", "تلویزیون", "یخچال", "اجاق‌گاز", "ماشین", "دوچرخه", "کامپیوتر", "لپتاپ", "دوربین", "ساعت", "عینک", "کیف", "کفش", "لباس", "کلاه", "شلوار", "پیراهن", "قاشق", "چنگال", "بشقاب", "لیوان", "چاقو", "تختخواب", "کمد", "فرش", "پرده", "آینه", "شانه", "مسواک", "پنجره", "درب", "کلید"],
};

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
        const welcomeMessage = `سلام ${name}، به بازی Wordly خوش آمدید! 🤖\n\nبرای شروع بازی روی دکمه زیر کلیک کنید:`;
        const inlineKeyboard = {
            inline_keyboard: [[{ text: '🚀 شروع بازی', web_app: { url: FRONTEND_URL } }]]
        };
        bot.sendMessage(chatId, welcomeMessage, { reply_markup: inlineKeyboard });
    } catch (error) {
        console.error('❌ خطای پردازش فرمان /start:', error);
        bot.sendMessage(chatId, 'خطایی در ثبت‌نام شما رخ داد. لطفا دوباره تلاش کنید.');
    }
});

// اتصال و اطمینان از وجود جداول
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                score INT DEFAULT 0,
                league_score INT DEFAULT 0, -- (NEW) امتیاز لیگ
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

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
        process.exit(1);
    }
}

// --- راه‌اندازی سرور Express و Socket.io ---
const app = express();
const server = http.createServer(app);
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// --- توابع کمکی ---
const generateGameCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

async function emitGameState(gameCode) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        if (result.rows.length === 0) return;
        const game = result.rows[0];
        const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
        let guesser = null;
        if (game.guesser_id) {
            guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
        }
        const gameState = {
            code: game.code, status: game.status, category: game.category,
            wordLength: game.word.length, maxGuesses: game.max_guesses, guessesLeft: game.guesses_left,
            correctGuesses: game.correct_guesses, incorrectGuesses: game.incorrect_guesses,
            revealedLetters: game.revealed_letters, guessedLetters: game.guessed_letters,
            startTime: game.start_time, creator: creator, guesser: guesser
        };
        io.to(gameCode).emit('game_update', gameState);
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
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی کلاسیک:', error);
    }
}

// --- (NEW) League Helper Functions ---
async function updateLeagueScoreAndEmitLeaderboard(playersFinalScores) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const player of playersFinalScores) {
            await client.query('UPDATE users SET league_score = league_score + $1 WHERE telegram_id = $2', [player.score, player.userId]);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
    await emitLeagueLeaderboard();
}

async function emitLeagueLeaderboard() {
    try {
        const result = await pool.query('SELECT name, league_score as score FROM users ORDER BY league_score DESC LIMIT 10');
        io.emit('league_leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی لیگ:', error);
    }
}

function getRandomWords(count) {
    const words = [];
    const categories = Object.keys(leagueWords);
    while (words.length < count) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        const wordList = leagueWords[randomCategory];
        const randomWord = wordList[Math.floor(Math.random() * wordList.length)];
        if (!words.some(w => w.word === randomWord)) {
            words.push({ word: randomWord, category: randomCategory });
        }
    }
    return words;
}

async function startLeagueGame() {
    const players = leagueQueue.splice(0, LEAGUE_REQUIRED_PLAYERS);
    leagueQueue = []; // Clear queue
    io.emit('league_queue_update', { players: [], total: 0 }); // Notify all clients that queue is empty

    const leagueId = generateGameCode();
    const wordsForLeague = getRandomWords(LEAGUE_TOTAL_ROUNDS);

    const leagueState = {
        leagueId,
        players: players.map(p => ({ ...p, score: 0, currentRoundFinished: false })),
        rounds: wordsForLeague.map(w => ({
            word: w.word,
            category: w.category,
            wordLength: w.word.length,
            playerStates: players.reduce((acc, p) => {
                acc[p.userId] = {
                    guessesLeft: 10,
                    revealedLetters: {},
                    guessedLetters: [],
                    startTime: null,
                    isFinishedForPlayer: false
                };
                return acc;
            }, {})
        })),
        currentRound: 0,
        gameStartTime: Date.now()
    };
    
    activeLeagues[leagueId] = leagueState;

    // Notify players and start the game
    for (const player of players) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
            playerSocket.join(leagueId);
            playerSocket.emit('league_start', getLeagueStateForPlayer(leagueId, player.userId));
        }
    }
    console.log(`🏆 لیگ ${leagueId} با ${players.length} بازیکن شروع شد.`);
    setTimeout(() => advanceLeagueRound(leagueId), 1000); // Start first round
}

function getLeagueStateForPlayer(leagueId, userId) {
    const league = activeLeagues[leagueId];
    const player = league.players.find(p => p.userId === userId);
    const roundData = league.rounds[league.currentRound];
    const playerRoundState = roundData.playerStates[userId];

    return {
        leagueId,
        players: league.players.map(p => ({ name: p.name, score: p.score })),
        currentRound: league.currentRound,
        totalRounds: LEAGUE_TOTAL_ROUNDS,
        myScore: player.score,
        roundState: {
            ...playerRoundState,
            category: roundData.category,
            wordLength: roundData.wordLength,
            timeRemaining: LEAGUE_ROUND_DURATION_SECONDS,
        }
    };
}

function advanceLeagueRound(leagueId) {
    const league = activeLeagues[leagueId];
    if (!league) return;

    const currentRoundIndex = league.currentRound;

    // Start the timer and set the start time for all players in this round
    league.rounds[currentRoundIndex].playerStates = Object.keys(league.rounds[currentRoundIndex].playerStates).reduce((acc, userId) => {
        acc[userId] = { ...league.rounds[currentRoundIndex].playerStates[userId], startTime: Date.now(), isFinishedForPlayer: false };
        return acc;
    }, {});

    // Notify all players in the league room about the new round
    for (const player of league.players) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
            playerSocket.emit('league_next_round', {
                currentRound: currentRoundIndex,
                roundState: getLeagueStateForPlayer(leagueId, player.userId).roundState,
            });
        }
    }

    // Set a timeout for the round duration
    setTimeout(() => endLeagueRound(leagueId, currentRoundIndex), LEAGUE_ROUND_DURATION_SECONDS * 1000);
}

function endLeagueRound(leagueId, roundIndex) {
    const league = activeLeagues[leagueId];
    if (!league || league.currentRound !== roundIndex) return; // Round already ended

    // Mark all unfinished players as finished for this round
    const round = league.rounds[roundIndex];
    for (const userId in round.playerStates) {
        if (!round.playerStates[userId].isFinishedForPlayer) {
            round.playerStates[userId].isFinishedForPlayer = true;
            // No points for timeout
        }
    }
    
    // Check if it's the final round
    if (roundIndex >= LEAGUE_TOTAL_ROUNDS - 1) {
        // Game Over
        const finalScores = league.players.map(p => ({ userId: p.userId, name: p.name, score: p.score }));
        io.to(leagueId).emit('league_game_finished', { leaderboard: finalScores.sort((a,b) => b.score - a.score) });
        updateLeagueScoreAndEmitLeaderboard(finalScores);
        delete activeLeagues[leagueId];
        console.log(`🏁 لیگ ${leagueId} به پایان رسید.`);
    } else {
        // Move to the next round
        league.currentRound++;
        advanceLeagueRound(leagueId);
    }
}


// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    let currentUserId = null;
    let currentUserName = null;

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
            
            const activeGamesResult = await pool.query(
                `SELECT code FROM games WHERE (creator_id = $1 OR guesser_id = $1) AND status IN ('waiting', 'in_progress')`, [userId]
            );
            if (activeGamesResult.rows.length > 0) {
                const gameCode = activeGamesResult.rows[0].code;
                socket.join(gameCode);
                await emitGameState(gameCode);
            }

            socket.emit('login_success', { name, userId });
            await emitLeaderboard();
            await emitLeagueLeaderboard(); // Send league leaderboard on login
        } catch (error) {
            console.error('❌ خطای ورود کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ثبت اطلاعات کاربری.' });
        }
    });

    // ... (All classic game event handlers remain unchanged) ...
    socket.on('create_game', async ({ userId, word, category }) => {
        if (!userId || !word || !category) return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });
        try {
            const gameCode = generateGameCode();
            const maxGuesses = Math.ceil(word.length * 1.5);
            if (!/^[\u0600-\u06FF\s]+$/.test(word) || word.length < 3) {
                return socket.emit('game_error', { message: 'کلمه وارد شده نامعتبر است. فقط حروف فارسی و حداقل ۳ حرف.' });
            }
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, revealed_letters, status) VALUES ($1, $2, $3, $4, $5, $6, '{}', 'waiting') RETURNING *`,
                [gameCode, userId, word, category, maxGuesses, maxGuesses]
            );
            socket.join(gameCode);
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی.' });
        }
    });

    socket.on('list_waiting_games', async () => {
        try {
            const result = await pool.query(`SELECT g.code, g.category, u.name as creator_name, char_length(g.word) as word_length FROM games g JOIN users u ON g.creator_id = u.telegram_id WHERE g.status = 'waiting' AND g.creator_id != $1`, [currentUserId]);
            socket.emit('waiting_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌ها:', error);
        }
    });

    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2 AND creator_id != $3', [gameCode, 'waiting', userId]);
            const game = gameResult.rows[0];
            if (!game) return socket.emit('game_error', { message: 'بازی پیدا نشد یا قبلاً شروع شده است.' });
            await pool.query('UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3', [userId, 'in_progress', gameCode]);
            socket.join(gameCode);
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
        }
    });

    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];
            if (!game || game.guesser_id != userId) return;
            const normalizedLetter = letter.trim().toLowerCase();
            if (game.guessed_letters.includes(normalizedLetter)) {
                return io.to(gameCode).emit('message', { type: 'warning', text: `حرف "${normalizedLetter}" قبلاً حدس زده شده است.` });
            }
            let isCorrect = game.word.includes(normalizedLetter);
            let newRevealed = { ...game.revealed_letters };
            if (isCorrect) {
                newRevealed[normalizedLetter] = [...game.word].map((char, i) => char === normalizedLetter ? i : -1).filter(i => i !== -1);
            }
            const newGuessesLeft = game.guesses_left - 1;
            const newIncorrectGuesses = game.incorrect_guesses + (isCorrect ? 0 : 1);
            await pool.query(`UPDATE games SET guesses_left = $1, incorrect_guesses = $2, revealed_letters = $3, guessed_letters = array_append(guessed_letters, $4) WHERE code = $5`, [newGuessesLeft, newIncorrectGuesses, newRevealed, normalizedLetter, gameCode]);
            io.to(gameCode).emit('message', { type: isCorrect ? 'success' : 'error', text: `${currentUserName} حدس زد: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` });
            
            const revealedCount = Object.values(newRevealed).flat().length;
            let gameStatus = 'in_progress';
            let pointsGained = 0;
            if (revealedCount === game.word.length) {
                gameStatus = 'finished';
                pointsGained = Math.max(10, Math.floor(1000 - (10 * newIncorrectGuesses) - ((Date.now() - new Date(game.start_time).getTime()) / 1000) + (50 * game.word.length)));
                await pool.query('UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3', [gameStatus, userId, gameCode]);
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
            } else if (newGuessesLeft <= 0) {
                gameStatus = 'finished';
                pointsGained = -5;
                await pool.query('UPDATE games SET status = $1, end_time = NOW() WHERE code = $2', [gameStatus, gameCode]);
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
            }
            if (gameStatus === 'finished') {
                io.to(gameCode).emit('game_finished', { winnerName: gameStatus === 'finished' && revealedCount === game.word.length ? currentUserName : 'هیچکس', points: pointsGained, word: game.word });
            }
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای حدس زدن:', error);
        }
    });

    socket.on('request_hint', async ({ userId, gameCode, letterPosition }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];
            if (!game || game.guesser_id != userId) return;
            const hintCost = 15;
            await updateScoreAndEmitLeaderboard(userId, -hintCost);
            const letter = game.word[letterPosition];
            let newRevealed = { ...game.revealed_letters };
            if (!newRevealed[letter]) newRevealed[letter] = [];
            if (!newRevealed[letter].includes(letterPosition)) newRevealed[letter].push(letterPosition);
            await pool.query('UPDATE games SET revealed_letters = $1 WHERE code = $2', [newRevealed, gameCode]);
            io.to(gameCode).emit('message', { type: 'hint', text: `راهنمایی درخواست شد (-${hintCost} امتیاز).` });
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای راهنمایی:', error);
        }
    });
    
    // --- (NEW) League Logic Handlers ---
    socket.on('league_join_queue', () => {
        if (!currentUserId || leagueQueue.some(p => p.userId === currentUserId)) return;
        leagueQueue.push({ userId: currentUserId, name: currentUserName, socketId: socket.id });
        
        io.emit('league_queue_update', { 
            players: leagueQueue.map(p => ({ name: p.name })), 
            total: leagueQueue.length,
            newUser: { name: currentUserName, userId: currentUserId }
        });
        
        console.log(`📥 ${currentUserName} به صف لیگ پیوست. (${leagueQueue.length}/${LEAGUE_REQUIRED_PLAYERS})`);
        
        if (leagueQueue.length >= LEAGUE_REQUIRED_PLAYERS) {
            startLeagueGame();
        }
    });

    socket.on('league_leave_queue', () => {
        leagueQueue = leagueQueue.filter(p => p.userId !== currentUserId);
        io.emit('league_queue_update', { players: leagueQueue.map(p => ({ name: p.name })), total: leagueQueue.length });
        console.log(`📤 ${currentUserName} از صف لیگ خارج شد.`);
    });
    
    socket.on('league_submit_guess', ({ letter }) => {
        const league = Object.values(activeLeagues).find(l => l.players.some(p => p.userId === currentUserId));
        if (!league) return;

        const round = league.rounds[league.currentRound];
        const playerState = round.playerStates[currentUserId];
        if (playerState.isFinishedForPlayer) return;

        const normalizedLetter = letter.toLowerCase();
        if (playerState.guessedLetters.includes(normalizedLetter)) return;

        playerState.guessedLetters.push(normalizedLetter);
        const isCorrect = round.word.includes(normalizedLetter);

        if (isCorrect) {
            round.word.split('').forEach((char, index) => {
                if (char === normalizedLetter) {
                    playerState.revealedLetters[index] = char;
                }
            });
        } else {
            playerState.guessesLeft--;
        }

        const revealedCount = Object.keys(playerState.revealedLetters).length;
        if (revealedCount === round.wordLength || playerState.guessesLeft <= 0) {
            playerState.isFinishedForPlayer = true;
            if (revealedCount === round.wordLength) {
                const timeTaken = (Date.now() - playerState.startTime) / 1000;
                const timeBonus = Math.max(0, Math.floor((LEAGUE_ROUND_DURATION_SECONDS - timeTaken) * 5));
                const points = 100 + timeBonus;
                league.players.find(p => p.userId === currentUserId).score += points;
            }
        }

        socket.emit('league_round_update', {
            roundState: getLeagueStateForPlayer(league.leagueId, currentUserId).roundState,
            players: league.players.map(p => ({ name: p.name, score: p.score }))
        });

        const allPlayersFinished = league.players.every(p => round.playerStates[p.userId].isFinishedForPlayer);
        if (allPlayersFinished) {
            endLeagueRound(league.leagueId, league.currentRound);
        }
    });

    socket.on('request_league_leaderboard', async () => {
        await emitLeagueLeaderboard();
    });

    // --- Disconnect Logic ---
    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
        // (NEW) Remove user from league queue on disconnect
        if (currentUserId) {
            const userInQueue = leagueQueue.find(p => p.userId === currentUserId);
            if (userInQueue) {
                leagueQueue = leagueQueue.filter(p => p.userId !== currentUserId);
                io.emit('league_queue_update', { players: leagueQueue.map(p => ({ name: p.name })), total: leagueQueue.length });
                console.log(`🔌 ${currentUserName} به دلیل قطع اتصال از صف لیگ حذف شد.`);
            }
        }
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🌐 سرور روی پورت ${PORT} در حال اجراست.`);
    });
});
