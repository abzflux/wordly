<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wordly Pro • پلتفرم حرفه‌ای بازی کلمه‌سازی</title>
    
    <!-- Fonts & Icons -->
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- Socket.io -->
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    
    <!-- Telegram Web App -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>

    <style>
        :root {
            --primary: #6366f1;
            --primary-dark: #4f46e5;
            --secondary: #10b981;
            --accent: #f59e0b;
            --danger: #ef4444;
            --dark: #0f172a;
            --darker: #020617;
            --card: #1e293b;
            --card-light: #334155;
            --border: #475569;
            --text: #f1f5f9;
            --text-muted: #94a3b8;
            --gradient: linear-gradient(135deg, #6366f1, #8b5cf6, #d946ef);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Vazirmatn', sans-serif;
            background: var(--darker);
            color: var(--text);
            min-height: 100vh;
            overflow-x: hidden;
        }

        .glass {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(71, 85, 105, 0.3);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .glass-card {
            background: rgba(30, 41, 59, 0.9);
            backdrop-filter: blur(15px);
            border: 1px solid rgba(71, 85, 105, 0.4);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .gradient-text {
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .gradient-bg {
            background: var(--gradient);
        }

        .btn-primary {
            background: var(--gradient);
            color: white;
            font-weight: 600;
            padding: 12px 24px;
            border-radius: 12px;
            border: none;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
            position: relative;
            overflow: hidden;
        }

        .btn-primary::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
        }

        .btn-primary:hover::before {
            left: 100%;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(99, 102, 241, 0.6);
        }

        .btn-secondary {
            background: rgba(16, 185, 129, 0.1);
            color: var(--secondary);
            border: 1px solid var(--secondary);
            font-weight: 600;
            padding: 12px 24px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .btn-secondary:hover {
            background: var(--secondary);
            color: white;
            transform: translateY(-1px);
        }

        .nav-tab {
            background: transparent;
            color: var(--text-muted);
            padding: 16px 20px;
            border-radius: 16px;
            transition: all 0.3s ease;
            border: none;
            cursor: pointer;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1;
            justify-content: center;
        }

        .nav-tab.active {
            background: rgba(99, 102, 241, 0.1);
            color: var(--primary);
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.2);
        }

        .nav-tab:hover:not(.active) {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text);
        }

        .game-card {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.9));
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 24px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }

        .game-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: var(--gradient);
            transform: scaleX(0);
            transition: transform 0.3s ease;
        }

        .game-card:hover::before {
            transform: scaleX(1);
        }

        .game-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
            border-color: var(--primary);
        }

        .letter-tile {
            width: 50px;
            height: 50px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: rgba(30, 41, 59, 0.8);
            border: 2px solid var(--border);
            border-radius: 12px;
            font-size: 1.5rem;
            font-weight: 800;
            color: var(--text-muted);
            margin: 4px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .letter-tile.revealed {
            background: rgba(16, 185, 129, 0.2);
            border-color: var(--secondary);
            color: var(--secondary);
            transform: scale(1.1);
            box-shadow: 0 8px 20px rgba(16, 185, 129, 0.3);
        }

        .level-badge {
            background: var(--gradient);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 800;
            font-size: 0.9rem;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }

        .progress-ring {
            transform: rotate(-90deg);
        }

        .progress-ring-circle {
            transition: stroke-dashoffset 0.5s ease;
        }

        .floating-nav {
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(71, 85, 105, 0.3);
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.3);
        }

        .notification {
            animation: slideInRight 0.3s ease-out;
        }

        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.4); }
            50% { box-shadow: 0 0 30px rgba(99, 102, 241, 0.8); }
        }

        .pulse-glow {
            animation: pulse-glow 2s infinite;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
        }

        .stat-item {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            transition: all 0.3s ease;
        }

        .stat-item:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
        }

        .achievement-card {
            background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .achievement-card.locked {
            opacity: 0.5;
            filter: grayscale(1);
        }

        .achievement-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--gradient);
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .achievement-card:not(.locked):hover::before {
            opacity: 0.1;
        }

        /* Custom Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(30, 41, 59, 0.5);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: var(--primary);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--primary-dark);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .nav-tab {
                padding: 12px 16px;
                font-size: 0.9rem;
            }
            
            .game-card {
                padding: 16px;
            }
            
            .letter-tile {
                width: 40px;
                height: 40px;
                font-size: 1.2rem;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
    <!-- Loading Screen -->
    <div id="loadingScreen" class="fixed inset-0 bg-slate-950 flex items-center justify-center z-50">
        <div class="text-center">
            <div class="w-24 h-24 mx-auto mb-8 relative">
                <div class="absolute inset-0 gradient-bg rounded-2xl animate-pulse"></div>
                <div class="absolute inset-2 bg-slate-900 rounded-xl flex items-center justify-center">
                    <i class="fas fa-gamepad text-2xl gradient-text"></i>
                </div>
            </div>
            <h1 class="text-3xl font-bold gradient-text mb-4">Wordly Pro</h1>
            <p class="text-slate-400 mb-6">در حال راه‌اندازی محیط بازی...</p>
            <div class="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
    </div>

    <!-- Main Navigation -->
    <nav class="floating-nav fixed top-0 left-0 right-0 z-40 p-4">
        <div class="container mx-auto max-w-6xl">
            <div class="flex items-center justify-between">
                <!-- Logo -->
                <div class="flex items-center space-x-3 space-x-reverse">
                    <div class="w-12 h-12 gradient-bg rounded-2xl flex items-center justify-center">
                        <i class="fas fa-gamepad text-white text-lg"></i>
                    </div>
                    <div>
                        <h1 class="text-xl font-bold gradient-text">Wordly Pro</h1>
                        <p class="text-xs text-slate-400">پلتفرم حرفه‌ای بازی کلمه‌سازی</p>
                    </div>
                </div>

                <!-- User Info -->
                <div id="userNavInfo" class="hidden">
                    <div class="flex items-center space-x-3 space-x-reverse">
                        <div class="text-right">
                            <p class="font-semibold text-sm" id="navUserName">کاربر</p>
                            <div class="flex items-center space-x-2 space-x-reverse">
                                <span class="level-badge text-xs" id="navUserLevel">سطح ۱</span>
                                <span class="text-xs text-slate-400" id="navUserScore">۰ امتیاز</span>
                            </div>
                        </div>
                        <div class="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center border-2 border-indigo-500">
                            <i class="fas fa-user text-slate-300"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </nav>

    <!-- Main App Container -->
    <div id="app" class="hidden pt-20 pb-24">
        <div class="container mx-auto max-w-6xl px-4">
            <!-- Tab Navigation -->
            <div class="glass-card rounded-2xl p-2 mb-6">
                <div class="flex space-x-2 space-x-reverse">
                    <button class="nav-tab active" data-tab="dashboard">
                        <i class="fas fa-home"></i>
                        <span class="hidden sm:inline">داشبورد</span>
                    </button>
                    <button class="nav-tab" data-tab="play">
                        <i class="fas fa-play"></i>
                        <span class="hidden sm:inline">بازی</span>
                    </button>
                    <button class="nav-tab" data-tab="leaderboard">
                        <i class="fas fa-trophy"></i>
                        <span class="hidden sm:inline">رتبه‌بندی</span>
                    </button>
                    <button class="nav-tab" data-tab="profile">
                        <i class="fas fa-user"></i>
                        <span class="hidden sm:inline">پروفایل</span>
                    </button>
                    <button class="nav-tab" data-tab="challenges">
                        <i class="fas fa-fire"></i>
                        <span class="hidden sm:inline">چالش‌ها</span>
                    </button>
                </div>
            </div>

            <!-- Tab Content -->
            <div id="tabContent">
                <!-- Dashboard Tab -->
                <div id="dashboardTab" class="tab-content space-y-6">
                    <!-- Welcome Card -->
                    <div class="game-card">
                        <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between">
                            <div class="flex-1">
                                <h2 class="text-2xl font-bold mb-2">سلام، <span id="welcomeUserName" class="gradient-text">کاربر</span>! 👋</h2>
                                <p class="text-slate-400 mb-4">آماده چالش جدیدی هستید؟ امروز فرصت دارید امتیاز ویژه کسب کنید!</p>
                                <div class="flex items-center space-x-4 space-x-reverse">
                                    <div class="level-badge text-sm" id="dashboardUserLevel">سطح ۱</div>
                                    <div class="text-sm text-slate-400">
                                        <span id="dashboardUserScore">۰</span> امتیاز
                                    </div>
                                </div>
                            </div>
                            <div class="mt-4 lg:mt-0">
                                <button class="btn-primary" onclick="showTab('play')">
                                    <i class="fas fa-play ml-2"></i>
                                    شروع بازی سریع
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Quick Stats -->
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="text-2xl font-bold text-indigo-400 mb-2" id="statsGamesPlayed">۰</div>
                            <p class="text-sm text-slate-400">بازی انجام شده</p>
                        </div>
                        <div class="stat-item">
                            <div class="text-2xl font-bold text-emerald-400 mb-2" id="statsGamesWon">۰</div>
                            <p class="text-sm text-slate-400">بازی برده</p>
                        </div>
                        <div class="stat-item">
                            <div class="text-2xl font-bold text-amber-400 mb-2" id="statsTotalGuesses">۰</div>
                            <p class="text-sm text-slate-400">حدس کل</p>
                        </div>
                        <div class="stat-item">
                            <div class="text-2xl font-bold text-cyan-400 mb-2" id="statsCorrectGuesses">۰</div>
                            <p class="text-sm text-slate-400">حدس درست</p>
                        </div>
                    </div>

                    <!-- Daily Challenge Preview -->
                    <div class="game-card">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-bold gradient-text">چالش روزانه</h3>
                            <span class="text-sm text-slate-400" id="dailyChallengeDate">امروز</span>
                        </div>
                        <div id="dailyChallengePreview">
                            <p class="text-slate-400 text-center py-4">در حال دریافت چالش روزانه...</p>
                        </div>
                        <button class="btn-secondary w-full mt-4" onclick="showTab('challenges')">
                            <i class="fas fa-fire ml-2"></i>
                            مشاهده چالش کامل
                        </button>
                    </div>
                </div>

                <!-- Play Tab -->
                <div id="playTab" class="tab-content hidden space-y-6">
                    <!-- Game Modes -->
                    <div class="game-card">
                        <h2 class="text-2xl font-bold gradient-text mb-6">🎮 انتخاب حالت بازی</h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="game-card text-center cursor-pointer hover:scale-105 transition-transform" onclick="showGameMode('classic')">
                                <div class="w-16 h-16 gradient-bg rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <i class="fas fa-user-friends text-white text-2xl"></i>
                                </div>
                                <h3 class="font-bold text-lg mb-2">حالت کلاسیک</h3>
                                <p class="text-slate-400 text-sm">بازی دو نفره سنتی - رقابت یک به یک</p>
                            </div>
                            
                            <div class="game-card text-center cursor-pointer hover:scale-105 transition-transform" onclick="showGameMode('daily')">
                                <div class="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                    <i class="fas fa-calendar-day text-white text-2xl"></i>
                                </div>
                                <h3 class="font-bold text-lg mb-2">چالش روزانه</h3>
                                <p class="text-slate-400 text-sm">امتیاز ویژه - چالش محدود زمانی</p>
                            </div>
                        </div>
                    </div>

                    <!-- Create Game Form -->
                    <div id="createGameSection" class="game-card hidden">
                        <h3 class="text-xl font-bold gradient-text mb-6">🎯 ایجاد بازی جدید</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-300 mb-2">کلمه پنهان</label>
                                <input type="text" id="gameWordInput" 
                                       class="w-full p-4 bg-slate-800 border border-slate-600 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                                       placeholder="کلمه مورد نظر را وارد کنید (فقط فارسی)">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-300 mb-2">دسته‌بندی</label>
                                <input type="text" id="gameCategoryInput" 
                                       class="w-full p-4 bg-slate-800 border border-slate-600 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                                       placeholder="مثلاً: میوه، حیوان، شهر">
                            </div>
                            <button id="createGameBtn" class="btn-primary w-full">
                                <i class="fas fa-plus ml-2"></i>
                                ایجاد بازی
                            </button>
                        </div>
                    </div>

                    <!-- Waiting Games -->
                    <div class="game-card">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="text-xl font-bold gradient-text">بازی‌های منتظر</h3>
                            <button id="refreshGamesBtn" class="text-slate-400 hover:text-white transition-colors">
                                <i class="fas fa-sync-alt ml-2"></i>
                                بروزرسانی
                            </button>
                        </div>
                        <div id="waitingGamesList" class="space-y-3 max-h-96 overflow-y-auto">
                            <!-- Games will be loaded here -->
                        </div>
                    </div>
                </div>

                <!-- Leaderboard Tab -->
                <div id="leaderboardTab" class="tab-content hidden">
                    <div class="game-card">
                        <h2 class="text-2xl font-bold gradient-text mb-6">🏆 جدول رتبه‌بندی</h2>
                        <div id="leaderboardList" class="space-y-3">
                            <!-- Leaderboard will be loaded here -->
                        </div>
                    </div>
                </div>

                <!-- Profile Tab -->
                <div id="profileTab" class="tab-content hidden space-y-6">
                    <!-- Profile Overview -->
                    <div class="game-card">
                        <div class="flex flex-col lg:flex-row items-center lg:items-start space-y-6 lg:space-y-0 lg:space-x-6 space-x-reverse">
                            <!-- Avatar & Basic Info -->
                            <div class="text-center lg:text-right">
                                <div class="w-24 h-24 gradient-bg rounded-2xl flex items-center justify-center mx-auto lg:mx-0 mb-4">
                                    <i class="fas fa-user text-white text-3xl"></i>
                                </div>
                                <h2 class="text-xl font-bold" id="profileUserName">کاربر</h2>
                                <div class="flex items-center justify-center lg:justify-start space-x-2 space-x-reverse mt-2">
                                    <span class="level-badge text-sm" id="profileUserLevel">سطح ۱</span>
                                    <span class="text-sm text-slate-400" id="profileUserScore">۰ امتیاز</span>
                                </div>
                            </div>

                            <!-- Progress & Stats -->
                            <div class="flex-1">
                                <!-- Level Progress -->
                                <div class="mb-6">
                                    <div class="flex justify-between text-sm mb-2">
                                        <span class="text-slate-300">پیشرفت به سطح بعدی</span>
                                        <span class="text-slate-400" id="profileProgressText">۰/۱۰۰</span>
                                    </div>
                                    <div class="w-full bg-slate-700 rounded-full h-3">
                                        <div class="gradient-bg h-3 rounded-full transition-all duration-500" 
                                             id="profileProgressBar" style="width: 0%"></div>
                                    </div>
                                </div>

                                <!-- Stats Grid -->
                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <div class="text-xl font-bold text-indigo-400" id="profileGamesPlayed">۰</div>
                                        <p class="text-xs text-slate-400 mt-1">بازی انجام شده</p>
                                    </div>
                                    <div class="stat-item">
                                        <div class="text-xl font-bold text-emerald-400" id="profileGamesWon">۰</div>
                                        <p class="text-xs text-slate-400 mt-1">بازی برده</p>
                                    </div>
                                    <div class="stat-item">
                                        <div class="text-xl font-bold text-amber-400" id="profileTotalGuesses">۰</div>
                                        <p class="text-xs text-slate-400 mt-1">حدس کل</p>
                                    </div>
                                    <div class="stat-item">
                                        <div class="text-xl font-bold text-cyan-400" id="profileCorrectGuesses">۰</div>
                                        <p class="text-xs text-slate-400 mt-1">حدس درست</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Achievements -->
                    <div class="game-card">
                        <h3 class="text-xl font-bold gradient-text mb-6">🏅 دستاوردها</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div class="achievement-card locked">
                                <div class="text-3xl mb-3">🥇</div>
                                <p class="text-sm font-semibold">قهرمان</p>
                                <p class="text-xs text-slate-400 mt-1">برنده ۱۰ بازی</p>
                            </div>
                            <div class="achievement-card locked">
                                <div class="text-3xl mb-3">⚡</div>
                                <p class="text-sm font-semibold">سریع</p>
                                <p class="text-xs text-slate-400 mt-1">پایان بازی در ۱ دقیقه</p>
                            </div>
                            <div class="achievement-card locked">
                                <div class="text-3xl mb-3">🎯</div>
                                <p class="text-sm font-semibold">دقیق</p>
                                <p class="text-xs text-slate-400 mt-1">۹۰٪ حدس درست</p>
                            </div>
                            <div class="achievement-card locked">
                                <div class="text-3xl mb-3">🔥</div>
                                <p class="text-sm font-semibold">مشتاق</p>
                                <p class="text-xs text-slate-400 mt-1">۷ روز متوالی بازی</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Challenges Tab -->
                <div id="challengesTab" class="tab-content hidden space-y-6">
                    <!-- Daily Challenge -->
                    <div class="game-card border-l-4 border-emerald-500">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-2xl font-bold gradient-text">⚡ چالش روزانه</h2>
                            <div class="text-right">
                                <div class="text-sm text-slate-400" id="challengeDate">امروز</div>
                                <div class="text-xs text-emerald-400" id="challengeParticipants">۰ شرکت‌کننده</div>
                            </div>
                        </div>
                        
                        <div id="dailyChallengeContent" class="text-center py-8">
                            <div class="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <i class="fas fa-fire text-white text-2xl"></i>
                            </div>
                            <p class="text-slate-400">در حال دریافت چالش روزانه...</p>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                            <button id="joinChallengeBtn" class="btn-secondary" disabled>
                                <i class="fas fa-play ml-2"></i>
                                شروع چالش
                            </button>
                            <button class="btn-primary">
                                <i class="fas fa-share ml-2"></i>
                                دعوت از دوستان
                            </button>
                        </div>
                    </div>

                    <!-- Challenge Stats -->
                    <div class="game-card">
                        <h3 class="text-xl font-bold gradient-text mb-6">📊 آمار چالش‌ها</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div class="stat-item">
                                <div class="text-2xl font-bold text-indigo-400">۰</div>
                                <p class="text-sm text-slate-400">چالش انجام شده</p>
                            </div>
                            <div class="stat-item">
                                <div class="text-2xl font-bold text-emerald-400">۰</div>
                                <p class="text-sm text-slate-400">چالش برده</p>
                            </div>
                            <div class="stat-item">
                                <div class="text-2xl font-bold text-amber-400">۰</div>
                                <p class="text-sm text-slate-400">امتیاز کسب شده</p>
                            </div>
                            <div class="stat-item">
                                <div class="text-2xl font-bold text-cyan-400">۰</div>
                                <p class="text-sm text-slate-400">رکورد شخصی</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Game View -->
    <div id="gameView" class="hidden fixed inset-0 bg-slate-950 z-50 overflow-y-auto">
        <!-- Game content will be loaded here -->
    </div>

    <!-- Bottom Navigation (Mobile) -->
    <div class="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-3 lg:hidden glass">
        <div class="flex justify-around">
            <button class="nav-tab active" data-tab="dashboard">
                <i class="fas fa-home"></i>
            </button>
            <button class="nav-tab" data-tab="play">
                <i class="fas fa-play"></i>
            </button>
            <button class="nav-tab" data-tab="leaderboard">
                <i class="fas fa-trophy"></i>
            </button>
            <button class="nav-tab" data-tab="profile">
                <i class="fas fa-user"></i>
            </button>
            <button class="nav-tab" data-tab="challenges">
                <i class="fas fa-fire"></i>
            </button>
        </div>
    </div>

    <!-- Notifications -->
    <div id="notificationContainer" class="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full"></div>

    <script>
        // Configuration
        const CONFIG = {
            SOCKET_URL: 'https://wordlybot.onrender.com',
            RECONNECTION_ATTEMPTS: 5,
            RECONNECTION_DELAY: 1000
        };

        // Application State
        const AppState = {
            user: null,
            socket: null,
            currentGame: null,
            currentTab: 'dashboard',
            notifications: []
        };

        // DOM Elements
        const DOM = {
            // Views
            loadingScreen: document.getElementById('loadingScreen'),
            app: document.getElementById('app'),
            gameView: document.getElementById('gameView'),
            
            // Navigation
            userNavInfo: document.getElementById('userNavInfo'),
            navUserName: document.getElementById('navUserName'),
            navUserLevel: document.getElementById('navUserLevel'),
            navUserScore: document.getElementById('navUserScore'),
            
            // Dashboard
            welcomeUserName: document.getElementById('welcomeUserName'),
            dashboardUserLevel: document.getElementById('dashboardUserLevel'),
            dashboardUserScore: document.getElementById('dashboardUserScore'),
            statsGamesPlayed: document.getElementById('statsGamesPlayed'),
            statsGamesWon: document.getElementById('statsGamesWon'),
            statsTotalGuesses: document.getElementById('statsTotalGuesses'),
            statsCorrectGuesses: document.getElementById('statsCorrectGuesses'),
            dailyChallengePreview: document.getElementById('dailyChallengePreview'),
            
            // Profile
            profileUserName: document.getElementById('profileUserName'),
            profileUserLevel: document.getElementById('profileUserLevel'),
            profileUserScore: document.getElementById('profileUserScore'),
            profileProgressBar: document.getElementById('profileProgressBar'),
            profileProgressText: document.getElementById('profileProgressText'),
            profileGamesPlayed: document.getElementById('profileGamesPlayed'),
            profileGamesWon: document.getElementById('profileGamesWon'),
            profileTotalGuesses: document.getElementById('profileTotalGuesses'),
            profileCorrectGuesses: document.getElementById('profileCorrectGuesses'),
            
            // Play
            createGameSection: document.getElementById('createGameSection'),
            gameWordInput: document.getElementById('gameWordInput'),
            gameCategoryInput: document.getElementById('gameCategoryInput'),
            createGameBtn: document.getElementById('createGameBtn'),
            waitingGamesList: document.getElementById('waitingGamesList'),
            refreshGamesBtn: document.getElementById('refreshGamesBtn'),
            
            // Leaderboard
            leaderboardList: document.getElementById('leaderboardList'),
            
            // Challenges
            dailyChallengeContent: document.getElementById('dailyChallengeContent'),
            joinChallengeBtn: document.getElementById('joinChallengeBtn'),
            challengeDate: document.getElementById('challengeDate'),
            challengeParticipants: document.getElementById('challengeParticipants'),
            
            // Notifications
            notificationContainer: document.getElementById('notificationContainer')
        };

        // Utility Functions
        const Utils = {
            toPersianDigits(n) {
                const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
                if (n === null || n === undefined) return '۰';
                return String(n).replace(/[0-9]/g, (w) => persian[+w]);
            },

            showNotification(message, type = 'info', duration = 4000) {
                const id = Date.now();
                const notification = {
                    id,
                    message,
                    type,
                    duration
                };

                AppState.notifications.push(notification);
                Utils.renderNotifications();

                setTimeout(() => {
                    AppState.notifications = AppState.notifications.filter(n => n.id !== id);
                    Utils.renderNotifications();
                }, duration);
            },

            renderNotifications() {
                DOM.notificationContainer.innerHTML = AppState.notifications.map(notification => `
                    <div class="notification glass-card p-4 rounded-xl border-l-4 ${
                        notification.type === 'success' ? 'border-emerald-500' :
                        notification.type === 'error' ? 'border-red-500' :
                        notification.type === 'warning' ? 'border-amber-500' : 'border-indigo-500'
                    }">
                        <div class="flex items-center space-x-3 space-x-reverse">
                            <i class="fas ${
                                notification.type === 'success' ? 'fa-check-circle text-emerald-400' :
                                notification.type === 'error' ? 'fa-exclamation-circle text-red-400' :
                                notification.type === 'warning' ? 'fa-exclamation-triangle text-amber-400' : 'fa-info-circle text-indigo-400'
                            }"></i>
                            <p class="flex-1 text-sm">${notification.message}</p>
                        </div>
                    </div>
                `).join('');
            },

            formatTime(seconds) {
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                return `${Utils.toPersianDigits(mins)}:${Utils.toPersianDigits(secs.toString().padStart(2, '0'))}`;
            },

            calculateLevel(score) {
                return Math.floor(score / 100) + 1;
            },

            calculateLevelProgress(score) {
                const level = Utils.calculateLevel(score);
                const currentLevelScore = (level - 1) * 100;
                const progress = score - currentLevelScore;
                return {
                    level,
                    progress,
                    percentage: Math.min((progress / 100) * 100, 100)
                };
            }
        };

        // Tab Management
        const TabManager = {
            show(tabName) {
                // Hide all tabs
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.add('hidden');
                });
                
                // Show selected tab
                document.getElementById(tabName + 'Tab').classList.remove('hidden');
                
                // Update active tab button
                document.querySelectorAll('.nav-tab').forEach(button => {
                    button.classList.remove('active');
                });
                document.querySelectorAll(`[data-tab="${tabName}"]`).forEach(button => {
                    button.classList.add('active');
                });

                AppState.currentTab = tabName;

                // Load tab-specific data
                TabManager.loadTabData(tabName);
            },

            loadTabData(tabName) {
                switch (tabName) {
                    case 'dashboard':
                        GameManager.loadWaitingGames();
                        ChallengeManager.loadDailyChallenge();
                        break;
                    case 'play':
                        GameManager.loadWaitingGames();
                        break;
                    case 'leaderboard':
                        UserManager.loadLeaderboard();
                        break;
                    case 'challenges':
                        ChallengeManager.loadDailyChallenge();
                        break;
                }
            }
        };

        // User Management
        const UserManager = {
            async login(userData) {
                try {
                    if (AppState.socket) {
                        AppState.socket.emit('user_login', userData);
                    }
                } catch (error) {
                    Utils.showNotification('خطا در ورود به سیستم', 'error');
                }
            },

            updateProfile(profile) {
                AppState.user = profile;
                
                const levelInfo = Utils.calculateLevelProgress(profile.score);

                // Update navigation
                DOM.navUserName.textContent = profile.name;
                DOM.navUserLevel.textContent = `سطح ${levelInfo.level}`;
                DOM.navUserScore.textContent = `${Utils.toPersianDigits(profile.score)} امتیاز`;
                DOM.userNavInfo.classList.remove('hidden');

                // Update dashboard
                DOM.welcomeUserName.textContent = profile.name;
                DOM.dashboardUserLevel.textContent = `سطح ${levelInfo.level}`;
                DOM.dashboardUserScore.textContent = Utils.toPersianDigits(profile.score);
                DOM.statsGamesPlayed.textContent = Utils.toPersianDigits(profile.games_played || 0);
                DOM.statsGamesWon.textContent = Utils.toPersianDigits(profile.games_won || 0);
                DOM.statsTotalGuesses.textContent = Utils.toPersianDigits(profile.total_guesses || 0);
                DOM.statsCorrectGuesses.textContent = Utils.toPersianDigits(profile.correct_guesses || 0);

                // Update profile
                DOM.profileUserName.textContent = profile.name;
                DOM.profileUserLevel.textContent = `سطح ${levelInfo.level}`;
                DOM.profileUserScore.textContent = `${Utils.toPersianDigits(profile.score)} امتیاز`;
                DOM.profileProgressBar.style.width = `${levelInfo.percentage}%`;
                DOM.profileProgressText.textContent = `${Utils.toPersianDigits(levelInfo.progress)}/۱۰۰`;
                DOM.profileGamesPlayed.textContent = Utils.toPersianDigits(profile.games_played || 0);
                DOM.profileGamesWon.textContent = Utils.toPersianDigits(profile.games_won || 0);
                DOM.profileTotalGuesses.textContent = Utils.toPersianDigits(profile.total_guesses || 0);
                DOM.profileCorrectGuesses.textContent = Utils.toPersianDigits(profile.correct_guesses || 0);
            },

            async loadLeaderboard() {
                try {
                    if (AppState.socket) {
                        AppState.socket.emit('get_leaderboard');
                    }
                } catch (error) {
                    Utils.showNotification('خطا در دریافت جدول رتبه‌بندی', 'error');
                }
            }
        };

        // Game Management
        const GameManager = {
            showGameMode(mode) {
                DOM.createGameSection.classList.remove('hidden');
                DOM.gameWordInput.focus();
            },

            async createGame() {
                const word = DOM.gameWordInput.value.trim();
                const category = DOM.gameCategoryInput.value.trim();

                if (!word || !category) {
                    Utils.showNotification('لطفاً کلمه و دسته‌بندی را وارد کنید', 'warning');
                    return;
                }

                if (!/^[\u0600-\u06FF\s]+$/.test(word)) {
                    Utils.showNotification('کلمه باید فقط شامل حروف فارسی باشد', 'error');
                    return;
                }

                if (word.length < 3) {
                    Utils.showNotification('کلمه باید حداقل ۳ حرف باشد', 'error');
                    return;
                }

                try {
                    if (AppState.socket) {
                        AppState.socket.emit('create_game', {
                            userId: AppState.user.telegram_id,
                            word: word.toLowerCase(),
                            category,
                            gameType: 'classic'
                        });

                        DOM.gameWordInput.value = '';
                        DOM.gameCategoryInput.value = '';
                    }
                } catch (error) {
                    Utils.showNotification('خطا در ایجاد بازی', 'error');
                }
            },

            async loadWaitingGames() {
                try {
                    if (AppState.socket && AppState.user) {
                        AppState.socket.emit('get_waiting_games', AppState.user.telegram_id);
                    }
                } catch (error) {
                    Utils.showNotification('خطا در دریافت لیست بازی‌ها', 'error');
                }
            },

            renderWaitingGames(games) {
                if (!games || games.length === 0) {
                    DOM.waitingGamesList.innerHTML = `
                        <div class="text-center py-8">
                            <i class="fas fa-gamepad text-4xl text-slate-600 mb-4"></i>
                            <p class="text-slate-400">هیچ بازی فعالی موجود نیست</p>
                            <p class="text-sm text-slate-500 mt-2">اولین نفری باشید که بازی ایجاد می‌کند!</p>
                        </div>
                    `;
                    return;
                }

                DOM.waitingGamesList.innerHTML = games.map(game => `
                    <div class="glass-card p-4 rounded-xl hover:border-indigo-400 transition-colors cursor-pointer" 
                         onclick="GameManager.joinGame('${game.code}')">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center space-x-3 space-x-reverse mb-2">
                                    <span class="font-semibold text-indigo-400">${game.creator_name}</span>
                                    <span class="text-xs text-slate-400 bg-slate-700 px-2 py-1 rounded">${game.code}</span>
                                </div>
                                <div class="text-sm text-slate-400">
                                    <span class="ml-3">${Utils.toPersianDigits(game.word.length)} حرف</span>
                                    <span>• ${game.category}</span>
                                </div>
                            </div>
                            <div class="text-left">
                                <button class="btn-primary text-sm px-4 py-2">
                                    <i class="fas fa-play ml-1"></i>
                                    پیوستن
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('');
            },

            async joinGame(gameCode) {
                try {
                    if (AppState.socket) {
                        AppState.socket.emit('join_game', {
                            userId: AppState.user.telegram_id,
                            gameCode
                        });
                    }
                } catch (error) {
                    Utils.showNotification('خطا در پیوستن به بازی', 'error');
                }
            }
        };

        // Challenge Management
        const ChallengeManager = {
            async loadDailyChallenge() {
                try {
                    if (AppState.socket) {
                        AppState.socket.emit('get_daily_challenge');
                    }
                } catch (error) {
                    Utils.showNotification('خطا در دریافت چالش روزانه', 'error');
                }
            },

            renderDailyChallenge(challenge) {
                if (!challenge) {
                    DOM.dailyChallengePreview.innerHTML = `
                        <p class="text-slate-400 text-center">چالش روزانه در دسترس نیست</p>
                    `;
                    DOM.dailyChallengeContent.innerHTML = `
                        <p class="text-slate-400 text-center">چالش روزانه در دسترس نیست</p>
                    `;
                    return;
                }

                // Preview version
                DOM.dailyChallengePreview.innerHTML = `
                    <div class="text-center">
                        <h4 class="font-semibold text-lg mb-2">${challenge.category}</h4>
                        <p class="text-slate-400 mb-4">${challenge.description || 'چالش ویژه امروز'}</p>
                        <div class="flex justify-center space-x-2 space-x-reverse">
                            ${Array.from({length: challenge.word.length}, (_, i) => `
                                <div class="letter-tile">?</div>
                            `).join('')}
                        </div>
                    </div>
                `;

                // Full version
                DOM.dailyChallengeContent.innerHTML = `
                    <div class="text-center">
                        <h3 class="font-bold text-xl mb-2">${challenge.category}</h3>
                        <p class="text-slate-400 mb-6">${challenge.description || 'چالش ویژه امروز'}</p>
                        <div class="flex justify-center space-x-3 space-x-reverse mb-6">
                            ${Array.from({length: challenge.word.length}, (_, i) => `
                                <div class="letter-tile text-lg">?</div>
                            `).join('')}
                        </div>
                        <div class="text-sm text-slate-400">
                            <p>طول کلمه: ${Utils.toPersianDigits(challenge.word.length)} حرف</p>
                            <p class="mt-1">${Utils.toPersianDigits(challenge.participants || 0)} نفر تاکنون شرکت کرده‌اند</p>
                        </div>
                    </div>
                `;

                DOM.joinChallengeBtn.disabled = false;
                DOM.challengeDate.textContent = 'امروز';
                DOM.challengeParticipants.textContent = `${Utils.toPersianDigits(challenge.participants || 0)} شرکت‌کننده`;
            }
        };

        // Socket Management
        const SocketManager = {
            init() {
                AppState.socket = io(CONFIG.SOCKET_URL, {
                    transports: ['websocket', 'polling'],
                    reconnectionAttempts: CONFIG.RECONNECTION_ATTEMPTS,
                    reconnectionDelay: CONFIG.RECONNECTION_DELAY
                });

                SocketManager.setupEventListeners();
            },

            setupEventListeners() {
                const socket = AppState.socket;

                socket.on('connect', () => {
                    console.log('🔗 متصل به سرور');
                    Utils.showNotification('اتصال برقرار شد', 'success');
                    Application.initialize();
                });

                socket.on('disconnect', () => {
                    console.log('🔴 قطع ارتباط با سرور');
                    Utils.showNotification('اتصال قطع شد', 'error');
                });

                socket.on('login_success', (userData) => {
                    UserManager.updateProfile(userData);
                    Utils.showNotification(`خوش آمدید ${userData.name}!`, 'success');
                });

                socket.on('user_profile', (profile) => {
                    UserManager.updateProfile(profile);
                });

                socket.on('game_created', (game) => {
                    Utils.showNotification(`بازی ${game.code} ایجاد شد!`, 'success');
                    GameManager.loadWaitingGames();
                });

                socket.on('game_joined', (game) => {
                    Utils.showNotification(`به بازی ${game.code} پیوستید`, 'success');
                    // TODO: Show game view
                });

                socket.on('waiting_games', (games) => {
                    GameManager.renderWaitingGames(games);
                });

                socket.on('daily_challenge', (challenge) => {
                    ChallengeManager.renderDailyChallenge(challenge);
                });

                socket.on('leaderboard_update', (leaderboard) => {
                    // TODO: Render leaderboard
                });

                socket.on('game_error', (error) => {
                    Utils.showNotification(error.message, 'error');
                });
            }
        };

        // Main Application
        const Application = {
            async initialize() {
                try {
                    // Initialize Telegram Web App
                    if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
                        Telegram.WebApp.ready();
                        Telegram.WebApp.expand();
                        
                        const tgUser = Telegram.WebApp.initDataUnsafe?.user;
                        if (tgUser) {
                            await UserManager.login({
                                userId: tgUser.id.toString(),
                                name: tgUser.first_name || 'کاربر',
                                username: tgUser.username
                            });
                        }
                    } else {
                        // Development fallback
                        await UserManager.login({
                            userId: 'DEV_' + Math.floor(Math.random() * 100000),
                            name: 'کاربر تستی',
                            username: 'test_user'
                        });
                    }

                    // Show main app
                    DOM.loadingScreen.classList.add('hidden');
                    DOM.app.classList.remove('hidden');

                    // Load initial data
                    TabManager.loadTabData('dashboard');

                } catch (error) {
                    console.error('❌ خطای راه‌اندازی برنامه:', error);
                    Utils.showNotification('خطا در راه‌اندازی برنامه', 'error');
                }
            }
        };

        // Global Functions
        window.showTab = TabManager.show;
        window.createGame = GameManager.showGameMode;

        // Event Listeners
        document.addEventListener('DOMContentLoaded', () => {
            // Tab buttons
            document.querySelectorAll('.nav-tab').forEach(button => {
                button.addEventListener('click', (e) => {
                    const tabName = e.currentTarget.getAttribute('data-tab');
                    TabManager.show(tabName);
                });
            });

            // Create game button
            DOM.createGameBtn.addEventListener('click', () => {
                GameManager.createGame();
            });

            // Refresh games button
            DOM.refreshGamesBtn.addEventListener('click', () => {
                GameManager.loadWaitingGames();
            });

            // Join challenge button
            DOM.joinChallengeBtn.addEventListener('click', () => {
                Utils.showNotification('شروع چالش روزانه', 'success');
                // TODO: Implement challenge start
            });

            // Initialize socket connection
            SocketManager.init();
        });

        // Service Worker Registration (for PWA)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(registration => {
                        console.log('✅ ServiceWorker registered');
                    })
                    .catch(error => {
                        console.log('❌ ServiceWorker registration failed');
                    });
            });
        }
    </script>
</body>
</html>
