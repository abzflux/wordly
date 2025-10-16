// --- تنظیمات و متغیرهای سرور ---
const SERVER_URL = 'https://wordlybot.ct.ws';
let socket = null;
let currentUser = null;
let currentGame = null;
let currentLeague = null;

// --- راه‌اندازی Telegram Web App ---
let tg = null;
try {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.enableClosingConfirmation();
} catch (error) {
    console.warn('Telegram Web App API در دسترس نیست. حالت توسعه فعال شد.');
}

// --- راه‌اندازی Socket.io ---
function initializeSocket() {
    socket = io(SERVER_URL, {
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('✅ متصل به سرور شد.');
        showScreen('mainMenu');
    });

    socket.on('disconnect', () => {
        console.log('❌ اتصال به سرور قطع شد.');
        showNotification('اتصال به سرور قطع شد. در حال تلاش برای اتصال مجدد...', 'error');
    });

    socket.on('connect_error', (error) => {
        console.error('❌ خطای اتصال:', error);
        showNotification('خطا در اتصال به سرور', 'error');
    });

    // --- مدیریت رویدادهای بازی ---
    socket.on('game_created', (data) => {
        showNotification(`بازی با کد ${data.code} ایجاد شد!`, 'success');
        currentGame = { code: data.code, role: 'creator' };
        showScreen('gameLobby');
    });

    socket.on('game_joined', (data) => {
        showNotification(`به بازی ${data.code} پیوستید!`, 'success');
        currentGame = { code: data.code, role: 'guesser' };
        showScreen('gameLobby');
    });

    socket.on('game_update', (gameState) => {
        updateGameDisplay(gameState);
    });

    socket.on('game_finished', (data) => {
        showNotification(`بازی پایان یافت! برنده: ${data.winnerName} - امتیاز: ${data.points}`, 'success');
        currentGame = null;
        setTimeout(() => showScreen('mainMenu'), 3000);
    });

    socket.on('game_error', (data) => {
        showNotification(data.message, 'error');
    });

    socket.on('message', (data) => {
        showGameMessage(data.text, data.type);
    });

    socket.on('waiting_games_list', (games) => {
        displayWaitingGames(games);
    });

    // --- مدیریت رویدادهای لیگ ---
    socket.on('league_created', (data) => {
        showNotification(`لیگ با کد ${data.code} ایجاد شد!`, 'success');
        currentLeague = { code: data.code };
        showScreen('leagueLobby');
    });

    socket.on('league_joined', (data) => {
        showNotification(`به لیگ ${data.code} پیوستید!`, 'success');
        currentLeague = { code: data.code };
        showScreen('leagueLobby');
    });

    socket.on('leagueStatus', (leagueState) => {
        updateLeagueDisplay(leagueState);
    });

    socket.on('leagueStarted', (data) => {
        showNotification('لیگ شروع شد! آماده باشید...', 'success');
    });

    socket.on('leagueWordStarted', (data) => {
        showNotification(`کلمه ${data.currentWordNumber} از ${data.totalWords} شروع شد!`, 'info');
    });

    socket.on('leagueEnded', (data) => {
        showNotification(`لیگ به پایان رسید! برنده: ${data.winner?.name || 'نامشخص'}`, 'success');
        currentLeague = null;
        setTimeout(() => showScreen('mainMenu'), 5000);
    });

    socket.on('league_message', (data) => {
        showGameMessage(data.text, data.type);
    });

    socket.on('league_error', (data) => {
        showNotification(data.message, 'error');
    });

    // --- مدیریت رویدادهای کاربر ---
    socket.on('login_success', (data) => {
        currentUser = data;
        showNotification(`خوش آمدید ${data.name}!`, 'success');
        showScreen('mainMenu');
    });

    socket.on('login_error', (data) => {
        showNotification(data.message, 'error');
    });

    socket.on('leaderboard_update', (data) => {
        updateLeaderboard(data);
    });
}

