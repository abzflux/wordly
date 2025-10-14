const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// --- 1. تنظیمات سرور پایه ---
const app = express();
const server = http.createServer(app);

// تنظیمات CORS برای ارتباط با کلاینت React
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // آدرس پیش‌فرض توسعه React
        methods: ["GET", "POST"]
    }
});

// --- 2. ثوابت و پارامترهای بازی ---
const REQUIRED_LEAGUE_PLAYERS = 5;      // تعداد بازیکنان لازم برای شروع لیگ
const LEAGUE_WORDS_COUNT = 10;          // تعداد کلماتی که هر بازیکن در لیگ باید حدس بزند
const STARTING_GUESSES = 10;            // تعداد حدس‌های اولیه برای هر کلمه
const GUESS_SCORE_PER_REMAINING = 10;   // امتیاز کسب شده به ازای هر حدس باقی‌مانده
const HINT_COST = 15;                   // هزینه امتیاز برای گرفتن راهنمایی
const HINT_PENALTY_SCORE = 15;          // امتیاز کسر شده از امتیاز کلی کاربر برای استفاده از راهنمایی

// پاداش‌های لیگ بر اساس رتبه
const LEAGUE_REWARDS = {
    1: 500,
    2: 300,
    3: 100,
    4: 0,
    5: 0,
};

// --- 3. پایگاه داده شبیه‌سازی شده (Global Game State) ---
// توجه: در یک اپلیکیشن واقعی، این داده‌ها باید در یک پایگاه داده پایدار (مانند Firestore) ذخیره شوند.

/**
 * @typedef {Object} User
 * @property {string} id - آیدی منحصر به فرد کاربر (مثل آیدی تلگرام)
 * @property {string} name - نام کاربر
 * @property {string|null} socketId - آیدی سوکت فعلی برای ارسال مستقیم
 * @property {number} score - امتیاز کلی کاربر (برای لیدربورد عمومی)
 */
let users = {};         // { userId: User }

/**
 * @typedef {Object} QuickGame
 * @property {string} code - کد 4 رقمی بازی
 * @property {string} status - 'waiting', 'playing', 'finished'
 * @property {string} word - کلمه هدف
 * @property {string} category - دسته‌بندی کلمه
 * @property {number} wordLength - طول کلمه
 * @property {number} guessesLeft - حدس‌های باقی‌مانده
 * @property {number} incorrectGuesses - تعداد حدس‌های اشتباه
 * @property {string[]} guessedLetters - لیست حروف حدس زده شده
 * @property {Object.<string, number[]>} revealedLetters - حروف آشکار شده { letter: [pos1, pos2] }
 * @property {boolean} isSolved - آیا کلمه حل شده است؟
 * @property {Array} players - شامل نقش‌ها ('creator', 'guesser')
 */
let quickGames = {};    // { gameCode: QuickGame }

/**
 * @typedef {Object} LeaguePlayerState
 * @property {string} id
 * @property {string} name
 * @property {number} score - امتیاز کسب شده در این مسابقه لیگ
 * @property {boolean} isFinished - آیا بازیکن همه کلمات را به پایان رسانده؟
 * @property {QuickGame} currentWordData - وضعیت حدس زدن برای کلمه فعلی
 */
/**
 * @typedef {Object} LeagueMatch
 * @property {string} id - آیدی منحصر به فرد مسابقه لیگ
 * @property {LeaguePlayerState[]} players - وضعیت بازیکنان در مسابقه
 * @property {Object[]} words - لیست ۱۰ کلمه برای مسابقه
 * @property {number} currentWordIndex - شاخص کلمه فعلی
 * @property {string} status - 'playing', 'finished'
 */
let leagueMatches = {}; // { leagueId: LeagueMatch }

/**
 * @typedef {Object} QueuePlayer
 * @property {string} id
 * @property {string} name
 * @property {string} socketId
 */
let leagueQueue = [];   // [QueuePlayer]

let globalLeaderboard = []; // [{ id, name, score }]
let leagueLeaderboard = []; // [{ leagueId, topPlayer, playersCount, leagueScore }]

