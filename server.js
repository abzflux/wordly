const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

// --- NEW: Telegram Bot Library ---
const TelegramBot = require('node-telegram-bot-api');
// ---------------------------------

// --- تنظیمات و متغیرهای محیطی ---
// توجه: در محیط رندر (render.com)، متغیرهای محیطی باید به درستی تنظیم شوند.
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ'; // توکن ربات تلگرام
const DATABASE_URL = 'postgresql://abzx:RsDq7AmdXXj9WOnACP0RTxonFuKIaJki@dpg-d3oj7rmuk2gs73cscc6g-a.frankfurt-postgres.render.com/wordlydb_7vux';
const FRONTEND_URL = 'https://wordlybot.ct.ws'; // آدرس فرانت اند
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی دیتابیس PostgreSQL ---
const pool = new Pool({
    connectionString: DATABASE_URL,
    // FIX START: تنظیمات SSL برای رفع خطای "Connection terminated unexpectedly"
    ssl: {
        // اطمینان از اینکه SSL باید استفاده شود
        require: true,
        // اجازه دادن به گواهی‌های بدون اعتبار (خود امضا شده) که در محیط‌های ابری رایج است
        rejectUnauthorized: false
    }
    // FIX END
});

// --- راه‌اندازی ربات تلگرام ---
// در محیط‌های Production بهتر است از Webhook استفاده شود، اما برای سادگی از Polling استفاده می‌کنیم.
// توجه: اگر توکن واقعی ربات را اینجا قرار ندهید، این بخش کار نخواهد کرد.
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ربات تلگرام فعال شد.');

