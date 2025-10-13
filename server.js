// server.js
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const path = require('path');

// ======================
// تنظیمات پایه
// ======================
const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || 'توکن_ربات_تو';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://abzflux.github.io/wordly/public';

// اتصال به PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'رمز';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// ======================
// کلاس اصلی ربات
// ======================
class WordGameBot {
    constructor() {
        this.db = null;
        this.activeGames = new Map();
        this.waitingGames = new Map();
        this.bot = null; // ربات تلگرام

        console.log('🎮 ربات بازی حدس کلمه راه‌اندازی شد');
    }

    log(msg) {
        const ts = new Date().toLocaleString('fa-IR');
        console.log(`[${ts}] ${msg}`);
    }

    // ======================
    // اتصال به دیتابیس
    // ======================
    async connectDB() {
        try {
            this.db = new Pool({
                host: DB_HOST,
                user: DB_USER,
                password: DB_PASSWORD,
                database: DB_NAME,
                port: DB_PORT,
                ssl: { rejectUnauthorized: false },
            });
            await this.db.query('SELECT NOW()');
            this.log('✅ متصل به دیتابیس');

            await this.createTables();
            await this.loadActiveGames();
        } catch (err) {
            this.log('❌ خطا در اتصال به دیتابیس: ' + err.message);
        }
    }

