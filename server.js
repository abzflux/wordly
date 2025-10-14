const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || `https://wordly.ct.ws`;

// تنظیمات PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

class WordGameBot {
    constructor() {
        this.db = null;
        this.dbConnected = false;
        this.activeGames = new Map();
        
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
            await this.fixTableConstraints();
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

    async fixTableConstraints() {
        try {
            // حذف constraint موجود اگر وجود دارد
            try {
                await this.db.query(`
                    ALTER TABLE multiplayer_games 
                    DROP CONSTRAINT IF EXISTS multiplayer_games_status_check
                `);
            } catch (error) {}

            // اضافه کردن ستون‌های جدید
            const alterQueries = [
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS creatorname VARCHAR(255)`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS opponentname VARCHAR(255)`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS worddisplay VARCHAR(255)`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS attemptsleft INTEGER DEFAULT 6`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS hintsusedcreator INTEGER DEFAULT 0`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS hintsusedopponent INTEGER DEFAULT 0`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS currentturn VARCHAR(20) DEFAULT 'creator'`,
                `ALTER TABLE multiplayer_games ADD COLUMN IF NOT EXISTS wordsetter VARCHAR(20) DEFAULT 'creator'`
            ];

            for (const query of alterQueries) {
                try {
                    await this.db.query(query);
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        this.log(`⚠️ خطا در اجرای دستور: ${query}`);
                    }
                }
            }

            this.log('✅ مشکلات جدول برطرف شد');
        } catch (error) {
            this.log(`❌ خطا در رفع مشکلات جدول: ${error.message}`);
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
                ON CONFLICT (userid) DO UPDATE SET firstname = $2
            `, [userId, firstName]);

            // ایجاد بازی
            await this.db.query(`
                INSERT INTO multiplayer_games 
                (gameid, creatorid, creatorname, status) 
                VALUES ($1, $2, $3, 'waiting')
            `, [gameId, userId, firstName]);

            const game = {
                gameId,
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
                wordSetter: null, // هنوز کلمه تنظیم نشده
                createdAt: new Date()
            };

            this.activeGames.set(gameId, game);

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
                ON CONFLICT (userid) DO UPDATE SET firstname = $2
            `, [userId, firstName]);

            // آپدیت بازی
            await this.db.query(`
                UPDATE multiplayer_games 
                SET opponentid = $1, opponentname = $2, status = 'waiting_for_word'
                WHERE gameid = $3
            `, [userId, firstName, gameId]);

            // آپدیت حافظه
            game.opponentId = userId;
            game.opponentName = firstName;
            game.status = 'waiting_for_word';
            this.activeGames.set(gameId, game);

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
            const result = await this.db.query(`
                SELECT totalscore, gamesplayed, bestscore, multiplayerwins, hintsused 
                FROM users WHERE userid = $1
            `, [userId]);

            if (result.rows.length === 0) {
                return `📊 <b>آمار بازی</b>\n\n👤 شما هنوز بازی نکرده‌اید!`;
            }

            const stats = result.rows[0];
            return `
📊 <b>آمار بازی شما</b>

👤 نام: ${stats.firstname || 'کاربر'}
🏆 امتیاز کل: ${stats.totalscore}
🎮 بازی‌های انجام شده: ${stats.gamesplayed}
⭐ بهترین امتیاز: ${stats.bestscore}
👥 بردهای دو نفره: ${stats.multiplayerwins}
💡 راهنماهای استفاده شده: ${stats.hintsused}
            `.trim();
        } catch (error) {
            this.log(`❌ خطا در دریافت آمار: ${error.message}`);
            return '❌ خطا در دریافت آمار';
        }
    }

    async loadActiveGames() {
        try {
            const result = await this.db.query(
                "SELECT * FROM multiplayer_games WHERE status IN ('waiting', 'waiting_for_word', 'active')"
            );
            
            for (const row of result.rows) {
                const game = {
                    gameId: row.gameid,
                    creatorId: row.creatorid,
                    creatorName: row.creatorname,
                    opponentId: row.opponentid,
                    opponentName: row.opponentname,
                    word: row.word,
                    wordDisplay: row.worddisplay || row.currentwordstate,
                    guessedLetters: Array.isArray(row.guessedletters) ? row.guessedletters : JSON.parse(row.guessedletters || '[]'),
                    attemptsLeft: row.attemptsleft || (6 - (row.attempts || 0)),
                    maxAttempts: row.maxattempts || 6,
                    hintsUsedCreator: row.hintsusedcreator || 0,
                    hintsUsedOpponent: row.hintsusedopponent || 0,
                    maxHints: row.maxhints || 2,
                    status: row.status,
                    currentTurn: row.currentturn || 'creator',
                    creatorScore: row.creatorscore || 0,
                    opponentScore: row.opponentscore || 0,
                    wordSetter: row.wordsetter || null,
                    createdAt: row.createdat
                };
                this.activeGames.set(row.gameid, game);
            }
            
            this.log(`✅ ${result.rows.length} بازی فعال بارگذاری شد`);
        } catch (error) {
            this.log(`❌ خطا در بارگذاری بازی‌ها: ${error.message}`);
        }
    }

    // API Routes
    setupRoutes() {
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
                        creatorName: row.creatorname,
                        opponentId: row.opponentid,
                        opponentName: row.opponentname,
                        word: row.word,
                        wordDisplay: row.worddisplay || row.currentwordstate,
                        guessedLetters: Array.isArray(row.guessedletters) ? row.guessedletters : JSON.parse(row.guessedletters || '[]'),
                        attemptsLeft: row.attemptsleft || (6 - (row.attempts || 0)),
                        maxAttempts: row.maxattempts || 6,
                        hintsUsedCreator: row.hintsusedcreator || 0,
                        hintsUsedOpponent: row.hintsusedopponent || 0,
                        maxHints: row.maxhints || 2,
                        status: row.status,
                        currentTurn: row.currentturn || 'creator',
                        creatorScore: row.creatorscore || 0,
                        opponentScore: row.opponentscore || 0,
                        wordSetter: row.wordsetter || null
                    };
                    this.activeGames.set(gameId, game);
                }

                res.json({ success: true, game });
                
            } catch (error) {
                this.log(`❌ خطا در دریافت بازی: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // API برای ثبت کلمه
        app.post('/api/game/:gameId/word', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId, word } = req.body;

                const game = this.activeGames.get(gameId);
                if (!game) {
                    return res.status(404).json({ success: false, error: 'بازی یافت نشد' });
                }

                // فقط سازنده می‌تواند کلمه را تنظیم کند
                if (game.creatorId != userId) {
                    return res.status(403).json({ success: false, error: 'فقط سازنده می‌تواند کلمه را تنظیم کند' });
                }

                if (!word || word.length < 3 || word.length > 15) {
                    return res.status(400).json({ success: false, error: 'کلمه باید بین ۳ تا ۱۵ حرف باشد' });
                }

                if (!/^[\u0600-\u06FFa-zA-Z\s]+$/.test(word)) {
                    return res.status(400).json({ success: false, error: 'کلمه باید شامل حروف فارسی، انگلیسی یا فاصله باشد' });
                }

                const wordDisplay = word.split('').map(c => c === ' ' ? ' ' : '_').join('');

                await this.db.query(
                    `UPDATE multiplayer_games SET 
                     word = $1, 
                     worddisplay = $2,
                     currentwordstate = $2,
                     status = 'active',
                     currentturn = 'opponent',
                     wordsetter = 'creator'
                     WHERE gameid = $3`,
                    [word, wordDisplay, gameId]
                );

                // آپدیت حافظه
                game.word = word;
                game.wordDisplay = wordDisplay;
                game.status = 'active';
                game.currentTurn = 'opponent'; // حریف شروع به حدس زدن می‌کند
                game.wordSetter = 'creator';   // سازنده کلمه را تنظیم کرده
                this.activeGames.set(gameId, game);

                res.json({ 
                    success: true, 
                    message: 'کلمه ثبت شد و بازی شروع شد',
                    wordDisplay: wordDisplay,
                    currentTurn: 'opponent'
                });

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
                if (!game) {
                    return res.status(404).json({ success: false, error: 'بازی یافت نشد' });
                }

                // بررسی نقش کاربر
                const userRole = game.creatorId == userId ? 'creator' : 
                               game.opponentId == userId ? 'opponent' : null;
                
                if (!userRole) {
                    return res.status(403).json({ success: false, error: 'شما در این بازی نیستید' });
                }

                // بررسی نوبت
                if (game.currentTurn !== userRole) {
                    return res.status(400).json({ success: false, error: 'اکنون نوبت شما نیست' });
                }

                // بررسی اینکه آیا این کاربر کلمه را تنظیم کرده است
                if (userRole === game.wordSetter) {
                    return res.status(400).json({ success: false, error: 'شما کلمه را تنظیم کرده‌اید و نمی‌توانید حدس بزنید' });
                }

                // اعتبارسنجی حدس
                if (!guess || guess.length !== 1 || !/^[\u0600-\u06FFa-zA-Z]$/.test(guess)) {
                    return res.status(400).json({ success: false, error: 'لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید' });
                }

                const guessLower = guess.toLowerCase();

                // بررسی تکراری نبودن حدس
                if (game.guessedLetters.some(g => g.letter === guessLower)) {
                    return res.status(400).json({ success: false, error: 'این حرف قبلاً حدس زده شده است' });
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
                const newGuessedLetters = [...game.guessedLetters, { letter: guessLower, correct }];
                
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
                } else if (newAttemptsLeft <= 0) {
                    newStatus = 'completed';
                    // امتیاز برای کسی که کلمه را تنظیم کرده
                    if (game.wordSetter === 'creator') {
                        newCreatorScore += 20;
                    } else {
                        newOpponentScore += 20;
                    }
                }

                // ذخیره در دیتابیس
                await this.db.query(
                    `UPDATE multiplayer_games SET 
                     worddisplay = $1,
                     currentwordstate = $1,
                     guessedletters = $2,
                     attemptsleft = $3,
                     currentturn = $4,
                     status = $5,
                     creatorscore = $6,
                     opponentscore = $7,
                     updatedat = CURRENT_TIMESTAMP
                     WHERE gameid = $8`,
                    [newWordDisplay, JSON.stringify(newGuessedLetters), newAttemptsLeft, 
                     newCurrentTurn, newStatus, newCreatorScore, newOpponentScore, gameId]
                );

                // آپدیت حافظه
                game.wordDisplay = newWordDisplay;
                game.guessedLetters = newGuessedLetters;
                game.attemptsLeft = newAttemptsLeft;
                game.currentTurn = newCurrentTurn;
                game.status = newStatus;
                game.creatorScore = newCreatorScore;
                game.opponentScore = newOpponentScore;
                this.activeGames.set(gameId, game);

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
                res.status(500).json({ success: false, error: 'خطای سرور' });
            }
        });