// --- مجموعه کلمات لیگ ---
const leagueWords = {
    "حیوانات": [
        "شیر", "فیل", "گربه", "سگ", "خرس", "گرگ", "روباه", "خرگوش", "گاو", "گوسفند",
        "ببر", "پلنگ", "زرافه", "کرگدن", "اسب", "الاغ", "قوچ", "بز", "شتر", "خوک",
        "موش", "سنجاب", "خفاش", "جغد", "عقاب", "شاهین", "کبوتر", "مرغ", "خروس", "اردک",
        "غاز", "قو", "پنگوئن", "فلامینگو", "طاووس", "طوطی", "کلاغ", "بلبل", "قناری", "هدهد",
        "لاک‌پشت", "مار", "مارمولک", "تمساح", "قورباغه", "وزغ", "ماهی", "کوسه", "دلفین", "نهنگ",
        "اختاپوس", "ستاره دریایی", "خرچنگ", "میگو", "حلزون", "کرم", "عنکبوت", "مورچه", "زنبور", "پشه",
        "مگس", "پروانه", "ملخ", "سوسک", "کفشدوزک", "مورچه خوار", "آهو", "گوزن", "گورخر", "گوریل",
        "شامپانزه", "میمون", "کوالا", "کانگورو", "پاندا", "خفاش", "خفاش میوه", "خفاش خون", "خفاش ماهی", "خفاش سفید",
        "خفاش قهوه", "خفاش سیاه", "خفاش خاکستری", "خفاش قرمز", "خفاش آبی", "خفاش سبز", "خفاش زرد", "خفاش نارنجی", "خفاش بنفش", "خفاش صورتی"
    ],
    "میوه‌ها": [
        "سیب", "موز", "پرتقال", "نارنگی", "لیمو", "گریپ فروت", "انار", "انگور", "هلو", "زردآلو",
        "شلیل", "آلو", "گیلاس", "آلبالو", "توت", "تمشک", "شاتوت", "توت فرنگی", "انجیر", "خرمالو",
        "کیوی", "آناناس", "نارگیل", "انبه", "پاپایا", "موز سبز", "موز قرمز", "موز زرد", "موز صورتی", "موز بنفش",
        "سیب سبز", "سیب قرمز", "سیب زرد", "سیب صورتی", "سیب بنفش", "پرتقال نارنجی", "پرتقال قرمز", "پرتقال زرد", "پرتقال سبز", "پرتقال بنفش",
        "نارنگی نارنجی", "نارنگی قرمز", "نارنگی زرد", "نارنگی سبز", "نارنگی بنفش", "لیمو زرد", "لیمو سبز", "لیمو قرمز", "لیمو نارنجی", "لیمو بنفش",
        "گریپ فروت صورتی", "گریپ فروت قرمز", "گریپ فروت زرد", "گریپ فروت نارنجی", "گریپ فروت سبز", "انار قرمز", "انار صورتی", "انار زرد", "انار نارنجی", "انار بنفش",
        "انگور سبز", "انگور قرمز", "انگور سیاه", "انگور زرد", "انگور صورتی", "هلو زرد", "هلو سفید", "هلو قرمز", "هلو نارنجی", "هلو صورتی",
        "زردآلو نارنجی", "زردآلو زرد", "زردآلو قرمز", "زردآلو صورتی", "زردآلو بنفش", "شلیل زرد", "شلیل سفید", "شلیل قرمز", "شلیل نارنجی", "شلیل صورتی",
        "آلو قرمز", "آلو زرد", "آلو سبز", "آلو بنفش", "آلو سیاه", "گیلاس قرمز", "گیلاس زرد", "گیلاس سیاه", "گیلاس صورتی", "گیلاس نارنجی"
    ],
    "سبزیجات": [
        "هویج", "سیب زمینی", "پیاز", "سیر", "کلم", "کاهو", "اسفناج", "جعفری", "نعناع", "تربچه",
        "شلغم", "چغندر", "کدو", "بادمجان", "فلفل", "گوجه", "خیار", "کرفس", "قارچ", "ذرت",
        "لوبیا", "نخود", "عدس", "ماش", "لپه", "باقلا", "کنگر", "ریحان", "ترخون", "مرزه",
        "شوید", "پیازچه", "تره", "جعفری فرنگی", "کلم بروکلی", "کلم گل", "کلم قرمز", "کلم سفید", "کلم چینی", "کلم پیچ",
        "هویج زرد", "هویج نارنجی", "هویج قرمز", "هویج بنفش", "هویج سفید", "سیب زمینی قهوه", "سیب زمینی قرمز", "سیب زمینی زرد", "سیب زمینی بنفش", "سیب زمینی سفید",
        "پیاز زرد", "پیاز قرمز", "پیاز سفید", "پیاز بنفش", "پیاز سبز", "سیر سفید", "سیر بنفش", "سیر قرمز", "سیر زرد", "سیر صورتی",
        "کلم سبز", "کلم قرمز", "کلم سفید", "کلم بنفش", "کلم زرد", "کاهو سبز", "کاهو قرمز", "کاهو بنفش", "کاهو زرد", "کاهو صورتی",
        "اسفناج سبز", "اسفناج قرمز", "اسفناج بنفش", "اسفناج زرد", "اسفناج نارنجی", "جعفری سبز", "جعفری قرمز", "جعفری بنفش", "جعفری زرد", "جعفری صورتی",
        "نعناع سبز", "نعناع قرمز", "نعناع بنفش", "نعناع زرد", "نعناع صورتی", "تربچه قرمز", "تربچه سفید", "تربچه بنفش", "تربچه زرد", "تربچه نارنجی"
    ],
    "شهرها": [
        "تهران", "مشهد", "اصفهان", "شیراز", "تبریز", "کرج", "قم", "اهواز", "کرمانشاه", "ارومیه",
        "رشت", "زاهدان", "کرمان", "همدان", "یزد", "اردبیل", "بندرعباس", "خرم‌آباد", "ساری", "گرگان",
        "قزوین", "سنندج", "کاشان", "نجف‌آباد", "بابل", "آمل", "دزفول", "بوشهر", "اسلام‌شهر", "پاکدشت",
        "ورامین", "شاهرود", "سبزوار", "نیشابور", "بجنورد", "شهرکرد", "یاسوج", "بیرجند", "زنجان", "قائم‌شهر",
        "لارستان", "کیش", "قشم", "چابهار", "خوی", "مراغه", "مرودشت", "سمنان", "ایلام", "بروجرد",
        "شوشتر", "ماهشهر", "بهبهان", "رامهرمز", "گنبد", "آبادان", "خرمشهر", "اندیمشک", "شهرری", "رباط‌کریم",
        "ملارد", "قدس", "پرند", "نسیم‌شهر", "قرچک", "پردیس", "هشتگرد", "اشتهارد", "طالقان", "فشم",
        "لواسان", "تجریش", "دربند", "درکه", "فرحزاد", "کن", "سعادت‌آباد", "جنت‌آباد", "شهرک غرب", "پاسداران",
        "نیاوران", "دوران", "ونک", "قیطریه", "امیرآباد", "کارگر", "انقلاب", "جمهوری", "ولیعصر", "میدان‌انقلاب"
    ],
    "کشورها": [
        "ایران", "عراق", "ترکیه", "افغانستان", "پاکستان", "عربستان", "امارات", "قطر", "کویت", "عمان",
        "یمن", "اردن", "سوریه", "لبنان", "مصر", "مراکش", "الجزایر", "تونس", "لیبی", "سودان",
        "اتیوپی", "کنیا", "تانزانیا", "آفریقای‌جنوبی", "نیجریه", "غنا", "سنگال", "اوگاندا", "رواندا", "بوروندی",
        "آنگولا", "زامبیا", "زیمبابوه", "موزامبیک", "ماداگاسکار", "سومالی", "اریتره", "جیبوتی", "چاد", "نیجر",
        "مالی", "بورکینافاسو", "ساحل‌عاج", "لیبریا", "سیرالئون", "گینه", "گینه‌بیسائو", "گامبیا", "بنین", "توگو",
        "کامرون", "گابن", "کنگو", "جمهوری‌آفریقای‌مرکزی", "جمهوری‌دموکراتیک‌کنگو", "رواندا", "بوروندی", "مالاوی", "زامبیا", "زیمبابوه",
        "بوتسوانا", "نامیبیا", "لسوتو", "اسواتینی", "سیشل", "موریس", "کومور", "ماداگاسکار", "مالدیو", "سری‌لانکا",
        "هند", "پاکستان", "بنگلادش", "نپال", "بوتان", "میانمار", "تایلند", "لائوس", "کامبوج", "ویتنام",
        "مالزی", "سنگاپور", "اندونزی", "فیلیپین", "برونئی", "تیمور", "پاپوآ", "فیجی", "ساموا", "تونگا"
    ],
    "اشیا": [
        "میز", "صندلی", "کتاب", "قلم", "دفتر", "مداد", "پاک‌کن", "خط‌کش", "گچ", "تخته",
        "کامپیوتر", "موبایل", "تبلت", "لپ‌تاپ", "مانیتور", "کیبورد", "ماوس", "هدفون", "اسپیکر", "میکروفون",
        "دوربین", "عینک", "ساعت", "جواهر", "طلا", "نقره", "الماس", "مروارید", "یاقوت", "زمررد",
        "یاقوت‌کبود", "آمیتیست", "توپاز", "گارنت", "اپال", "آکوامارین", "سیترین", "پریدوت", "تانزانیت", "لعل",
        "فیروزه", "عقیق", "یشم", "مالاکیت", "لاجورد", "کهربا", "مرمر", "سنگ‌آهک", "گرانیت", "بازالت",
        "ماسه‌سنگ", "شیست", "گنیس", "سنگ‌چخماق", "ابسیدین", "پومیس", "توف", "کنگلومرا", "برش", "میل",
        "پیچ", "مهره", "خار", "میخ", "قلاب", "زنجیر", "قفل", "کلید", "چاقو", "قیچی",
        "سوزن", "نخ", "قلاب‌بافی", "پارچه", "پنبه", "ابریشم", "پشم", "کتان", "نایلون", "پلی‌استر"
    ],
    "حرفه‌ها": [
        "پزشک", "مهندس", "معلم", "پرستار", "پلیس", "آتش‌نشان", "خلبان", "راننده", "کشاورز", "دامدار",
        "باغبان", "نجار", "آهنگر", "جوشکار", "برقکار", "لوله‌کش", "نقاش", "مجسمه‌ساز", "عکاس", "فیلمبردار",
        "کارگردان", "بازیگر", "خواننده", "نوازنده", "نویسنده", "شاعر", "روزنامه‌نگار", "مترجم", "مدرس", "استاد",
        "محقق", "دانشمند", "شیمیدان", "فیزیکدان", "ریاضی‌دان", "اخترشناس", "زمین‌شناس", "زیست‌شناس", "پزشک", "دندانپزشک",
        "داروساز", "فیزیوتراپ", "روانشناس", "مشاور", "وکیل", "قاضی", "کارآگاه", "جاسوس", "مأمور", "مامور",
        "منشی", "مدیر", "رئیس", "معاون", "کارمند", "حسابدار", "مدیرمالی", "بازاریاب", "فروشنده", "مشتری",
        "مهماندار", "پیشخدمت", "آشپز", "نانوا", "قصاب", "میوه‌فروش", "سبزی‌فروش", "عطار", "داروفروش", "کتابفروش",
        "لوازم‌تحریرفروش", "پوشاک‌فروش", "کفاش", "خیاط", "آرایشگر", "ماساژور", "مربی", "ورزشکار", "داور", "تماشاگر"
    ],
    "ورزش‌ها": [
        "فوتبال", "والیبال", "بسکتبال", "تنیس", "بدمینتون", "پینگ‌پنگ", "گلف", "هاکی", "کریکت", "بیسبال",
        "بوکس", "کشتی", "جودو", "کاراته", "تکواندو", "کونگ‌فو", "موای‌تای", "کیک‌بوکسینگ", "مبارزه", "شمشیربازی",
        "تیراندازی", "کمانگیری", "پرتاب نیزه", "پرتاب چکش", "پرتاب دیسک", "پرش ارتفاع", "پرش طول", "پرش سه‌گام", "دو", "دوی سرعت",
        "دوی استقامت", "دوی ماراتن", "دوی نیمه‌ماراتن", "دوی امدادی", "دوی با مانع", "دوی صحرانوردی", "شنا", "شیرجه", "واترپلو", "غواصی",
        "قایقرانی", "قایق‌سواری", "کایاک", "قایق بادبانی", "موج‌سواری", "اسکی", "اسنوبرد", "هاکی روی یخ", "اسکیت", "پاتیناژ",
        "کوهنوردی", "صخره‌نوردی", "غارنوردی", "پیاده‌روی", "کوهپیمایی", "دوچرخه‌سواری", "موتورسواری", "اتومبیل‌رانی", "مسابقه", "رالی",
        "اسب‌سواری", "سوارکاری", "پرش با اسب", "درساژ", "چوگان", "شترسواری", "فیل‌سواری", "قایق‌سواری", "هواپیما", "هلیکوپتر",
        "پاراگلایدر", "چتربازی", "بانجی‌جامپینگ", "اسکای‌دایوینگ", "بیس‌جامپینگ", "پارکور", "ترامپولین", "ژیمناستیک", "حرکات‌آکروباتیک", "رقص"
    ],
    "غذاها": [
        "قورمه‌سبزی", "قیمه", "خورشت", "کباب", "جوجه‌کباب", "چلوکباب", "برنج", "پلو", "چلو", "عدس‌پلو",
        "لوبیاپلو", "سبزی‌پلو", "ماهی‌پلو", "آلبالوپلو", "زرشک‌پلو", "شویدپلو", "استامبولی", "دلمه", "دلمه‌برگ", "دلمه‌فلفل",
        "دلمه‌کدو", "دلمه‌بادمجان", "کوفته", "کوفته‌تبریزی", "کوفته‌سبزی", "کوفته‌لوبیا", "کله‌پاچه", "آش", "آش‌رشته", "آش‌شله‌قلمکار",
        "آش‌جو", "آش‌ماست", "آش‌آلبالو", "آش‌کدو", "حلیم", "فرنی", "شیربرنج", "سمنو", "کاچی", "حلوای",
        "شیرینی", "کیک", "کوکی", "بیسکویت", "نان", "نان‌سنگک", "نان‌بربری", "نان‌تافتون", "نان‌لواش", "نان‌باگت",
        "ساندویچ", "همبرگر", "پیتزا", "پاستا", "ماکارونی", "لازانیا", "ریزوتو", "پولنتا", "فوندو", "راویولی",
        "پنینی", "کروسان", "دونات", "پنکیک", "وافل", "کرپ", "املت", "خاگینه", "نیمرو", "تخم‌مرغ",
        "ماست", "پنیر", "کره", "خامه", "سرشیر", "کشک", "دوغ", "آب", "نوشابه", "آبمیوه"
    ],
    "رنگ‌ها": [
        "قرمز", "نارنجی", "زرد", "سبز", "آبی", "نیلی", "بنفش", "صورتی", "قهوه‌ای", "مشکی",
        "سفید", "خاکستری", "نقره‌ای", "طلایی", "برنزی", "نقره", "طلا", "مس", "برنج", "آهن",
        "فولاد", "آلومینیوم", "سرب", "روی", "قلع", "نیکل", "کروم", "تیتانیوم", "پلاتین", "پالادیوم",
        "رودیوم", "ایریدیوم", "اسمیوم", "روتنیوم", "رنیوم", "تنگستن", "مولیبدن", "وانادیوم", "کبالت", "نیکل",
        "مس", "روی", "قلع", "سرب", "آلومینیوم", "تیتانیوم", "منیزیم", "سیلیسیم", "فسفر", "گوگرد",
        "کلر", "پتاسیم", "سدیم", "کلسیم", "منگنز", "آهن", "کبالت", "نیکل", "مس", "روی",
        "گالیم", "ژرمانیوم", "آرسنیک", "سلنیوم", "برم", "کریپتون", "روبیدیوم", "استرانسیوم", "ایتریم", "زیرکونیوم",
        "نیوبیوم", "مولیبدن", "تکنسیوم", "روتنیوم", "رودیم", "پالادیوم", "نقره", "کادمیوم", "ایندیم", "قلع"
    ]
};

