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
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
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
    const words = leagueWords[randomCategory];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    return { word: randomWord, category: randomCategory };
}

/**
 * وضعیت لیگ را به کلاینت‌ها ارسال می‌کند
 * @param {string} leagueCode کد لیگ
 */
async function emitLeagueState(leagueCode) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) return;

        // دریافت بازیکنان لیگ
        const playersResult = await pool.query(`
            SELECT u.name, u.telegram_id, lp.score, lp.correct_words, lp.total_time 
            FROM league_players lp 
            JOIN users u ON lp.user_id = u.telegram_id 
            WHERE lp.league_id = $1 
            ORDER BY lp.score DESC, lp.total_time ASC
        `, [league.id]);

        // دریافت وضعیت کلمه فعلی
        const currentWordResult = await pool.query(`
            SELECT * FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, league.current_word_number]);

        const currentWord = currentWordResult.rows[0];

        // ارسال وضعیت لیگ
        io.to(leagueCode).emit('league_update', {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            players: playersResult.rows,
            currentWord: currentWord ? {
                wordNumber: currentWord.word_number,
                category: currentWord.category,
                maxGuesses: currentWord.max_guesses,
                status: currentWord.status
            } : null
        });

        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد.`);
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
    }
}

// --- مدیریت اتصال‌های Socket.io ---
io.on('connection', (socket) => {
    console.log(`🔌 کاربر متصل شد: ${socket.id}`);

    // --- NEW: مدیریت رویدادهای لیگ ---

    // ایجاد لیگ جدید
    socket.on('create_league', async (data) => {
        try {
            const { userId, totalWords = 10 } = data;
            const leagueCode = generateGameCode();

            // ایجاد لیگ جدید
            const result = await pool.query(`
                INSERT INTO leagues (code, total_words, start_time) 
                VALUES ($1, $2, CURRENT_TIMESTAMP) 
                RETURNING *
            `, [leagueCode, totalWords]);

            const league = result.rows[0];

            // اضافه کردن سازنده به لیگ
            await pool.query(`
                INSERT INTO league_players (league_id, user_id) 
                VALUES ($1, $2)
            `, [league.id, userId]);

            // تولید کلمات لیگ
            for (let i = 1; i <= totalWords; i++) {
                const { word, category } = getRandomLeagueWord();
                await pool.query(`
                    INSERT INTO league_words (league_id, word_number, word, category, max_guesses) 
                    VALUES ($1, $2, $3, $4, 6)
                `, [league.id, i, word, category]);
            }

            // فعال کردن اولین کلمه
            await pool.query(`
                UPDATE league_words 
                SET status = 'active' 
                WHERE league_id = $1 AND word_number = 1
            `, [league.id]);

            // عضویت در اتاق لیگ
            socket.join(leagueCode);

            // ارسال وضعیت لیگ
            await emitLeagueState(leagueCode);

            socket.emit('league_created', { 
                code: leagueCode,
                message: 'لیگ با موفقیت ایجاد شد!' 
            });

            console.log(`🏆 لیگ جدید ${leagueCode} توسط کاربر ${userId} ایجاد شد.`);
        } catch (error) {
            console.error('❌ خطای ایجاد لیگ:', error);
            socket.emit('league_error', { message: 'خطا در ایجاد لیگ' });
        }
    });

    // پیوستن به لیگ
    socket.on('join_league', async (data) => {
        try {
            const { leagueCode, userId } = data;

            // بررسی وجود لیگ
            const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league) {
                socket.emit('league_error', { message: 'لیگ مورد نظر یافت نشد.' });
                return;
            }

            // بررسی وضعیت لیگ
            if (league.status !== 'waiting' && league.status !== 'starting') {
                socket.emit('league_error', { message: 'لیگ قبلاً شروع شده است.' });
                return;
            }

            // اضافه کردن کاربر به لیگ
            await pool.query(`
                INSERT INTO league_players (league_id, user_id) 
                VALUES ($1, $2) 
                ON CONFLICT (league_id, user_id) DO NOTHING
            `, [league.id, userId]);

            // عضویت در اتاق لیگ
            socket.join(leagueCode);

            // ارسال وضعیت لیگ
            await emitLeagueState(leagueCode);

            socket.emit('league_joined', { 
                code: leagueCode,
                message: 'با موفقیت به لیگ پیوستید!' 
            });

            console.log(`👤 کاربر ${userId} به لیگ ${leagueCode} پیوست.`);
        } catch (error) {
            console.error('❌ خطای پیوستن به لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پیوستن به لیگ' });
        }
    });

    // شروع لیگ
    socket.on('start_league', async (data) => {
        try {
            const { leagueCode } = data;

            // به‌روزرسانی وضعیت لیگ
            await pool.query(`
                UPDATE leagues 
                SET status = 'in_progress', start_time = CURRENT_TIMESTAMP 
                WHERE code = $1
            `, [leagueCode]);

            // ارسال وضعیت لیگ
            await emitLeagueState(leagueCode);

            console.log(`🏁 لیگ ${leagueCode} شروع شد.`);
        } catch (error) {
            console.error('❌ خطای شروع لیگ:', error);
            socket.emit('league_error', { message: 'خطا در شروع لیگ' });
        }
    });

    // دریافت وضعیت لیگ
    socket.on('get_league_state', async (data) => {
        try {
            const { leagueCode } = data;
            await emitLeagueState(leagueCode);
        } catch (error) {
            console.error('❌ خطای دریافت وضعیت لیگ:', error);
            socket.emit('league_error', { message: 'خطا در دریافت وضعیت لیگ' });
        }
    });

    // حدس کلمه در لیگ
    socket.on('guess_league_word', async (data) => {
        try {
            const { leagueCode, userId, guess } = data;

            // دریافت اطلاعات لیگ
            const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
            const league = leagueResult.rows[0];

            if (!league || league.status !== 'in_progress') {
                socket.emit('league_error', { message: 'لیگ فعال نیست.' });
                return;
            }

            // دریافت کلمه فعلی
            const wordResult = await pool.query(`
                SELECT * FROM league_words 
                WHERE league_id = $1 AND word_number = $2
            `, [league.id, league.current_word_number]);

            const currentWord = wordResult.rows[0];

            if (!currentWord) {
                socket.emit('league_error', { message: 'کلمه فعلی یافت نشد.' });
                return;
            }

            // دریافت وضعیت بازیکن برای این کلمه
            const playerWordResult = await pool.query(`
                SELECT * FROM league_player_words 
                WHERE league_id = $1 AND user_id = $2 AND word_number = $3
            `, [league.id, userId, league.current_word_number]);

            let playerWord = playerWordResult.rows[0];

            // اگر وضعیت بازیکن وجود ندارد، ایجاد کن
            if (!playerWord) {
                const insertResult = await pool.query(`
                    INSERT INTO league_player_words 
                    (league_id, user_id, word_number, word, category, guesses_left, start_time) 
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
                    RETURNING *
                `, [league.id, userId, league.current_word_number, currentWord.word, currentWord.category, currentWord.max_guesses]);

                playerWord = insertResult.rows[0];
            }

            // بررسی وضعیت بازیکن
            if (playerWord.status !== 'in_progress') {
                socket.emit('league_error', { message: 'شما قبلاً این کلمه را کامل کرده‌اید.' });
                return;
            }

            // پردازش حدس
            const guessedLetters = playerWord.guessed_letters || [];
            const revealedLetters = playerWord.revealed_letters || {};
            let guessesLeft = playerWord.guesses_left;
            let correctGuesses = playerWord.correct_guesses;
            let incorrectGuesses = playerWord.incorrect_guesses;

            // بررسی حدس
            const word = currentWord.word;
            let correct = false;

            if (guess.length === 1) { // حدس حرف
                if (guessedLetters.includes(guess)) {
                    socket.emit('league_error', { message: 'این حرف را قبلاً حدس زده‌اید.' });
                    return;
                }

                guessedLetters.push(guess);

                // بررسی وجود حرف در کلمه
                const indices = [];
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === guess) {
                        indices.push(i);
                        correct = true;
                    }
                }

                if (indices.length > 0) {
                    revealedLetters[guess] = indices;
                    correctGuesses++;
                } else {
                    incorrectGuesses++;
                    guessesLeft--;
                }
            } else { // حدس کلمه کامل
                if (guess === word) {
                    // کلمه درست حدس زده شده
                    correct = true;
                    for (let i = 0; i < word.length; i++) {
                        const letter = word[i];
                        if (!revealedLetters[letter]) {
                            revealedLetters[letter] = [i];
                        } else if (!revealedLetters[letter].includes(i)) {
                            revealedLetters[letter].push(i);
                        }
                    }
                    correctGuesses += word.length;
                } else {
                    incorrectGuesses++;
                    guessesLeft--;
                }
            }

            // به‌روزرسانی وضعیت بازیکن
            await pool.query(`
                UPDATE league_player_words 
                SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3,
                    revealed_letters = $4, guessed_letters = $5
                WHERE id = $6
            `, [guessesLeft, correctGuesses, incorrectGuesses, revealedLetters, guessedLetters, playerWord.id]);

            // بررسی پایان کلمه
            if (correct || guessesLeft <= 0) {
                const endTime = new Date();
                const startTime = new Date(playerWord.start_time);
                const timeTaken = Math.floor((endTime - startTime) / 1000);

                let status = 'completed';
                let scoreEarned = 0;

                if (correct) {
                    status = 'completed';
                    // محاسبه امتیاز: امتیاز پایه + پاداش زمان
                    scoreEarned = 100 + Math.max(0, 50 - Math.floor(timeTaken / 10));
                } else {
                    status = 'failed';
                    scoreEarned = 0;
                }

                await pool.query(`
                    UPDATE league_player_words 
                    SET status = $1, end_time = $2, time_taken = $3, score_earned = $4
                    WHERE id = $5
                `, [status, endTime, timeTaken, scoreEarned, playerWord.id]);

                // به‌روزرسانی امتیاز کلی بازیکن در لیگ
                await pool.query(`
                    UPDATE league_players 
                    SET score = score + $1, 
                        correct_words = correct_words + $2,
                        total_time = total_time + $3
                    WHERE league_id = $4 AND user_id = $5
                `, [scoreEarned, correct ? 1 : 0, timeTaken, league.id, userId]);

                // بررسی پایان لیگ
                const nextWordNumber = league.current_word_number + 1;
                if (nextWordNumber > league.total_words) {
                    // پایان لیگ
                    await pool.query(`
                        UPDATE leagues 
                        SET status = 'ended', end_time = CURRENT_TIMESTAMP 
                        WHERE id = $1
                    `, [league.id]);
                } else {
                    // رفتن به کلمه بعدی
                    await pool.query(`
                        UPDATE leagues 
                        SET current_word_number = $1 
                        WHERE id = $2
                    `, [nextWordNumber, league.id]);

                    await pool.query(`
                        UPDATE league_words 
                        SET status = 'active' 
                        WHERE league_id = $1 AND word_number = $2
                    `, [league.id, nextWordNumber]);
                }
            }

            // ارسال وضعیت به‌روزرسانی شده لیگ
            await emitLeagueState(leagueCode);

            // ارسال نتیجه حدس به کاربر
            socket.emit('league_guess_result', {
                correct,
                guessesLeft,
                correctGuesses,
                incorrectGuesses,
                revealedLetters,
                guessedLetters,
                gameCompleted: correct || guessesLeft <= 0
            });

        } catch (error) {
            console.error('❌ خطای حدس در لیگ:', error);
            socket.emit('league_error', { message: 'خطا در پردازش حدس' });
        }
    });

    // --- رویدادهای اصلی بازی ---

    // دریافت جدول رتبه‌بندی
    socket.on('get_leaderboard', async () => {
        await emitLeaderboard();
    });

    // ایجاد بازی جدید
    socket.on('create_game', async (data) => {
        try {
            const { userId, category, word, maxGuesses = 6 } = data;
            const gameCode = generateGameCode();

            // بررسی وجود کاربر
            const userResult = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
            if (userResult.rows.length === 0) {
                socket.emit('game_error', { message: 'کاربر یافت نشد. لطفاً ابتدا در ربات تلگرام ثبت‌نام کنید.' });
                return;
            }

            // ایجاد بازی جدید
            await pool.query(`
                INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, start_time) 
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            `, [gameCode, userId, word, category, maxGuesses, maxGuesses]);

            // عضویت در اتاق بازی
            socket.join(gameCode);

            // ارسال وضعیت بازی
            await emitGameState(gameCode);

            socket.emit('game_created', { 
                code: gameCode,
                message: 'بازی با موفقیت ایجاد شد!' 
            });

            console.log(`🎮 بازی جدید ${gameCode} توسط کاربر ${userId} ایجاد شد.`);
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی' });
        }
    });

    // پیوستن به بازی
    socket.on('join_game', async (data) => {
        try {
            const { gameCode, userId } = data;

            // بررسی وجود بازی
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
                return;
            }

            // بررسی وضعیت بازی
            if (game.status !== 'waiting') {
                socket.emit('game_error', { message: 'بازی قبلاً شروع شده است.' });
                return;
            }

            // بررسی اینکه کاربر سازنده نباشد
            if (game.creator_id === userId) {
                socket.emit('game_error', { message: 'شما سازنده این بازی هستید و نمی‌توانید به عنوان حدس‌زننده وارد شوید.' });
                return;
            }

            // بررسی وجود کاربر
            const userResult = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [userId]);
            if (userResult.rows.length === 0) {
                socket.emit('game_error', { message: 'کاربر یافت نشد. لطفاً ابتدا در ربات تلگرام ثبت‌نام کنید.' });
                return;
            }

            // به‌روزرسانی بازی
            await pool.query(`
                UPDATE games 
                SET guesser_id = $1, status = 'in_progress' 
                WHERE code = $2
            `, [userId, gameCode]);

            // عضویت در اتاق بازی
            socket.join(gameCode);

            // ارسال وضعیت بازی
            await emitGameState(gameCode);

            socket.emit('game_joined', { 
                code: gameCode,
                message: 'با موفقیت به بازی پیوستید!' 
            });

            console.log(`👤 کاربر ${userId} به بازی ${gameCode} پیوست.`);
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی' });
        }
    });

    // حدس کلمه
    socket.on('guess_word', async (data) => {
        try {
            const { gameCode, userId, guess } = data;

            // دریافت بازی
            const result = await pool.query('SELECT * FROM games WHERE code = $1', [gameCode]);
            const game = result.rows[0];

            if (!game) {
                socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
                return;
            }

            // بررسی اینکه کاربر حدس‌زننده باشد
            if (game.guesser_id !== userId) {
                socket.emit('game_error', { message: 'شما حدس‌زننده این بازی نیستید.' });
                return;
            }

            // بررسی وضعیت بازی
            if (game.status !== 'in_progress') {
                socket.emit('game_error', { message: 'بازی فعال نیست.' });
                return;
            }

            // پردازش حدس
            const guessedLetters = game.guessed_letters || [];
            const revealedLetters = game.revealed_letters || {};
            let guessesLeft = game.guesses_left;
            let correctGuesses = game.correct_guesses;
            let incorrectGuesses = game.incorrect_guesses;

            // بررسی حدس
            const word = game.word;
            let correct = false;

            if (guess.length === 1) { // حدس حرف
                if (guessedLetters.includes(guess)) {
                    socket.emit('game_error', { message: 'این حرف را قبلاً حدس زده‌اید.' });
                    return;
                }

                guessedLetters.push(guess);

                // بررسی وجود حرف در کلمه
                const indices = [];
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === guess) {
                        indices.push(i);
                        correct = true;
                    }
                }

                if (indices.length > 0) {
                    revealedLetters[guess] = indices;
                    correctGuesses++;
                } else {
                    incorrectGuesses++;
                    guessesLeft--;
                }
            } else { // حدس کلمه کامل
                if (guess === word) {
                    // کلمه درست حدس زده شده
                    correct = true;
                    for (let i = 0; i < word.length; i++) {
                        const letter = word[i];
                        if (!revealedLetters[letter]) {
                            revealedLetters[letter] = [i];
                        } else if (!revealedLetters[letter].includes(i)) {
                            revealedLetters[letter].push(i);
                        }
                    }
                    correctGuesses += word.length;
                } else {
                    incorrectGuesses++;
                    guessesLeft--;
                }
            }

            // به‌روزرسانی بازی
            await pool.query(`
                UPDATE games 
                SET guesses_left = $1, correct_guesses = $2, incorrect_guesses = $3,
                    revealed_letters = $4, guessed_letters = $5
                WHERE code = $6
            `, [guessesLeft, correctGuesses, incorrectGuesses, revealedLetters, guessedLetters, gameCode]);

            // بررسی پایان بازی
            if (correct || guessesLeft <= 0) {
                const endTime = new Date();
                await pool.query(`
                    UPDATE games 
                    SET status = 'finished', end_time = $1, winner_id = $2 
                    WHERE code = $3
                `, [endTime, correct ? userId : game.creator_id, gameCode]);

                // به‌روزرسانی امتیازها
                if (correct) {
                    await updateScoreAndEmitLeaderboard(userId, 10); // 10 امتیاز برای برنده
                } else {
                    await updateScoreAndEmitLeaderboard(game.creator_id, 5); // 5 امتیاز برای سازنده
                }
            }

            // ارسال وضعیت به‌روزرسانی شده بازی
            await emitGameState(gameCode);

            // ارسال نتیجه حدس به کاربر
            socket.emit('guess_result', {
                correct,
                guessesLeft,
                correctGuesses,
                incorrectGuesses,
                revealedLetters,
                guessedLetters,
                gameCompleted: correct || guessesLeft <= 0
            });

        } catch (error) {
            console.error('❌ خطای حدس:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس' });
        }
    });

    // دریافت وضعیت بازی
    socket.on('get_game_state', async (data) => {
        try {
            const { gameCode } = data;
            await emitGameState(gameCode);
        } catch (error) {
            console.error('❌ خطای دریافت وضعیت بازی:', error);
            socket.emit('game_error', { message: 'خطا در دریافت وضعیت بازی' });
        }
    });

    // --- NEW: Event Handlers for My Games ---
    
    // دریافت بازی‌های ایجاد شده توسط کاربر
    socket.on('list_my_created_games', async (data) => {
        try {
            const { userId } = data;
            
            const result = await pool.query(`
                SELECT g.*, 
                       u_creator.name as creator_name,
                       u_guesser.name as guesser_name
                FROM games g
                LEFT JOIN users u_creator ON g.creator_id = u_creator.telegram_id
                LEFT JOIN users u_guesser ON g.guesser_id = u_guesser.telegram_id
                WHERE g.creator_id = $1
                ORDER BY g.created_at DESC
            `, [userId]);

            const games = result.rows.map(game => ({
                code: game.code,
                word: game.word,
                category: game.category,
                status: game.status,
                max_guesses: game.max_guesses,
                guesses_left: game.guesses_left,
                correct_guesses: game.correct_guesses,
                incorrect_guesses: game.incorrect_guesses,
                creator_name: game.creator_name,
                guesser_name: game.guesser_name,
                start_time: game.start_time,
                end_time: game.end_time
            }));

            socket.emit('my_created_games_list', { games });
            console.log(`📋 لیست بازی‌های ایجاد شده توسط کاربر ${userId} ارسال شد. تعداد: ${games.length}`);
        } catch (error) {
            console.error('❌ خطای دریافت بازی‌های ایجاد شده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت بازی‌های ایجاد شده' });
        }
    });

    // دریافت بازی‌های در حال حدس کاربر
    socket.on('list_my_guessing_games', async (data) => {
        try {
            const { userId } = data;
            
            const result = await pool.query(`
                SELECT g.*, 
                       u_creator.name as creator_name,
                       u_guesser.name as guesser_name
                FROM games g
                LEFT JOIN users u_creator ON g.creator_id = u_creator.telegram_id
                LEFT JOIN users u_guesser ON g.guesser_id = u_guesser.telegram_id
                WHERE g.guesser_id = $1
                ORDER BY g.created_at DESC
            `, [userId]);

            const games = result.rows.map(game => ({
                code: game.code,
                word: game.word,
                category: game.category,
                status: game.status,
                max_guesses: game.max_guesses,
                guesses_left: game.guesses_left,
                correct_guesses: game.correct_guesses,
                incorrect_guesses: game.incorrect_guesses,
                creator_name: game.creator_name,
                guesser_name: game.guesser_name,
                start_time: game.start_time,
                end_time: game.end_time
            }));

            socket.emit('my_guessing_games_list', { games });
            console.log(`📋 لیست بازی‌های در حال حدس کاربر ${userId} ارسال شد. تعداد: ${games.length}`);
        } catch (error) {
            console.error('❌ خطای دریافت بازی‌های در حال حدس:', error);
            socket.emit('game_error', { message: 'خطا در دریافت بازی‌های در حال حدس' });
        }
    });

    // دریافت لیگ‌های ایجاد شده توسط کاربر
    socket.on('list_my_created_leagues', async (data) => {
        try {
            const { userId } = data;
            
            const result = await pool.query(`
                SELECT l.*, 
                       COUNT(lp.user_id) as player_count
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status != 'ended'
                GROUP BY l.id
                ORDER BY l.created_at DESC
            `, [userId]);

            const leagues = result.rows.map(league => ({
                code: league.code,
                status: league.status,
                current_word_number: league.current_word_number,
                total_words: league.total_words,
                player_count: league.player_count,
                start_time: league.start_time,
                created_at: league.created_at
            }));

            socket.emit('my_created_leagues_list', { leagues });
            console.log(`🏆 لیست لیگ‌های ایجاد شده توسط کاربر ${userId} ارسال شد. تعداد: ${leagues.length}`);
        } catch (error) {
            console.error('❌ خطای دریافت لیگ‌های ایجاد شده:', error);
            socket.emit('league_error', { message: 'خطا در دریافت لیگ‌های ایجاد شده' });
        }
    });

    // دریافت لیگ‌های شرکت‌کرده کاربر
    socket.on('list_my_joined_leagues', async (data) => {
        try {
            const { userId } = data;
            
            const result = await pool.query(`
                SELECT l.*, 
                       lp.score,
                       lp.correct_words,
                       COUNT(lp2.user_id) as player_count
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                LEFT JOIN league_players lp2 ON l.id = lp2.league_id
                WHERE lp.user_id = $1 AND l.status != 'ended'
                GROUP BY l.id, lp.score, lp.correct_words
                ORDER BY l.created_at DESC
            `, [userId]);

            const leagues = result.rows.map(league => ({
                code: league.code,
                status: league.status,
                current_word_number: league.current_word_number,
                total_words: league.total_words,
                player_count: league.player_count,
                my_score: league.score,
                my_correct_words: league.correct_words,
                start_time: league.start_time
            }));

            socket.emit('my_joined_leagues_list', { leagues });
            console.log(`🏆 لیست لیگ‌های شرکت‌کرده کاربر ${userId} ارسال شد. تعداد: ${leagues.length}`);
        } catch (error) {
            console.error('❌ خطای دریافت لیگ‌های شرکت‌کرده:', error);
            socket.emit('league_error', { message: 'خطا در دریافت لیگ‌های شرکت‌کرده' });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور در پورت ${PORT} راه‌اندازی شد.`);
        console.log(`🌐 آدرس فرانت‌اند: ${FRONTEND_URL}`);
    });
}).catch(error => {
    console.error('❌ خطای راه‌اندازی سرور:', error);
    process.exit(1);
});
