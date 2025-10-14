const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || `https://wordly.ct.ws`;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

class WordGameBot {
    constructor() {
        this.users = new Map(); // ذخیره کاربران
        this.games = new Map(); // ذخیره بازی‌ها
        this.activeGameTimers = new Map(); // تایمرهای بازی
        
        console.log('🎮 ربات بازی حدس کلمه راه‌اندازی شد');
    }

    log(message) {
        const timestamp = new Date().toLocaleString('fa-IR');
        console.log(`[${timestamp}] ${message}`);
    }

    generateGameId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    // ایجاد بازی جدید
    async createGame(chatId, userId, firstName) {
        try {
            const gameId = this.generateGameId();
            
            // ثبت کاربر
            this.users.set(userId, {
                userId: userId,
                firstName: firstName,
                totalScore: 0,
                gamesPlayed: 0,
                bestScore: 0,
                multiplayerWins: 0,
                hintsUsed: 0,
                createdAt: new Date()
            });

            // ایجاد بازی
            const game = {
                gameId: gameId,
                creatorId: userId,
                creatorName: firstName,
                opponentId: null,
                opponentName: null,
                word: null,
                wordDisplay: null,
                guessedLetters: [],
                attemptsLeft: 6,
                maxAttempts: 6,
                hintsUsedCreator: 0,
                hintsUsedOpponent: 0,
                maxHints: 2,
                status: 'waiting',
                currentTurn: 'creator',
                creatorScore: 0,
                opponentScore: 0,
                wordSetter: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            this.games.set(gameId, game);

            // ایجاد لینک بازی
            const gameUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${userId}&role=creator`;

            const message = `
🎮 <b>بازی جدید ایجاد شد!</b>

🆔 <b>کد بازی:</b> <code>${gameId}</code>
👤 <b>سازنده:</b> ${firstName}
⏳ <b>وضعیت:</b> در انتظار بازیکن دوم

📝 برای شروع بازی روی دکمه زیر کلیک کنید:
            `.trim();

            await bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { 
                                text: '🚀 ورود به صفحه بازی', 
                                web_app: { url: gameUrl } 
                            }
                        ],
                        [
                            { 
                                text: '📋 کپی کد بازی', 
                                callback_data: `copy_${gameId}` 
                            }
                        ]
                    ]
                }
            });

            // تایمر لغو خودکار
            const timer = setTimeout(async () => {
                const currentGame = this.games.get(gameId);
                if (currentGame && currentGame.status === 'waiting') {
                    await this.cancelGame(gameId, '⏰ زمان بازی به پایان رسید');
                }
            }, 10 * 60 * 1000);

            this.activeGameTimers.set(gameId, timer);

            this.log(`✅ بازی ${gameId} توسط ${firstName} ایجاد شد`);

        } catch (error) {
            this.log(`❌ خطا در ایجاد بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در ایجاد بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    // پیوستن به بازی
    async joinGame(chatId, userId, firstName, gameId) {
        try {
            const game = this.games.get(gameId);
            
            if (!game) {
                await bot.sendMessage(chatId, '❌ بازی مورد نظر یافت نشد.');
                return;
            }

            if (game.creatorId === userId) {
                await bot.sendMessage(chatId, '❌ نمی‌توانید به بازی خودتان بپیوندید.');
                return;
            }

            if (game.status !== 'waiting') {
                await bot.sendMessage(chatId, '❌ این بازی قبلاً شروع شده است.');
                return;
            }

            // ثبت کاربر
            this.users.set(userId, {
                userId: userId,
                firstName: firstName,
                totalScore: 0,
                gamesPlayed: 0,
                bestScore: 0,
                multiplayerWins: 0,
                hintsUsed: 0,
                createdAt: new Date()
            });

            // آپدیت بازی
            game.opponentId = userId;
            game.opponentName = firstName;
            game.status = 'waiting_for_word';
            game.updatedAt = new Date();
            this.games.set(gameId, game);

            // لغو تایمر انتظار
            if (this.activeGameTimers.has(gameId)) {
                clearTimeout(this.activeGameTimers.get(gameId));
                this.activeGameTimers.delete(gameId);
            }

            // لینک بازی برای بازیکن دوم
            const opponentUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${userId}&role=opponent`;

            // پیام به بازیکن دوم
            await bot.sendMessage(chatId, 
                `🎉 <b>به بازی پیوستید!</b>\n\n` +
                `🆔 کد بازی: <code>${gameId}</code>\n` +
                `👤 سازنده: ${game.creatorName}\n` +
                `⏳ وضعیت: منتظر ثبت کلمه توسط سازنده\n\n` +
                `برای ورود به بازی کلیک کنید:`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🎮 ورود به بازی', web_app: { url: opponentUrl } }
                        ]]
                    }
                }
            );

            // اطلاع به سازنده
            const creatorUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${game.creatorId}&role=creator`;
            await bot.sendMessage(game.creatorId,
                `🎊 <b>بازیکن دوم پیوست!</b>\n\n` +
                `👤 بازیکن: ${firstName}\n` +
                `🆔 کد بازی: <code>${gameId}</code>\n` +
                `📝 لطفاً کلمه مخفی را ثبت کنید\n\n` +
                `برای ثبت کلمه کلیک کنید:`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🔐 ثبت کلمه مخفی', web_app: { url: creatorUrl } }
                        ]]
                    }
                }
            );

            this.log(`✅ ${firstName} به بازی ${gameId} پیوست`);

        } catch (error) {
            this.log(`❌ خطا در پیوستن به بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در پیوستن به بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    async cancelGame(gameId, reason) {
        try {
            const game = this.games.get(gameId);
            if (!game) return;

            game.status = 'cancelled';
            game.updatedAt = new Date();
            this.games.set(gameId, game);

            // حذف تایمر
            if (this.activeGameTimers.has(gameId)) {
                clearTimeout(this.activeGameTimers.get(gameId));
                this.activeGameTimers.delete(gameId);
            }

            if (game.creatorId) {
                await bot.sendMessage(game.creatorId, `❌ ${reason}`);
            }
            if (game.opponentId) {
                await bot.sendMessage(game.opponentId, `❌ ${reason}`);
            }

        } catch (error) {
            this.log(`❌ خطا در لغو بازی: ${error.message}`);
        }
    }

    createMainMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🎮 ایجاد بازی دو نفره', callback_data: 'create_game' }],
                    [{ text: '🔍 پیوستن به بازی', callback_data: 'join_game' }],
                    [{ text: '📊 آمار من', callback_data: 'stats' }],
                    [{ text: 'ℹ️ راهنما', callback_data: 'help' }]
                ]
            }
        };
    }

    async handleStart(chatId, user) {
        const welcome = `
🌟 <b>سلام ${user.firstName}!</b>

🎮 <b>به بازی حدس کلمه خوش آمدید</b>

✨ <b>ویژگی‌ها:</b>
• 👥 بازی دو نفره آنلاین
• 🔤 پشتیبانی از فارسی و انگلیسی
• 💡 سیستم راهنمایی هوشمند
• 🏆 امتیازدهی پیشرفته
• ⚡ رابط کاربری زیبا

برای شروع یکی از گزینه‌های زیر را انتخاب کنید:
        `.trim();

        await bot.sendMessage(chatId, welcome, {
            parse_mode: 'HTML',
            ...this.createMainMenu()
        });
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'کاربر';
        const text = msg.text || '';

        this.log(`📩 ${firstName}: ${text}`);

        try {
            if (text.startsWith('/start')) {
                await this.handleStart(chatId, { userId, firstName });
            }
            else if (text.startsWith('/join')) {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    await this.joinGame(chatId, userId, firstName, parts[1].toUpperCase());
                } else {
                    await bot.sendMessage(chatId,
                        `🔍 <b>پیوستن به بازی</b>\n\n` +
                        `برای پیوستن به بازی، کد آن را وارد کنید:\n\n` +
                        `<code>/join کد_بازی</code>\n\n` +
                        `مثال:\n<code>/join ABC123</code>`,
                        { parse_mode: 'HTML' }
                    );
                }
            }
            else if (text.startsWith('/cancel')) {
                const parts = text.split(' ');
                if (parts.length === 2) {
                    await this.cancelGame(parts[1].toUpperCase(), 'بازی توسط سازنده لغو شد');
                } else {
                    await bot.sendMessage(chatId, 'لطفاً کد بازی را وارد کنید: /cancel کد_بازی');
                }
            }
            else {
                await this.handleStart(chatId, { userId, firstName });
            }
        } catch (error) {
            this.log(`❌ خطا در پردازش پیام: ${error.message}`);
        }
    }

    async handleCallbackQuery(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const firstName = callbackQuery.from.first_name || 'کاربر';
        const data = callbackQuery.data;

        try {
            if (data.startsWith('copy_')) {
                const gameId = data.replace('copy_', '');
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: `کد ${gameId} کپی شد!`,
                    show_alert: false
                });
            }
            else {
                switch (data) {
                    case 'create_game':
                        await this.createGame(chatId, userId, firstName);
                        break;

                    case 'join_game':
                        await bot.sendMessage(chatId,
                            `🔍 <b>پیوستن به بازی</b>\n\n` +
                            `برای پیوستن به بازی، کد آن را وارد کنید:\n\n` +
                            `<code>/join کد_بازی</code>\n\n` +
                            `مثال:\n<code>/join ABC123</code>`,
                            { parse_mode: 'HTML' }
                        );
                        break;

                    case 'stats':
                        const stats = await this.getUserStats(userId);
                        await bot.sendMessage(chatId, stats, { parse_mode: 'HTML' });
                        break;

                    case 'help':
                        await bot.sendMessage(chatId,
                            `📖 <b>راهنمای بازی</b>\n\n` +
                            `🎯 <b>هدف بازی:</b>\n` +
                            `حدس زدن کلمه مخفی با کمترین تعداد حدس\n\n` +
                            `👥 <b>بازی دو نفره:</b>\n` +
                            `۱. یک بازی ایجاد کنید\n` +
                            `۲. کد بازی را به دوستتان بدهید\n` +
                            `۳. دوستتان با /join کد_بازی می‌پیوندد\n` +
                            `۴. شما کلمه مخفی را ثبت می‌کنید\n` +
                            `۵. دوستتان حدس می‌زند\n\n` +
                            `💡 <b>راهنمایی:</b>\n` +
                            `• هر بازیکن ۲ بار می‌تواند راهنمایی بگیرد\n` +
                            `• راهنمایی یک حرف تصادفی نشان می‌دهد\n\n` +
                            `🏆 <b>امتیازدهی:</b>\n` +
                            `• حدس درست: +۱۰ امتیاز\n` +
                            `• برنده شدن: +۵۰ امتیاز\n` +
                            `• بازی تمام شده: +۲۰ امتیاز برای سازنده`,
                            { parse_mode: 'HTML' }
                        );
                        break;
                }
            }
        } catch (error) {
            this.log(`❌ خطا در callback: ${error.message}`);
        }
    }

    async getUserStats(userId) {
        try {
            const user = this.users.get(userId);
            if (!user) {
                return `📊 <b>آمار بازی</b>\n\n👤 شما هنوز بازی نکرده‌اید!`;
            }

            return `
📊 <b>آمار بازی شما</b>

👤 نام: ${user.firstName || 'کاربر'}
🏆 امتیاز کل: ${user.totalScore}
🎮 بازی‌های انجام شده: ${user.gamesPlayed}
⭐ بهترین امتیاز: ${user.bestScore}
👥 بردهای دو نفره: ${user.multiplayerWins}
💡 راهنماهای استفاده شده: ${user.hintsUsed}
            `.trim();
        } catch (error) {
            this.log(`❌ خطا در دریافت آمار: ${error.message}`);
            return '❌ خطا در دریافت آمار';
        }
    }

    // API Routes
    setupRoutes() {
        // API برای وضعیت بازی
        app.get('/api/game/:gameId', async (req, res) => {
            try {
                const { gameId } = req.params;
                
                if (!gameId) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'کد بازی الزامی است' 
                    });
                }
                
                const game = this.games.get(gameId);
                
                if (!game) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'بازی یافت نشد' 
                    });
                }

                res.json({ 
                    success: true, 
                    game: game 
                });
                
            } catch (error) {
                this.log(`❌ خطا در دریافت بازی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطای سرور در دریافت وضعیت بازی' 
                });
            }
        });

        // API برای ثبت کلمه
        app.post('/api/game/:gameId/word', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, word } = req.body;

                if (!gameId || !userId || !word) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'پارامترهای الزامی ارسال نشده' 
                    });
                }

                const game = this.games.get(gameId);
                if (!game) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'بازی یافت نشد' 
                    });
                }

                // فقط سازنده می‌تواند کلمه را تنظیم کند
                if (game.creatorId != userId) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'فقط سازنده می‌تواند کلمه را تنظیم کند' 
                    });
                }

                if (game.status !== 'waiting_for_word') {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'بازی در وضعیت مناسب برای ثبت کلمه نیست' 
                    });
                }

                if (!word || word.length < 3 || word.length > 15) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'کلمه باید بین ۳ تا ۱۵ حرف باشد' 
                    });
                }

                if (!/^[\u0600-\u06FFa-zA-Z\s]+$/.test(word)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'کلمه باید شامل حروف فارسی، انگلیسی یا فاصله باشد' 
                    });
                }

                const wordDisplay = word.split('').map(c => c === ' ' ? ' ' : '_').join('');

                // آپدیت بازی
                game.word = word;
                game.wordDisplay = wordDisplay;
                game.status = 'active';
                game.currentTurn = 'opponent';
                game.wordSetter = 'creator';
                game.updatedAt = new Date();
                this.games.set(gameId, game);

                res.json({ 
                    success: true, 
                    message: 'کلمه ثبت شد و بازی شروع شد',
                    wordDisplay: wordDisplay,
                    currentTurn: 'opponent'
                });

            } catch (error) {
                this.log(`❌ خطا در ثبت کلمه: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطای سرور در ثبت کلمه' 
                });
            }
        });

        // API برای ارسال حدس
        app.post('/api/game/:gameId/guess', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, guess } = req.body;

                if (!gameId || !userId || !guess) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'پارامترهای الزامی ارسال نشده' 
                    });
                }

                const game = this.games.get(gameId);
                if (!game) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'بازی یافت نشد' 
                    });
                }

                // بررسی نقش کاربر
                const userRole = game.creatorId == userId ? 'creator' : 
                               (game.opponentId == userId ? 'opponent' : null);
                
                if (!userRole) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'شما در این بازی نیستید' 
                    });
                }

                // بررسی نوبت
                if (game.currentTurn !== userRole) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'اکنون نوبت شما نیست' 
                    });
                }

                // بررسی اینکه آیا این کاربر کلمه را تنظیم کرده است
                if (userRole === game.wordSetter) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'شما کلمه را تنظیم کرده‌اید و نمی‌توانید حدس بزنید' 
                    });
                }

                // اعتبارسنجی حدس
                if (!guess || guess.length !== 1 || !/^[\u0600-\u06FFa-zA-Z]$/.test(guess)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید' 
                    });
                }

                const guessLower = guess.toLowerCase();

                // بررسی تکراری نبودن حدس
                if (game.guessedLetters.some(g => g.letter === guessLower)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'این حرف قبلاً حدس زده شده است' 
                    });
                }

                // پردازش حدس
                let correct = false;
                let newWordDisplay = '';
                
                for (let i = 0; i < game.word.length; i++) {
                    const currentChar = game.word[i];
                    if (currentChar.toLowerCase() === guessLower) {
                        newWordDisplay += currentChar;
                        correct = true;
                    } else {
                        newWordDisplay += game.wordDisplay[i] !== '_' ? game.wordDisplay[i] : '_';
                    }
                }

                // افزودن به حروف حدس زده شده
                const newGuessedLetters = [...game.guessedLetters, { 
                    letter: guessLower, 
                    correct 
                }];
                
                // محاسبه امتیاز و تغییر نوبت
                let newAttemptsLeft = game.attemptsLeft;
                let newCreatorScore = game.creatorScore;
                let newOpponentScore = game.opponentScore;
                let newCurrentTurn = game.currentTurn;
                let newStatus = game.status;

                if (correct) {
                    // افزایش امتیاز بازیکن فعلی
                    if (userRole === 'creator') {
                        newCreatorScore += 10;
                    } else {
                        newOpponentScore += 10;
                    }
                    // اگر حدس درست بود، نوبت تغییر نمی‌کند
                } else {
                    newAttemptsLeft--;
                    // اگر حدس نادرست بود، نوبت به بازیکن دیگر می‌رود
                    newCurrentTurn = userRole === 'creator' ? 'opponent' : 'creator';
                }

                // بررسی پایان بازی
                if (!newWordDisplay.includes('_')) {
                    newStatus = 'completed';
                    // امتیاز اضافی برای برنده
                    if (userRole === 'creator') {
                        newCreatorScore += 50;
                    } else {
                        newOpponentScore += 50;
                    }
                    
                    // آپدیت آمار کاربران
                    this.updateUserStats(userRole === 'creator' ? game.creatorId : game.opponentId, newCreatorScore + newOpponentScore, true);
                } else if (newAttemptsLeft <= 0) {
                    newStatus = 'completed';
                    // امتیاز برای کسی که کلمه را تنظیم کرده
                    if (game.wordSetter === 'creator') {
                        newCreatorScore += 20;
                        this.updateUserStats(game.creatorId, 20, false);
                    } else {
                        newOpponentScore += 20;
                        this.updateUserStats(game.opponentId, 20, false);
                    }
                }

                // آپدیت بازی
                game.wordDisplay = newWordDisplay;
                game.guessedLetters = newGuessedLetters;
                game.attemptsLeft = newAttemptsLeft;
                game.currentTurn = newCurrentTurn;
                game.status = newStatus;
                game.creatorScore = newCreatorScore;
                game.opponentScore = newOpponentScore;
                game.updatedAt = new Date();
                
                this.games.set(gameId, game);

                res.json({ 
                    success: true,
                    correct: correct,
                    currentWordState: newWordDisplay,
                    attemptsLeft: newAttemptsLeft,
                    gameCompleted: newStatus === 'completed',
                    currentTurn: newCurrentTurn,
                    creatorScore: newCreatorScore,
                    opponentScore: newOpponentScore,
                    guessedLetters: newGuessedLetters
                });

            } catch (error) {
                this.log(`❌ خطا در پردازش حدس: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطای سرور در پردازش حدس' 
                });
            }
        });

        // API برای درخواست راهنمایی
        app.post('/api/game/:gameId/hint', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId } = req.body;

                if (!gameId || !userId) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'پارامترهای الزامی ارسال نشده' 
                    });
                }

                const game = this.games.get(gameId);
                if (!game) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'بازی یافت نشد' 
                    });
                }

                // بررسی نقش کاربر
                const userRole = game.creatorId == userId ? 'creator' : 
                               (game.opponentId == userId ? 'opponent' : null);
                
                if (!userRole) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'شما در این بازی نیستید' 
                    });
                }

                // بررسی نوبت
                if (game.currentTurn !== userRole) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'اکنون نوبت شما نیست' 
                    });
                }

                // بررسی اینکه آیا این کاربر کلمه را تنظیم کرده است
                if (userRole === game.wordSetter) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'شما کلمه را تنظیم کرده‌اید و نمی‌توانید راهنمایی بگیرید' 
                    });
                }

                // بررسی تعداد راهنماهای استفاده شده
                const hintsUsed = userRole === 'creator' ? game.hintsUsedCreator : game.hintsUsedOpponent;
                if (hintsUsed >= game.maxHints) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'شما تمام راهنمایی‌های خود را استفاده کرده‌اید' 
                    });
                }

                // یافتن حروفی که هنوز فاش نشده‌اند
                const hiddenLetters = [];
                
                for (let i = 0; i < game.word.length; i++) {
                    const char = game.word[i].toLowerCase();
                    if (char !== ' ' && game.wordDisplay[i] === '_' && !hiddenLetters.includes(char)) {
                        hiddenLetters.push(char);
                    }
                }

                if (hiddenLetters.length === 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'تمام حروف کلمه قبلاً فاش شده‌اند' 
                    });
                }

                // انتخاب یک حرف تصادفی
                const hintLetter = hiddenLetters[Math.floor(Math.random() * hiddenLetters.length)];

                // فاش کردن حرف در کلمه نمایشی
                let newWordDisplay = '';
                for (let i = 0; i < game.word.length; i++) {
                    if (game.word[i].toLowerCase() === hintLetter) {
                        newWordDisplay += game.word[i];
                    } else {
                        newWordDisplay += game.wordDisplay[i];
                    }
                }

                // کاهش تعداد تلاش‌ها
                const newAttemptsLeft = Math.max(0, game.attemptsLeft - 1);

                // آپدیت تعداد راهنماهای استفاده شده
                if (userRole === 'creator') {
                    game.hintsUsedCreator++;
                } else {
                    game.hintsUsedOpponent++;
                }

                // تغییر نوبت
                const newCurrentTurn = userRole === 'creator' ? 'opponent' : 'creator';

                // آپدیت بازی
                game.wordDisplay = newWordDisplay;
                game.attemptsLeft = newAttemptsLeft;
                game.currentTurn = newCurrentTurn;
                game.updatedAt = new Date();
                this.games.set(gameId, game);

                // آپدیت آمار کاربر
                const user = this.users.get(userId);
                if (user) {
                    user.hintsUsed++;
                    this.users.set(userId, user);
                }

                res.json({ 
                    success: true,
                    hintLetter: hintLetter,
                    hintsLeft: game.maxHints - (userRole === 'creator' ? game.hintsUsedCreator : game.hintsUsedOpponent),
                    attemptsLeft: newAttemptsLeft,
                    currentTurn: newCurrentTurn,
                    wordDisplay: newWordDisplay
                });

            } catch (error) {
                this.log(`❌ خطا در درخواست راهنمایی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطای سرور در درخواست راهنمایی' 
                });
            }
        });

        // صفحه اصلی
        app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html dir="rtl" lang="fa">
                <head>
                    <title>بازی حدس کلمه - Wordly</title>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { 
                            font-family: Tahoma, Arial, sans-serif; 
                            text-align: center; 
                            padding: 50px; 
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; 
                            margin: 0;
                        }
                        .container { 
                            max-width: 500px; 
                            margin: 0 auto; 
                            background: rgba(255,255,255,0.1); 
                            padding: 40px; 
                            border-radius: 20px; 
                            backdrop-filter: blur(10px);
                            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                        }
                        h1 { 
                            font-size: 2.5em; 
                            margin-bottom: 20px; 
                            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                        }
                        .btn {
                            display: inline-block;
                            background: linear-gradient(45deg, #FF6B6B, #FF8E53);
                            color: white;
                            padding: 15px 30px;
                            border-radius: 50px;
                            text-decoration: none;
                            font-weight: bold;
                            margin: 10px;
                            transition: transform 0.3s ease;
                        }
                        .btn:hover {
                            transform: translateY(-3px);
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎮 بازی حدس کلمه</h1>
                        <p>یک بازی دو نفره جذاب و سرگرم کننده</p>
                        <p>برای استفاده از بازی، لطفاً از طریق ربات تلگرام اقدام کنید:</p>
                        <a href="https://t.me/WordlyGameBot" class="btn">شروع بازی در تلگرام</a>
                    </div>
                </body>
                </html>
            `);
        });

        // سرو کردن فایل game.html
        app.get('/game.html', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'game.html'));
        });
    }

    updateUserStats(userId, score, isWin) {
        try {
            const user = this.users.get(userId);
            if (user) {
                user.totalScore += score;
                user.gamesPlayed += 1;
                user.bestScore = Math.max(user.bestScore, score);
                if (isWin) {
                    user.multiplayerWins += 1;
                }
                this.users.set(userId, user);
            }
        } catch (error) {
            this.log(`❌ خطا در به روزرسانی آمار کاربر: ${error.message}`);
        }
    }

    async start() {
        this.setupRoutes();

        // راه‌اندازی سرور
        app.listen(PORT, () => {
            this.log(`🚀 سرور اجرا شد روی پورت ${PORT}`);
            this.log(`🌐 آدرس: ${WEB_APP_URL}`);
            this.log(`💾 استفاده از دیتابیس داخلی (در حافظه)`);
        });

        // هندلرهای ربات
        bot.on('message', (msg) => this.handleMessage(msg));
        bot.on('callback_query', (callbackQuery) => this.handleCallbackQuery(callbackQuery));

        this.log('🤖 ربات تلگرام آماده دریافت پیام');
    }
}

// اجرای برنامه
const gameBot = new WordGameBot();
gameBot.start();