// لیست نمونه کلمات برای بازی‌های لیگ
const availableWords = [
    { word: "برنامه نویسی", category: "علمی" }, { word: "کامپیوتر", category: "فناوری" },
    { word: "دریچه", category: "عمومی" }, { word: "ریاضیات", category: "علمی" },
    { word: "جغرافیا", category: "تحصیلی" }, { word: "کتابخانه", category: "فرهنگی" },
    { word: "آسمان", category: "طبیعت" }, { word: "ساختمان", category: "عمومی" },
    { word: "اتومبیل", category: "حمل و نقل" }, { word: "موسیقی", category: "هنر" },
    { word: "انسان", category: "زیست شناسی" }, { word: "اینترنت", category: "فناوری" },
    { word: "کیبورد", category: "فناوری" }, { word: "تهران", category: "جغرافیا" },
    { word: "آبشار", category: "طبیعت" }, { word: "پرنده", category: "حیوانات" },
    { word: "خوشنویسی", category: "هنر" }, { word: "نوروز", category: "فرهنگی" },
];

// --- 4. توابع کمکی منطق بازی ---

/**
 * کلمات تصادفی و منحصر به فرد را برای مسابقه لیگ انتخاب می‌کند.
 * @returns {Object[]} آرایه‌ای از اشیاء کلمه/دسته
 */
const selectLeagueWords = () => {
    // نمونه‌برداری بدون تکرار
    const shuffled = [...availableWords].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, LEAGUE_WORDS_COUNT);
};

/**
 * یک شیء وضعیت کلمه جدید برای بازیکن یا بازی سریع می‌سازد.
 * @param {Object} wordObj - شامل word و category
 * @returns {QuickGame}
 */
const createPlayerWordData = (wordObj) => ({
    word: wordObj.word,
    category: wordObj.category,
    wordLength: wordObj.word.length,
    guessesLeft: STARTING_GUESSES,
    incorrectGuesses: 0,
    guessedLetters: [],
    revealedLetters: {}, // { letter: [pos1, pos2, ...] }
    isSolved: false,
});

/**
 * پاداش لیگ را بر اساس رتبه نهایی محاسبه می‌کند.
 * @param {number} rank - رتبه نهایی (۱ تا ۵)
 * @returns {number} پاداش امتیازی
 */
const calculateLeagueReward = (rank) => {
    return LEAGUE_REWARDS[rank] || 0;
};

/**
 * امتیاز کلی کاربر را به‌روزرسانی می‌کند و لیدربورد عمومی را منتشر می‌کند.
 * @param {string} userId
 * @param {number} scoreChange - تغییر در امتیاز (+ یا -)
 */
