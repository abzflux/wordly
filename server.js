const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { Sequelize, DataTypes } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws/';

// تنظیمات MySQL از Environment Variables
const DB_HOST = process.env.DB_HOST || 'sql312.infinityfree.com';
const DB_USER = process.env.DB_USER || 'if0_38684226';
const DB_PASSWORD = process.env.DB_PASSWORD || 'ps1PruIyBUxdipu';
const DB_NAME = process.env.DB_NAME || 'if0_38684226_wordly_db';
const DB_PORT = process.env.DB_PORT || 3306;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

app.use(express.json());

// اتصال به MySQL
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: 'mysql',
    logging: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
    }
});

// مدل‌های دیتابیس
const User = sequelize.define('User', {
    userId: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        allowNull: false
    },
    firstName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    username: {
        type: DataTypes.STRING,
        allowNull: true
    },
    totalScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    gamesPlayed: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    bestScore: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'users',
    timestamps: true
});

const GameSession = sequelize.define('GameSession', {
    userId: {
        type: DataTypes.BIGINT,
        allowNull: false
    },
    word: {
        type: DataTypes.STRING,
        allowNull: false
    },
    difficulty: {
        type: DataTypes.STRING,
        allowNull: false
    },
    score: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    completed: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
}, {
    tableName: 'game_sessions',
    timestamps: true
});

class WordGameBot {
    constructor() {
        this.dbConnected = false;
        this.log('🤖 ربات تلگرام راه‌اندازی شد');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }

    async connectDB() {
        try {
            await sequelize.authenticate();
            await sequelize.sync(); // ایجاد خودکار جداول اگر وجود ندارند
            this.dbConnected = true;
            this.log('✅ متصل به دیتابیس MySQL');
        } catch (error) {
            this.log(`❌ خطا در اتصال به دیتابیس: ${error.message}`);
            this.dbConnected = false;
        }
    }

    async getUserStats(userId) {
        if (!this.dbConnected) {
            return null;
        }

        try {
            let user = await User.findByPk(userId);
            
            if (!user) {
                user = await User.create({ 
                    userId, 
                    firstName: 'کاربر',
                    totalScore: 0,
                    gamesPlayed: 0,
                    bestScore: 0
                });
            }

            return user;
        } catch (error) {
            this.log(`❌ خطا در دریافت اطلاعات کاربر: ${error.message}`);
            return null;
        }
    }

    async updateUserStats(userId, score, firstName = 'کاربر', username = '') {
        if (!this.dbConnected) {
            return;
        }

        try {
            let user = await User.findByPk(userId);
            
            if (!user) {
                user = await User.create({ 
                    userId, 
                    firstName,
                    username,
                    totalScore: score,
                    gamesPlayed: 1,
                    bestScore: score
                });
            } else {
                await user.update({
                    totalScore: user.totalScore + score,
                    gamesPlayed: user.gamesPlayed + 1,
                    bestScore: Math.max(user.bestScore, score),
                    firstName: firstName,
                    username: username
                });
            }
            
            this.log(`📊 آمار کاربر ${firstName} به روز شد: ${score} امتیاز`);
        } catch (error) {
            this.log(`❌ خطا در به‌روزرسانی کاربر: ${error.message}`);
        }
    }

    async getLeaderboard(limit = 10) {
        if (!this.dbConnected) {
            return [];
        }

        try {
            const topUsers = await User.findAll({
                order: [['bestScore', 'DESC']],
                limit: limit
            });
            return topUsers;
        } catch (error) {
            this.log(`❌ خطا در دریافت لیست برترین‌ها: ${error.message}`);
            return [];
        }
    }

    createMainMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: 'شروع',
                            web_app: { url: WEB_APP_URL }
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