    async createTables() {
        try {
            // جدول کاربران
            await this.db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    userid BIGINT PRIMARY KEY,
                    firstname VARCHAR(255) NOT NULL
                )
            `);

            // جدول بازی‌ها
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
                    createdat TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            this.log('✅ جداول دیتابیس آماده');
        } catch (err) {
            this.log('❌ خطا در ایجاد جداول: ' + err.message);
        }
    }

    generateGameId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // ======================
    // ایجاد ربات تلگرام با long polling امن
    // ======================
    initBot() {
        if (this.bot) {
            this.log('⚠️ ربات قبلاً ساخته شده است، دوباره نمی‌سازیم.');
            return;
        }

        try {
            this.bot = new TelegramBot(BOT_TOKEN, { polling: true });

            // دستور /start
            this.bot.onText(/\/start/, async (msg) => {
                const chatId = msg.chat.id;
                const firstName = msg.from.first_name || 'بازیکن';
                await this.bot.sendMessage(
                    chatId,
                    `سلام ${firstName}! 🎮\nبرای ساخت بازی جدید دستور زیر را بزنید:\n/newgame`
                );
            });

            // دستور /newgame
            this.bot.onText(/\/newgame/, async (msg) => {
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                const firstName = msg.from.first_name || 'بازیکن';
                await this.createGame(chatId, userId, firstName);
            });

            // دستور /joingame <کد بازی>
            this.bot.onText(/\/joingame (.+)/, async (msg, match) => {
                const chatId = msg.chat.id;
                const userId = msg.from.id;
                const firstName = msg.from.first_name || 'بازیکن';
                const gameId = match[1].trim().toUpperCase();
                await this.joinGame(chatId, userId, firstName, gameId);
            });

            this.log('🤖 ربات تلگرام آماده دریافت دستورات');
        } catch (err) {
            this.log('❌ خطا در ایجاد ربات: ' + err.message);
        }
    }

    // ======================
    // ایجاد بازی جدید
    // ======================
    async createGame(chatId, userId, firstName) {
        try {
            const gameId = this.generateGameId();

            await this.db.query(
                `INSERT INTO users (userid, firstname) VALUES ($1, $2) ON CONFLICT (userid) DO NOTHING`,
                [userId, firstName]
            );

            await this.db.query(
                `INSERT INTO multiplayer_games (gameid, creatorid, status) VALUES ($1, $2, 'waiting')`,
                [gameId, userId]
            );

            const game = { gameId, creatorId: userId, creatorName: firstName, status: 'waiting' };
            this.activeGames.set(gameId, game);
            this.waitingGames.set(userId, gameId);

            const gameUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${userId}&role=creator`;

            await this.bot.sendMessage(chatId,
                `🎮 بازی جدید ایجاد شد!\n\n🆔 کد بازی: <code>${gameId}</code>\n👤 سازنده: ${firstName}\n⏳ در انتظار بازیکن دوم`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚀 ورود به صفحه بازی', web_app: { url: gameUrl } }],
                            [{ text: '📋 کپی کد بازی', callback_data: `copy_${gameId}` }]
                        ]
                    }
                }
            );

            this.log(`✅ بازی جدید ساخته شد: ${gameId}`);
        } catch (err) {
            this.log('❌ خطا در ایجاد بازی: ' + err.message);
        }
    }

    // ======================
    // بارگذاری بازی‌های فعال
    // ======================
    async loadActiveGames() {
        try {
            const res = await this.db.query(
                "SELECT * FROM multiplayer_games WHERE status IN ('waiting','active')"
            );
            res.rows.forEach(row => {
                const game = {
                    gameId: row.gameid,
                    creatorId: row.creatorid,
                    opponentId: row.opponentid,
                    status: row.status
                };
                this.activeGames.set(row.gameid, game);
                if (row.status === 'waiting') this.waitingGames.set(row.creatorid, row.gameid);
            });
            this.log(`✅ ${res.rows.length} بازی فعال بارگذاری شد`);
        } catch (err) {
            this.log('❌ خطا در بارگذاری بازی‌ها: ' + err.message);
        }
    }

    // ======================
    // پیوستن به بازی
    // ======================
    async joinGame(chatId, userId, firstName, gameId) {
        try {
            const game = this.activeGames.get(gameId);
            if (!game) {
                await this.bot.sendMessage(chatId, '❌ بازی یافت نشد.');
                return;
            }
            if (game.creatorId === userId) {
                await this.bot.sendMessage(chatId, '❌ نمی‌توانید به بازی خودتان بپیوندید.');
                return;
            }
            if (game.status !== 'waiting') {
                await this.bot.sendMessage(chatId, '❌ بازی قبلاً شروع شده است.');
                return;
            }

            await this.db.query(
                `INSERT INTO users (userid, firstname) VALUES ($1, $2) ON CONFLICT (userid) DO NOTHING`,
                [userId, firstName]
            );

            await this.db.query(
                `UPDATE multiplayer_games SET opponentid=$1, status='active' WHERE gameid=$2`,
                [userId, gameId]
            );

            game.opponentId = userId;
            game.opponentName = firstName;
            game.status = 'active';
            this.activeGames.set(gameId, game);
            this.waitingGames.delete(game.creatorId);

            const opponentUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${userId}&role=opponent`;
            const creatorUrl = `${WEB_APP_URL}/game.html?gameId=${gameId}&userId=${game.creatorId}&role=creator`;

            // پیام به بازیکن دوم
            await this.bot.sendMessage(chatId, `🎉 به بازی پیوستید!\n🆔 کد بازی: <code>${gameId}</code>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🎮 شروع بازی', web_app: { url: opponentUrl } }]]
                }
            });

            // اطلاع به سازنده
            await this.bot.sendMessage(game.creatorId, `🎊 بازیکن دوم پیوست!\n👤 ${firstName}\n🆔 کد بازی: <code>${gameId}</code>`, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[{ text: '🎮 ادامه بازی', web_app: { url: creatorUrl } }]]
                }
            });

        } catch (err) {
            this.log('❌ خطا در پیوستن به بازی: ' + err.message);
        }
    }
}

// ======================
// اجرای برنامه
// ======================
const gameBot = new WordGameBot();

(async () => {
    await gameBot.connectDB();
    gameBot.initBot(); // ایجاد امن ربات تلگرام

    // مسیر اصلی
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // مسیر game.html
    app.get('/game.html', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'game.html'));
    });

    app.listen(PORT, () => {
        console.log(`🚀 سرور اجرا شد روی پورت ${PORT}`);
        console.log(`🌐 آدرس بازی: ${WEB_APP_URL}`);
    });
})();