// --- منطق ربات تلگرام (پاسخ به /start) ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const name = msg.from.first_name || msg.from.username || 'کاربر ناشناس';

    try {
        // ثبت یا به‌روزرسانی کاربر در دیتابیس
        await pool.query(
            `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
            ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
            [userId, name]
        );
        
        // ارسال پیام خوشامدگویی با لینک بازی
        const welcomeMessage = `
            سلام ${name}، به بازی Wordly خوش آمدید! 🤖
            
            شما اکنون ثبت‌نام شده‌اید. 
            برای شروع بازی و رقابت با دیگران، لطفاً روی دکمه یا لینک زیر کلیک کنید:
        `;

        // دکمه شیشه‌ای (Inline Keyboard) برای هدایت به Mini App
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: 'شروع بازی (Mini App)',
                        web_app: { url: FRONTEND_URL }
                    }
                ]
            ]
        };

        bot.sendMessage(chatId, welcomeMessage, { 
            reply_markup: inlineKeyboard,
            parse_mode: 'Markdown' 
        });

        // پیام راهنمایی برای نمایش آیدی
        bot.sendMessage(chatId, `کد کاربری (Telegram ID) شما: \`${userId}\``, { parse_mode: 'Markdown' });

        console.log(`🤖 ربات به کاربر ${userId} پاسخ /start داد.`);
        
    } catch (error) {
        console.error('❌ خطای پردازش فرمان /start:', error);
        bot.sendMessage(chatId, 'خطایی در ثبت‌نام شما در دیتابیس رخ داد. لطفا دوباره تلاش کنید.');
    }
});
// ------------------------------------------

