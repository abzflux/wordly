const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws/';

// تنظیمات PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

app.use(express.json());
app.use(express.static('public'));

class WordGameBot {
    constructor() {
        this.db = null;
        this.dbConnected = false;
        this.activeMultiplayerGames = new Map();
        this.waitingGames = new Map();
        this.wordCategories = {
            'میوه': ['سیب', 'موز', 'پرتقال', 'انگور', 'هندوانه', 'خربزه', 'انار', 'انجیر', 'کیوی', 'لیمو'],
            'حیوانات': ['شیر', 'فیل', 'میمون', 'گربه', 'سگ', 'خرگوش', 'گاو', 'گوسفند', 'مرغ', 'خروس'],
            'شهرها': ['تهران', 'مشهد', 'اصفهان', 'شیراز', 'تبریز', 'اهواز', 'کرج', 'قم', 'کرمان', 'رشت'],
            'کشورها': ['ایران', 'ترکیه', 'آلمان', 'فرانسه', 'ایتالیا', 'ژاپن', 'چین', 'هند', 'روسیه', 'کانادا'],
            'غذاها': ['قورمه', 'کباب', 'پلو', 'آش', 'سوپ', 'پیتزا', 'همبرگر', 'سالاد', 'ماکارونی', 'لازانیا'],
            'اشیا': ['میز', 'صندلی', 'کتاب', 'قلم', 'دفتر', 'تلویزیون', 'تلفن', 'کامپیوتر', 'لامپ', 'پنجره']
        };
        console.log('🤖 ربات تلگرام راه‌اندازی شد');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }

    async connectDB() {
        try {
            this.db = new Pool({
                host: DB_HOST,
                user: DB_USER,
                password: DB_PASSWORD,
                database: DB_NAME,
                port: DB_PORT,
                ssl: {
                    rejectUnauthorized: false
                },
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            
            const client = await this.db.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.dbConnected = true;
            this.log('✅ متصل به دیتابیس PostgreSQL');
            
            await this.createTables();
            await this.loadActiveGames();
            
        } catch (error) {
            this.log(`❌ خطا در اتصال به دیتابیس: ${error.message}`);
            this.dbConnected = false;
        }
    }

    async createTables() {
        try {
            await this.db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    userid BIGINT PRIMARY KEY,
                    firstname VARCHAR(255) NOT NULL,
                    username VARCHAR(255),
                    totalscore INTEGER DEFAULT 0,
                    gamesplayed INTEGER DEFAULT 0,
                    bestscore INTEGER DEFAULT 0,
                    multiplayerwins INTEGER DEFAULT 0,
                    hintsused INTEGER DEFAULT 0,
                    createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updatedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            await this.db.query(`
                CREATE TABLE IF NOT EXISTS multiplayer_games (
                    gameid VARCHAR(10) PRIMARY KEY,
                    creatorid BIGINT NOT NULL,
                    opponentid BIGINT,
                    word VARCHAR(255),
                    wordlength INTEGER DEFAULT 0,
                    status VARCHAR(20) DEFAULT 'waiting',
                    winnerid BIGINT,
                    category VARCHAR(100) DEFAULT 'عمومی',
                    hints INTEGER DEFAULT 2,
                    hintsused INTEGER DEFAULT 0,
                    maxattempts INTEGER DEFAULT 6,
                    attempts INTEGER DEFAULT 0,
                    guessedletters TEXT,
                    currentwordstate VARCHAR(255),
                    creatorscore INTEGER DEFAULT 0,
                    opponentscore INTEGER DEFAULT 0,
                    lastactivity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updatedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            this.log('✅ جداول دیتابیس ایجاد شدند');
        } catch (error) {
            this.log(`❌ خطا در ایجاد جداول: ${error.message}`);
        }
    }

    generateGameId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    createMainMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🎮 شروع تک نفره',
                            web_app: { url: WEB_APP_URL }
                        }
                    ],
                    [
                        {
                            text: '👥 بازی دو نفره',
                            callback_data: 'multiplayer'
                        }
                    ],
                    [
                        {
                            text: '📊 آمار و امتیازات',
                            callback_data: 'stats'
                        },
                        {
                            text: '🏆 جدول رتبه‌بندی', 
                            callback_data: 'leaderboard'
                        }
                    ],
                    [
                        {
                            text: '📖 راهنمای بازی',
                            callback_data: 'help'
                        },
                        {
                            text: 'ℹ️ درباره بازی',
                            callback_data: 'about'
                        }
                    ]
                ]
            }
        };
    }

    createMultiplayerMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🆕 ایجاد بازی جدید',
                            callback_data: 'create_multiplayer'
                        }
                    ],
                    [
                        {
                            text: '🔍 پیدا کردن بازی',
                            callback_data: 'find_multiplayer'
                        }
                    ],
                    [
                        {
                            text: '📋 بازی‌های فعال من',
                            callback_data: 'my_games'
                        }
                    ],
                    [
                        {
                            text: '🔙 بازگشت به منوی اصلی',
                            callback_data: 'main_menu'
                        }
                    ]
                ]
            }
        };
    }

    async handleStart(chatId, userData) {
        const welcomeText = 
            `🌟 <b>سلام ${userData.firstName} عزیز!</b>\n\n` +
            "🎮 <b>به ربات بازی حدس کلمه خوش آمدید!</b>\n\n" +
            "✨ <b>ویژگی‌های جدید:</b>\n" +
            "• 🎯 سه سطح مختلف (آسان، متوسط، سخت)\n" +
            "• 👥 <b>حالت دو نفره آنلاین</b>\n" +
            "• 🏆 سیستم امتیازدهی پیشرفته\n" + 
            "• 📊 جدول رتبه‌بندی\n" +
            "• 💡 سیستم راهنمایی هوشمند\n" +
            "• 🗂️ دسته‌بندی کلمات\n\n" +
            "برای شروع بازی روی گزینه مورد نظر کلیک کنید:";

        try {
            await this.getUserStats(userData.userId);
            await bot.sendMessage(chatId, welcomeText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
            this.log(`✅ پیام خوش‌آمدگویی برای ${userData.firstName} ارسال شد`);
        } catch (error) {
            this.log(`❌ خطا در ارسال پیام: ${error.message}`);
        }
    }

    async handleMultiplayerMenu(chatId, userId) {
        const menuText = 
            "👥 <b>بازی دو نفره آنلاین</b>\n\n" +
            "در این حالت می‌توانید با دوستان خود بازی کنید!\n\n" +
            "🎯 <b>طریقه بازی:</b>\n" +
            "1. یک بازی جدید ایجاد کنید\n" +
            "2. دسته‌بندی و کلمه مخفی را وارد کنید\n" +
            "3. دوست شما کلمه را حدس می‌زند\n" +
            "4. هر کس زودتر حدس بزند برنده است!\n\n" +
            "💡 <b>ویژگی‌های جدید:</b>\n" +
            "• 🗂️ انتخاب دسته‌بندی کلمه\n" +
            "• 💡 سیستم راهنمایی (۲ بار)\n" +
            "• ⏱️ زمان‌بندی خودکار\n\n" +
            "گزینه مورد نظر را انتخاب کنید:";

        await bot.sendMessage(chatId, menuText, {
            parse_mode: 'HTML',
            ...this.createMultiplayerMenu()
        });
    }

    // ایجاد بازی جدید از طریق تلگرام
    async createMultiplayerGame(chatId, userId, firstName) {
        try {
            // ثبت کاربر در جدول users اگر موجود نباشد
            await this.db.query(`
                INSERT INTO users (userid, firstname)
                VALUES ($1, $2)
                ON CONFLICT (userid) DO NOTHING
            `, [userId, firstName]);

            const gameId = this.generateGameId();

            // ایجاد رکورد بازی دو نفره در دیتابیس
            await this.db.query(`
                INSERT INTO multiplayer_games (gameid, creatorid, status)
                VALUES ($1, $2, 'waiting')
            `, [gameId, userId]);

            // ذخیره در حافظه محلی
            const game = {
                gameid: gameId,
                creatorid: userId,
                status: 'waiting',
                createdat: new Date(),
                updatedat: new Date()
            };
            this.activeMultiplayerGames.set(gameId, game);
            this.waitingGames.set(userId, gameId);

            // پیام به سازنده
            const gameText = 
                `🎮 <b>بازی دو نفره ایجاد شد!</b>\n\n` +
                `🆔 <b>کد بازی:</b> <code>${gameId}</code>\n` +
                `👤 <b>سازنده:</b> ${firstName}\n` +
                `⏳ <b>وضعیت:</b> در انتظار بازیکن دوم\n\n` +
                `📝 <b>برای شروع بازی:</b>\n` +
                `1. کد بازی را برای دوست خود بفرستید\n` +
                `2. یا از گزینه "پیدا کردن بازی" استفاده کنید\n\n` +
                `🌐 <b>یا از لینک زیر استفاده کنید:</b>\n` +
                `${WEB_APP_URL}game?gameId=${gameId}&userId=${userId}&role=creator\n\n` +
                `⚡ بازی به طور خودکار در ۱۰ دقیقه لغو می‌شود`;

            await bot.sendMessage(chatId, gameText, {
                parse_mode: 'HTML'
            });

            // تایمر ۱۰ دقیقه‌ای برای لغو بازی در صورت عدم پیوستن بازیکن دوم
            setTimeout(async () => {
                const currentGame = this.activeMultiplayerGames.get(gameId);
                if (currentGame && currentGame.status === 'waiting') {
                    await this.cancelMultiplayerGame(gameId, '⏰ زمان بازی به پایان رسید');
                }
            }, 10 * 60 * 1000);

        } catch (error) {
            this.log(`❌ خطا در ایجاد بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در ایجاد بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    async cancelMultiplayerGame(gameId, reason = 'بازی لغو شد') {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game) return;

            await this.db.query(
                'UPDATE multiplayer_games SET status = $1 WHERE gameid = $2',
                ['cancelled', gameId]
            );

            if (game.creatorid) {
                await bot.sendMessage(game.creatorid, `❌ ${reason}`);
            }
            if (game.opponentid) {
                await bot.sendMessage(game.opponentid, `❌ ${reason}`);
            }

            this.activeMultiplayerGames.delete(gameId);
            this.waitingGames.delete(game.creatorid);

        } catch (error) {
            this.log(`❌ خطا در لغو بازی: ${error.message}`);
        }
    }

    async getUserStats(userId) {
        if (!this.dbConnected) return null;

        try {
            const result = await this.db.query(
                'SELECT * FROM users WHERE userId = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                await this.db.query(
                    'INSERT INTO users (userId, firstName, totalScore, gamesPlayed, bestScore, hintsUsed) VALUES ($1, $2, $3, $4, $5, $6)',
                    [userId, 'کاربر', 0, 0, 0, 0]
                );
                return {
                    userid: userId,
                    firstname: 'کاربر',
                    totalscore: 0,
                    gamesplayed: 0,
                    bestscore: 0,
                    multiplayerwins: 0,
                    hintsused: 0
                };
            }
            
            return result.rows[0];
        } catch (error) {
            this.log(`❌ خطا در دریافت اطلاعات کاربر: ${error.message}`);
            return null;
        }
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'کاربر';
        const username = msg.from.username || '';
        const text = msg.text || '';

        this.log(`📩 پیام از ${firstName}: ${text}`);

        const userData = {
            userId,
            firstName,
            username
        };

        try {
            switch (text) {
                case '/start':
                    await this.handleStart(chatId, userData);
                    break;
                    
                case '/game':
                    await bot.sendMessage(chatId, 
                        "🎯 <b>شروع بازی</b>\n\n" +
                        "برای تجربه‌ی بهترین بازی، روی دکمه زیر کلیک کنید:\n\n" +
                        "🖥️ بازی در مرورگر باز می‌شود\n" +
                        "📱 سازگار با موبایل و دسکتاپ\n" +
                        "⚡ عملکرد سریع و روان",
                        {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text: '🚀 بازی در مرورگر',
                                            web_app: { url: WEB_APP_URL }
                                        }
                                    ]
                                ]
                            }
                        }
                    );
                    break;

                case '/multiplayer':
                    await this.handleMultiplayerMenu(chatId, userId);
                    break;
                    
                default:
                    await bot.sendMessage(chatId, 
                        "🎮 <b>منوی اصلی بازی حدس کلمه</b>\n\n" +
                        "از گزینه‌های زیر استفاده کنید:",
                        {
                            parse_mode: 'HTML',
                            ...this.createMainMenu()
                        }
                    );
                    break;
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

        this.log(`🔘 کلیک از ${firstName}: ${data}`);

        try {
            switch (data) {
                case 'multiplayer':
                    await this.handleMultiplayerMenu(chatId, userId);
                    break;

                case 'create_multiplayer':
                    await this.createMultiplayerGame(chatId, userId, firstName);
                    break;

                case 'main_menu':
                    await this.handleStart(chatId, { userId, firstName });
                    break;
                    
                default:
                    await bot.sendMessage(chatId, 'دستور نامعتبر است.');
                    break;
            }
        } catch (error) {
            this.log(`❌ خطا در پردازش callback: ${error.message}`);
        }
    }