const updateGlobalScore = (userId, scoreChange) => {
    if (users[userId]) {
        users[userId].score = (users[userId].score || 0) + scoreChange;
        
        // به‌روزرسانی و مرتب‌سازی لیدربورد کلی
        globalLeaderboard = Object.values(users)
            .filter(u => u.score > 0)
            .map(u => ({ id: u.id, name: u.name, score: u.score }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10); // ۱۰ نفر اول
        
        io.emit('leaderboard_update', globalLeaderboard);
    }
};

/**
 * یک مسابقه لیگ جدید را با بازیکنان صف آغاز می‌کند.
 */
const startLeagueMatch = () => {
    if (leagueQueue.length < REQUIRED_LEAGUE_PLAYERS) return;

    // 1. انتخاب بازیکنان و پاکسازی صف
    const matchPlayers = leagueQueue.splice(0, REQUIRED_LEAGUE_PLAYERS);
    const leagueId = uuidv4();
    const words = selectLeagueWords();
    const initialWord = words[0];

    // 2. ساخت شیء مسابقه جدید
    const newMatch = {
        id: leagueId,
        players: matchPlayers.map(p => ({
            id: p.id,
            name: p.name,
            score: 0, // امتیاز بازی فعلی لیگ
            isFinished: false,
            currentWordData: createPlayerWordData(initialWord),
        })),
        words: words,
        currentWordIndex: 0,
        status: 'playing',
    };
    
    leagueMatches[leagueId] = newMatch;
    console.log(`[LEAGUE] Match ${leagueId} started with ${matchPlayers.length} players.`);

    // 3. ارسال اعلان و جوین به روم
    matchPlayers.forEach(p => {
        io.to(p.socketId).emit('start_league_game', newMatch);
        io.sockets.sockets.get(p.socketId)?.join(leagueId);
    });

    // 4. به‌روزرسانی وضعیت صف برای بقیه
    io.emit('league_status_update', { players: leagueQueue.map(p => ({ id: p.id, name: p.name })) });
};

/**
 * بازیکن را به کلمه بعدی در مسابقه لیگ می‌برد یا بازی را خاتمه می‌دهد.
 * @param {LeagueMatch} game - آبجکت مسابقه
 * @param {LeaguePlayerState} player - آبجکت وضعیت بازیکن
 * @param {string} room - آیدی روم (آیدی لیگ)
 * @param {number} scoreGained - امتیازی که در کلمه فعلی کسب شده است
 */
const moveToNextWordOrFinish = (game, player, room, scoreGained) => {
    player.score += scoreGained;
    
    // 1. اطلاع‌رسانی به بازیکن در مورد امتیاز
    io.to(player.currentWordData.socketId || users[player.id].socketId).emit('message', { 
        text: `کلمه حل شد! امتیاز کسب شده در این راند: ${scoreGained}.`, 
        type: "success" 
    });

    // 2. بررسی اتمام ۱۰ کلمه
    const isLastWord = game.currentWordIndex === LEAGUE_WORDS_COUNT - 1;
    
    if (isLastWord) {
        // این بازیکن مسابقه را تمام کرده است
        player.isFinished = true;
        
        // بررسی اینکه آیا همه بازیکنان مسابقه را تمام کرده‌اند
        const allFinished = game.players.every(p => p.isFinished);
        
        if (allFinished) {
            finishLeagueMatch(game.id);
        } else {
            // فقط وضعیت لیگ را برای رقبا به‌روز کن
            io.to(room).emit('league_game_update', game);
        }
    } else {
        // حرکت به کلمه بعدی
        game.currentWordIndex++;
        const nextWord = game.words[game.currentWordIndex];
        
        // بازنشانی وضعیت کلمه برای بازیکن
        player.currentWordData = createPlayerWordData(nextWord);
        
        // به‌روزرسانی وضعیت لیگ با پرچم کلمه جدید
        io.to(room).emit('league_game_update', { ...game, currentWordIndex: game.currentWordIndex, isNewWord: true });
    }
};

/**
 * مسابقه لیگ را به پایان می‌رساند و نتایج نهایی را اعلام می‌کند.
 * @param {string} leagueId
 */
const finishLeagueMatch = (leagueId) => {
    const match = leagueMatches[leagueId];
    if (!match || match.status === 'finished') return;

    match.status = 'finished';

    // 1. محاسبه رتبه و پاداش نهایی
    const results = match.players
        .sort((a, b) => b.score - a.score)
        .map((p, index) => ({
            id: p.id,
            name: p.name,
            score: p.score, // امتیاز کسب شده در این لیگ
            rank: index + 1,
            reward: calculateLeagueReward(index + 1)
        }));
    
    // 2. به‌روزرسانی امتیاز کلی کاربران و اعمال پاداش
    const winner = results[0];
    results.forEach(r => {
        updateGlobalScore(r.id, r.reward); 
    });

    // 3. ساخت شیء نتایج
    const gameFinishedData = {
        isLeague: true,
        leagueId: leagueId,
        results: results,
        winnerName: winner.name,
    };
    
    // 4. به‌روزرسانی لیدربورد لیگ (۱۰ نتیجه آخر)
    leagueLeaderboard.unshift({
        leagueId: leagueId,
        topPlayer: winner.name,
        playersCount: match.players.length,
        leagueScore: winner.score,
    });
    leagueLeaderboard = leagueLeaderboard.slice(0, 10); 
    io.emit('league_leaderboard_update', leagueLeaderboard);

    // 5. ارسال نتایج نهایی و ترک روم
    io.to(leagueId).emit('game_finished', gameFinishedData);

    match.players.forEach(p => {
        io.sockets.sockets.get(users[p.id]?.socketId)?.leave(leagueId);
    });
    delete leagueMatches[leagueId];
    console.log(`[LEAGUE] Match ${leagueId} permanently finished and deleted.`);
};


// --- 5. منطق رویدادهای Socket.IO ---

io.on('connection', (socket) => {
    console.log(`[CONNECT] User connected: ${socket.id}`);

    // --- 5.1. رویداد ورود (Login) ---
    socket.on('user_login', (data) => {
        const { userId, name } = data;
        
        // منطق جابجایی سوکت (اگر کاربر قبلاً با آیدی دیگری وصل بود)
        if (users[userId] && users[userId].socketId && users[userId].socketId !== socket.id) {
             io.sockets.sockets.get(users[userId].socketId)?.disconnect(true);
             console.log(`[LOGIN] Reconnecting user ${userId}. Disconnecting old socket.`);
        }
        
        // به‌روزرسانی یا ایجاد کاربر
        users[userId] = users[userId] || { id: userId, score: 0 };
        users[userId].name = name;
        users[userId].socketId = socket.id;
        
        let currentQuickGame = null;
        let currentLeagueMatch = null;
        
        // بازیابی وضعیت بازی‌های فعال (اگر کاربر در حین بازی دیسکانکت شده باشد)
        for (const code in quickGames) {
            if (quickGames[code].players.some(p => p.id === userId)) {
                currentQuickGame = quickGames[code];
                socket.join(code);
                break;
            }
        }
        for (const id in leagueMatches) {
            if (leagueMatches[id].players.some(p => p.id === userId)) {
                currentLeagueMatch = leagueMatches[id];
                socket.join(id);
                break;
            }
        }

        // به‌روزرسانی سوکت در صف لیگ
        const queueIndex = leagueQueue.findIndex(p => p.id === userId);
        if (queueIndex !== -1) { leagueQueue[queueIndex].socketId = socket.id; }

        // ارسال وضعیت اولیه به کلاینت
        const leagueStateForClient = { players: leagueQueue.map(p => ({ id: p.id, name: p.name })) };
        socket.emit('login_success', { 
            currentQuickGame, 
            currentLeagueMatch, 
            currentLeagueState: leagueStateForClient 
        });
        
        // ارسال لیست بازی‌های منتظر و لیدربوردها
        const waitingGames = Object.values(quickGames)
            .filter(g => g.status === 'waiting').map(g => ({
                code: g.code, 
                creatorName: users[g.players.find(p => p.role === 'creator').id]?.name || 'نامشخص', 
                wordLength: g.wordLength, 
                category: g.category
        }));
        socket.emit('waiting_games_list', waitingGames);
        socket.emit('leaderboard_update', globalLeaderboard);
        socket.emit('league_leaderboard_update', leagueLeaderboard);
    });

    // --- 5.2. رویداد قطع اتصال (Disconnect) ---
    socket.on('disconnect', () => {
        const userId = Object.keys(users).find(key => users[key].socketId === socket.id);
        if (userId) {
            // فقط socketId را null می‌کنیم تا کاربر بتواند دوباره وصل شود
            users[userId].socketId = null; 
            
            // اگر در صف لیگ بود، حذف شود و به بقیه اطلاع داده شود
            const queueIndex = leagueQueue.findIndex(p => p.id === userId);
            if (queueIndex !== -1) {
                leagueQueue.splice(queueIndex, 1);
                io.emit('league_status_update', { players: leagueQueue.map(p => ({ id: p.id, name: p.name })) });
                console.log(`[QUEUE] User ${userId} removed from queue on disconnect.`);
            }
        }
    });

    // --- 5.3. رویدادهای بازی سریع ---
    
    socket.on('create_game', (data) => {
        const { userId, word, category } = data;
        const user = users[userId];
        if (!user || !word || word.length < 3) {
            return socket.emit('message', { text: "کلمه باید حداقل ۳ حرف داشته باشد.", type: "error" });
        }
        
        const gameCode = uuidv4().substring(0, 4).toUpperCase();
        
        const newGame = {
            code: gameCode,
            status: 'waiting',
            word: word.trim(),
            category: category.trim() || 'عمومی',
            ...createPlayerWordData({ word: word.trim(), category: category.trim() || 'عمومی' }), // استفاده از تابع کمکی
            players: [
                { id: userId, name: user.name, role: 'creator', socketId: user.socketId },
            ]
        };
        
        quickGames[gameCode] = newGame;
        socket.join(gameCode);
        socket.emit('game_update', newGame);
        
        // به‌روزرسانی لیست بازی‌های منتظر
        io.emit('waiting_games_list', Object.values(quickGames).filter(g => g.status === 'waiting').map(g => ({
            code: g.code, creatorName: user.name, wordLength: newGame.wordLength, category: newGame.category
        })));
    });
    
    socket.on('join_game', (data) => {
        const { userId, gameCode } = data;
        const game = quickGames[gameCode];
        const user = users[userId];
        
        if (!game || game.status !== 'waiting' || game.players.some(p => p.id === userId)) {
             return socket.emit('message', { text: "این بازی برای پیوستن معتبر نیست یا پر شده است.", type: "error" });
        }
        
        // حدس‌زننده اضافه می‌شود
        game.players.push({ id: userId, name: user.name, role: 'guesser', socketId: user.socketId });
        game.status = 'playing';
        socket.join(gameCode);

        // حذف از لیست انتظار
        io.emit('waiting_games_list', Object.values(quickGames).filter(g => g.status === 'waiting').map(g => ({
            code: g.code, creatorName: users[g.players.find(p => p.role === 'creator').id]?.name || 'نامشخص', wordLength: g.wordLength, category: g.category
        })));

        // شروع بازی برای هر دو نفر
        io.to(gameCode).emit('game_update', game);
        io.to(gameCode).emit('message', { text: `بازی شروع شد! ${user.name} حدس‌زننده است.`, type: "success" });
    });

    socket.on('leave_game_room', (data) => {
        const { userId } = data;
        let gameCodeToLeave;
        
        for(const code in quickGames) {
            if (quickGames[code].players.some(p => p.id === userId)) {
                gameCodeToLeave = code;
                break;
            }
        }
        
        if (gameCodeToLeave) {
            const game = quickGames[gameCodeToLeave];
            const otherPlayer = game.players.find(p => p.id !== userId);
            
            // اعلام پایان بازی
            io.to(gameCodeToLeave).emit('game_finished', {
                isLeague: false,
                word: game.word,
                winnerId: otherPlayer?.id || null, 
                message: `${users[userId].name} از بازی خارج شد. بازی لغو شد یا بازیکن دیگر برنده اعلام شد.`
            });
            
            // ترک روم و حذف بازی
            delete quickGames[gameCodeToLeave];
            socket.leave(gameCodeToLeave);
        }
        
        // به‌روزرسانی لیست انتظار
        io.emit('waiting_games_list', Object.values(quickGames).filter(g => g.status === 'waiting').map(g => ({
            code: g.code, creatorName: users[g.creatorId]?.name || 'نامشخص', wordLength: g.wordLength, category: g.category
        })));
    });

    // --- 5.4. رویدادهای لیگ ---
    
    socket.on('join_league_queue', (data) => {
        const { userId } = data;
        const user = users[userId];
        
        if (leagueQueue.some(p => p.id === userId)) {
            return socket.emit('message', { text: "شما در حال حاضر در صف انتظار لیگ هستید.", type: "warning" });
        }
        
        // خروج از بازی سریع فعال (اگر وجود داشت)
        socket.emit('leave_game_room', { userId });

        const player = { id: userId, name: user.name, socketId: user.socketId };
        leagueQueue.push(player);
        
        // به‌روزرسانی وضعیت صف برای همه
        const leagueStateForClient = { players: leagueQueue.map(p => ({ id: p.id, name: p.name })) };
        io.emit('league_status_update', leagueStateForClient);
        
        socket.emit('message', { text: "شما به صف انتظار لیگ پیوستید. منتظر شروع مسابقه باشید.", type: "success" });
        
        // بررسی شروع مسابقه
        if (leagueQueue.length >= REQUIRED_LEAGUE_PLAYERS) {
            startLeagueMatch();
        }
    });

    socket.on('leave_league_queue', (data) => {
        const { userId } = data;
        const initialLength = leagueQueue.length;
        leagueQueue = leagueQueue.filter(p => p.id !== userId);
        
        if (leagueQueue.length < initialLength) {
            const leagueStateForClient = { players: leagueQueue.map(p => ({ id: p.id, name: p.name })) };
            io.emit('league_status_update', leagueStateForClient);
            socket.emit('message', { text: "شما از صف انتظار لیگ خارج شدید.", type: "info" });
        }
    });

    // --- 5.5. رویدادهای حدس زدن و راهنمایی (مشترک) ---

    socket.on('submit_guess', (data) => {
        const { userId, gameCode, letter, isLeague } = data;
        
        let game, playerWordData, player, room;

        if (isLeague) {
            game = leagueMatches[gameCode];
            player = game?.players.find(p => p.id === userId);
            if (!game || game.status !== 'playing' || !player || player.isFinished) return;
            playerWordData = player.currentWordData;
            room = gameCode;
        } else {
            game = quickGames[gameCode];
            player = game?.players.find(p => p.id === userId && p.role === 'guesser');
            if (!game || game.status !== 'playing' || !player) return socket.emit('message', { text: "شما حدس‌زننده این بازی نیستید.", type: "error" });
            playerWordData = game; // در حالت سریع، اطلاعات کلمه در آبجکت اصلی بازی است
            room = gameCode;
        }
        
        if (playerWordData.guessedLetters.includes(letter)) {
             return socket.emit('message', { text: "این حرف قبلاً حدس زده شده است.", type: "warning" });
        }

        if (playerWordData.isSolved || playerWordData.guessesLeft <= 0) {
             return socket.emit('message', { text: "بازی/کلمه شما به پایان رسیده است.", type: "error" });
        }
        
        playerWordData.guessedLetters.push(letter);
        let found = false;
        let positions = [];

        for (let i = 0; i < playerWordData.word.length; i++) {
            if (playerWordData.word[i] === letter) {
                found = true;
                positions.push(i);
            }
        }
        
        if (found) {
            playerWordData.revealedLetters[letter] = playerWordData.revealedLetters[letter] || [];
            positions.forEach(pos => {
                if (!playerWordData.revealedLetters[letter].includes(pos)) {
                    playerWordData.revealedLetters[letter].push(pos);
                }
            });
            
            // بررسی حل شدن کلمه
            let revealedCount = Object.values(playerWordData.revealedLetters).flat().length;
            if (revealedCount === playerWordData.wordLength) {
                playerWordData.isSolved = true;
                
                const wordScore = playerWordData.guessesLeft * GUESS_SCORE_PER_REMAINING;
                
                if (isLeague) {
                    moveToNextWordOrFinish(game, player, room, wordScore);
                    return;
                } else {
                    // بازی سریع - برنده
                    game.status = 'finished';
                    updateGlobalScore(userId, wordScore); // به امتیاز کلی اضافه می‌شود
                    io.to(room).emit('game_finished', { isLeague: false, winnerId: userId, word: game.word });
                    delete quickGames[gameCode];
                    return;
                }
            }
        } else {
            // حدس اشتباه
            playerWordData.guessesLeft--;
            playerWordData.incorrectGuesses++;
        }
        
        // بررسی باخت
        if (playerWordData.guessesLeft <= 0) {
            playerWordData.isSolved = false;
            
            if (isLeague) {
                // در لیگ، باخت در یک کلمه، امتیاز صفر و حرکت به کلمه بعدی
                moveToNextWordOrFinish(game, player, room, 0);
                return;
            } else {
                // بازی سریع - باخت
                game.status = 'finished';
                const creatorId = game.players.find(p => p.role === 'creator').id;
                io.to(room).emit('game_finished', { isLeague: false, winnerId: creatorId, word: game.word });
                delete quickGames[gameCode];
                return;
            }
        }
        
        // به‌روزرسانی وضعیت UI
        if (isLeague) {
            io.to(room).emit('league_game_update', game);
        } else {
            io.to(room).emit('game_update', game);
        }
    });

    socket.on('request_hint', (data) => {
        const { userId, gameCode, letterPosition, isLeague } = data;
        
        let game, playerWordData, player, room;

        if (isLeague) {
            game = leagueMatches[gameCode];
            player = game?.players.find(p => p.id === userId);
            if (!game || game.status !== 'playing' || !player || player.isFinished) return;
            playerWordData = player.currentWordData;
            room = gameCode;
        } else {
            game = quickGames[gameCode];
            player = game?.players.find(p => p.id === userId && p.role === 'guesser');
            if (!game || game.status !== 'playing' || !player) return socket.emit('message', { text: "شما حدس‌زننده این بازی نیستید.", type: "error" });
            playerWordData = game;
            room = gameCode;
        }
        
        // چک کردن امتیاز (فقط برای لیگ)
        if (isLeague && player.score < HINT_COST) {
             return socket.emit('message', { text: `امتیاز شما برای خرید راهنمایی کافی نیست. (نیاز به ${HINT_COST} امتیاز)`, type: "error" });
        }

        const letter = playerWordData.word[letterPosition];
        const isAlreadyRevealed = playerWordData.guessedLetters.includes(letter);
        if (isAlreadyRevealed) {
             return socket.emit('message', { text: "این موقعیت قبلاً آشکار شده است.", type: "warning" });
        }

        // اعمال هزینه و آشکارسازی
        if (isLeague) {
            player.score -= HINT_PENALTY_SCORE; 
            updateGlobalScore(userId, -HINT_PENALTY_SCORE); 
            socket.emit('message', { text: `راهنمایی: ${HINT_PENALTY_SCORE} امتیاز از شما کسر شد.`, type: "warning" });
        }

        playerWordData.guessedLetters.push(letter);
        playerWordData.revealedLetters[letter] = playerWordData.revealedLetters[letter] || [];
        
        // پیدا کردن تمام تکرارهای حرف
        for (let i = 0; i < playerWordData.word.length; i++) {
             if (playerWordData.word[i] === letter) {
                if (!playerWordData.revealedLetters[letter].includes(i)) {
                    playerWordData.revealedLetters[letter].push(i);
                }
             }
        }
        
        // بررسی حل شدن بعد از راهنمایی
        let revealedCount = Object.values(playerWordData.revealedLetters).flat().length;
        if (revealedCount === playerWordData.wordLength) {
            playerWordData.isSolved = true;
            
            if (isLeague) {
                // اگر با راهنمایی حل شد، امتیاز کلمه صفر است (به جز هزینه کسر شده قبلی)
                moveToNextWordOrFinish(game, player, room, 0); 
                return;
            } else {
                // بازی سریع - حل شد
                game.status = 'finished';
                io.to(room).emit('game_finished', { isLeague: false, winnerId: userId, word: game.word });
                delete quickGames[gameCode];
                return;
            }
        }

        // به‌روزرسانی وضعیت UI
        if (isLeague) {
            io.to(room).emit('league_game_update', game);
        } else {
            io.to(room).emit('game_update', game);
        }
    });
    
    // --- 5.6. رویدادهای درخواست لیدربورد ---
    
    socket.on('request_leaderboard', () => {
        socket.emit('leaderboard_update', globalLeaderboard);
    });
    
    socket.on('request_league_leaderboard', () => {
         socket.emit('league_leaderboard_update', leagueLeaderboard);
    });

});

// --- 6. شروع سرور ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Wordly Game Server is running on port ${PORT}`);
    console.log(`==============================================`);
    console.log(`[STATUS] Required League Players: ${REQUIRED_LEAGUE_PLAYERS}`);
    console.log(`[STATUS] League Words Count: ${LEAGUE_WORDS_COUNT}`);
    
    // مقادیر اولیه برای تست
    users['u1'] = { id: 'u1', name: 'جیمز', score: 1500, socketId: null };
    users['u2'] = { id: 'u2', name: 'سارا', score: 1200, socketId: null };
    users['u3'] = { id: 'u3', name: 'میلاد', score: 900, socketId: null };
    updateGlobalScore('u1', 0); // بارگذاری لیدربورد اولیه
});
