import cors from "cors";
app.use(cors());

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || `https://wordly.ct.ws/`;

// تنظیمات PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.use(express.json());
app.use(express.static('public'));

class WordGameBot {
    constructor() {
        this.db = null;
        this.dbConnected = false;
        this.activeGames = new Map();
        this.waitingGames = new Map();
        this.wordCategories = {
            'میوه': ['سیب', 'موز', 'پرتقال', 'انگور', 'هندوانه', 'خربزه', 'انار', 'انجیر', 'کیوی', 'لیمو'],
            'حیوانات': ['شیر', 'فیل', 'میمون', 'گربه', 'سگ', 'خرگوش', 'گاو', 'گوسفند', 'مرغ', 'خروس'],
            'شهرها': ['تهران', 'مشهد', 'اصفهان', 'شیراز', 'تبریز', 'اهواز', 'کرج', 'قم', 'کرمان', 'رشت'],
            'کشورها': ['ایران', 'ترکیه', 'آلمان', 'فرانسه', 'ایتالیا', 'ژاپن', 'چین', 'هند', 'روسیه', 'کانادا'],
            'غذاها': ['قورمه', 'کباب', 'پلو', 'آش', 'سوپ', 'پیتزا', 'همبرگر', 'سالاد', 'ماکارونی', 'لازانیا'],
            'اشیا': ['میز', 'صندلی', 'کتاب', 'قلم', 'دفتر', 'تلویزیون', 'تلفن', 'کامپیوتر', 'لامپ', 'پنجره']
        };
        
        console.log('🎮 ربات بازی حدس کلمه راه‌اندازی شد');
    }

