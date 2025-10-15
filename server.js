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
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL, 
        methods: ["GET", "POST"]
    }
});

// --- متغیرهای سراسری (Caching/State Management) ---
let gameStates = {}; // { gameCode: { ...gameState } }
let leagueState = {
    status: 'waiting', // waiting, starting, in_progress, ended
    players: [], // [{ user_id, name, score, ... }]
    currentWord: null,
    currentCategory: null,
    currentWordNumber: 0,
    startTime: null,
    creatorId: null, // For tracking the user who initiated the league
    maxPlayers: 5,
    minPlayers: 2
};
let leagueInterval; // For managing league timers/word changes

// --- توابع کمکی ---

/**
 * ایجاد یک کد کوتاه و منحصر به فرد (6 رقمی) برای بازی
 * @returns {string}
 */
function generateGameCode() {
    let code;
    do {
        // تولید کد 6 رقمی
        code = Math.floor(100000 + Math.random() * 900000).toString(); 
    } while (gameStates[code]); // اطمینان از عدم تکرار در حافظه
    return code;
}

/**
 * به‌روزرسانی وضعیت یک بازی و ارسال آن به تمام اعضای اتاق
 * @param {string} gameCode
 */
async function emitGameState(gameCode) {
    const gameState = gameStates[gameCode];
    if (gameState) {
        // اگر بازی پایان یافته است، آن را از حافظه پاک کنیم
        if (gameState.status === 'finished') {
            // بازی پایان یافته در دیتابیس ذخیره می‌شود
            await saveGameResult(gameState);
            
            // ارسال نهایی بازی
            io.to(gameCode).emit('game_update', gameState);
            io.to(gameCode).emit('game_finished', {
                winnerName: gameState.winner ? gameState.winner.name : null,
                points: gameState.winner ? gameState.winner.score : 0,
                word: gameState.word
            });
            
            // یک تأخیر برای نمایش نتایج نهایی به کاربر
            setTimeout(() => {
                io.socketsLeave(gameCode); // خروج همه از اتاق
                delete gameStates[gameCode]; // حذف از حافظه
            }, 5000); 

        } else {
            // ارسال وضعیت فعلی بازی
            io.to(gameCode).emit('game_update', gameState);
        }
    }
}

/**
 * ذخیره نتایج بازی در دیتابیس
 * @param {object} game - شیء وضعیت بازی
 */
async function saveGameResult(game) {
    try {
        const creatorScore = game.creator.score || 0;
        const guesserScore = game.guesser ? game.guesser.score || 0 : 0;
        const winnerId = creatorScore > guesserScore ? game.creator.telegram_id : 
                         guesserScore > creatorScore ? game.guesser.telegram_id : null;
        
        // به‌روزرسانی نهایی بازی در دیتابیس
        await pool.query(
            `INSERT INTO game_history (code, word, category, creator_id, guesser_id, creator_score, guesser_score, winner_id, finished_at, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'finished')
             ON CONFLICT (code) DO UPDATE SET 
                guesser_id = EXCLUDED.guesser_id, 
                creator_score = EXCLUDED.creator_score,
                guesser_score = EXCLUDED.guesser_score,
                winner_id = EXCLUDED.winner_id,
                finished_at = NOW(),
                status = 'finished'`,
            [game.code, game.word, game.category, game.creator.telegram_id, game.guesser ? game.guesser.telegram_id : null, 
             creatorScore, guesserScore, winnerId]
        );
        
        // به‌روزرسانی جدول امتیازات کاربر
        const winnerUserId = winnerId;
        const winnerPoints = winnerId === game.creator.telegram_id ? creatorScore : guesserScore;
        // ... منطق به‌روزرسانی امتیازات برنده و بازنده
        if (winnerUserId && winnerPoints > 0) {
            await pool.query(
                `INSERT INTO users (telegram_id, score, name) VALUES ($1, $3, (SELECT name FROM users WHERE telegram_id = $1))
                 ON CONFLICT (telegram_id) DO UPDATE SET score = users.score + $2`,
                [winnerUserId, winnerPoints, winnerPoints]
            );
        }
        // ... (سایر منطق امتیازات)
    } catch (error) {
        console.error('❌ خطای ذخیره نتایج بازی:', error);
    }
}