// --- توابع کمکی نمایش ---
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // پاکسازی محتوای داینامیک
    if (screenId === 'mainMenu') {
        document.getElementById('waitingGamesList').innerHTML = '';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function showGameMessage(message, type = 'info') {
    const messagesContainer = document.getElementById('gameMessages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `game-message ${type}`;
    messageElement.textContent = message;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- مدیریت کاربر و ورود ---
function initializeUser() {
    try {
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const tgUser = tg.initDataUnsafe.user;
            const userId = tgUser.id.toString();
            const name = tgUser.first_name || 'کاربر';
            
            socket.emit('user_login', { userId, name });
        } else {
            // حالت توسعه
            const devUserId = 'dev_' + Math.random().toString(36).substr(2, 9);
            const devName = 'تست کاربر';
            
            socket.emit('user_login', { userId: devUserId, name: devName });
        }
    } catch (error) {
        console.error('خطای راه‌اندازی کاربر:', error);
        showNotification('خطا در راه‌اندازی کاربر', 'error');
    }
}

// --- مدیریت بازی ---
function createGame() {
    const wordInput = document.getElementById('gameWord');
    const categoryInput = document.getElementById('gameCategory');
    
    const word = wordInput.value.trim();
    const category = categoryInput.value.trim();
    
    if (!word || !category) {
        showNotification('لطفا کلمه و دسته‌بندی را وارد کنید.', 'error');
        return;
    }
    
    // اعتبارسنجی کلمه - اجازه فاصله در کلمه
    if (!/^[\u0600-\u06FF\s]+$/.test(word) || word.replace(/\s/g, '').length < 3) {
        showNotification('کلمه وارد شده نامعتبر است. فقط حروف فارسی و فاصله مجاز است و حداقل باید ۳ حرف داشته باشد.', 'error');
        return;
    }
    
    socket.emit('create_game', { 
        userId: currentUser.userId, 
        word: word, 
        category: category 
    });
    
    // پاکسازی فرم
    wordInput.value = '';
    categoryInput.value = '';
}

function joinGame(gameCode) {
    if (!gameCode) {
        showNotification('لطفا کد بازی را وارد کنید.', 'error');
        return;
    }
    
    socket.emit('join_game', { 
        userId: currentUser.userId, 
        gameCode: gameCode.toUpperCase() 
    });
}

function listWaitingGames() {
    socket.emit('list_waiting_games');
}

function displayWaitingGames(games) {
    const container = document.getElementById('waitingGamesList');
    container.innerHTML = '';
    
    if (games.length === 0) {
        container.innerHTML = '<p class="no-games">هیچ بازی در انتظاری وجود ندارد.</p>';
        return;
    }
    
    games.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'waiting-game';
        gameElement.innerHTML = `
            <div class="game-info">
                <strong>کد: ${game.code}</strong>
                <span>سازنده: ${game.creatorName}</span>
                <span>دسته: ${game.category}</span>
                <span>طول کلمه: ${game.wordLength}</span>
            </div>
            <button onclick="joinGame('${game.code}')">پیوستن</button>
        `;
        container.appendChild(gameElement);
    });
}

function updateGameDisplay(gameState) {
    // به‌روزرسانی اطلاعات بازی
    document.getElementById('gameCodeDisplay').textContent = gameState.code;
    document.getElementById('gameCategoryDisplay').textContent = gameState.category;
    document.getElementById('gameStatusDisplay').textContent = getStatusText(gameState.status);
    document.getElementById('guessesLeftDisplay').textContent = gameState.guessesLeft;
    
    // نمایش کلمه با فاصله‌ها
    displayWordWithSpaces(gameState.word, gameState.revealedLetters);
    
    // نمایش حروف حدس زده شده
    displayGuessedLetters(gameState.guessedLetters);
    
    // نمایش اطلاعات بازیکنان
    updatePlayersDisplay(gameState.creator, gameState.guesser);
    
    // فعال/غیرفعال کردن دکمه‌ها بر اساس نقش کاربر
    const guessInput = document.getElementById('guessInput');
    const submitGuessBtn = document.getElementById('submitGuessBtn');
    const hintBtn = document.getElementById('hintBtn');
    
    if (currentGame.role === 'guesser' && gameState.status === 'in_progress') {
        guessInput.disabled = false;
        submitGuessBtn.disabled = false;
        hintBtn.disabled = false;
    } else {
        guessInput.disabled = true;
        submitGuessBtn.disabled = true;
        hintBtn.disabled = true;
    }
}

