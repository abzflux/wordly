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
        require: true,
        rejectUnauthorized: false
    }
    // FIX END
});

// --- راه‌اندازی ربات تلگرام ---
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
        "دلمه‌کدو", "دلمه‌بادمجان", "کوفته", " تبریزی", " سبزی", " لوبیا", "کله‌پاچه", "آش", "آش‌رشته", "آش‌شله‌قلمکار",
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
                revealed_letters JSONB DEFAULT '{}',
                guessed_letters VARCHAR(1)[] DEFAULT '{}',
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'finished')),
                winner_id BIGINT,
                FOREIGN KEY (guesser_id) REFERENCES users(telegram_id)
            );
        `);

        // جدول لیگ‌ها
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

        // جدول بازیکنان لیگ
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_players (
                id SERIAL PRIMARY KEY,
                league_id INT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                score INT DEFAULT 0,
                correct_words INT DEFAULT 0,
                total_time INT DEFAULT 0,
                joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(league_id, user_id)
            );
        `);

        // جدول کلمات لیگ
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

        // جدول وضعیت بازیکنان در کلمات لیگ
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
                time_taken INT DEFAULT 0,
                score_earned INT DEFAULT 0,
                UNIQUE(league_id, user_id, word_number)
            );
        `);

        console.log('✅ جداول دیتابیس بررسی و ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err.message);
        process.exit(1);
    }
}

// --- راه‌اندازی سرور Express و Socket.io ---
const app = express();
const server = http.createServer(app);

// فعال‌سازی CORS برای ارتباط بین فرانت و بک
app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST']
}));

app.use(express.json());

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
            const creator = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.creator_id])).rows[0];
            let guesser = null;
            if (game.guesser_id) {
                guesser = (await pool.query('SELECT telegram_id, name, score FROM users WHERE telegram_id = $1', [game.guesser_id])).rows[0];
            }

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
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];
        
        if (!league) return;

        const playersResult = await pool.query(`
            SELECT u.telegram_id, u.name, lp.score, lp.correct_words, lp.total_time
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = $1
            ORDER BY lp.score DESC
        `, [league.id]);

        const players = playersResult.rows;

        let currentWord = null;
        let currentCategory = null;
        
        if (league.status === 'in_progress') {
            const currentWordResult = await pool.query(`
                SELECT word, category FROM league_words
                WHERE league_id = $1 AND word_number = $2
            `, [league.id, league.current_word_number]);
            
            if (currentWordResult.rows.length > 0) {
                currentWord = currentWordResult.rows[0].word;
                currentCategory = currentWordResult.rows[0].category;
            }
        }

        const leagueState = {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            players: players,
            currentWord: currentWord,
            currentCategory: currentCategory
        };

        io.to(league.code).emit('leagueStatus', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد.`);
    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
    }
}

/**
 * شروع یک کلمه جدید در لیگ
 * @param {string} leagueCode کد لیگ
 * @param {number} wordNumber شماره کلمه
 */