    log(message) {
        const timestamp = new Date().toLocaleString('fa-IR');
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
                ssl: { rejectUnauthorized: false },
                max: 10,
                idleTimeoutMillis: 30000,
            });
            
            await this.db.query('SELECT NOW()');
            this.dbConnected = true;
            this.log('✅ متصل به دیتابیس');
            
            await this.createTables();
            await this.loadActiveGames();
            
        } catch (error) {
            this.log(`❌ خطا در اتصال به دیتابیس: ${error.message}`);
            this.dbConnected = false;
        }
    }

    async createTables() {
        try {
            // ایجاد جدول کاربران
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
                    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // ایجاد جدول بازی‌ها
            await this.db.query(`
                CREATE TABLE IF NOT EXISTS multiplayer_games (
                    gameid VARCHAR(10) PRIMARY KEY,
                    creatorid BIGINT NOT NULL,
                    opponentid BIGINT,
                    category VARCHAR(100),
                    word VARCHAR(255),
                    wordlength INTEGER DEFAULT 0,
                    currentwordstate VARCHAR(255),
                    guessedletters TEXT DEFAULT '[]',
                    attempts INTEGER DEFAULT 0,
                    maxattempts INTEGER DEFAULT 6,
                    hintsused INTEGER DEFAULT 0,
                    maxhints INTEGER DEFAULT 2,
                    status VARCHAR(20) DEFAULT 'waiting',
                    winnerid BIGINT,
                    creatorscore INTEGER DEFAULT 0,
                    opponentscore INTEGER DEFAULT 0,
                    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updatedat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            this.log('✅ جداول دیتابیس آماده');
        } catch (error) {
            this.log(`❌ خطا در ایجاد جداول: ${error.message}`);
        }
    }

    generateGameId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // ایجاد بازی جدید
    async createGame(chatId, userId, firstName) {
        try {
            const gameId = this.generateGameId();
            
            // ثبت کاربر
            await this.db.query(`
                INSERT INTO users (userid, firstname) 
                VALUES ($1, $2) 
                ON CONFLICT (userid) DO NOTHING
            `, [userId, firstName]);

            // ایجاد بازی
            await this.db.query(`
                INSERT INTO multiplayer_games (gameid, creatorid, status) 
                VALUES ($1, $2, 'waiting')
            `, [gameId, userId]);

            const game = {
                gameId,
                creatorId: userId,
                creatorName: firstName,
                status: 'waiting',
                createdAt: new Date()
            };

            this.activeGames.set(gameId, game);
            this.waitingGames.set(userId, gameId);

            // ایجاد لینک بازی - استفاده از آدرس داخلی
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

            // ارسال راهنمای پیوستن
            await bot.sendMessage(chatId,
                `🔗 <b>برای پیوستن دوستان:</b>\n\n` +
                `دستور زیر را برایشان ارسال کنید:\n` +
                `<code>/join ${gameId}</code>\n\n` +
                `یا کد زیر را به آنها بدهید:\n` +
                `<code>${gameId}</code>`,
                { parse_mode: 'HTML' }
            );

            // تایمر لغو خودکار
            setTimeout(async () => {
                const currentGame = this.activeGames.get(gameId);
                if (currentGame && currentGame.status === 'waiting') {
                    await this.cancelGame(gameId, '⏰ زمان بازی به پایان رسید');
                }
            }, 10 * 60 * 1000);

            this.log(`✅ بازی ${gameId} توسط ${firstName} ایجاد شد`);

        } catch (error) {
            this.log(`❌ خطا در ایجاد بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در ایجاد بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    // پیوستن به بازی
    async joinGame(chatId, userId, firstName, gameId) {
        try {
            const game = this.activeGames.get(gameId);
            
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
            await this.db.query(`
                INSERT INTO users (userid, firstname) 
                VALUES ($1, $2) 
                ON CONFLICT (userid) DO NOTHING
            `, [userId, firstName]);

            // آپدیت بازی
            await this.db.query(`
                UPDATE multiplayer_games 
                SET opponentid = $1, status = 'active' 
                WHERE gameid = $2
            `, [userId, gameId]);

            // آپدیت حافظه
            game.opponentId = userId;
            game.opponentName = firstName;
            game.status = 'active';
            this.activeGames.set(gameId, game);
            this.waitingGames.delete(game.creatorId);

            // لینک بازی برای بازیکن دوم
            const opponentUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${userId}&role=opponent`;

            // پیام به بازیکن دوم
            await bot.sendMessage(chatId, 
                `🎉 <b>به بازی پیوستید!</b>\n\n` +
                `🆔 کد بازی: <code>${gameId}</code>\n` +
                `👤 سازنده: ${game.creatorName}\n\n` +
                `برای شروع بازی کلیک کنید:`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🎮 شروع بازی', web_app: { url: opponentUrl } }
                        ]]
                    }
                }
            );

            // اطلاع به سازنده
            const creatorUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${game.creatorId}&role=creator`;
            await bot.sendMessage(game.creatorId,
                `🎊 <b>بازیکن دوم پیوست!</b>\n\n` +
                `👤 بازیکن: ${firstName}\n` +
                `🆔 کد بازی: <code>${gameId}</code>\n\n` +
                `برای ادامه بازی کلیک کنید:`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🎮 ادامه بازی', web_app: { url: creatorUrl } }
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
            const game = this.activeGames.get(gameId);
            if (!game) return;

            await this.db.query(
                'UPDATE multiplayer_games SET status = $1 WHERE gameid = $2',
                ['cancelled', gameId]
            );

            if (game.creatorId) {
                await bot.sendMessage(game.creatorId, `❌ ${reason}`);
            }
            if (game.opponentId) {
                await bot.sendMessage(game.opponentId, `❌ ${reason}`);
            }

            this.activeGames.delete(gameId);
            this.waitingGames.delete(game.creatorId);

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
• 🗂️ ۶ دسته‌بندی مختلف  
• 💡 سیستم راهنمایی
• 🏆 امتیازدهی پیشرفته

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
                        await bot.sendMessage(chatId,
                            `📊 <b>آمار بازی</b>\n\n` +
                            `👤 نام: ${firstName}\n` +
                            `🎮 بازی‌های انجام شده: ۰\n` +
                            `🏆 امتیاز کل: ۰\n` +
                            `👥 بردهای دو نفره: ۰\n\n` +
                            `💡 هنوز بازی نکرده‌اید!`,
                            { parse_mode: 'HTML' }
                        );
                        break;

                    case 'help':
                        await bot.sendMessage(chatId,
                            `📖 <b>راهنمای بازی</b>\n\n` +
                            `🎯 <b>هدف بازی:</b>\n` +
                            `حدس زدن کلمه مخفی\n\n` +
                            `👥 <b>بازی دو نفره:</b>\n` +
                            `۱. یک بازی ایجاد کنید\n` +
                            `۲. کد بازی را به دوستتان بدهید\n` +
                            `۳. در صفحه بازی منتظر بمانید\n` +
                            `۴. وقتی دوستتان پیوست، بازی شروع می‌شود\n\n` +
                            `💡 <b>راهنمایی:</b>\n` +
                            `• هر بازیکن ۲ بار می‌تواند راهنمایی بگیرد\n` +
                            `• راهنمایی یک حرف تصادفی نشان می‌دهد`,
                            { parse_mode: 'HTML' }
                        );
                        break;
                }
            }
        } catch (error) {
            this.log(`❌ خطا در callback: ${error.message}`);
        }
    }

    async loadActiveGames() {
        try {
            const result = await this.db.query(
                "SELECT * FROM multiplayer_games WHERE status IN ('waiting', 'active')"
            );
            
            for (const row of result.rows) {
                const game = {
                    gameId: row.gameid,
                    creatorId: row.creatorid,
                    opponentId: row.opponentid,
                    status: row.status,
                    createdAt: row.createdat
                };
                this.activeGames.set(row.gameid, game);
                
                if (row.status === 'waiting') {
                    this.waitingGames.set(row.creatorid, row.gameid);
                }
            }
            
            this.log(`✅ ${result.rows.length} بازی فعال بارگذاری شد`);
        } catch (error) {
            this.log(`❌ خطا در بارگذاری بازی‌ها: ${error.message}`);
        }
    }

    async start() {
        await this.connectDB();

        // Routes
        app.get('/', (req, res) => {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>بازی حدس کلمه</title>
                    <meta charset="utf-8">
                    <style>
                        body { 
                            font-family: Tahoma; 
                            text-align: center; 
                            padding: 50px; 
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; 
                        }
                        .container { 
                            max-width: 500px; 
                            margin: 0 auto; 
                            background: rgba(255,255,255,0.1); 
                            padding: 30px; 
                            border-radius: 15px; 
                        }
                        h1 { font-size: 2.5em; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🎮 بازی حدس کلمه</h1>
                        <p>برای استفاده از بازی، لطفاً از طریق ربات تلگرام اقدام کنید:</p>
                        <p><a href="https://t.me/your_bot_username" style="color: white; font-weight: bold;">@your_bot_username</a></p>
                    </div>
                </body>
                </html>
            `);
        });

        // سرو کردن فایل game.html
        app.get('/game.html', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'game.html'));
        });

        // API برای وضعیت بازی
        app.get('/api/game/:gameId', async (req, res) => {
            try {
                const { gameId } = req.params;
                let game = this.activeGames.get(gameId);
                
                if (!game) {
                    const result = await this.db.query(
                        'SELECT * FROM multiplayer_games WHERE gameid = $1',
                        [gameId]
                    );
                    
                    if (result.rows.length === 0) {
                        return res.status(404).json({ success: false, error: 'بازی یافت نشد' });
                    }
                    
                    const row = result.rows[0];
                    game = {
                        gameId: row.gameid,
                        creatorId: row.creatorid,
                        opponentId: row.opponentid,
                        category: row.category,
                        word: row.word,
                        wordLength: row.wordlength,
                        currentState: row.currentwordstate,
                        guessedLetters: JSON.parse(row.guessedletters || '[]'),
                        attempts: row.attempts || 0,
                        maxAttempts: row.maxattempts || 6,
                        hintsUsed: row.hintsused || 0,
                        maxHints: row.maxhints || 2,
                        status: row.status,
                        winnerId: row.winnerid,
                        creatorScore: row.creatorscore || 0,
                        opponentScore: row.opponentscore || 0
                    };
                    this.activeGames.set(gameId, game);
                }

                res.json({ success: true, game });
                
            } catch (error) {
                this.log(`❌ خطا در دریافت بازی: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // API برای انتخاب دسته‌بندی
        app.post('/api/game/:gameId/category', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, category } = req.body;

                const game = this.activeGames.get(gameId);
                if (!game || game.creatorId != userId) {
                    return res.status(403).json({ success: false, error: 'دسترسی غیرمجاز' });
                }

                await this.db.query(
                    'UPDATE multiplayer_games SET category = $1 WHERE gameid = $2',
                    [category, gameId]
                );

                game.category = category;
                this.activeGames.set(gameId, game);

                res.json({ success: true, message: `دسته‌بندی "${category}" انتخاب شد` });

            } catch (error) {
                this.log(`❌ خطا در انتخاب دسته‌بندی: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // API برای ثبت کلمه
        app.post('/api/game/:gameId/word', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, word } = req.body;

                const game = this.activeGames.get(gameId);
                if (!game || game.creatorId != userId) {
                    return res.status(403).json({ success: false, error: 'دسترسی غیرمجاز' });
                }

                if (word.length < 3 || word.length > 15) {
                    return res.status(400).json({ success: false, error: 'کلمه باید ۳-۱۵ حرف باشد' });
                }

                if (!/^[آ-یa-z\s]+$/.test(word)) {
                    return res.status(400).json({ success: false, error: 'کلمه باید شامل حروف فارسی، انگلیسی یا فاصله باشد' });
                }

                const currentState = word.split('').map(c => c === ' ' ? ' ' : '_').join('');

                await this.db.query(
                    'UPDATE multiplayer_games SET word = $1, wordlength = $2, currentwordstate = $3 WHERE gameid = $4',
                    [word, word.length, currentState, gameId]
                );

                game.word = word;
                game.wordLength = word.length;
                game.currentState = currentState;
                this.activeGames.set(gameId, game);

                res.json({ success: true, message: 'کلمه ثبت شد', wordLength: word.length });

            } catch (error) {
                this.log(`❌ خطا در ثبت کلمه: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // API برای ارسال حدس
        app.post('/api/game/:gameId/guess', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, guess } = req.body;

                const game = this.activeGames.get(gameId);
                if (!game || game.opponentId != userId) {
                    return res.status(403).json({ success: false, error: 'دسترسی غیرمجاز' });
                }

                // اعتبارسنجی حدس
                if (guess.length !== 1 || !/^[آ-یa-z]$/.test(guess)) {
                    return res.status(400).json({ success: false, error: 'لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید' });
                }

                let guessedLetters = game.guessedLetters || [];
                if (guessedLetters.includes(guess)) {
                    return res.status(400).json({ success: false, error: 'این حرف قبلاً حدس زده شده است' });
                }

                // پردازش حدس
                guessedLetters.push(guess);
                const word = game.word;
                let currentState = game.currentState || '_'.repeat(word.length);
                let correctGuess = false;

                let newWordState = '';
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === guess || currentState[i] !== '_') {
                        newWordState += word[i];
                        if (word[i] === guess) correctGuess = true;
                    } else {
                        newWordState += '_';
                    }
                }

                const newAttempts = (game.attempts || 0) + (correctGuess ? 0 : 1);
                let newStatus = game.status;

                // بررسی پایان بازی
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
                        [game.creatorId, 'completed', gameId]
                    );
                }

                // ذخیره در دیتابیس
                await this.db.query(
                    `UPDATE multiplayer_games SET 
                     attempts = $1, 
                     guessedletters = $2,
                     currentwordstate = $3,
                     status = $4
                     WHERE gameid = $5`,
                    [newAttempts, JSON.stringify(guessedLetters), newWordState, newStatus, gameId]
                );

                // آپدیت حافظه
                game.attempts = newAttempts;
                game.guessedLetters = guessedLetters;
                game.currentState = newWordState;
                game.status = newStatus;
                this.activeGames.set(gameId, game);

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
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // API برای درخواست راهنمایی
        app.post('/api/game/:gameId/hint', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId } = req.body;

                const game = this.activeGames.get(gameId);
                if (!game || game.opponentId != userId) {
                    return res.status(403).json({ success: false, error: 'دسترسی غیرمجاز' });
                }

                if (game.hintsUsed >= 2) {
                    return res.status(400).json({ success: false, error: 'شما تمام راهنمایی‌های خود را استفاده کرده‌اید' });
                }

                const word = game.word;
                const guessedLetters = game.guessedLetters || [];
                const availableLetters = [];

                for (let char of word) {
                    if (!guessedLetters.includes(char) && !availableLetters.includes(char)) {
                        availableLetters.push(char);
                    }
                }

                if (availableLetters.length === 0) {
                    return res.status(400).json({ success: false, error: 'تمام حروف کلمه قبلاً حدس زده شده‌اند' });
                }

                const hintLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

                await this.db.query(
                    'UPDATE multiplayer_games SET hintsused = hintsused + 1 WHERE gameid = $1',
                    [gameId]
                );

                game.hintsUsed = (game.hintsUsed || 0) + 1;

                res.json({ 
                    success: true,
                    hintLetter: hintLetter,
                    hintsLeft: 2 - game.hintsUsed
                });

            } catch (error) {
                this.log(`❌ خطا در درخواست راهنمایی: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // راه‌اندازی سرور
        app.listen(PORT, () => {
            this.log(`🚀 سرور اجرا شد روی پورت ${PORT}`);
            this.log(`🌐 آدرس: ${WEB_APP_URL}`);
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