function displayWordWithSpaces(word, revealedLetters) {
    const wordContainer = document.getElementById('wordDisplay');
    wordContainer.innerHTML = '';
    
    for (let i = 0; i < word.length; i++) {
        const letter = word[i];
        const letterElement = document.createElement('span');
        letterElement.className = 'letter';
        
        // بررسی اینکه آیا حرف فاصله است
        if (letter === ' ') {
            letterElement.classList.add('space-box');
            letterElement.innerHTML = '&nbsp;';
        } else {
            // بررسی اینکه آیا حرف باید نمایش داده شود
            const isRevealed = Object.values(revealedLetters).flat().includes(i);
            
            if (isRevealed) {
                letterElement.textContent = letter;
                letterElement.classList.add('revealed');
            } else {
                letterElement.textContent = '_';
                letterElement.classList.add('hidden');
            }
        }
        
        wordContainer.appendChild(letterElement);
    }
}

function displayGuessedLetters(guessedLetters) {
    const container = document.getElementById('guessedLetters');
    container.innerHTML = '';
    
    if (guessedLetters && guessedLetters.length > 0) {
        container.textContent = `حروف حدس زده شده: ${guessedLetters.join(', ')}`;
    } else {
        container.textContent = 'هنوز حرفی حدس زده نشده است.';
    }
}

function updatePlayersDisplay(creator, guesser) {
    document.getElementById('creatorName').textContent = creator.name;
    document.getElementById('creatorScore').textContent = creator.score;
    
    if (guesser) {
        document.getElementById('guesserName').textContent = guesser.name;
        document.getElementById('guesserScore').textContent = guesser.score;
        document.getElementById('guesserInfo').style.display = 'block';
    } else {
        document.getElementById('guesserInfo').style.display = 'none';
    }
}

function submitGuess() {
    const guessInput = document.getElementById('guessInput');
    const letter = guessInput.value.trim();
    
    if (!letter || letter.length !== 1) {
        showNotification('لطفا فقط یک حرف فارسی وارد کنید.', 'error');
        return;
    }
    
    socket.emit('submit_guess', {
        userId: currentUser.userId,
        gameCode: currentGame.code,
        letter: letter
    });
    
    guessInput.value = '';
}

function requestHint() {
    const position = prompt('موقعیت حرف مورد نظر برای راهنمایی را وارد کنید (شماره از 1 شروع می‌شود):');
    
    if (position && !isNaN(position)) {
        const positionIndex = parseInt(position) - 1;
        
        socket.emit('request_hint', {
            userId: currentUser.userId,
            gameCode: currentGame.code,
            letterPosition: positionIndex
        });
    }
}

// --- مدیریت لیگ ---
function createLeague() {
    socket.emit('create_league', { userId: currentUser.userId });
}

function joinLeague() {
    const leagueCodeInput = document.getElementById('leagueCodeInput');
    const leagueCode = leagueCodeInput.value.trim();
    
    if (!leagueCode) {
        showNotification('لطفا کد لیگ را وارد کنید.', 'error');
        return;
    }
    
    socket.emit('join_league', { 
        userId: currentUser.userId, 
        leagueCode: leagueCode.toUpperCase() 
    });
    
    leagueCodeInput.value = '';
}

function startLeague() {
    if (!currentLeague) return;
    
    socket.emit('start_league', { 
        userId: currentUser.userId, 
        leagueCode: currentLeague.code 
    });
}

function updateLeagueDisplay(leagueState) {
    // به‌روزرسانی اطلاعات کلی لیگ
    document.getElementById('leagueCodeDisplay').textContent = leagueState.code;
    document.getElementById('leagueStatusDisplay').textContent = getLeagueStatusText(leagueState.status);
    document.getElementById('currentWordNumber').textContent = leagueState.currentWordNumber;
    document.getElementById('totalWords').textContent = leagueState.totalWords;
    document.getElementById('playerCount').textContent = leagueState.playerCount;
    
    // نمایش کلمه فعلی (اگر در حال بازی باشد)
    if (leagueState.status === 'in_progress' && leagueState.currentWord) {
        displayLeagueWord(leagueState.currentWord, leagueState.currentCategory);
    } else {
        document.getElementById('leagueWordDisplay').innerHTML = '';
        document.getElementById('leagueCategoryDisplay').textContent = '-';
    }
    
    // نمایش جدول بازیکنان
    displayLeaguePlayers(leagueState.players);
    
    // فعال/غیرفعال کردن دکمه شروع
    const startLeagueBtn = document.getElementById('startLeagueBtn');
    if (leagueState.status === 'waiting') {
        startLeagueBtn.style.display = 'block';
    } else {
        startLeagueBtn.style.display = 'none';
    }
    
    // فعال/غیرفعال کردن ورودی حدس
    const leagueGuessInput = document.getElementById('leagueGuessInput');
    const submitLeagueGuessBtn = document.getElementById('submitLeagueGuessBtn');
    
    if (leagueState.status === 'in_progress') {
        leagueGuessInput.disabled = false;
        submitLeagueGuessBtn.disabled = false;
    } else {
        leagueGuessInput.disabled = true;
        submitLeagueGuessBtn.disabled = true;
    }
}