    async handleStart(chatId, userData) {
        const welcomeText = 
            `<b>سلام ${userData.firstName} عزیز!</b>\n\n` +
            "<b>به ربات بازی حدس کلمه خوش آمدید!</b>\n\n" +

            "برای شروع بازی روی دکمه زیر کلیک کنید:";

        try {
            // ایجاد یا به‌روزرسانی کاربر در دیتابیس
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
                    await this.handleGame(chatId);
                    break;
                    
                case '/stats':
                    await this.handleStats(chatId, userId, firstName);
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
                case 'stats':
                    await this.handleStats(chatId, userId, firstName);
                    break;
                    
                case 'leaderboard':
                    await this.handleLeaderboard(chatId);
                    break;
                    
                case 'help':
                    await this.handleHelp(chatId);
                    break;
                    
                case 'about':
                    await this.handleAbout(chatId);
                    break;
            }
        } catch (error) {
            this.log(`❌ خطا در پردازش callback: ${error.message}`);
        }
    }

    async handleStats(chatId, userId, firstName) {
        try {
            const userStats = await this.getUserStats(userId);
            
            let statsText;
            if (userStats) {
                statsText =
                    `📊 <b>آمار و امتیازات</b>\n\n` +
                    `👤 <b>کاربر:</b> ${firstName}\n` +
                    `🏆 <b>امتیاز کلی:</b> ${userStats.totalScore}\n` +
                    `🎯 <b>تعداد بازی‌ها:</b> ${userStats.gamesPlayed}\n` +
                    `⭐ <b>بهترین امتیاز:</b> ${userStats.bestScore}\n\n` +
                    `📈 <i>برای بهبود آمار، بازی کنید!</i>`;
            } else {
                statsText =
                    `📊 <b>آمار و امتیازات</b>\n\n` +
                    `👤 <b>کاربر:</b> ${firstName}\n` +
                    `🏆 <b>امتیاز کلی:</b> 0\n` +
                    `🎯 <b>تعداد بازی‌ها:</b> 0\n` +
                    `⭐ <b>بهترین امتیاز:</b> 0\n\n` +
                    `📈 <i>هنوز بازی نکرده‌اید!</i>`;
            }

            await bot.sendMessage(chatId, statsText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
        } catch (error) {
            this.log(`❌ خطا در نمایش آمار: ${error.message}`);
        }
    }

    async handleLeaderboard(chatId) {
        try {
            const topUsers = await this.getLeaderboard(5);
            
            let leaderboardText = "🏆 <b>جدول رتبه‌بندی</b>\n\n";
            
            if (topUsers.length > 0) {
                topUsers.forEach((user, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔸';
                    leaderboardText += `${medal} <b>${user.firstName}:</b> ${user.bestScore} امتیاز\n`;
                });
            } else {
                leaderboardText += "📝 هنوز کسی بازی نکرده است!\n";
            }
            
            leaderboardText += "\n📊 <i>برای قرارگیری در جدول، بازی کنید!</i>";

            await bot.sendMessage(chatId, leaderboardText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
        } catch (error) {
            this.log(`❌ خطا در نمایش جدول: ${error.message}`);
        }
    }

    async handleHelp(chatId) {
        const helpText =
            "📖 <b>راهنمای بازی حدس کلمه</b>\n\n" +
            "🎯 <b>هدف بازی:</b>\n" +
            "حدس زدن کلمه مخفی قبل از اتمام فرصت‌ها\n\n" +
            "🔤 <b>طریقه بازی:</b>\n" +
            "1. روی «شروع بازی» کلیک کنید\n" +
            "2. سطح مورد نظر را انتخاب کنید\n" + 
            "3. حروف را در کادر وارد کنید\n" +
            "4. کلمه را قبل از اتمام ۶ فرصت حدس بزنید\n\n" +
            "💡 <b>نکات مهم:</b>\n" +
            "• هر حرف اشتباه = از دست دادن یک فرصت\n" +
            "• امتیاز بیشتر برای سطح‌های سخت‌تر\n" +
            "• سرعت پاسخ‌دهی در امتیاز تأثیر دارد";

        await bot.sendMessage(chatId, helpText, {
            parse_mode: 'HTML',
            ...this.createMainMenu()
        });
    }

    async handleAbout(chatId) {
        const aboutText =
            "ℹ️ <b>درباره بازی</b>\n\n" +
            "🎮 <b>بازی حدس کلمه</b>\n" +
            "یک بازی آموزشی و سرگرم کننده برای تقویت دایره لغات فارسی\n\n" +
            "✨ <b>ویژگی‌ها:</b>\n" +
            "• طراحی اختصاصی برای تلگرام\n" +
            "• رابط کاربری زیبا و مدرن\n" +
            "• سیستم امتیازدهی هوشمند\n" +
            "• پشتیبانی از تمام دستگاه‌ها\n\n" +
            "🔗 <b>آدرس بازی:</b>\n" +
            `<code>${WEB_APP_URL}</code>`;

        await bot.sendMessage(chatId, aboutText, {
            parse_mode: 'HTML',
            ...this.createMainMenu()
        });
    }

    async handleGame(chatId) {
        const gameText =
            "🎯 <b>شروع بازی</b>\n\n" +
            "برای تجربه‌ی بهترین بازی، روی دکمه زیر کلیک کنید:\n\n" +
            "🖥️ بازی در مرورگر باز می‌شود\n" +
            "📱 سازگار با موبایل و دسکتاپ\n" +
            "⚡ عملکرد سریع و روان";

        await bot.sendMessage(chatId, gameText, {
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
        });
    }

    async setupWebhook() {
        try {
            const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-app-name.onrender.com'}/webhook`;
            
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

    async start() {
        // اتصال به دیتابیس
        await this.connectDB();

        // راه‌اندازی وب‌هوک
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

        // API برای ذخیره امتیاز از وب اپ
        app.post('/api/save-score', async (req, res) => {
            try {
                const { userId, score, firstName, username } = req.body;
                
                if (userId && score !== undefined) {
                    await this.updateUserStats(userId, score, firstName, username);
                    res.json({ success: true, message: 'امتیاز ذخیره شد' });
                } else {
                    res.status(400).json({ success: false, message: 'داده‌ها ناقص است' });
                }
            } catch (error) {
                this.log(`❌ خطا در ذخیره امتیاز: ${error.message}`);
                res.status(500).json({ success: false, message: 'خطای سرور' });
            }
        });

        // صفحه اصلی
        app.get('/', (req, res) => {
            const dbStatus = this.dbConnected ? '✅ متصل' : '❌ قطع';
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ربات بازی حدس کلمه</title>
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
                        .info { 
                            text-align: left; 
                            background: rgba(0,0,0,0.2); 
                            padding: 15px; 
                            border-radius: 10px; 
                            margin: 10px 0; 
                        }
                        code {
                            background: rgba(0,0,0,0.3);
                            padding: 2px 6px;
                            border-radius: 4px;
                            direction: ltr;
                            display: inline-block;
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
                        </div>
                        <div class="info">
                            <strong>🔗 آدرس وب اپ:</strong><br>
                            <code>${WEB_APP_URL}</code>
                        </div>
                        <div class="info">
                            <strong>📊 وضعیت ربات:</strong><br>
                            ✅ فعال و آماده دریافت پیام
                        </div>
                        <div class="info">
                            <strong>🚀 برای شروع:</strong><br>
                            در تلگرام به ربات پیام <code>/start</code> بفرستید
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        // هندل خطا ۴۰۴
        app.use((req, res) => {
            res.status(404).send('صفحه مورد نظر یافت نشد');
        });

        // شروع سرور
        app.listen(PORT, async () => {
            this.log(`🚀 سرور Node.js اجرا شد روی پورت: ${PORT}`);
            
            // تنظیم وب‌هوک پس از راه‌اندازی سرور
            await this.setupWebhook();
            
            this.log(`🤖 ربات آماده دریافت پیام...`);
        });
    }
}

// اجرای ربات
const gameBot = new WordGameBot();
gameBot.start();

// جلوگیری از خوابیدن - هر ۱۰ دقیقه
cron.schedule('*/10 * * * *', async () => {
    try {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const response = await fetch(baseUrl);
        console.log('🔄 Keeping alive...');
    } catch (error) {
        console.log('❌ Keep-alive failed:', error.message);
    }
});

// هندل کردن خطاها
process.on('unhandledRejection', (error) => {
    console.error('❌ خطای unhandledRejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطای uncaughtException:', error);
});