// اتصال و اطمینان از وجود جداول
async function setupDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // جدول کاربران
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                score INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // جدول بازی‌ها
        await client.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                creator_id BIGINT NOT NULL REFERENCES users(telegram_id),
                guesser_id BIGINT,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                max_guesses INT NOT NULL,
                guesses_left INT NOT NULL,
                correct_guesses INT DEFAULT 0,
                incorrect_guesses INT DEFAULT 0,
                revealed_letters JSONB DEFAULT '{}', -- { "حرف": [اندیس1, اندیس2] }
                guessed_letters VARCHAR(1)[] DEFAULT '{}', -- آرایه‌ای از حروف حدس زده شده
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
                winner_id BIGINT,
                FOREIGN KEY (guesser_id) REFERENCES users(telegram_id)
            );
        `);

        // --- NEW: جدول لیگ‌ها ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS leagues (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'starting', 'in_progress', 'ended')),
                current_word_number INT DEFAULT 1,
                total_words INT DEFAULT 10,
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- NEW: جدول بازیکنان لیگ ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_players (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                score INT DEFAULT 0,
                correct_words INT DEFAULT 0,
                total_time INT DEFAULT 0, -- زمان کل صرف شده برای تمام کلمات (ثانیه)
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(league_id, user_id)
            );
        `);

        // --- NEW: جدول کلمات لیگ ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_words (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                word_number INT NOT NULL,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                max_guesses INT NOT NULL,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed'))
            );
        `);

        // --- NEW: جدول وضعیت بازیکنان در کلمات لیگ ---
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_player_words (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                word_number INT NOT NULL,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                guesses_left INT NOT NULL,
                correct_guesses INT DEFAULT 0,
                incorrect_guesses INT DEFAULT 0,
                revealed_letters JSONB DEFAULT '{}',
                guessed_letters VARCHAR(1)[] DEFAULT '{}',
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
                time_taken INT DEFAULT 0, -- زمان صرف شده برای این کلمه (ثانیه)
                score_earned INT DEFAULT 0,
                UNIQUE(league_id, user_id, word_number)
            );
        `);

        console.log('✅ جداول دیتابیس بررسی و ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err.message);
        // اگر نتوانستیم به دیتابیس متصل شویم، ادامه نمی‌دهیم
        process.exit(1);
    }
}

// --- راه‌اندازی سرور Express و Socket.io ---
const app = express();
const server = http.createServer(app);

// فعال‌سازی CORS برای ارتباط بین فرانت و بک
app.use(cors({
    origin: FRONTEND_URL, // فقط فرانت اند مشخص شده
    methods: ['GET', 'POST']
}));

// استفاده از JSON در درخواست‌ها
app.use(express.json());

// راه‌اندازی Socket.io
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST']
    }
});

// --- توابع کمکی ---
const generateGameCode = () => Math.random().toString(36).substring(2, 6).toUpperCase();

/**
 * وضعیت بازی را به کلاینت‌ها ارسال می‌کند
 * @param {string} gameCode کد بازی
 */