function displayLeagueWord(word, category) {
    const wordContainer = document.getElementById('leagueWordDisplay');
    const categoryContainer = document.getElementById('leagueCategoryDisplay');
    
    categoryContainer.textContent = category || '-';
    wordContainer.innerHTML = '';
    
    // نمایش کلمه لیگ با فاصله‌ها
    for (let i = 0; i < word.length; i++) {
        const letter = word[i];
        const letterElement = document.createElement('span');
        letterElement.className = 'letter';
        
        if (letter === ' ') {
            letterElement.classList.add('space-box');
            letterElement.innerHTML = '&nbsp;';
        } else {
            letterElement.textContent = '_';
            letterElement.classList.add('hidden');
        }
        
        wordContainer.appendChild(letterElement);
    }
}

function displayLeaguePlayers(players) {
    const container = document.getElementById('leaguePlayersList');
    container.innerHTML = '';
    
    if (!players || players.length === 0) {
        container.innerHTML = '<p class="no-players">هیچ بازیکنی در لیگ وجود ندارد.</p>';
        return;
    }
    
    players.forEach((player, index) => {
        const playerElement = document.createElement('div');
        playerElement.className = 'league-player';
        
        if (index === 0) {
            playerElement.classList.add('leader');
        }
        
        playerElement.innerHTML = `
            <div class="player-rank">${index + 1}</div>
            <div class="player-name">${player.name}</div>
            <div class="player-score">${player.score} امتیاز</div>
            <div class="player-stats">
                ${player.correct_words} کلمه | ${Math.floor(player.total_time / 60)}:${(player.total_time % 60).toString().padStart(2, '0')}
            </div>
        `;
        
        container.appendChild(playerElement);
    });
}

function submitLeagueGuess() {
    const guessInput = document.getElementById('leagueGuessInput');
    const letter = guessInput.value.trim();
    
    if (!letter || letter.length !== 1) {
        showNotification('لطفا فقط یک حرف فارسی وارد کنید.', 'error');
        return;
    }
    
    socket.emit('submit_league_guess', {
        userId: currentUser.userId,
        leagueCode: currentLeague.code,
        letter: letter
    });
    
    guessInput.value = '';
}

// --- توابع کمکی ---
function getStatusText(status) {
    const statusMap = {
        'waiting': 'در انتظار بازیکن',
        'in_progress': 'در حال بازی',
        'finished': 'پایان یافته',
        'cancelled': 'لغو شده'
    };
    return statusMap[status] || status;
}

function getLeagueStatusText(status) {
    const statusMap = {
        'waiting': 'در انتظار بازیکنان',
        'starting': 'در حال شروع',
        'in_progress': 'در حال بازی',
        'ended': 'پایان یافته'
    };
    return statusMap[status] || status;
}

function updateLeaderboard(players) {
    const container = document.getElementById('leaderboardList');
    container.innerHTML = '';
    
    if (!players || players.length === 0) {
        container.innerHTML = '<p class="no-data">هنوز امتیازی ثبت نشده است.</p>';
        return;
    }
    
    players.forEach((player, index) => {
        const playerElement = document.createElement('div');
        playerElement.className = 'leaderboard-player';
        
        if (index < 3) {
            playerElement.classList.add(`top-${index + 1}`);
        }
        
        playerElement.innerHTML = `
            <div class="rank">${index + 1}</div>
            <div class="name">${player.name}</div>
            <div class="score">${player.score}</div>
        `;
        
        container.appendChild(playerElement);
    });
}