        // API برای درخواست راهنمایی
        app.post('/api/game/:gameId/hint', async (req, res) => {
            try {
                const { gameId } = req.params;
                const { userId } = req.body;

                const game = this.activeGames.get(gameId);
                if (!game) {
                    return res.status(404).json({ success: false, error: 'بازی یافت نشد' });
                }

                // بررسی نقش کاربر
                const userRole = game.creatorId == userId ? 'creator' : 
                               game.opponentId == userId ? 'opponent' : null;
                
                if (!userRole) {
                    return res.status(403).json({ success: false, error: 'شما در این بازی نیستید' });
                }

                // بررسی نوبت
                if (game.currentTurn !== userRole) {
                    return res.status(400).json({ success: false, error: 'اکنون نوبت شما نیست' });
                }

                // بررسی اینکه آیا این کاربر کلمه را تنظیم کرده است
                if (userRole === game.wordSetter) {
                    return res.status(400).json({ success: false, error: 'شما کلمه را تنظیم کرده‌اید و نمی‌توانید راهنمایی بگیرید' });
                }

                // بررسی تعداد راهنماهای استفاده شده
                const hintsUsed = userRole === 'creator' ? game.hintsUsedCreator : game.hintsUsedOpponent;
                if (hintsUsed >= game.maxHints) {
                    return res.status(400).json({ success: false, error: 'شما تمام راهنمایی‌های خود را استفاده کرده‌اید' });
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
                    return res.status(400).json({ success: false, error: 'تمام حروف کلمه قبلاً فاش شده‌اند' });
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
                let newHintsUsedCreator = game.hintsUsedCreator;
                let newHintsUsedOpponent = game.hintsUsedOpponent;
                
                if (userRole === 'creator') {
                    newHintsUsedCreator++;
                } else {
                    newHintsUsedOpponent++;
                }

                // تغییر نوبت
                const newCurrentTurn = userRole === 'creator' ? 'opponent' : 'creator';

                // ذخیره در دیتابیس
                await this.db.query(
                    `UPDATE multiplayer_games SET 
                     worddisplay = $1,
                     currentwordstate = $1,
                     attemptsleft = $2,
                     hintsusedcreator = $3,
                     hintsusedopponent = $4,
                     currentturn = $5,
                     updatedat = CURRENT_TIMESTAMP
                     WHERE gameid = $6`,
                    [newWordDisplay, newAttemptsLeft, newHintsUsedCreator, 
                     newHintsUsedOpponent, newCurrentTurn, gameId]
                );

                // آپدیت حافظه
                game.wordDisplay = newWordDisplay;
                game.attemptsLeft = newAttemptsLeft;
                if (userRole === 'creator') {
                    game.hintsUsedCreator = newHintsUsedCreator;
                } else {
                    game.hintsUsedOpponent = newHintsUsedOpponent;
                }
                game.currentTurn = newCurrentTurn;
                this.activeGames.set(gameId, game);

                res.json({ 
                    success: true,
                    hintLetter: hintLetter,
                    hintsLeft: game.maxHints - (userRole === 'creator' ? newHintsUsedCreator : newHintsUsedOpponent),
                    attemptsLeft: newAttemptsLeft,
                    currentTurn: newCurrentTurn,
                    wordDisplay: newWordDisplay
                });

            } catch (error) {
                this.log(`❌ خطا در درخواست راهنمایی: ${error.message}`);
                res.status(500).json({ success: false, error: 'خطای سرور' });
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

    async updateUserStats(userId, score, isWin) {
        try {
            await this.db.query(`
                UPDATE users SET 
                totalscore = totalscore + $1,
                gamesplayed = gamesplayed + 1,
                bestscore = GREATEST(bestscore, $1),
                multiplayerwins = multiplayerwins + $2
                WHERE userid = $3
            `, [score, isWin ? 1 : 0, userId]);
        } catch (error) {
            this.log(`❌ خطا در به روزرسانی آمار کاربر: ${error.message}`);
        }
    }

    async start() {
        await this.connectDB();
        this.setupRoutes();

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
