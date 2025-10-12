const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws/';

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

class WordGameBot {
    constructor() {
        this.log('🤖 ربات تلگرام روی Render راه‌اندازی شد (Node.js)');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }

    createMainMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🎮 شروع بازی زیبا',
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

    async handleStart(chatId, firstName) {
        const welcomeText = 
            `🌟 <b>سلام ${firstName} عزیز!</b>\n\n` +
            "🎮 <b>به ربات بازی حدس کلمه خوش آمدید!</b>\n\n" +
            "✨ <b>ویژگی‌های بازی:</b>\n" +
            "• 🎯 سه سطح مختلف (آسان، متوسط، سخت)\n" +
            "• 🏆 سیستم امتیازدهی پیشرفته\n" + 
            "• 📊 جدول رتبه‌بندی\n" +
            "• 🎨 طراحی زیبا و ریسپانسیو\n\n" +
            "برای شروع بازی روی دکمه زیر کلیک کنید:";

        try {
            await bot.sendMessage(chatId, welcomeText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
            this.log(`✅ پیام خوش‌آمدگویی برای ${firstName} ارسال شد`);
        } catch (error) {
            this.log(`❌ خطا در ارسال پیام: ${error.message}`);
        }
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'کاربر';
        const text = msg.text || '';

        this.log(`📩 پیام از ${firstName}: ${text}`);

        try {
            switch (text) {
                case '/start':
                    await this.handleStart(chatId, firstName);
                    break;
                    
                case '/game':
                    await this.handleGame(chatId);
                    break;
                    
                case '/stats':
                    await this.handleStats(chatId, userId);
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
        const data = callbackQuery.data;
        const firstName = callbackQuery.from.first_name || 'کاربر';

        this.log(`🔘 کلیک از ${firstName}: ${data}`);

        try {
            switch (data) {
                case 'stats':
                    await this.handleStats(chatId, callbackQuery.from.id);
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

    async handleStats(chatId, userId) {
        const statsText =
            "📊 <b>آمار و امتیازات</b>\n\n" +
            "👤 <b>کاربر:</b> در حال بارگذاری...\n" +
            "🏆 <b>امتیاز کلی:</b> در حال بارگذاری...\n" +
            "🎯 <b>تعداد بازی‌ها:</b> در حال بارگذاری...\n" +
            "⭐ <b>بهترین امتیاز:</b> در حال بارگذاری...\n\n" +
            "📈 <i>برای مشاهده آمار کامل، وارد بازی شوید...</i>";

        await bot.sendMessage(chatId, statsText, {
            parse_mode: 'HTML',
            ...this.createMainMenu()
        });
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

    async handleLeaderboard(chatId) {
        const leaderboardText =
            "🏆 <b>جدول رتبه‌بندی</b>\n\n" +
            "🥇 <b>رتبه اول:</b> در حال بارگذاری...\n" +
            "🥈 <b>رتبه دوم:</b> در حال بارگذاری...\n" + 
            "🥉 <b>رتبه سوم:</b> در حال بارگذاری...\n\n" +
            "📊 <i>برای مشاهده جدول کامل، وارد بازی شوید...</i>";

        await bot.sendMessage(chatId, leaderboardText, {
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

    start() {
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

        // صفحه اصلی
        app.get('/', (req, res) => {
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