// --- راه‌اندازی اولیه ---
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    initializeUser();
    
    // تنظیم event listeners
    document.getElementById('createGameBtn').addEventListener('click', () => showScreen('createGame'));
    document.getElementById('joinGameBtn').addEventListener('click', () => showScreen('joinGame'));
    document.getElementById('listGamesBtn').addEventListener('click', () => {
        showScreen('waitingGames');
        listWaitingGames();
    });
    document.getElementById('createLeagueBtn').addEventListener('click', () => showScreen('createLeague'));
    document.getElementById('joinLeagueBtn').addEventListener('click', () => showScreen('joinLeague'));
    document.getElementById('leaderboardBtn').addEventListener('click', () => {
        showScreen('leaderboard');
        socket.emit('get_leaderboard');
    });
    
    // فرم‌های ایجاد بازی
    document.getElementById('submitCreateGame').addEventListener('click', createGame);
    document.getElementById('submitJoinGame').addEventListener('click', () => {
        const gameCode = document.getElementById('gameCodeInput').value.trim();
        joinGame(gameCode);
    });
    
    // فرم‌های لیگ
    document.getElementById('submitCreateLeague').addEventListener('click', createLeague);
    document.getElementById('submitJoinLeague').addEventListener('click', joinLeague);
    document.getElementById('startLeagueBtn').addEventListener('click', startLeague);
    
    // مدیریت بازی
    document.getElementById('submitGuessBtn').addEventListener('click', submitGuess);
    document.getElementById('hintBtn').addEventListener('click', requestHint);
    document.getElementById('leagueGuessInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') submitLeagueGuess();
    });
    document.getElementById('guessInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') submitGuess();
    });
    
    // دکمه‌های بازگشت
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', () => showScreen('mainMenu'));
    });
});

