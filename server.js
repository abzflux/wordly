<?php
// wordGame.php
header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>بازی حدس کلمه - حالت دو نفره</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        :root {
            --primary: #667eea;
            --primary-dark: #5a6fd8;
            --secondary: #764ba2;
            --success: #10b981;
            --danger: #ef4444;
            --warning: #f59e0b;
            --dark: #1f2937;
            --light: #f8fafc;
            --gray: #6b7280;
        }

        body {
            background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
            min-height: 100vh;
            padding: 20px;
            color: var(--dark);
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .game-container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            min-height: 80vh;
        }

        .header {
            background: linear-gradient(135deg, var(--primary), var(--secondary));
            color: white;
            padding: 30px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
            background-size: 20px 20px;
            animation: float 20s linear infinite;
        }

        @keyframes float {
            0% { transform: translate(0, 0) rotate(0deg); }
            100% { transform: translate(-20px, -20px) rotate(360deg); }
        }

        .game-title {
            font-size: 2.5em;
            font-weight: 700;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }

        .game-subtitle {
            font-size: 1.2em;
            opacity: 0.9;
            font-weight: 300;
        }

        .content {
            padding: 40px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            min-height: 500px;
        }

        @media (max-width: 768px) {
            .content {
                grid-template-columns: 1fr;
                padding: 20px;
            }
        }

        .panel {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .panel-title {
            font-size: 1.5em;
            font-weight: 600;
            margin-bottom: 20px;
            color: var(--primary);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .panel-title i {
            font-size: 1.2em;
        }

        .word-display {
            background: linear-gradient(135deg, #f0f4ff, #e6f7ff);
            border-radius: 15px;
            padding: 30px;
            text-align: center;
            margin-bottom: 25px;
            border: 2px dashed var(--primary);
        }

        .word-letters {
            display: flex;
            justify-content: center;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }

        .letter {
            width: 50px;
            height: 50px;
            background: white;
            border: 2px solid var(--primary);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5em;
            font-weight: bold;
            color: var(--dark);
            box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
        }

        .letter.revealed {
            background: var(--success);
            color: white;
            border-color: var(--success);
            transform: scale(1.1);
        }

        .letter.space {
            background: transparent;
            border: none;
            box-shadow: none;
        }

        .game-info {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 25px;
        }

        .info-item {
            background: var(--light);
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }

        .info-label {
            font-size: 0.9em;
            color: var(--gray);
            margin-bottom: 5px;
        }

        .info-value {
            font-size: 1.2em;
            font-weight: 600;
            color: var(--dark);
        }

        .guessed-letters {
            background: var(--light);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 25px;
        }

        .guessed-title {
            font-size: 1.1em;
            margin-bottom: 10px;
            color: var(--gray);
        }

        .letters-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .guessed-letter {
            background: white;
            border: 1px solid var(--gray);
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 0.9em;
            color: var(--dark);
        }

        .guessed-letter.correct {
            background: var(--success);
            color: white;
            border-color: var(--success);
        }

        .guessed-letter.incorrect {
            background: var(--danger);
            color: white;
            border-color: var(--danger);
        }

        .input-section {
            margin-top: 25px;
        }

        .guess-input {
            width: 100%;
            padding: 15px 20px;
            border: 2px solid #e5e7eb;
            border-radius: 12px;
            font-size: 1.1em;
            text-align: center;
            margin-bottom: 15px;
            transition: all 0.3s ease;
        }

        .guess-input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .btn {
            padding: 15px 30px;
            border: none;
            border-radius: 12px;
            font-size: 1.1em;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-dark);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        }

        .btn-success {
            background: var(--success);
            color: white;
        }

        .btn-danger {
            background: var(--danger);
            color: white;
        }

        .btn-warning {
            background: var(--warning);
            color: white;
        }

        .btn-full {
            width: 100%;
        }

        .hint-section {
            background: linear-gradient(135deg, #fff3cd, #ffeaa7);
            border: 1px solid #ffd43b;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
        }

        .hint-title {
            font-size: 1.1em;
            margin-bottom: 10px;
            color: #856404;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .players-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
        }

        .player-card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 2px solid transparent;
            transition: all 0.3s ease;
        }

        .player-card.active {
            border-color: var(--primary);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.2);
        }

        .player-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--primary);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5em;
            margin: 0 auto 10px;
        }

        .player-name {
            font-weight: 600;
            margin-bottom: 5px;
        }

        .player-role {
            font-size: 0.9em;
            color: var(--gray);
        }

        .chat-container {
            background: var(--light);
            border-radius: 12px;
            padding: 20px;
            max-height: 300px;
            overflow-y: auto;
        }

        .message {
            padding: 12px 15px;
            margin-bottom: 10px;
            border-radius: 10px;
            font-size: 0.95em;
        }

        .message.system {
            background: #e3f2fd;
            color: #1565c0;
            text-align: center;
        }

        .message.guess {
            background: white;
            border-left: 4px solid var(--primary);
        }

        .message.hint {
            background: #fff3e0;
            border-left: 4px solid var(--warning);
        }

        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid var(--primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .hidden {
            display: none !important;
        }

        .fade-in {
            animation: fadeIn 0.5s ease-in;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .pulse {
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
        }

        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 15px 25px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            border-left: 4px solid var(--success);
            z-index: 1000;
            transform: translateX(400px);
            transition: transform 0.3s ease;
        }

        .notification.show {
            transform: translateX(0);
        }

        .notification.error {
            border-left-color: var(--danger);
        }

        .game-phase {
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 10px;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="game-container">
            <div class="header">
                <h1 class="game-title">🎮 بازی حدس کلمه</h1>
                <p class="game-subtitle">حالت دو نفره آنلاین - تجربه‌ای جذاب و مدرن</p>
            </div>

            <div class="content">
                <!-- پنل سمت راست: وضعیت بازی -->
                <div class="panel">
                    <h2 class="panel-title">📊 وضعیت بازی</h2>
                    
                    <div id="gamePhase" class="game-phase">
                        در حال بارگذاری...
                    </div>

                    <div class="word-display">
                        <div class="word-letters" id="wordLetters">
                            <!-- حروف کلمه اینجا نمایش داده می‌شوند -->
                        </div>
                        <div class="game-info">
                            <div class="info-item">
                                <div class="info-label">دسته‌بندی</div>
                                <div class="info-value" id="categoryValue">-</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">تعداد حروف</div>
                                <div class="info-value" id="wordLengthValue">-</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">فرصت‌های باقی‌مانده</div>
                                <div class="info-value" id="attemptsLeftValue">۶</div>
                            </div>
                            <div class="info-item">
                                <div class="info-label">راهنمایی باقی‌مانده</div>
                                <div class="info-value" id="hintsLeftValue">۲</div>
                            </div>
                        </div>
                    </div>

                    <div class="guessed-letters">
                        <div class="guessed-title">حروف حدس زده شده:</div>
                        <div class="letters-container" id="guessedLettersContainer">
                            <!-- حروف حدس زده شده اینجا نمایش داده می‌شوند -->
                        </div>
                    </div>

                    <div class="players-section">
                        <div class="player-card" id="creatorCard">
                            <div class="player-avatar">👤</div>
                            <div class="player-name" id="creatorName">سازنده</div>
                            <div class="player-role">سازنده بازی</div>
                        </div>
                        <div class="player-card" id="opponentCard">
                            <div class="player-avatar">👤</div>
                            <div class="player-name" id="opponentName">بازیکن</div>
                            <div class="player-role">حدس‌زننده</div>
                        </div>
                    </div>
                </div>

                <!-- پنل سمت چپ: کنترل‌های بازی -->
                <div class="panel">
                    <h2 class="panel-title">🎯 کنترل بازی</h2>
                    
                    <!-- بخش ورودی حدس (برای بازیکن دوم) -->
                    <div id="guessSection" class="hidden">
                        <div class="input-section">
                            <input type="text" 
                                   id="guessInput" 
                                   class="guess-input" 
                                   placeholder="یک حرف فارسی یا انگلیسی وارد کنید..."
                                   maxlength="1">
                            <button onclick="submitGuess()" class="btn btn-primary btn-full">
                                💡 ارسال حدس
                            </button>
                        </div>

                        <div class="hint-section">
                            <div class="hint-title">
                                💡 سیستم راهنمایی
                            </div>
                            <button onclick="requestHint()" class="btn btn-warning btn-full" id="hintBtn">
                                درخواست راهنمایی (۲ باقی‌مانده)
                            </button>
                        </div>
                    </div>

                    <!-- بخش ورودی کلمه (برای سازنده) -->
                    <div id="wordInputSection" class="hidden">
                        <div class="input-section">
                            <input type="text" 
                                   id="wordInput" 
                                   class="guess-input" 
                                   placeholder="کلمه مخفی را وارد کنید (۳-۱۵ حرف)...">
                            <button onclick="submitWord()" class="btn btn-success btn-full">
                                ✅ ثبت کلمه مخفی
                            </button>
                        </div>
                    </div>

                    <!-- بخش انتخاب دسته‌بندی -->
                    <div id="categorySection" class="hidden">
                        <div style="text-align: center; margin-bottom: 20px;">
                            <p>لطفاً دسته‌بندی کلمه را انتخاب کنید:</p>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button onclick="selectCategory('میوه')" class="btn btn-primary">🍎 میوه</button>
                            <button onclick="selectCategory('حیوانات')" class="btn btn-primary">🐘 حیوانات</button>
                            <button onclick="selectCategory('شهرها')" class="btn btn-primary">🏙️ شهرها</button>
                            <button onclick="selectCategory('کشورها')" class="btn btn-primary">🌍 کشورها</button>
                            <button onclick="selectCategory('غذاها')" class="btn btn-primary">🍕 غذاها</button>
                            <button onclick="selectCategory('اشیا')" class="btn btn-primary">📦 اشیا</button>
                        </div>
                    </div>

                    <!-- بخش چت و رویدادها -->
                    <div style="margin-top: 30px;">
                        <h3 class="panel-title">💬 رویدادهای بازی</h3>
                        <div class="chat-container" id="gameChat">
                            <div class="message system">
                                🎮 به بازی دو نفره حدس کلمه خوش آمدید!
                            </div>
                        </div>
                    </div>

                    <!-- دکمه‌های کنترلی -->
                    <div style="margin-top: 20px; display: flex; gap: 10px;">
                        <button onclick="updateGameStatus()" class="btn btn-primary">
                            🔄 بروزرسانی وضعیت
                        </button>
                        <button onclick="leaveGame()" class="btn btn-danger">
                            🚪 خروج از بازی
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div id="notification" class="notification"></div>

    <script>
        // متغیرهای全局 بازی
        let gameState = {
            gameId: null,
            userId: null,
            userRole: null, // 'creator' یا 'opponent'
            gameData: null,
            connection: null
        };

        // تنظیمات WebSocket
        const WS_URL = 'wss://your-websocket-server.com/ws';
        
        // شبیه‌سازی WebSocket (در محیط واقعی باید با سرور واقعی جایگزین شود)
        function connectWebSocket() {
            console.log('🔗 در حال اتصال به سرور بازی...');
            
            // شبیه‌سازی اتصال بلادرنگ
            setInterval(updateGameState, 3000); // هر 3 ثانیه وضعیت بازی را بروزرسانی کن
            
            addChatMessage('system', '✅ به سرور بازی متصل شدید');
        }

        // بارگذاری اولیه بازی
        document.addEventListener('DOMContentLoaded', function() {
            initializeGame();
            connectWebSocket();
        });

        // مقداردهی اولیه بازی
        function initializeGame() {
            // دریافت اطلاعات از URL (شبیه‌سازی)
            const urlParams = new URLSearchParams(window.location.search);
            gameState.gameId = urlParams.get('gameId') || 'TEST123';
            gameState.userId = urlParams.get('userId') || Math.floor(Math.random() * 1000);
            gameState.userRole = urlParams.get('role') || 'opponent';
            
            // بارگذاری وضعیت اولیه بازی
            loadInitialGameState();
            
            // نمایش رابط کاربری مناسب بر اساس نقش کاربر
            setupUIForUserRole();
        }

        // بارگذاری وضعیت اولیه بازی
        function loadInitialGameState() {
            // شبیه‌سازی داده‌های بازی
            gameState.gameData = {
                gameId: gameState.gameId,
                creator: { id: 1, name: 'کاربر میزبان' },
                opponent: { id: 2, name: 'شما' },
                category: 'میوه',
                word: 'سیب',
                wordLength: 3,
                currentWordState: '___',
                attempts: 0,
                maxAttempts: 6,
                hintsUsed: 0,
                maxHints: 2,
                guessedLetters: [],
                status: 'active', // waiting, active, completed
                winner: null
            };

            updateGameDisplay();
        }

        // تنظیم رابط کاربری بر اساس نقش کاربر
        function setupUIForUserRole() {
            const guessSection = document.getElementById('guessSection');
            const wordInputSection = document.getElementById('wordInputSection');
            const categorySection = document.getElementById('categorySection');
            const gamePhase = document.getElementById('gamePhase');

            if (gameState.userRole === 'creator') {
                // کاربر سازنده است
                guessSection.classList.add('hidden');
                wordInputSection.classList.add('hidden');
                categorySection.classList.remove('hidden');
                gamePhase.textContent = '🎮 شما سازنده بازی هستید - لطفاً دسته‌بندی را انتخاب کنید';
                document.getElementById('creatorCard').classList.add('active');
            } else {
                // کاربر بازیکن دوم است
                guessSection.classList.add('hidden');
                wordInputSection.classList.add('hidden');
                categorySection.classList.add('hidden');
                gamePhase.textContent = '⏳ در انتظار انتخاب دسته‌بندی توسط سازنده...';
                document.getElementById('opponentCard').classList.add('active');
            }

            // به روزرسانی نام بازیکنان
            document.getElementById('creatorName').textContent = gameState.gameData.creator.name;
            document.getElementById('opponentName').textContent = gameState.gameData.opponent.name;
        }

        // انتخاب دسته‌بندی توسط سازنده
        function selectCategory(category) {
            showNotification(`✅ دسته‌بندی "${category}" انتخاب شد`);
            
            // شبیه‌سازی ارسال به سرور
            setTimeout(() => {
                document.getElementById('categorySection').classList.add('hidden');
                document.getElementById('wordInputSection').classList.remove('hidden');
                document.getElementById('gamePhase').textContent = '📝 لطفاً کلمه مخفی را وارد کنید';
                addChatMessage('system', `🗂️ سازنده دسته‌بندی "${category}" را انتخاب کرد`);
                
                // به‌روزرسانی نمایش دسته‌بندی
                document.getElementById('categoryValue').textContent = category;
                gameState.gameData.category = category;
            }, 1000);
        }

        // ثبت کلمه مخفی توسط سازنده
        function submitWord() {
            const wordInput = document.getElementById('wordInput');
            const word = wordInput.value.trim();
            
            if (word.length < 3 || word.length > 15) {
                showNotification('❌ کلمه باید بین ۳ تا ۱۵ حرف باشد', true);
                return;
            }

            if (!/^[آ-یa-z\s]+$/.test(word)) {
                showNotification('❌ کلمه باید شامل حروف فارسی، انگلیسی یا فاصله باشد', true);
                return;
            }

            showNotification('✅ کلمه مخفی با موفقیت ثبت شد');
            
            // شبیه‌سازی ارسال به سرور
            setTimeout(() => {
                document.getElementById('wordInputSection').classList.add('hidden');
                document.getElementById('gamePhase').textContent = '👀 در حال مشاهده حدس‌های بازیکن...';
                
                // به‌روزرسانی وضعیت بازی
                gameState.gameData.word = word;
                gameState.gameData.wordLength = word.length;
                gameState.gameData.currentWordState = '_'.repeat(word.length);
                
                updateGameDisplay();
                addChatMessage('system', `🔐 سازنده کلمه مخفی را ثبت کرد (${word.length} حرف)`);
                
                // برای بازیکن دوم بخش حدس را فعال کن
                if (gameState.userRole === 'opponent') {
                    activateGuessSection();
                }
            }, 1000);
        }

        // فعال کردن بخش حدس برای بازیکن دوم
        function activateGuessSection() {
            document.getElementById('guessSection').classList.remove('hidden');
            document.getElementById('gamePhase').textContent = '🎯 نوبت شما برای حدس زدن!';
            document.getElementById('guessInput').focus();
        }

        // ارسال حدس بازیکن دوم
        function submitGuess() {
            const guessInput = document.getElementById('guessInput');
            const guess = guessInput.value.trim().toLowerCase();
            
            if (guess.length !== 1 || !/^[آ-یa-z]$/.test(guess)) {
                showNotification('❌ لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید', true);
                return;
            }

            // بررسی تکراری نبودن حدس
            if (gameState.gameData.guessedLetters.includes(guess)) {
                showNotification('❌ این حرف قبلاً حدس زده شده است', true);
                return;
            }

            // شبیه‌سازی پردازش حدس
            processGuess(guess);
            
            // پاک کردن فیلد ورودی
            guessInput.value = '';
            guessInput.focus();
        }

        // پردازش حدس کاربر
        function processGuess(guess) {
            showNotification(`💡 حدس شما: "${guess}"`);
            
            // اضافه کردن به لیست حروف حدس زده شده
            gameState.gameData.guessedLetters.push(guess);
            
            // بررسی صحیح بودن حدس
            const word = gameState.gameData.word;
            let correctGuess = word.includes(guess);
            
            // به‌روزرسانی وضعیت کلمه
            let newWordState = '';
            for (let i = 0; i < word.length; i++) {
                if (word[i] === guess || gameState.gameData.currentWordState[i] !== '_') {
                    newWordState += word[i];
                } else {
                    newWordState += '_';
                }
            }
            gameState.gameData.currentWordState = newWordState;
            
            // افزایش تعداد حدس‌ها در صورت اشتباه
            if (!correctGuess) {
                gameState.gameData.attempts++;
            }
            
            // افزودن پیام به چت
            addChatMessage('guess', 
                correctGuess ? 
                `✅ حرف "${guess}" صحیح بود!` : 
                `❌ حرف "${guess}" در کلمه وجود ندارد`
            );
            
            // بررسی پایان بازی
            checkGameEnd(correctGuess, newWordState);
            
            // به‌روزرسانی نمایش
            updateGameDisplay();
        }

        // بررسی پایان بازی
        function checkGameEnd(correctGuess, newWordState) {
            const word = gameState.gameData.word;
            
            if (newWordState === word) {
                // بازیکن برنده شد
                setTimeout(() => {
                    showNotification('🎉 تبریک! شما برنده شدید!', false);
                    document.getElementById('gamePhase').textContent = '🏆 شما برنده بازی شدید!';
                    addChatMessage('system', '🎉 بازی به پایان رسید! بازیکن دوم برنده شد!');
                    endGame('opponent');
                }, 1000);
            } else if (gameState.gameData.attempts >= gameState.gameData.maxAttempts) {
                // بازیکن باخت
                setTimeout(() => {
                    showNotification('❌ متأسفانه باختید!', true);
                    document.getElementById('gamePhase').textContent = '💔 شما باختید!';
                    addChatMessage('system', '🎉 بازی به پایان رسید! سازنده برنده شد!');
                    endGame('creator');
                }, 1000);
            }
        }

        // پایان بازی
        function endGame(winner) {
            gameState.gameData.status = 'completed';
            gameState.gameData.winner = winner;
            
            // غیرفعال کردن ورودی‌ها
            document.getElementById('guessSection').classList.add('hidden');
            document.getElementById('wordInputSection').classList.add('hidden');
            document.getElementById('categorySection').classList.add('hidden');
            
            // نمایش کلمه کامل
            gameState.gameData.currentWordState = gameState.gameData.word;
            updateGameDisplay();
            
            // نمایش پیام نهایی
            if (winner === gameState.userRole) {
                addChatMessage('system', '🏆 شما برنده این دور از بازی شدید!');
            } else {
                addChatMessage('system', '💡 دفعه بعد شانس بیشتری دارید!');
            }
        }

        // درخواست راهنمایی
        function requestHint() {
            if (gameState.gameData.hintsUsed >= gameState.gameData.maxHints) {
                showNotification('❌ شما تمام راهنمایی‌های خود را استفاده کرده‌اید', true);
                return;
            }

            // شبیه‌سازی درخواست راهنمایی
            showNotification('💡 درخواست راهنمایی ارسال شد');
            gameState.gameData.hintsUsed++;
            
            // پیدا کردن یک حرف تصادفی برای راهنمایی
            const word = gameState.gameData.word;
            const guessedLetters = gameState.gameData.guessedLetters;
            const availableLetters = [];
            
            for (let char of word) {
                if (!guessedLetters.includes(char) && !availableLetters.includes(char)) {
                    availableLetters.push(char);
                }
            }
            
            if (availableLetters.length > 0) {
                const hintLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
                
                setTimeout(() => {
                    showNotification(`💡 راهنمایی: حرف "${hintLetter}"`);
                    addChatMessage('hint', `💡 راهنمایی: حرف "${hintLetter}" در کلمه وجود دارد`);
                    
                    // به‌روزرسانی نمایش
                    updateGameDisplay();
                }, 2000);
            } else {
                showNotification('💡 تمام حروف قبلاً حدس زده شده‌اند');
            }
        }

        // به‌روزرسانی نمایش بازی
        function updateGameDisplay() {
            // به‌روزرسانی حروف کلمه
            const wordLetters = document.getElementById('wordLetters');
            wordLetters.innerHTML = '';
            
            const currentState = gameState.gameData.currentWordState;
            for (let i = 0; i < currentState.length; i++) {
                const letterDiv = document.createElement('div');
                letterDiv.className = 'letter';
                
                if (currentState[i] === ' ') {
                    letterDiv.classList.add('space');
                    letterDiv.innerHTML = '&nbsp;';
                } else if (currentState[i] !== '_') {
                    letterDiv.classList.add('revealed');
                    letterDiv.textContent = currentState[i];
                    letterDiv.classList.add('pulse');
                } else {
                    letterDiv.textContent = '?';
                }
                
                wordLetters.appendChild(letterDiv);
            }
            
            // به‌روزرسانی اطلاعات بازی
            document.getElementById('categoryValue').textContent = gameState.gameData.category;
            document.getElementById('wordLengthValue').textContent = gameState.gameData.wordLength;
            document.getElementById('attemptsLeftValue').textContent = 
                gameState.gameData.maxAttempts - gameState.gameData.attempts;
            document.getElementById('hintsLeftValue').textContent = 
                gameState.gameData.maxHints - gameState.gameData.hintsUsed;
            
            // به‌روزرسانی دکمه راهنمایی
            const hintBtn = document.getElementById('hintBtn');
            hintBtn.textContent = `درخواست راهنمایی (${gameState.gameData.maxHints - gameState.gameData.hintsUsed} باقی‌مانده)`;
            hintBtn.disabled = gameState.gameData.hintsUsed >= gameState.gameData.maxHints;
            
            // به‌روزرسانی حروف حدس زده شده
            const guessedContainer = document.getElementById('guessedLettersContainer');
            guessedContainer.innerHTML = '';
            
            gameState.gameData.guessedLetters.forEach(letter => {
                const letterDiv = document.createElement('div');
                letterDiv.className = 'guessed-letter';
                letterDiv.classList.add(gameState.gameData.word.includes(letter) ? 'correct' : 'incorrect');
                letterDiv.textContent = letter;
                guessedContainer.appendChild(letterDiv);
            });
        }

        // افزودن پیام به چت
        function addChatMessage(type, text) {
            const chatContainer = document.getElementById('gameChat');
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${type}`;
            messageDiv.textContent = text;
            
            chatContainer.appendChild(messageDiv);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // نمایش نوتیفیکیشن
        function showNotification(message, isError = false) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.className = `notification ${isError ? 'error' : ''}`;
            notification.classList.add('show');
            
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }

        // به‌روزرسانی وضعیت بازی از سرور
        function updateGameState() {
            // در محیط واقعی، این تابع از سرور وضعیت جدید را دریافت می‌کند
            console.log('🔄 بروزرسانی وضعیت بازی...');
        }

        // بروزرسانی دستی وضعیت
        function updateGameStatus() {
            showNotification('🔄 در حال بروزرسانی وضعیت بازی...');
            // در محیط واقعی، این تابع وضعیت بازی را از سرور دریافت می‌کند
        }

        // خروج از بازی
        function leaveGame() {
            if (confirm('آیا مطمئن هستید که می‌خواهید از بازی خارج شوید؟')) {
                showNotification('🚪 در حال خروج از بازی...');
                setTimeout(() => {
                    window.close(); // یا انتقال به صفحه دیگر
                }, 1000);
            }
        }

        // شبیه‌سازی WebSocket برای تست
        function simulateWebSocketMessages() {
            // شبیه‌سازی پیام‌های مختلف از سرور
            setTimeout(() => addChatMessage('system', '👤 کاربر جدید به بازی پیوست'), 5000);
            setTimeout(() => addChatMessage('system', '💡 سازنده در حال انتخاب کلمه است...'), 8000);
        }

        // اجرای شبیه‌سازی برای نمایش قابلیت‌ها
        simulateWebSocketMessages();
    </script>
</body>
</html>