    async setupWebhook() {
        try {
            const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-app.onrender.com'}/webhook`;
            
            this.log(`🔄 در حال تنظیم وب‌هوک: ${webhookUrl}`);
            
            const response = await bot.setWebHook(webhookUrl);
            
            if (response) {
                this.log('✅ وب‌هوک با موفقیت تنظیم شد');
            } else {
                this.log('❌ خطا در تنظیم وب‌هوک');
            }
        } catch (error) {
            this.log(`❌ خطا در تنظیم وب‌هوک: ${error.message}`);
        }
    }

    async loadActiveGames() {
        try {
            const result = await this.db.query(
                "SELECT * FROM multiplayer_games WHERE status IN ('waiting', 'active')"
            );
            
            result.rows.forEach(game => {
                this.activeMultiplayerGames.set(game.gameid, game);
            });
            
            this.log(`✅ ${result.rows.length} بازی فعال لود شد`);
        } catch (error) {
            this.log(`❌ خطا در لود بازی‌های فعال: ${error.message}`);
        }
    }

    async start() {
        await this.connectDB();
        await this.setupWebhook();

        // Routes برای وب اپ
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        app.get('/game', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'game.html'));
        });

        // Webhook برای تلگرام
        app.post('/webhook', async (req, res) => {
            try {
                const update = req.body;
                
                if (update.message) {
                    await this.handleMessage(update.message);
                }
                
                if (update.callback_query) {
                    await this.handleCallbackQuery(update.callback_query);
                }
                
                res.sendStatus(200);
            } catch (error) {
                this.log(`❌ خطا در پردازش وب‌هوک: ${error.message}`);
                res.sendStatus(200);
            }
        });

        // API برای وب اپ
        app.post('/api/create-game', async (req, res) => {
            try {
                const { userId, firstName } = req.body;
                const gameId = this.generateGameId();

                await this.db.query(`
                    INSERT INTO users (userid, firstname)
                    VALUES ($1, $2)
                    ON CONFLICT (userid) DO NOTHING
                `, [userId, firstName]);

                await this.db.query(`
                    INSERT INTO multiplayer_games (gameid, creatorid, status)
                    VALUES ($1, $2, 'waiting')
                `, [gameId, userId]);

                const game = {
                    gameid: gameId,
                    creatorid: userId,
                    status: 'waiting',
                    createdat: new Date()
                };
                this.activeMultiplayerGames.set(gameId, game);

                res.json({ 
                    success: true, 
                    gameId: gameId,
                    message: 'بازی با موفقیت ایجاد شد'
                });

            } catch (error) {
                this.log(`❌ خطا در ایجاد بازی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در ایجاد بازی' 
                });
            }
        });

        // دریافت وضعیت بازی
        app.get('/api/game/:gameId', async (req, res) => {
            try {
                const { gameId } = req.params;
                let game = this.activeMultiplayerGames.get(gameId);
                
                if (!game) {
                    const result = await this.db.query(
                        'SELECT * FROM multiplayer_games WHERE gameid = $1',
                        [gameId]
                    );
                    
                    if (result.rows.length === 0) {
                        return res.status(404).json({ 
                            success: false, 
                            error: 'بازی یافت نشد' 
                        });
                    }
                    
                    game = result.rows[0];
                    this.activeMultiplayerGames.set(gameId, game);
                }

                res.json({ 
                    success: true, 
                    game: {
                        gameId: game.gameid,
                        creatorId: game.creatorid,
                        opponentId: game.opponentid,
                        category: game.category,
                        word: game.word,
                        wordLength: game.wordlength,
                        currentWordState: game.currentwordstate,
                        attempts: game.attempts,
                        maxAttempts: 6,
                        hintsUsed: game.hintsused,
                        maxHints: 2,
                        guessedLetters: JSON.parse(game.guessedletters || '[]'),
                        status: game.status,
                        winnerId: game.winnerid
                    }
                });

            } catch (error) {
                this.log(`❌ خطا در دریافت وضعیت بازی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در دریافت وضعیت بازی' 
                });
            }
        });

        // انتخاب دسته‌بندی
        app.post('/api/game/:gameId/category', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, category } = req.body;

                const game = this.activeMultiplayerGames.get(gameId);
                if (!game || game.creatorid != userId) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'شما سازنده این بازی نیستید' 
                    });
                }

                await this.db.query(
                    'UPDATE multiplayer_games SET category = $1 WHERE gameid = $2',
                    [category, gameId]
                );

                game.category = category;
                this.activeMultiplayerGames.set(gameId, game);

                res.json({ 
                    success: true, 
                    message: `دسته‌بندی "${category}" انتخاب شد` 
                });

            } catch (error) {
                this.log(`❌ خطا در انتخاب دسته‌بندی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در انتخاب دسته‌بندی' 
                });
            }
        });

        // ثبت کلمه مخفی
        app.post('/api/game/:gameId/word', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, word } = req.body;

                const game = this.activeMultiplayerGames.get(gameId);
                if (!game || game.creatorid != userId) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'شما سازنده این بازی نیستید' 
                    });
                }

                if (word.length < 3 || word.length > 15) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'کلمه باید بین ۳ تا ۱۵ حرف باشد' 
                    });
                }

                if (!/^[آ-یa-z\s]+$/.test(word)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'کلمه باید شامل حروف فارسی، انگلیسی یا فاصله باشد' 
                    });
                }

                const currentWordState = word.split('').map(c => c === ' ' ? ' ' : '_').join('');

                await this.db.query(
                    'UPDATE multiplayer_games SET word = $1, wordlength = $2, currentwordstate = $3, status = $4 WHERE gameid = $5',
                    [word, word.length, currentWordState, 'active', gameId]
                );

                game.word = word;
                game.wordlength = word.length;
                game.currentwordstate = currentWordState;
                game.status = 'active';
                this.activeMultiplayerGames.set(gameId, game);

                res.json({ 
                    success: true, 
                    message: 'کلمه مخفی با موفقیت ثبت شد',
                    wordLength: word.length
                });

            } catch (error) {
                this.log(`❌ خطا در ثبت کلمه: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در ثبت کلمه' 
                });
            }
        });

        // ارسال حدس
        app.post('/api/game/:gameId/guess', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, guess } = req.body;

                const game = this.activeMultiplayerGames.get(gameId);
                if (!game || game.opponentid != userId) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'شما بازیکن این بازی نیستید' 
                    });
                }

                if (guess.length !== 1 || !/^[آ-یa-z]$/.test(guess)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید' 
                    });
                }

                let guessedLetters = JSON.parse(game.guessedletters || '[]');
                if (guessedLetters.includes(guess)) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'این حرف قبلاً حدس زده شده است' 
                    });
                }

                // پردازش حدس
                guessedLetters.push(guess);
                const word = game.word;
                let currentWordState = game.currentwordstate || '_'.repeat(word.length);
                let correctGuess = false;

                let newWordState = '';
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === guess || currentWordState[i] !== '_') {
                        newWordState += word[i];
                        if (word[i] === guess) correctGuess = true;
                    } else {
                        newWordState += '_';
                    }
                }

                const newAttempts = game.attempts + (correctGuess ? 0 : 1);
                let newStatus = game.status;

                if (newWordState === word) {
                    newStatus = 'completed';
                    await this.db.query(
                        'UPDATE multiplayer_games SET winnerid = $1, opponentscore = 100, status = $2 WHERE gameid = $3',
                        [userId, 'completed', gameId]
                    );
                } else if (newAttempts >= 6) {
                    newStatus = 'completed';
                    await this.db.query(
                        'UPDATE multiplayer_games SET winnerid = $1, creatorscore = 50, status = $2 WHERE gameid = $3',
                        [game.creatorid, 'completed', gameId]
                    );
                }

                await this.db.query(
                    `UPDATE multiplayer_games SET 
                     attempts = $1, 
                     guessedletters = $2,
                     currentwordstate = $3,
                     status = $4
                     WHERE gameid = $5`,
                    [newAttempts, JSON.stringify(guessedLetters), newWordState, newStatus, gameId]
                );

                game.attempts = newAttempts;
                game.guessedletters = JSON.stringify(guessedLetters);
                game.currentwordstate = newWordState;
                game.status = newStatus;
                this.activeMultiplayerGames.set(gameId, game);

                res.json({ 
                    success: true,
                    correct: correctGuess,
                    currentWordState: newWordState,
                    attemptsLeft: 6 - newAttempts,
                    gameCompleted: newStatus === 'completed',
                    winner: newStatus === 'completed' ? (newWordState === word ? 'opponent' : 'creator') : null
                });

            } catch (error) {
                this.log(`❌ خطا در پردازش حدس: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در پردازش حدس' 
                });
            }
        });

        // درخواست راهنمایی
        app.post('/api/game/:gameId/hint', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId } = req.body;

                const game = this.activeMultiplayerGames.get(gameId);
                if (!game || game.opponentid != userId) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'شما بازیکن این بازی نیستید' 
                    });
                }

                if (game.hintsused >= 2) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'شما تمام راهنمایی‌های خود را استفاده کرده‌اید' 
                    });
                }

                const word = game.word;
                const guessedLetters = JSON.parse(game.guessedletters || '[]');
                const availableLetters = [];

                for (let char of word) {
                    if (!guessedLetters.includes(char) && !availableLetters.includes(char)) {
                        availableLetters.push(char);
                    }
                }

                if (availableLetters.length === 0) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'تمام حروف کلمه قبلاً حدس زده شده‌اند' 
                    });
                }

                const hintLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

                await this.db.query(
                    'UPDATE multiplayer_games SET hintsused = hintsused + 1 WHERE gameid = $1',
                    [gameId]
                );

                game.hintsused = (game.hintsused || 0) + 1;

                res.json({ 
                    success: true,
                    hintLetter: hintLetter,
                    hintsLeft: 2 - game.hintsused
                });

            } catch (error) {
                this.log(`❌ خطا در درخواست راهنمایی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در درخواست راهنمایی' 
                });
            }
        });

        // پیوستن به بازی
        app.post('/api/game/:gameId/join', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, firstName } = req.body;

                const game = this.activeMultiplayerGames.get(gameId);
                if (!game) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'بازی یافت نشد' 
                    });
                }

                if (game.status !== 'waiting') {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'این بازی قبلاً شروع شده است' 
                    });
                }

                await this.db.query(`
                    INSERT INTO users (userid, firstname)
                    VALUES ($1, $2)
                    ON CONFLICT (userid) DO NOTHING
                `, [userId, firstName]);

                await this.db.query(`
                    UPDATE multiplayer_games 
                    SET opponentid = $1, status = 'active' 
                    WHERE gameid = $2
                `, [userId, gameId]);

                game.opponentid = userId;
                game.status = 'active';
                this.activeMultiplayerGames.set(gameId, game);

                res.json({ 
                    success: true, 
                    message: 'با موفقیت به بازی پیوستید' 
                });

            } catch (error) {
                this.log(`❌ خطا در پیوستن به بازی: ${error.message}`);
                res.status(500).json({ 
                    success: false, 
                    error: 'خطا در پیوستن به بازی' 
                });
            }
        });

        // صفحه وضعیت سرور
        app.get('/status', (req, res) => {
            const dbStatus = this.dbConnected ? '✅ متصل' : '❌ قطع';
            const activeGames = this.activeMultiplayerGames.size;
            const waitingGames = Array.from(this.activeMultiplayerGames.values())
                .filter(game => game.status === 'waiting').length;
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>وضعیت ربات بازی حدس کلمه</title>
                    <meta charset="utf-8">
                    <style>
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                            text-align: center; 
                            padding: 50px; 
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; 
                            margin: 0;
                        }
                        .container { 
                            max-width: 600px; 
                            margin: 0 auto; 
                            background: rgba(255,255,255,0.1); 
                            padding: 30px; 
                            border-radius: 15px; 
                            backdrop-filter: blur(10px); 
                        }
                        h1 { font-size: 2.5em; margin-bottom: 20px; }
                        .status { 
                            background: rgba(255,255,255,0.2); 
                            padding: 15px; 
                            border-radius: 10px; 
                            margin: 20px 0; 
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 ربات تلگرام</h1>
                        <div class="status">
                            <h2>🎮 بازی حدس کلمه</h2>
                            <p>ربات فعال و در حال اجرا روی Render.com</p>
                            <p>وضعیت دیتابیس: ${dbStatus}</p>
                            <p>بازی‌های فعال: ${activeGames}</p>
                            <p>بازی‌های در انتظار: ${waitingGames}</p>
                            <p>آدرس وب اپ: ${WEB_APP_URL}</p>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        // راه‌اندازی سرور
        app.listen(PORT, () => {
            this.log(`🚀 سرور اجرا شد روی پورت: ${PORT}`);
            this.log(`🌐 آدرس بازی: http://localhost:${PORT}`);
            this.log(`🤖 ربات تلگرام آماده دریافت پیام...`);
        });
    }
}

const gameBot = new WordGameBot();
gameBot.start();