// --- استایل‌های CSS ---
const styles = `
/* استایل‌های پایه */
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: 'Tahoma', 'Arial', sans-serif;
}

body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #333;
    line-height: 1.6;
    min-height: 100vh;
    padding: 10px;
}

.container {
    max-width: 400px;
    margin: 0 auto;
    background: white;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    overflow: hidden;
}

.screen {
    display: none;
    padding: 20px;
    min-height: 500px;
}

.screen.active {
    display: block;
}

/* هدر */
.header {
    text-align: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid #f0f0f0;
}

.header h1 {
    color: #4a5568;
    font-size: 1.5rem;
    margin-bottom: 5px;
}

.header p {
    color: #718096;
    font-size: 0.9rem;
}

/* دکمه‌ها */
.btn {
    display: block;
    width: 100%;
    padding: 12px 20px;
    margin: 10px 0;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    font-size: 1rem;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    text-align: center;
}

.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}

.btn:disabled {
    background: #a0aec0;
    cursor: not-allowed;
    transform: none;
}

.btn-secondary {
    background: #e2e8f0;
    color: #4a5568;
}

.btn-success {
    background: linear-gradient(135deg, #48bb78, #38a169);
}

.btn-danger {
    background: linear-gradient(135deg, #f56565, #e53e3e);
}

/* فرم‌ها */
.form-group {
    margin-bottom: 15px;
}

.form-group label {
    display: block;
    margin-bottom: 5px;
    color: #4a5568;
    font-weight: bold;
}

.form-control {
    width: 100%;
    padding: 12px;
    border: 2px solid #e2e8f0;
    border-radius: 10px;
    font-size: 1rem;
    transition: border-color 0.3s ease;
}

.form-control:focus {
    outline: none;
    border-color: #667eea;
}

/* نمایش کلمه */
.word-display {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 5px;
    margin: 20px 0;
    padding: 15px;
    background: #f7fafc;
    border-radius: 10px;
}

.letter {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 35px;
    height: 45px;
    font-size: 1.2rem;
    font-weight: bold;
    border-bottom: 3px solid #667eea;
    margin: 0 2px;
}

.letter.revealed {
    color: #2d3748;
}

.letter.hidden {
    color: #a0aec0;
}

.space-box {
    border-bottom: none;
    width: 20px;
    background: transparent;
}

/* پیام‌ها و نوتیفیکیشن‌ها */
.notification {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 20px;
    border-radius: 10px;
    color: white;
    font-weight: bold;
    z-index: 1000;
    max-width: 90%;
    text-align: center;
}

.notification.success {
    background: linear-gradient(135deg, #48bb78, #38a169);
}

.notification.error {
    background: linear-gradient(135deg, #f56565, #e53e3e);
}

.notification.info {
    background: linear-gradient(135deg, #4299e1, #3182ce);
}

.notification.warning {
    background: linear-gradient(135deg, #ed8936, #dd6b20);
}

.game-messages {
    max-height: 150px;
    overflow-y: auto;
    margin: 15px 0;
    padding: 10px;
    background: #f7fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
}

.game-message {
    padding: 8px 12px;
    margin: 5px 0;
    border-radius: 8px;
    font-size: 0.9rem;
}

.game-message.success {
    background: #c6f6d5;
    color: #22543d;
    border-right: 4px solid #48bb78;
}

.game-message.error {
    background: #fed7d7;
    color: #742a2a;
    border-right: 4px solid #f56565;
}

.game-message.info {
    background: #bee3f8;
    color: #1a365d;
    border-right: 4px solid #4299e1;
}

.game-message.warning {
    background: #feebc8;
    color: #744210;
    border-right: 4px solid #ed8936;
}

/* لیست بازی‌ها و بازیکنان */
.waiting-games-list,
.league-players-list {
    margin: 15px 0;
}

.waiting-game,
.league-player {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    margin: 8px 0;
    background: #f7fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
}

.waiting-game .game-info {
    flex: 1;
}

.waiting-game .game-info span {
    display: block;
    font-size: 0.8rem;
    color: #718096;
    margin-top: 2px;
}

.league-player {
    flex-direction: column;
    align-items: flex-start;
    position: relative;
}

.league-player.leader {
    background: linear-gradient(135deg, #fef5e7, #fed7d7);
    border-color: #ed8936;
}

.player-rank {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #667eea;
    color: white;
    width: 25px;
    height: 25px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: bold;
}

.league-player.leader .player-rank {
    background: #ed8936;
}

.player-name {
    font-weight: bold;
    margin-bottom: 5px;
}

.player-score {
    font-size: 1.1rem;
    font-weight: bold;
    color: #667eea;
}

.player-stats {
    font-size: 0.8rem;
    color: #718096;
    margin-top: 3px;
}

/* جدول رتبه‌بندی */
.leaderboard-player {
    display: flex;
    align-items: center;
    padding: 12px;
    margin: 8px 0;
    background: #f7fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
}

.leaderboard-player.top-1 {
    background: linear-gradient(135deg, #fef5e7, #fed7d7);
    border-color: #ed8936;
}

.leaderboard-player.top-2 {
    background: linear-gradient(135deg, #f0f4ff, #e6fffa);
    border-color: #4299e1;
}

.leaderboard-player.top-3 {
    background: linear-gradient(135deg, #f0fff4, #e6fffa);
    border-color: #48bb78;
}

.rank {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: #667eea;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    margin-left: 10px;
}

.leaderboard-player.top-1 .rank {
    background: #ed8936;
}

.leaderboard-player.top-2 .rank {
    background: #4299e1;
}

.leaderboard-player.top-3 .rank {
    background: #48bb78;
}

.name {
    flex: 1;
    font-weight: bold;
}

.score {
    font-weight: bold;
    color: #667eea;
}

/* اطلاعات بازی */
.game-info,
.league-info {
    background: #f7fafc;
    padding: 15px;
    border-radius: 10px;
    margin: 15px 0;
    border: 1px solid #e2e8f0;
}

.info-row {
    display: flex;
    justify-content: space-between;
    margin: 8px 0;
    padding: 5px 0;
    border-bottom: 1px solid #e2e8f0;
}

.info-row:last-child {
    border-bottom: none;
}

.info-label {
    color: #718096;
    font-weight: bold;
}

.info-value {
    color: #2d3748;
    font-weight: bold;
}

/* حالت‌های پاسخگو */
@media (max-width: 480px) {
    .container {
        margin: 5px;
        border-radius: 10px;
    }
    
    .screen {
        padding: 15px;
    }
    
    .letter {
        width: 30px;
        height: 40px;
        font-size: 1rem;
    }
    
    .btn {
        padding: 10px 15px;
        font-size: 0.9rem;
    }
}

/* انیمیشن‌ها */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

.screen.active {
    animation: fadeIn 0.3s ease;
}

.letter.revealed {
    animation: bounceIn 0.5s ease;
}

@keyframes bounceIn {
    0% { transform: scale(0.8); opacity: 0; }
    50% { transform: scale(1.1); }
    100% { transform: scale(1); opacity: 1; }
}
`;

// تزریق استایل‌ها به صفحه
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);