async function emitGameState(gameCode) {
    try {
        const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
        const game = result.rows[0];

        if (game) {
            // دریافت اطلاعات کامل سازنده و حدس زننده
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }

            // وضعیت فیلتر شده بازی (کلمه اصلی مخفی می‌شود)
            const gameState = {
                code: game.code,
                status: game.status,
                category: game.category,
                wordLength: game.word.length,
                maxGuesses: game.max_guesses,
                guessesLeft: game.guesses_left,
                correctGuesses: game.correct_guesses,
                incorrectGuesses: game.incorrect_guesses,
                revealedLetters: game.revealed_letters,
                guessedLetters: game.guessed_letters,
                startTime: game.start_time,
                creator: creator,
                guesser: guesser
            };

            io.to(gameCode).emit('game_update', gameState);
            console.log(`📡 وضعیت جدید بازی ${gameCode} ارسال شد.`);
        } else {
            io.to(gameCode).emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
        }
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت بازی ${gameCode}:`, error);
    }
}

/**
 * امتیاز کاربر را به‌روزرسانی کرده و جدول رتبه‌بندی را بروزرسانی می‌کند
 * @param {bigint} userId آیدی تلگرام کاربر برنده
 * @param {number} points امتیاز
 */
async function updateScoreAndEmitLeaderboard(userId, points) {
    await pool.query('UPDATE users SET score = score + $1 WHERE telegram_id = $2', [points, userId]);
    await emitLeaderboard();
}

/**
 * جدول رتبه‌بندی را به تمامی کلاینت‌ها ارسال می‌کند
 */
async function emitLeaderboard() {
    try {
        const result = await pool.query('SELECT name, score FROM users ORDER BY score DESC LIMIT 10');
        io.emit('leaderboard_update', result.rows);
    } catch (error) {
        console.error('❌ خطای ارسال جدول رتبه‌بندی:', error);
    }
}

// --- NEW: توابع کمکی لیگ ---

/**
 * تولید کلمه تصادفی برای لیگ
 * @returns {Object} شیء حاوی کلمه و دسته‌بندی
 */
function getRandomLeagueWord() {
    const categories = Object.keys(leagueWords);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const wordsInCategory = leagueWords[randomCategory];
    const randomWord = wordsInCategory[Math.floor(Math.random() * wordsInCategory.length)];
    
    return {
        word: randomWord,
        category: randomCategory
    };
}

/**
 * ارسال وضعیت لیگ به تمام بازیکنان
 * @param {string} leagueCode کد لیگ
 */
async function emitLeagueState(leagueCode) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) return;

        // دریافت اطلاعات بازیکنان
        const playersResult = await pool.query(`
            SELECT lp.*, u.name 
            FROM league_players lp 
            JOIN users u ON lp.user_id = u.telegram_id 
            WHERE lp.league_id = $1 
            ORDER BY lp.score DESC
        `, [league.id]);

        // دریافت اطلاعات کلمه فعلی
        const currentWordResult = await pool.query(`
            SELECT * FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, league.current_word_number]);

        const currentWord = currentWordResult.rows[0];

        // ساخت وضعیت لیگ
        const leagueState = {
            code: leagueCode,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            startTime: league.start_time,
            endTime: league.end_time,
            players: playersResult.rows,
            currentWord: currentWord ? {
                wordNumber: currentWord.word_number,
                category: currentWord.category,
                maxGuesses: currentWord.max_guesses,
                status: currentWord.status
            } : null
        };

        io.to(leagueCode).emit('league_update', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد.`);
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
    }
}

/**
 * ارسال وضعیت کلمه لیگ برای یک بازیکن خاص
 * @param {string} leagueCode کد لیگ
 * @param {bigint} userId آیدی کاربر
 * @param {number} wordNumber شماره کلمه
 */
async function emitPlayerWordState(leagueCode, userId, wordNumber) {
    try {
        const result = await pool.query(`
            SELECT lpw.*, lw.word as actual_word
            FROM league_player_words lpw
            JOIN league_words lw ON lpw.league_id = lw.league_id AND lpw.word_number = lw.word_number
            WHERE lpw.league_id = (SELECT id FROM leagues WHERE code = $1)
            AND lpw.user_id = $2 AND lpw.word_number = $3
        `, [leagueCode, userId, wordNumber]);

        const playerWord = result.rows[0];

        if (playerWord) {
            // ساخت وضعیت کلمه بازیکن (کلمه اصلی مخفی می‌شود)
            const wordState = {
                wordNumber: playerWord.word_number,
                category: playerWord.category,
                wordLength: playerWord.actual_word.length,
                maxGuesses: playerWord.max_guesses,
                guessesLeft: playerWord.guesses_left,
                correctGuesses: playerWord.correct_guesses,
                incorrectGuesses: playerWord.incorrect_guesses,
                revealedLetters: playerWord.revealed_letters,
                guessedLetters: playerWord.guessed_letters,
                status: playerWord.status,
                timeTaken: playerWord.time_taken,
                scoreEarned: playerWord.score_earned
            };

            io.to(`${leagueCode}_${userId}`).emit('player_word_update', wordState);
        }
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت کلمه بازیکن:`, error);
    }
}

/**
 * شروع کلمه بعدی در لیگ
 * @param {string} leagueCode کد لیگ
 */
async function startNextLeagueWord(leagueCode) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league || league.status !== 'in_progress') return;

        const nextWordNumber = league.current_word_number + 1;

        // بررسی آیا کلمه بعدی وجود دارد
        const nextWordResult = await pool.query(`
            SELECT * FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, nextWordNumber]);

        if (nextWordResult.rows.length === 0) {
            // لیگ به پایان رسیده
            await pool.query(`
                UPDATE leagues 
                SET status = 'ended', end_time = CURRENT_TIMESTAMP 
                WHERE id = $1
            `, [league.id]);
            
            await emitLeagueState(leagueCode);
            return;
        }

        // به‌روزرسانی کلمه فعلی لیگ
        await pool.query(`
            UPDATE leagues 
            SET current_word_number = $1 
            WHERE id = $2
        `, [nextWordNumber, league.id]);

        // به‌روزرسانی وضعیت کلمه قبلی به "completed"
        await pool.query(`
            UPDATE league_words 
            SET status = 'completed' 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, league.current_word_number]);

        // به‌روزرسانی وضعیت کلمه جدید به "active"
        await pool.query(`
            UPDATE league_words 
            SET status = 'active' 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, nextWordNumber]);

        // ارسال وضعیت جدید لیگ
        await emitLeagueState(leagueCode);

        console.log(`🔄 کلمه ${nextWordNumber} در لیگ ${leagueCode} شروع شد.`);
    } catch (error) {
        console.error(`❌ خطای شروع کلمه بعدی لیگ ${leagueCode}:`, error);
    }
}

// --- NEW: منطق لیگ‌ها ---

/**
 * ایجاد یک لیگ جدید
 * @param {bigint} creatorId آیدی سازنده
 * @param {number} totalWords تعداد کل کلمات
 * @returns {string} کد لیگ
 */
async function createLeague(creatorId, totalWords = 10) {
    const leagueCode = generateGameCode();

    try {
        // ایجاد لیگ جدید
        const leagueResult = await pool.query(`
            INSERT INTO leagues (code, total_words, start_time)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            RETURNING id
        `, [leagueCode, totalWords]);

        const leagueId = leagueResult.rows[0].id;

        // اضافه کردن سازنده به لیگ
        await pool.query(`
            INSERT INTO league_players (league_id, user_id)
            VALUES ($1, $2)
        `, [leagueId, creatorId]);

        // تولید کلمات لیگ
        for (let i = 1; i <= totalWords; i++) {
            const { word, category } = getRandomLeagueWord();
            await pool.query(`
                INSERT INTO league_words (league_id, word_number, word, category, max_guesses, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [leagueId, i, word, category, 6, i === 1 ? 'active' : 'pending']);
        }

        // اولین کلمه را فعال می‌کنیم
        await pool.query(`
            UPDATE leagues 
            SET status = 'in_progress', current_word_number = 1 
            WHERE id = $1
        `, [leagueId]);

        console.log(`🏆 لیگ جدید ${leagueCode} توسط کاربر ${creatorId} ایجاد شد.`);
        return leagueCode;
    } catch (error) {
        console.error('❌ خطای ایجاد لیگ:', error);
        throw error;
    }
}