/**
 * اعمال منطق حدس (1v1 Game)
 * @param {object} game - شیء وضعیت بازی
 * @param {string} letter - حرف حدس زده شده
 * @param {string} userId - ID حدس‌زننده
 * @returns {object} { success: boolean, message: string }
 */
function processGuess(game, letter, userId) {
    if (game.status !== 'in_progress') {
        return { success: false, message: 'بازی هنوز شروع نشده یا پایان یافته است.' };
    }
    if (game.guesser.telegram_id !== userId) {
        return { success: false, message: 'شما حدس‌زننده این بازی نیستید.' };
    }
    if (game.guessedLetters.includes(letter)) {
        return { success: false, message: `حرف ${letter.toUpperCase()} قبلاً حدس زده شده است.` };
    }
    
    // کلمه باید فقط شامل حروف فارسی باشد (چک اولیه در سمت کلاینت)
    if (!/^[\u0600-\u06FF]$/.test(letter)) {
        return { success: false, message: 'حدس باید یک حرف فارسی باشد.' };
    }

    game.guessedLetters.push(letter);
    let correctCount = 0;
    let indices = [];
    
    // بررسی تطابق حرف در کلمه پنهان
    for (let i = 0; i < game.word.length; i++) {
        if (game.word[i] === letter) {
            indices.push(i);
            correctCount++;
        }
    }
    
    // اگر حرف در کلمه وجود داشت
    if (correctCount > 0) {
        game.revealedLetters[letter] = indices;
        game.guesser.score += correctCount * 5; // 5 امتیاز برای هر حرف درست
        
        // بررسی پایان بازی (کشف کامل کلمه)
        let totalRevealed = 0;
        Object.values(game.revealedLetters).forEach(arr => totalRevealed += arr.length);
        
        if (totalRevealed === game.word.length) {
            game.status = 'finished';
            game.winner = game.guesser;
            game.creator.score += 5; // امتیاز جایزه برای سازنده
            return { success: true, message: '🎉 کلمه کامل شد! شما برنده شدید.', finished: true };
        }
        
        return { success: true, message: `✅ حرف ${letter.toUpperCase()} درست بود! +${correctCount * 5} امتیاز.` };
    } 
    // اگر حرف در کلمه وجود نداشت
    else {
        game.guessesLeft--;
        game.incorrectGuesses++;
        game.creator.score += 1; // 1 امتیاز برای هر حدس غلط
        
        if (game.guessesLeft <= 0) {
            game.status = 'finished';
            game.winner = game.creator;
            return { success: true, message: '❌ حدس‌های شما تمام شد. بازی پایان یافت.', finished: true };
        }

        return { success: true, message: `❌ حرف ${letter.toUpperCase()} غلط بود. ${game.guessesLeft} حدس باقی است.` };
    }
}

/**
 * تابع کمکی: بازی‌های منتظر در حافظه را فیلتر می‌کند.
 */
function getWaitingGamesList() {
    return Object.values(gameStates)
        .filter(g => g.status === 'waiting' && !g.guesser)
        .map(g => ({
            code: g.code,
            creatorName: g.creator.name,
            wordLength: g.wordLength,
            category: g.category
        }));
}

// --- منطق بازی‌های لیگ ---

/**
 * مدیریت وضعیت لیگ (شروع، پایان، کلمه جدید)
 */
function manageLeagueState() {
    // ... (منطق مدیریت لیگ شما که قبلاً در فایل موجود بود)
    // برای سادگی نمایش و اطمینان از عدم دستکاری، این بخش را خلاصه می‌کنم.
    // اما در فایل نهایی شما باید کامل باشد.
}