async function startLeagueWord(leagueCode, wordNumber) {
    try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];
        
        if (!league) return;

        const wordData = getRandomLeagueWord();
        const maxGuesses = wordData.word.length + 3;

        await pool.query(`
            INSERT INTO league_words (league_id, word_number, word, category, max_guesses, status)
            VALUES ($1, $2, $3, $4, $5, 'active')
            ON CONFLICT (league_id, word_number) DO NOTHING
        `, [league.id, wordNumber, wordData.word, wordData.category, maxGuesses]);

        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);

        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words (
                    league_id, user_id, word_number, word, category, 
                    guesses_left, start_time, status
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress')
            `, [league.id, player.user_id, wordNumber, wordData.word, wordData.category, maxGuesses]);
        }

        await pool.query(`
            UPDATE leagues SET current_word_number = $1
            WHERE id = $2
        `, [wordNumber, league.id]);

        io.to(leagueCode).emit('leagueWordStarted', {
            code: leagueCode,
            currentWordNumber: wordNumber,
            currentCategory: wordData.category
        });

        await emitLeagueState(leagueCode);
    } catch (error) {
        console.error(`❌ خطای شروع کلمه جدید در لیگ ${leagueCode}:`, error);
    }
}

/**
 * پایان دادن به لیگ
 * @param {string} leagueCode کد لیگ
 */
async function endLeague(leagueCode) {
    try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) return;

        await pool.query(`
            UPDATE leagues SET status = 'ended', end_time = NOW()
            WHERE id = $1
        `, [league.id]);

        const playersResult = await pool.query(`
            SELECT u.telegram_id, u.name, lp.score
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = $1
            ORDER BY lp.score DESC
            LIMIT 1
        `, [league.id]);

        const winner = playersResult.rows[0] || null;

        io.to(leagueCode).emit('leagueEnded', {
            code: leagueCode,
            status: 'ended',
            winner: winner
        });

        await emitLeagueState(leagueCode);
        console.log(`🏁 لیگ ${leagueCode} به پایان رسید.`);
    } catch (error) {
        console.error(`❌ خطای پایان لیگ ${leagueCode}:`, error);
    }
}

/**
 * شروع لیگ
 * @param {string} leagueCode کد لیگ
 */
async function startLeague(leagueCode) {
    try {
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        if (!league) return;

        await pool.query(`
            UPDATE leagues SET status = 'starting', start_time = NOW()
            WHERE id = $1
        `, [league.id]);

        io.to(leagueCode).emit('leagueStarted', {
            code: leagueCode,
            status: 'starting'
        });

        setTimeout(async () => {
            await pool.query(`
                UPDATE leagues SET status = 'in_progress'
                WHERE id = $1
            `, [league.id]);

            await startLeagueWord(leagueCode, 1);
        }, 5000);

        await emitLeagueState(leagueCode);
        console.log(`🚀 لیگ ${leagueCode} شروع شد.`);
    } catch (error) {
        console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
    }
}

// --- NEW: دریافت لیست بازی‌های کاربر ---
async function emitUserGames(userId, socket) {
    try {
        // بازی‌هایی که کاربر ایجاد کرده است
        const createdGamesResult = await pool.query(`
            SELECT g.*, u.name as creator_name
            FROM games g
            JOIN users u ON g.creator_id = u.telegram_id
            WHERE g.creator_id = $1
            ORDER BY g.created_at DESC
        `, [userId]);

        // بازی‌هایی که کاربر به عنوان حدس‌زننده به آن‌ها پیوسته است
        const joinedGamesResult = await pool.query(`
            SELECT g.*, u.name as creator_name
            FROM games g
            JOIN users u ON g.creator_id = u.telegram_id
            WHERE g.guesser_id = $1
            ORDER BY g.created_at DESC
        `, [userId]);

        socket.emit('user_games_list', {
            createdGames: createdGamesResult.rows,
            joinedGames: joinedGamesResult.rows
        });
    } catch (error) {
        console.error('❌ خطای دریافت لیست بازی‌های کاربر:', error);
        socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌های کاربر.' });
    }
}

// --- Socket.io Events ---
io.on('connection', (socket) => {
    let currentUserId = null;
    let currentUserName = null;

    socket.on('user_login', async (data) => {
        try {
            currentUserId = data.userId;
            currentUserName = data.name;
            socket.join(`user_${currentUserId}`);

            const existingGame = await pool.query(`
                SELECT * FROM games 
                WHERE (creator_id = $1 OR guesser_id = $1) 
                AND status IN ('waiting', 'in_progress')
                ORDER BY created_at DESC LIMIT 1
            `, [currentUserId]);

            if (existingGame.rows.length > 0) {
                const game = existingGame.rows[0];
                socket.join(game.code);
                await emitGameState(game.code);
            }

            const activeLeague = await pool.query(`
                SELECT l.* FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
                ORDER BY l.created_at DESC LIMIT 1
            `, [currentUserId]);

            if (activeLeague.rows.length > 0) {
                socket.join(activeLeague.rows[0].code);
                await emitLeagueState(activeLeague.rows[0].code);
            }

            socket.emit('login_success', { message: 'ورود با موفقیت انجام شد.' });
            await emitUserGames(currentUserId, socket); // NEW: ارسال لیست بازی‌های کاربر
        } catch (error) {
            console.error('❌ خطای لاگین:', error);
            socket.emit('game_error', { message: 'خطا در ورود کاربر.' });
        }
    });

    socket.on('create_game', async ({ userId, word, category }) => {
        try {
            if (!userId || !word || !category) {
                return socket.emit('game_error', { message: 'اطلاعات ناقص است.' });
            }

            const normalizedWord = word.trim().toLowerCase();
            if (!/^[\u0600-\u06FF\s]+$/.test(normalizedWord)) {
                return socket.emit('game_error', { message: 'کلمه باید فقط شامل حروف فارسی و فاصله باشد.' });
            }

            const maxGuesses = normalizedWord.length + 3;
            const gameCode = generateGameCode();

            const result = await pool.query(`
                INSERT INTO games (
                    code, creator_id, word, category, max_guesses, guesses_left, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $5, 'waiting', NOW())
                RETURNING *
            `, [gameCode, userId, normalizedWord, category, maxGuesses]);

            socket.join(gameCode);
            await emitGameState(gameCode);

            socket.emit('game_created', { code: gameCode });
            io.emit('waiting_games_list', (await pool.query(`
                SELECT g.code, g.category, g.word, u.name as creatorName
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting'
            `)).rows);

            await emitUserGames(userId, socket); // NEW: به‌روزرسانی لیست بازی‌های کاربر
        } catch (error) {
            console.error('❌ خطای ساخت بازی:', error);
            socket.emit('game_error', { message: 'خطا در ساخت بازی.' });
        }
    });

    socket.on('list_waiting_games', async ({ userId }) => {
        try {
            const result = await pool.query(`
                SELECT g.code, g.category, g.word, u.name as creatorName
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.creator_id != $1
            `, [userId]);
            socket.emit('waiting_games_list', result.rows);
        } catch (error) {
            console.error('❌ خطای لیست بازی‌های منتظر:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌ها.' });
        }
    });

    socket.on('request_leaderboard', async () => {
        await emitLeaderboard();
    });

    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query(`
                SELECT * FROM games WHERE code = $1 AND status = 'waiting'
            `, [gameCode]);

            if (gameResult.rows.length === 0) {
                return socket.emit('game_error', { message: 'بازی مورد نظر یافت نشد یا شروع شده است.' });
            }

            const game = gameResult.rows[0];
            if (game.creator_id === userId) {
                return socket.emit('game_error', { message: 'شما نمی‌توانید به بازی خودتان بپیوندید.' });
            }

            await pool.query(`
                UPDATE games SET 
                guesser_id = $1, 
                status = 'in_progress', 
                start_time = NOW()
                WHERE code = $2
            `, [userId, gameCode]);

            socket.join(gameCode);
            await emitGameState(gameCode);

            io.emit('waiting_games_list', (await pool.query(`
                SELECT g.code, g.category, g.word, u.name as creatorName
                FROM games g
                JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting'
            `)).rows);

            socket.to(gameCode).emit('message', { 
                type: 'info', 
                text: `${currentUserName} به بازی پیوست.` 
            });

            await emitUserGames(userId, socket); // NEW: به‌روزرسانی لیست بازی‌های کاربر
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });

    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            if (gameResult.rows.length === 0) {
                return socket.emit('game_error', { message: 'بازی در حال انجام نیست.' });
            }

            const game = gameResult.rows[0];
            if (game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به حدس زدن در این بازی نیستید.' });
            }
            
            const normalizedLetter = letter.trim().toLowerCase();
            
            if (normalizedLetter.length !== 1 || !/^[\u0600-\u06FF]$/.test(normalizedLetter)) {
                return socket.emit('game_error', { message: 'لطفا فقط یک حرف فارسی وارد کنید.' });
            }
            
            if (game.guessed_letters.includes(normalizedLetter)) {
                io.to(gameCode).emit('message', { 
                    type: 'warning', 
                    text: `⚠️ حرف "${normalizedLetter}" قبلاً حدس زده شده است.` 
                });
                return;
            }

            let isCorrect = false;
            let newRevealed = { ...game.revealed_letters };
            let indices = [];
            
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === normalizedLetter) {
                    indices.push(i);
                }
            }
            
            if (indices.length > 0) {
                isCorrect = true;
                newRevealed[normalizedLetter] = indices;
            }

            const newGuessesLeft = game.guesses_left - 1;
            const newCorrectGuesses = game.correct_guesses + (isCorrect ? indices.length : 0);
            const newIncorrectGuesses = game.incorrect_guesses + (isCorrect ? 0 : 1);
            
            let gameStatus = 'in_progress';
            let winnerId = null;
            let pointsGained = 0;
            
            await pool.query(`
                UPDATE games SET 
                guesses_left = $1, 
                correct_guesses = $2, 
                incorrect_guesses = $3, 
                revealed_letters = $4,
                guessed_letters = array_append(guessed_letters, $5)
                WHERE code = $6
            `, [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, normalizedLetter, gameCode]);

            const messageType = isCorrect ? 'success' : 'error';
            io.to(gameCode).emit('message', { 
                type: messageType, 
                text: `${currentUserName} حدس زد: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` 
            });

            const allLetters = Array.from(new Set(game.word.replace(/\s/g, '').split('')));
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount >= game.word.replace(/\s/g, '').length) {
                gameStatus = 'finished';
                winnerId = userId;
                
                const timeTaken = (Date.now() - game.start_time) / 1000;
                pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * newIncorrectGuesses) - timeTaken + (50 * game.word.length)
                ));
                
                await pool.query(`
                    UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3
                `, [gameStatus, winnerId, gameCode]);
                await updateScoreAndEmitLeaderboard(winnerId, pointsGained);
            } else if (newGuessesLeft <= 0) {
                gameStatus = 'finished';
                pointsGained = -5;
                winnerId = null;
                
                await pool.query(`
                    UPDATE games SET status = $1, end_time = NOW() WHERE code = $2
                `, [gameStatus, gameCode]);
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
            }

            if (gameStatus === 'finished') {
                io.to(gameCode).emit('game_finished', { 
                    winnerName: winnerId ? currentUserName : 'هیچکس', 
                    points: pointsGained,
                    word: game.word
                });
            }
            
            await emitGameState(gameCode);
            await emitUserGames(userId, socket); // NEW: به‌روزرسانی لیست بازی‌های کاربر
        } catch (error) {
            console.error('❌ خطای حدس زدن:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });
    
    socket.on('request_hint', async ({ userId, gameCode, letterPosition }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];

            if (!game || game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به درخواست راهنمایی در این بازی نیستید.' });
            }

            const requestedIndex = parseInt(letterPosition);
            if (requestedIndex < 0 || requestedIndex >= game.word.length || isNaN(requestedIndex)) {
                return socket.emit('game_error', { message: 'موقعیت حرف نامعتبر است.' });
            }

            const letter = game.word[requestedIndex];
            if (game.revealed_letters && game.revealed_letters[letter] && game.revealed_letters[letter].includes(requestedIndex)) {
                return socket.emit('message', { type: 'info', text: '⚠️ این حرف قبلاً در این موقعیت مشخص شده است.' });
            }

            const hintCost = 15;
            await updateScoreAndEmitLeaderboard(userId, -hintCost);

            let newRevealed = { ...game.revealed_letters };
            let indices = newRevealed[letter] || [];
            
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === letter && !indices.includes(i)) {
                    indices.push(i);
                }
            }
            newRevealed[letter] = indices.sort((a, b) => a - b);
            
            await pool.query(`
                UPDATE games SET 
                revealed_letters = $1
                WHERE code = $2
            `, [newRevealed, gameCode]);

            io.to(gameCode).emit('message', { 
                type: 'hint', 
                text: `${currentUserName} درخواست راهنمایی کرد (-${hintCost} امتیاز) و حرف در موقعیت ${requestedIndex + 1} کشف شد.` 
            });
            
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount >= game.word.replace(/\s/g, '').length) {
                const timeTaken = (Date.now() - game.start_time) / 1000;
                let pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * game.incorrect_guesses) - timeTaken + (50 * game.word.length) - (2 * hintCost)
                ));
                
                await pool.query(`
                    UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3
                `, ['finished', userId, gameCode]);
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
                
                io.to(gameCode).emit('game_finished', { 
                    winnerName: currentUserName, 
                    points: pointsGained,
                    word: game.word
                });
            }

            await emitGameState(gameCode);
            await emitUserGames(userId, socket); // NEW: به‌روزرسانی لیست بازی‌های کاربر
        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در ارائه راهنمایی.' });
        }
    });

    // --- NEW: دریافت لیست بازی‌های کاربر ---
    socket.on('list_user_games', async ({ userId }) => {
        await emitUserGames(userId, socket);
    });

    socket.on('joinLeague', async ({ userId, userName }) => {
        try {
            if (!userId || !userName) {
                return socket.emit('game_error', { message: 'اطلاعات کاربر کامل نیست.' });
            }

            const waitingLeagueResult = await pool.query(`
                SELECT l.*, COUNT(lp.user_id) as player_count
                FROM leagues l
                LEFT JOIN league_players lp ON l.id = lp.league_id
                WHERE l.status = 'waiting'
                GROUP BY l.id
                HAVING COUNT(lp.user_id) < 5
                ORDER BY l.created_at ASC
                LIMIT 1
            `);

            let league;
            
            if (waitingLeagueResult.rows.length > 0) {
                league = waitingLeagueResult.rows[0];
            } else {
                const leagueCode = generateGameCode();
                const result = await pool.query(`
                    INSERT INTO leagues (code, status) 
                    VALUES ($1, 'waiting') 
                    RETURNING *
                `, [leagueCode]);
                
                league = result.rows[0];
            }

            const existingPlayer = await pool.query(`
                SELECT * FROM league_players 
                WHERE league_id = $1 AND user_id = $2
            `, [league.id, userId]);

            if (existingPlayer.rows.length > 0) {
                socket.join(league.code);
                await emitLeagueState(league.code);
                return socket.emit('leagueJoined', { 
                    code: league.code, 
                    status: league.status,
                    message: 'شما قبلاً در این لیگ هستید.'
                });
            }

            await pool.query(`
                INSERT INTO league_players (league_id, user_id, score, correct_words, total_time)
                VALUES ($1, $2, 0, 0, 0)
            `, [league.id, userId]);

            socket.join(league.code);
            
            const playerCountResult = await pool.query(`
                SELECT COUNT(*) FROM league_players WHERE league_id = $1
            `, [league.id]);
            
            const playerCount = parseInt(playerCountResult.rows[0].count);

            const playersResult = await pool.query(`
                SELECT u.name FROM league_players lp
                JOIN users u ON lp.user_id = u.telegram_id
                WHERE lp.league_id = $1
            `, [league.id]);

            const players = playersResult.rows.map(p => p.name);

            io.to(league.code).emit('leaguePlayerJoined', {
                code: league.code,
                players: players,
                playerCount: playerCount,
                newPlayer: userName
            });

            console.log(`🔗 کاربر ${userName} به لیگ ${league.code} پیوست. (${playerCount}/5)`);

            if (playerCount >= 5) {
                await startLeague(league.code);
            }

            await emitLeagueState(league.code);

            socket.emit('leagueJoined', { 
                code: league.code, 
                status: league.status,
                playerCount: playerCount,
                message: `شما به لیگ پیوستید. (${playerCount}/5)`
            });
        } catch (error) {
            console.error('❌ خطای پیوستن به لیگ:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به لیگ.' });
        }
    });

    socket.on('submitLeagueGuess', async ({ userId, letter }) => {
        try {
            if (!userId || !letter) {
                return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });
            }

            const activeLeagueResult = await pool.query(`
                SELECT l.*, lpw.*
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                JOIN league_player_words lpw ON l.id = lpw.league_id AND lp.user_id = lpw.user_id
                WHERE lp.user_id = $1 
                AND l.status = 'in_progress' 
                AND lpw.word_number = l.current_word_number
                AND lpw.status = 'in_progress'
            `, [userId]);

            if (activeLeagueResult.rows.length === 0) {
                return socket.emit('game_error', { message: 'لیگ فعالی پیدا نشد.' });
            }

            const leagueData = activeLeagueResult.rows[0];
            const normalizedLetter = letter.trim().toLowerCase();

            if (normalizedLetter.length !== 1 || !/^[\u0600-\u06FF]$/.test(normalizedLetter)) {
                return socket.emit('game_error', { message: 'لطفا فقط یک حرف فارسی وارد کنید.' });
            }

            if (leagueData.guessed_letters && leagueData.guessed_letters.includes(normalizedLetter)) {
                socket.emit('message', { 
                    type: 'warning', 
                    text: `⚠️ حرف "${normalizedLetter}" قبلاً حدس زده شده است.` 
                });
                return;
            }

            let isCorrect = false;
            let newRevealed = { ...leagueData.revealed_letters };
            let indices = [];
            
            for (let i = 0; i < leagueData.word.length; i++) {
                if (leagueData.word[i] === normalizedLetter) {
                    indices.push(i);
                }
            }
            
            if (indices.length > 0) {
                isCorrect = true;
                newRevealed[normalizedLetter] = indices;
            }

            const newGuessesLeft = leagueData.guesses_left - 1;
            const newCorrectGuesses = leagueData.correct_guesses + (isCorrect ? indices.length : 0);
            const newIncorrectGuesses = leagueData.incorrect_guesses + (isCorrect ? 0 : 1);

            const timeTaken = Math.floor((Date.now() - new Date(leagueData.start_time)) / 1000);

            await pool.query(`
                UPDATE league_player_words SET 
                guesses_left = $1, 
                correct_guesses = $2, 
                incorrect_guesses = $3, 
                revealed_letters = $4,
                guessed_letters = array_append(guessed_letters, $5),
                time_taken = $6
                WHERE league_id = $7 AND user_id = $8 AND word_number = $9
            `, [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, 
                normalizedLetter, timeTaken, leagueData.league_id, userId, leagueData.word_number]);

            const revealedCount = Object.values(newRevealed).flat().length;
            let wordCompleted = false;
            let pointsEarned = 0;

            if (revealedCount >= leagueData.word.replace(/\s/g, '').length) {
                wordCompleted = true;
                pointsEarned = Math.max(50, Math.floor(
                    1000 - (10 * newIncorrectGuesses) - (timeTaken * 2) + (50 * leagueData.word.length)
                ));

                await pool.query(`
                    UPDATE league_player_words SET 
                    status = 'completed',
                    score_earned = $1,
                    end_time = NOW()
                    WHERE league_id = $2 AND user_id = $3 AND word_number = $4
                `, [pointsEarned, leagueData.league_id, userId, leagueData.word_number]);

                await pool.query(`
                    UPDATE league_players SET 
                    score = score + $1,
                    correct_words = correct_words + 1,
                    total_time = total_time + $2
                    WHERE league_id = $3 AND user_id = $4
                `, [pointsEarned, timeTaken, leagueData.league_id, userId]);

                const remainingPlayersResult = await pool.query(`
                    SELECT COUNT(*) FROM league_player_words
                    WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'
                `, [leagueData.league_id, leagueData.word_number]);

                const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);

                if (remainingPlayers === 0) {
                    if (leagueData.word_number < leagueData.total_words) {
                        setTimeout(() => {
                            startLeagueWord(leagueData.code, leagueData.word_number + 1);
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            endLeague(leagueData.code);
                        }, 3000);
                    }
                }
            } else if (newGuessesLeft <= 0) {
                await pool.query(`
                    UPDATE league_player_words SET 
                    status = 'failed',
                    end_time = NOW()
                    WHERE league_id = $1 AND user_id = $2 AND word_number = $3
                `, [leagueData.league_id, userId, leagueData.word_number]);

                const remainingPlayersResult = await pool.query(`
                    SELECT COUNT(*) FROM league_player_words
                    WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'
                `, [leagueData.league_id, leagueData.word_number]);

                const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);

                if (remainingPlayers === 0) {
                    if (leagueData.word_number < leagueData.total_words) {
                        setTimeout(() => {
                            startLeagueWord(leagueData.code, leagueData.word_number + 1);
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            endLeague(leagueData.code);
                        }, 3000);
                    }
                }
            }

            socket.emit('leagueGuessResult', {
                isCorrect: isCorrect,
                pointsEarned: pointsEarned,
                wordCompleted: wordCompleted,
                guessesLeft: newGuessesLeft
            });

            await emitLeagueState(leagueData.code);

            console.log(`🎯 کاربر ${userId} در لیگ ${leagueData.code} حدس زد: "${normalizedLetter}" - ${isCorrect ? 'درست' : 'غلط'}`);
        } catch (error) {
            console.error('❌ خطای حدس زدن در لیگ:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس لیگ.' });
        }
    });

    socket.on('getLeagueStatus', async () => {
        try {
            if (!currentUserId) return;

            const activeLeaguesResult = await pool.query(`
                SELECT l.code, l.status
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
            `, [currentUserId]);

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

    socket.on('join_game_room', async (gameCode) => {
        socket.join(gameCode);
        await emitGameState(gameCode);
    });

    socket.on('disconnect', () => {
        console.log(`➖ کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی سرور ---
setupDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🌐 سرور روی پورت ${PORT} در حال اجراست.`);
    });
});