/**
 * پیوستن به یک لیگ
 * @param {bigint} userId آیدی کاربر
 * @param {string} leagueCode کد لیگ
 */
async function joinLeague(userId, leagueCode) {
    try {
        // بررسی وجود لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) {
            throw new Error('لیگ مورد نظر یافت نشد.');
        }

        if (league.status !== 'waiting' && league.status !== 'starting') {
            throw new Error('امکان پیوستن به این لیگ وجود ندارد.');
        }

        // بررسی آیا کاربر قبلاً عضو شده
        const existingPlayer = await pool.query(`
            SELECT * FROM league_players 
            WHERE league_id = $1 AND user_id = $2
        `, [league.id, userId]);

        if (existingPlayer.rows.length > 0) {
            throw new Error('شما قبلاً به این لیگ پیوسته‌اید.');
        }

        // اضافه کردن کاربر به لیگ
        await pool.query(`
            INSERT INTO league_players (league_id, user_id)
            VALUES ($1, $2)
        `, [league.id, userId]);

        // ایجاد رکوردهای کلمات برای کاربر جدید
        const wordsResult = await pool.query(`
            SELECT * FROM league_words 
            WHERE league_id = $1 
            ORDER BY word_number
        `, [league.id]);

        for (const word of wordsResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words 
                (league_id, user_id, word_number, word, category, guesses_left, max_guesses)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [league.id, userId, word.word_number, word.word, word.category, 6, 6]);
        }

        console.log(`✅ کاربر ${userId} به لیگ ${leagueCode} پیوست.`);
        await emitLeagueState(leagueCode);
    } catch (error) {
        console.error(`❌ خطای پیوستن به لیگ ${leagueCode}:`, error);
        throw error;
    }
}

/**
 * شروع بازی لیگ برای یک کاربر
 * @param {bigint} userId آیدی کاربر
 * @param {string} leagueCode کد لیگ
 */
async function startLeagueGame(userId, leagueCode) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league || league.status !== 'in_progress') {
            throw new Error('لیگ در حال حاضر فعال نیست.');
        }

        // دریافت کلمه فعلی
        const currentWord = league.current_word_number;

        // بررسی آیا کاربر قبلاً این کلمه را تمام کرده
        const playerWordResult = await pool.query(`
            SELECT * FROM league_player_words 
            WHERE league_id = $1 AND user_id = $2 AND word_number = $3
        `, [league.id, userId, currentWord]);

        const playerWord = playerWordResult.rows[0];

        if (!playerWord) {
            throw new Error('کلمه فعلی برای کاربر یافت نشد.');
        }

        if (playerWord.status !== 'in_progress') {
            throw new Error('شما قبلاً این کلمه را تمام کرده‌اید.');
        }

        // شروع زمان برای کاربر
        await pool.query(`
            UPDATE league_player_words 
            SET start_time = CURRENT_TIMESTAMP 
            WHERE league_id = $1 AND user_id = $2 AND word_number = $3
        `, [league.id, userId, currentWord]);

        await emitPlayerWordState(leagueCode, userId, currentWord);
        console.log(`🎮 بازی لیگ ${leagueCode} برای کاربر ${userId} شروع شد.`);
    } catch (error) {
        console.error(`❌ خطای شروع بازی لیگ ${leagueCode}:`, error);
        throw error;
    }
}

/**
 * پردازش حدس در لیگ
 * @param {bigint} userId آیدی کاربر
 * @param {string} leagueCode کد لیگ
 * @param {string} letter حرف حدس زده شده
 */