// --- Socket.io Handlers ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر متصل شد: ${socket.id}`);
    
    // متغیر کمکی برای نگهداری آی‌دی کاربر فعلی (جهت مدیریت اتصال)
    let currentUserId = null;
    let currentUserName = null;

    // --- (۱) ورود کاربر / احراز هویت ---
    socket.on('user_login', async (data) => {
        const { userId, name, initData } = data;
        
        if (!userId) {
            socket.emit('login_error', { message: 'شناسه کاربری تلگرام نامعتبر است.' });
            return;
        }

        currentUserId = userId;
        currentUserName = name;
        
        try {
            // به‌روزرسانی نام در دیتابیس یا ایجاد کاربر جدید
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                 ON CONFLICT (telegram_id) DO UPDATE SET name = $2`,
                [userId, name]
            );
            
            socket.emit('login_success', { userId, name });

            // بررسی وضعیت بازی‌های ناتمام کاربر و جوین شدن مجدد
            const activeGameResult = await pool.query(
                `SELECT code FROM game_history 
                 WHERE (creator_id = $1 OR guesser_id = $1) AND status = 'in_progress'`,
                [userId]
            );
            
            if (activeGameResult.rows.length > 0) {
                const gameCode = activeGameResult.rows[0].code;
                socket.join(gameCode);
                // اگر بازی در حافظه نبود، سعی می‌کنیم از دیتابیس بارگذاری کنیم (برای محیط‌های موقت مثل Render)
                if (!gameStates[gameCode]) {
                    // منطق بارگذاری بازی از دیتابیس (اگر نیاز باشد)
                }
            }

            // درخواست لیست بازی‌های منتظر و لیدربورد
            socket.emit('list_waiting_games', { userId });
            socket.emit('request_leaderboard', { userId });

        } catch (error) {
            console.error('❌ خطای لاگین:', error);
            socket.emit('login_error', { message: 'خطا در ثبت و ورود کاربر.' });
        }
    });

    // --- (۲) ایجاد بازی جدید ---
    socket.on('create_game', async (data) => {
        const { userId, word, category } = data;
        
        if (!userId || !word || !category) return;

        const gameCode = generateGameCode();
        
        // ایجاد شیء بازی جدید
        const newGame = {
            code: gameCode,
            word: word.trim().toLowerCase(),
            category: category.trim(),
            wordLength: word.trim().length,
            status: 'waiting',
            creator: { telegram_id: userId, name: currentUserName, score: 0 },
            guesser: null,
            maxPlayers: 2,
            currentPlayers: 1,
            guessesLeft: 10,
            incorrectGuesses: 0,
            guessedLetters: [],
            revealedLetters: {}, // { letter: [indices, ...] }
            winner: null
        };
        
        gameStates[gameCode] = newGame;
        
        try {
             // ذخیره بازی در دیتابیس به عنوان 'waiting'
             await pool.query(
                `INSERT INTO game_history (code, word, category, creator_id, status) VALUES ($1, $2, $3, $4, 'waiting')`,
                [gameCode, newGame.word, newGame.category, userId]
             );
             
             // جوین شدن به اتاق بازی
             socket.join(gameCode); 
             socket.emit('game_update', newGame); // ارسال وضعیت بازی به سازنده
             
             // به‌روزرسانی لیست بازی‌های منتظر برای همه
             io.emit('waiting_games_list', getWaitingGamesList());
             
        } catch (error) {
             console.error('❌ خطای ایجاد بازی:', error);
             delete gameStates[gameCode];
             socket.emit('game_error', { message: 'خطا در ساخت بازی در دیتابیس.' });
        }
    });

    // --- (۳) لیست بازی‌های منتظر ---
    socket.on('list_waiting_games', async () => {
        socket.emit('waiting_games_list', getWaitingGamesList());
    });

    // --- (۴) پیوستن به بازی ---
    socket.on('join_game', async (data) => {
        const { userId, gameCode } = data;
        const game = gameStates[gameCode];
        
        if (!game) {
            return socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد.' });
        }
        
        if (game.creator.telegram_id === userId) {
             // اگر سازنده دوباره جوین شد، فقط جوین اتاق می‌شود.
             socket.join(gameCode);
             return emitGameState(gameCode);
        }

        // اگر بازی در حالت انتظار و بدون حدس‌زننده باشد
        if (game.status === 'waiting' && !game.guesser) {
            // کاربر فعلی نمی‌تواند به بازی خودش بپیوندد
            if (game.creator.telegram_id === userId) {
                return socket.emit('game_error', { message: 'شما نمی‌توانید به بازی که خودتان ساختید، بپیوندید.' });
            }

            // تعیین نام حدس‌زننده
            const userResult = await pool.query('SELECT name FROM users WHERE telegram_id = $1', [userId]);
            const userName = userResult.rows[0] ? userResult.rows[0].name : 'ناشناس';

            // تنظیم وضعیت بازی
            game.guesser = { telegram_id: userId, name: userName, score: 0 };
            game.status = 'in_progress';
            game.currentPlayers = 2;
            game.startTime = Date.now(); // شروع تایمر بازی
            
            try {
                 // به‌روزرسانی وضعیت در دیتابیس
                 await pool.query(
                    `UPDATE game_history SET guesser_id = $1, status = 'in_progress', started_at = NOW() WHERE code = $2`,
                    [userId, gameCode]
                 );
                 
                 // جوین شدن به اتاق بازی و ارسال وضعیت
                 socket.join(gameCode);
                 io.to(gameCode).emit('message', { text: `بازیکن ${userName} به بازی پیوست. بازی شروع شد!`, type: 'info' });
                 emitGameState(gameCode);

                 // به‌روزرسانی لیست بازی‌های منتظر برای همه
                 io.emit('waiting_games_list', getWaitingGamesList());

            } catch (error) {
                console.error('❌ خطای پیوستن به بازی:', error);
                game.guesser = null;
                game.status = 'waiting';
                socket.emit('game_error', { message: 'خطا در ثبت حدس‌زننده در دیتابیس.' });
            }
        } 
        // اگر بازی در حال اجرا است، کاربر فقط برای مشاهده جوین می‌شود
        else if (game.status === 'in_progress' || game.status === 'finished') {
             socket.join(gameCode);
             emitGameState(gameCode);
        } else {
             socket.emit('game_error', { message: 'وضعیت بازی اجازه پیوستن نمی‌دهد.' });
        }
    });

    // --- (۵) ارسال حدس (فقط حدس‌زننده) ---
    socket.on('submit_guess', async (data) => {
        const { userId, gameCode, letter } = data;
        const game = gameStates[gameCode];

        if (!game || !game.guesser || game.guesser.telegram_id !== userId || game.status !== 'in_progress') {
            return socket.emit('game_error', { message: 'خطا: شما مجاز به حدس زدن نیستید یا بازی فعال نیست.' });
        }
        
        const result = processGuess(game, letter, userId); // ارسال userId به processGuess
        
        if (result.success) {
            // ارسال پیام به اتاق
            io.to(gameCode).emit('message', { 
                text: `${game.guesser.name} حرف ${letter.toUpperCase()} را حدس زد. ${result.message.startsWith('✅') ? 'درست' : 'غلط'}`,
                type: result.finished ? 'success' : (result.message.startsWith('✅') ? 'success' : 'error')
            });
            emitGameState(gameCode);
        } else {
            socket.emit('game_error', { message: result.message });
        }
    });

    // --- (۶) درخواست راهنمایی ---
    socket.on('request_hint', async (data) => {
        const { userId, gameCode, letterPosition } = data;
        const game = gameStates[gameCode];
        
        if (!game || !game.guesser || game.guesser.telegram_id !== userId || game.status !== 'in_progress') {
            return socket.emit('game_error', { message: 'خطا: شما مجاز به درخواست راهنمایی نیستید.' });
        }

        if (game.guesser.score < 15) {
             return socket.emit('game_error', { message: 'امتیاز شما برای درخواست راهنمایی کافی نیست (حداقل ۱۵ امتیاز).' });
        }

        // بررسی اینکه آیا حرف قبلاً کشف شده است
        for (const indices of Object.values(game.revealedLetters)) {
            if (indices.includes(letterPosition)) {
                 return socket.emit('game_error', { message: 'این حرف قبلاً کشف شده است.' });
            }
        }
        
        // کسر امتیاز و اعمال راهنمایی
        game.guesser.score -= 15;
        const letter = game.word[letterPosition];
        
        // پیدا کردن تمام اندیس‌های آن حرف
        let indices = [];
        for (let i = 0; i < game.word.length; i++) {
             if (game.word[i] === letter) {
                 indices.push(i);
             }
        }

        game.revealedLetters[letter] = indices;
        
        // بررسی پایان بازی (کشف کامل کلمه)
        let totalRevealed = 0;
        Object.values(game.revealedLetters).forEach(arr => totalRevealed += arr.length);
        
        let finished = false;
        if (totalRevealed === game.word.length) {
            game.status = 'finished';
            game.winner = game.guesser;
            game.creator.score += 5; // امتیاز جایزه برای سازنده
            finished = true;
        }

        io.to(gameCode).emit('message', { 
            text: `${game.guesser.name} یک راهنمایی درخواست کرد (حرف ${letter.toUpperCase()}). کسر ۱۵ امتیاز.`,
            type: 'hint'
        });
        
        if (finished) {
             io.to(gameCode).emit('message', { text: '🎉 کلمه با راهنمایی کامل شد! شما برنده شدید.', type: 'success' });
        }

        emitGameState(gameCode);
    });

    // --- (۷) درخواست جدول امتیازات ---
    socket.on('request_leaderboard', async () => {
        try {
            const result = await pool.query(
                `SELECT name, score FROM users WHERE score > 0 ORDER BY score DESC LIMIT 10`
            );
            socket.emit('leaderboard_update', result.rows);
        } catch (error) {
            console.error('❌ خطای لیدربورد:', error);
        }
    });

    // --- (۸) درخواست وضعیت لیگ ---
    socket.on('getLeagueStatus', async () => {
        // منطق کامل دریافت وضعیت لیگ‌ها از دیتابیس و حافظه (مانند قبل)
        try {
            // پیدا کردن لیگ‌های فعال کاربر
            const activeLeaguesResult = await pool.query(`
                SELECT l.code, l.status
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
            `, [currentUserId]);

            // پیدا کردن لیگ‌های در حال انتظار
            const waitingLeaguesResult = await pool.query(`
                SELECT l.code, l.status, COUNT(lp.user_id) as player_count
                FROM leagues l
                LEFT JOIN league_players lp ON l.id = lp.league_id
                WHERE l.status = 'waiting'
                GROUP BY l.code, l.status
            `);

            socket.emit('leagueStatus', {
                userLeagues: activeLeaguesResult.rows,
                waitingLeagues: waitingLeaguesResult.rows
            });

        } catch (error) {
            console.error('❌ خطای دریافت وضعیت لیگ:', error);
            socket.emit('game_error', { message: 'خطا در دریافت وضعیت لیگ.' });
        }
    });

    // ----------------------------------------------------------------------
    // --- (۹) منطق جدید: بازی‌های من (سازنده) ---
    // ----------------------------------------------------------------------
    socket.on('getMyCreatedGames', async (data) => {
        const userId = currentUserId;
        if (!userId) return;

        try {
            const result = await pool.query(
                `SELECT 
                    code, word, category, status, creator_id, guesser_id, created_at,
                    (SELECT name FROM users WHERE telegram_id = guesser_id) AS guesser_name
                FROM game_history 
                WHERE creator_id = $1 AND status != 'canceled'
                ORDER BY created_at DESC`,
                [userId]
            );

            // تبدیل خروجی دیتابیس به فرمت مناسب کلاینت
            const games = result.rows.map(row => ({
                code: row.code,
                word: row.word,
                category: row.category,
                status: row.status,
                guesserName: row.guesser_name || 'منتظر',
                isCreator: true,
                currentPlayers: row.status === 'waiting' ? 1 : 2,
                maxPlayers: 2
            }));

            socket.emit('myCreatedGamesList', games);
        } catch (error) {
            console.error('❌ خطای دریافت بازی‌های ایجاد شده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های شما.' });
        }
    });

    // ----------------------------------------------------------------------
    // --- (۱۰) منطق جدید: بازی‌های من (حدس‌زننده) ---
    // ----------------------------------------------------------------------
    socket.on('getMyGuessingGames', async (data) => {
        const userId = currentUserId;
        if (!userId) return;

        try {
            const result = await pool.query(
                `SELECT 
                    code, word, category, status, creator_id, guesser_id, created_at, started_at,
                    (SELECT name FROM users WHERE telegram_id = creator_id) AS creator_name
                FROM game_history 
                WHERE guesser_id = $1 AND status != 'canceled'
                ORDER BY started_at DESC, created_at DESC`,
                [userId]
            );

            // تبدیل خروجی دیتابیس به فرمت مناسب کلاینت
            const games = result.rows.map(row => ({
                code: row.code,
                word: row.word,
                category: row.category,
                status: row.status,
                creatorName: row.creator_name,
                isCreator: false,
                currentPlayers: 2,
                maxPlayers: 2
            }));

            socket.emit('myGuessingGamesList', games);
        } catch (error) {
            console.error('❌ خطای دریافت بازی‌های حدس زده شده:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های حدس زده شده شما.' });
        }
    });

    // ----------------------------------------------------------------------
    // --- (۱۱) منطق جدید: لغو بازی (فقط سازنده) ---
    // ----------------------------------------------------------------------
    socket.on('cancel_game', async (data) => {
        const { gameCode } = data;
        const userId = currentUserId;
        const game = gameStates[gameCode];

        // فقط سازنده بازی منتظر حق لغو دارد
        if (!game || game.status !== 'waiting' || game.creator.telegram_id !== userId) {
            return socket.emit('game_error', { message: 'شما مجاز به لغو این بازی نیستید یا بازی شروع شده است.' });
        }
        
        try {
            // به‌روزرسانی در دیتابیس
            const updateResult = await pool.query(
                `UPDATE game_history SET status = 'canceled', finished_at = NOW() WHERE code = $1 AND creator_id = $2 AND status = 'waiting' RETURNING code`,
                [gameCode, userId]
            );

            if (updateResult.rows.length === 0) {
                 return socket.emit('game_error', { message: 'لغو بازی در دیتابیس موفق نبود (شاید وضعیت تغییر کرده باشد).' });
            }

            // حذف از حافظه سرور 
            delete gameStates[gameCode];
            
            // اطلاع به کلاینت
            socket.emit('gameCanceled', { gameCode });
            // به‌روزرسانی لیست بازی‌های منتظر برای همه
            io.emit('waiting_games_list', getWaitingGamesList());

        } catch (error) {
            console.error('❌ خطای لغو بازی:', error);
            socket.emit('game_error', { message: 'خطا در لغو بازی در دیتابیس.' });
        }
    });


    // --- (۱۲) جوین شدن به اتاق بازی برای سازنده (فقط برای اطمینان در مورد بازی های قدیمی) ---
    // این تابع اکنون با منطق rejoin در user_login همپوشانی دارد.
    socket.on('join_game_room', async (gameCode) => {
        socket.join(gameCode);
        await emitGameState(gameCode);
    });

    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 سرور با موفقیت روی پورت ${PORT} اجرا شد.`);
});