async function processLeagueGuess(userId, leagueCode, letter) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league || league.status !== 'in_progress') {
            throw new Error('لیگ در حال حاضر فعال نیست.');
        }

        const currentWordNumber = league.current_word_number;

        // دریافت وضعیت کلمه کاربر
        const playerWordResult = await pool.query(`
            SELECT lpw.*, lw.word as actual_word
            FROM league_player_words lpw
            JOIN league_words lw ON lpw.league_id = lw.league_id AND lpw.word_number = lw.word_number
            WHERE lpw.league_id = $1 AND lpw.user_id = $2 AND lpw.word_number = $3
        `, [league.id, userId, currentWordNumber]);

        const playerWord = playerWordResult.rows[0];

        if (!playerWord || playerWord.status !== 'in_progress') {
            throw new Error('کلمه فعلی برای کاربر یافت نشد یا قبلاً تمام شده.');
        }

        // بررسی تکراری نبودن حدس
        if (playerWord.guessed_letters.includes(letter)) {
            throw new Error('این حرف را قبلاً حدس زده‌اید.');
        }

        const actualWord = playerWord.actual_word;
        let guessesLeft = playerWord.guesses_left;
        let correctGuesses = playerWord.correct_guesses;
        let incorrectGuesses = playerWord.incorrect_guesses;
        let revealedLetters = playerWord.revealed_letters || {};
        const guessedLetters = [...playerWord.guessed_letters, letter];

        // بررسی وجود حرف در کلمه
        if (actualWord.includes(letter)) {
            // حرف در کلمه وجود دارد
            correctGuesses++;
            
            // پیدا کردن تمام موقعیت‌های حرف
            const positions = [];
            for (let i = 0; i < actualWord.length; i++) {
                if (actualWord[i] === letter) {
                    positions.push(i);
                }
            }
            
            // افزودن به حروف آشکار شده
            if (!revealedLetters[letter]) {
                revealedLetters[letter] = positions;
            } else {
                revealedLetters[letter] = [...revealedLetters[letter], ...positions];
            }
        } else {
            // حرف در کلمه وجود ندارد
            incorrectGuesses++;
            guessesLeft--;
        }

        // بررسی پایان بازی
        let status = playerWord.status;
        let scoreEarned = playerWord.score_earned;
        let timeTaken = playerWord.time_taken;

        // بررسی برنده شدن
        const allLettersRevealed = Object.values(revealedLetters).flat().length === actualWord.length;
        if (allLettersRevealed) {
            status = 'completed';
            // محاسبه زمان صرف شده
            const endTime = new Date();
            const startTime = new Date(playerWord.start_time);
            timeTaken = Math.floor((endTime - startTime) / 1000);
            
            // محاسبه امتیاز (امتیاز پایه + پاداش زمان)
            const baseScore = 100;
            const timeBonus = Math.max(0, 300 - timeTaken); // پاداش حداکثر 300 ثانیه
            scoreEarned = baseScore + timeBonus;

            // به‌روزرسانی امتیاز کاربر در لیگ
            await pool.query(`
                UPDATE league_players 
                SET score = score + $1, correct_words = correct_words + 1, total_time = total_time + $2
                WHERE league_id = $3 AND user_id = $4
            `, [scoreEarned, timeTaken, league.id, userId]);
        } else if (guessesLeft <= 0) {
            // باخت
            status = 'failed';
            const endTime = new Date();
            const startTime = new Date(playerWord.start_time);
            timeTaken = Math.floor((endTime - startTime) / 1000);
        }

        // به‌روزرسانی وضعیت کلمه کاربر
        await pool.query(`
            UPDATE league_player_words 
            SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3,
                revealed_letters = $4, guessed_letters = $5, status = $6,
                score_earned = $7, time_taken = $8, end_time = CASE WHEN $6 != 'in_progress' THEN CURRENT_TIMESTAMP ELSE end_time END
            WHERE league_id = $9 AND user_id = $10 AND word_number = $11
        `, [
            guessesLeft, correctGuesses, incorrectGuesses,
            revealedLetters, guessedLetters, status,
            scoreEarned, timeTaken, league.id, userId, currentWordNumber
        ]);

        // ارسال وضعیت جدید
        await emitPlayerWordState(leagueCode, userId, currentWordNumber);

        // اگر بازی تمام شده، بررسی می‌کنیم آیا همه بازیکنان این کلمه را تمام کرده‌اند
        if (status !== 'in_progress') {
            await checkAllPlayersCompleted(leagueCode, currentWordNumber);
        }

        console.log(`🎯 حدس "${letter}" توسط کاربر ${userId} در لیگ ${leagueCode} پردازش شد.`);
    } catch (error) {
        console.error(`❌ خطای پردازش حدس لیگ ${leagueCode}:`, error);
        throw error;
    }
}

/**
 * بررسی آیا همه بازیکنان کلمه فعلی را تمام کرده‌اند
 * @param {string} leagueCode کد لیگ
 * @param {number} wordNumber شماره کلمه
 */
async function checkAllPlayersCompleted(leagueCode, wordNumber) {
    try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        // تعداد بازیکنان
        const playersCountResult = await pool.query(`
            SELECT COUNT(*) FROM league_players WHERE league_id = $1
        `, [league.id]);

        const totalPlayers = parseInt(playersCountResult.rows[0].count);

        // تعداد بازیکنانی که کلمه را تمام کرده‌اند
        const completedCountResult = await pool.query(`
            SELECT COUNT(*) FROM league_player_words 
            WHERE league_id = $1 AND word_number = $2 AND status IN ('completed', 'failed')
        `, [league.id, wordNumber]);

        const completedPlayers = parseInt(completedCountResult.rows[0].count);

        // اگر همه بازیکنان تمام کردند، کلمه بعدی شروع می‌شود
        if (completedPlayers >= totalPlayers) {
            console.log(`✅ همه بازیکنان کلمه ${wordNumber} را در لیگ ${leagueCode} تمام کردند.`);
            setTimeout(() => startNextLeagueWord(leagueCode), 3000); // تأخیر 3 ثانیه
        }
    } catch (error) {
        console.error(`❌ خطای بررسی اتمام کلمه توسط همه بازیکنان:`, error);
    }
}

// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`🔌 کاربر متصل شد: ${socket.id}`);

    // --- منطق بازی معمولی ---
    socket.on('create_game', async (data) => {
        try {
            const { userId, userName, category, word, maxGuesses } = data;
            const gameCode = generateGameCode();

            // ذخیره بازی جدید در دیتابیس
            await pool.query(`
                INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, start_time)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            `, [gameCode, userId, word, category, maxGuesses, maxGuesses]);

            // ثبت کاربر در دیتابیس اگر وجود ندارد
            await pool.query(`
                INSERT INTO users (telegram_id, name) 
                VALUES ($1, $2) 
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name
            `, [userId, userName]);

            socket.join(gameCode);
            socket.emit('game_created', { gameCode });
            console.log(`🎮 بازی جدید ${gameCode} توسط کاربر ${userId} ایجاد شد.`);
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی' });
        }
    });

    socket.on('join_game', async (data) => {
        try {
            const { userId, userName, gameCode } = data;

            // بررسی وجود بازی
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
                return;
            }

            if (game.status !== 'waiting') {
                socket.emit('game_error', { message: 'بازی قبلاً شروع شده است.' });
                return;
            }

            // ثبت کاربر در دیتابیس اگر وجود ندارد
            await pool.query(`
                INSERT INTO users (telegram_id, name) 
                VALUES ($1, $2) 
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name
            `, [userId, userName]);

            // به‌روزرسانی بازی با حدس زننده
            await pool.query('UPDATE games SET guesser_id = $1, status = $2 WHERE code = $3', 
                [userId, 'in_progress', gameCode]);

            socket.join(gameCode);
            socket.emit('game_joined', { gameCode });
            console.log(`✅ کاربر ${userId} به بازی ${gameCode} پیوست.`);

            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی' });
        }
    });

    socket.on('make_guess', async (data) => {
        try {
            const { userId, gameCode, letter } = data;

            // دریافت اطلاعات بازی
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
                return;
            }

            if (game.status !== 'in_progress') {
                socket.emit('game_error', { message: 'بازی در حال حاضر فعال نیست.' });
                return;
            }

            if (game.guesser_id !== userId) {
                socket.emit('game_error', { message: 'شما مجاز به حدس زدن در این بازی نیستید.' });
                return;
            }

            // بررسی تکراری نبودن حدس
            if (game.guessed_letters && game.guessed_letters.includes(letter)) {
                socket.emit('game_error', { message: 'این حرف را قبلاً حدس زده‌اید.' });
                return;
            }

            const word = game.word;
            let guessesLeft = game.guesses_left;
            let correctGuesses = game.correct_guesses;
            let incorrectGuesses = game.incorrect_guesses;
            let revealedLetters = game.revealed_letters || {};
            const guessedLetters = game.guessed_letters ? [...game.guessed_letters, letter] : [letter];

            // بررسی وجود حرف در کلمه
            if (word.includes(letter)) {
                // حرف در کلمه وجود دارد
                correctGuesses++;
                
                // پیدا کردن تمام موقعیت‌های حرف
                const positions = [];
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === letter) {
                        positions.push(i);
                    }
                }
                
                // افزودن به حروف آشکار شده
                if (!revealedLetters[letter]) {
                    revealedLetters[letter] = positions;
                } else {
                    revealedLetters[letter] = [...revealedLetters[letter], ...positions];
                }
            } else {
                // حرف در کلمه وجود ندارد
                incorrectGuesses++;
                guessesLeft--;
            }

            // بررسی پایان بازی
            let status = game.status;
            let winnerId = game.winner_id;

            // بررسی برنده شدن
            const allLettersRevealed = Object.values(revealedLetters).flat().length === word.length;
            if (allLettersRevealed) {
                status = 'finished';
                winnerId = userId;
                await updateScoreAndEmitLeaderboard(userId, 50); // 50 امتیاز برای برنده
            } else if (guessesLeft <= 0) {
                // باخت
                status = 'finished';
                winnerId = game.creator_id;
                await updateScoreAndEmitLeaderboard(game.creator_id, 25); // 25 امتیاز برای سازنده
            }

            // به‌روزرسانی بازی
            await pool.query(`
                UPDATE games 
                SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3,
                    revealed_letters = $4, guessed_letters = $5, status = $6, winner_id = $7
                WHERE code = $8
            `, [guessesLeft, correctGuesses, incorrectGuesses, revealedLetters, guessedLetters, status, winnerId, gameCode]);

            await emitGameState(gameCode);
            console.log(`🎯 حدس "${letter}" توسط کاربر ${userId} در بازی ${gameCode} پردازش شد.`);

        } catch (error) {
            console.error('❌ خطای پردازش حدس:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس' });
        }
    });

    // --- NEW: منطق لیگ‌ها ---
    socket.on('create_league', async (data) => {
        try {
            const { userId, userName, totalWords = 10 } = data;

            // ثبت کاربر در دیتابیس اگر وجود ندارد
            await pool.query(`
                INSERT INTO users (telegram_id, name) 
                VALUES ($1, $2) 
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name
            `, [userId, userName]);

            const leagueCode = await createLeague(userId, totalWords);
            socket.join(leagueCode);
            socket.emit('league_created', { leagueCode });
            console.log(`🏆 لیگ جدید ${leagueCode} توسط کاربر ${userId} ایجاد شد.`);

            await emitLeagueState(leagueCode);
        } catch (error) {
            console.error('❌ خطای ایجاد لیگ:', error);
            socket.emit('league_error', { message: 'خطا در ایجاد لیگ' });
        }
    });

    socket.on('join_league', async (data) => {
        try {
            const { userId, userName, leagueCode } = data;

            // ثبت کاربر در دیتابیس اگر وجود ندارد
            await pool.query(`
                INSERT INTO users (telegram_id, name) 
                VALUES ($1, $2) 
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name
            `, [userId, userName]);

            await joinLeague(userId, leagueCode);
            socket.join(leagueCode);
            socket.join(`${leagueCode}_${userId}`); // اتاق خصوصی برای وضعیت کلمه کاربر
            socket.emit('league_joined', { leagueCode });
            console.log(`✅ کاربر ${userId} به لیگ ${leagueCode} پیوست.`);

            await emitLeagueState(leagueCode);
        } catch (error) {
            console.error('❌ خطای پیوستن به لیگ:', error);
            socket.emit('league_error', { message: error.message });
        }
    });

    socket.on('start_league_game', async (data) => {
        try {
            const { userId, leagueCode } = data;
            await startLeagueGame(userId, leagueCode);
            socket.emit('league_game_started', { leagueCode });
        } catch (error) {
            console.error('❌ خطای شروع بازی لیگ:', error);
            socket.emit('league_error', { message: error.message });
        }
    });

    socket.on('make_league_guess', async (data) => {
        try {
            const { userId, leagueCode, letter } = data;
            await processLeagueGuess(userId, leagueCode, letter);
        } catch (error) {
            console.error('❌ خطای پردازش حدس لیگ:', error);
            socket.emit('league_error', { message: error.message });
        }
    });

    socket.on('get_league_state', async (data) => {
        try {
            const { leagueCode } = data;
            await emitLeagueState(leagueCode);
        } catch (error) {
            console.error('❌ خطای دریافت وضعیت لیگ:', error);
            socket.emit('league_error', { message: error.message });
        }
    });

    socket.on('get_player_word_state', async (data) => {
        try {
            const { userId, leagueCode, wordNumber } = data;
            await emitPlayerWordState(leagueCode, userId, wordNumber);
        } catch (error) {
            console.error('❌ خطای دریافت وضعیت کلمه بازیکن:', error);
            socket.emit('league_error', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور در پورت ${PORT} اجرا شد.`);
        console.log(`🌐 آدرس فرانت اند: ${FRONTEND_URL}`);
    });
}).catch(err => {
    console.error('❌ خطای راه‌اندازی سرور:', err);
    process.exit(1);
});
