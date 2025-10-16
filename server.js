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
        ", "گیلاس نارنجی"
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

        // دریافت بازیکنان لیگ
        const playersResult = await pool.query(`
            SELECT u.telegram_id, u.name, lp.score, lp.correct_words, lp.total_time
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = $1
            ORDER BY lp.score DESC
        `, [league.id]);

        const players = playersResult.rows;

        // دریافت کلمه فعلی
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

        // ساخت وضعیت لیگ برای ارسال
        const leagueState = {
            code: league.code,
            status: league.status,
            currentWordNumber: league.current_word_number,
            totalWords: league.total_words,
            players: players,
            currentWord: currentWord, // ارسال کلمه اصلی فقط برای بررسی منطق
            currentCategory: currentCategory
        };

        // ارسال به تمام بازیکنان لیگ
        io.to(leagueCode).emit('leagueStatus', leagueState);
        console.log(`📡 وضعیت جدید لیگ ${leagueCode} ارسال شد.`);

    } catch (error) {
        console.error(`❌ خطای ارسال وضعیت لیگ ${leagueCode}:`, error);
    }
}

/**
 * شروع لیگ جدید
 * @param {string} leagueCode کد لیگ
 */
async function startLeague(leagueCode) {
    try {
        // به‌روزرسانی وضعیت لیگ
        await pool.query(
            'UPDATE leagues SET status = $1, start_time = NOW() WHERE code = $2',
            ['starting', leagueCode]
        );

        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        // تولید 10 کلمه تصادفی برای لیگ
        const words = [];
        for (let i = 1; i <= 10; i++) {
            const { word, category } = getRandomLeagueWord();
            words.push({
                league_id: league.id,
                word_number: i,
                word: word,
                category: category,
                max_guesses: Math.ceil(word.length * 1.5),
                status: i === 1 ? 'active' : 'pending'
            });
        }

        // ذخیره کلمات در دیتابیس
        for (const wordData of words) {
            await pool.query(`
                INSERT INTO league_words (league_id, word_number, word, category, max_guesses, status)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [wordData.league_id, wordData.word_number, wordData.word, wordData.category, 
                wordData.max_guesses, wordData.status]);
        }

        // شروع اولین کلمه پس از تأخیر
        setTimeout(async () => {
            await pool.query(
                'UPDATE leagues SET status = $1 WHERE code = $2',
                ['in_progress', leagueCode]
            );
            
            // ارسال وضعیت جدید
            await emitLeagueState(leagueCode);
            
            // اطلاع‌رسانی شروع لیگ
            io.to(leagueCode).emit('leagueStarted', {
                code: leagueCode,
                status: 'in_progress',
                currentWordNumber: 1,
                totalWords: 10
            });

            console.log(`🎮 لیگ ${leagueCode} شروع شد.`);
            
        }, 3000); // تأخیر 3 ثانیه برای آماده‌سازی

    } catch (error) {
        console.error(`❌ خطای شروع لیگ ${leagueCode}:`, error);
    }
}

/**
 * شروع کلمه جدید در لیگ
 * @param {string} leagueCode کد لیگ
 * @param {number} wordNumber شماره کلمه
 */
async function startLeagueWord(leagueCode, wordNumber) {
    try {
        // دریافت اطلاعات لیگ
        const leagueResult = await pool.query('SELECT * FROM leagues WHERE code = $1', [leagueCode]);
        const league = leagueResult.rows[0];

        // به‌روزرسانی وضعیت کلمه قبلی
        await pool.query(`
            UPDATE league_words SET status = 'completed' 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber - 1]);

        // به‌روزرسانی وضعیت کلمه جدید
        await pool.query(`
            UPDATE league_words SET status = 'active' 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        // به‌روزرسانی شماره کلمه فعلی در لیگ
        await pool.query(`
            UPDATE leagues SET current_word_number = $1 
            WHERE code = $2
        `, [wordNumber, leagueCode]);

        // ایجاد رکوردهای جدید برای بازیکنان
        const playersResult = await pool.query(`
            SELECT user_id FROM league_players WHERE league_id = $1
        `, [league.id]);

        const currentWordResult = await pool.query(`
            SELECT word, category, max_guesses FROM league_words 
            WHERE league_id = $1 AND word_number = $2
        `, [league.id, wordNumber]);

        if (currentWordResult.rows.length === 0) return;

        const currentWord = currentWordResult.rows[0];

        for (const player of playersResult.rows) {
            await pool.query(`
                INSERT INTO league_player_words 
                (league_id, user_id, word_number, word, category, guesses_left, start_time)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (league_id, user_id, word_number) DO NOTHING
            `, [league.id, player.user_id, wordNumber, currentWord.word, 
                currentWord.category, currentWord.max_guesses]);
        }

        // ارسال وضعیت جدید
        await emitLeagueState(leagueCode);

        // اطلاع‌رسانی شروع کلمه جدید
        io.to(leagueCode).emit('leagueWordStarted', {
            code: leagueCode,
            currentWordNumber: wordNumber,
            totalWords: 10,
            currentCategory: currentWord.category
        });

        console.log(`📝 کلمه ${wordNumber} در لیگ ${leagueCode} شروع شد.`);

    } catch (error) {
        console.error(`❌ خطای شروع کلمه جدید در لیگ ${leagueCode}:`, error);
    }
}

/**
 * پایان لیگ
 * @param {string} leagueCode کد لیگ
 */
async function endLeague(leagueCode) {
    try {
        // به‌روزرسانی وضعیت لیگ
        await pool.query(
            'UPDATE leagues SET status = $1, end_time = NOW() WHERE code = $2',
            ['ended', leagueCode]
        );

        // دریافت برنده لیگ
        const winnerResult = await pool.query(`
            SELECT u.telegram_id, u.name, lp.score
            FROM league_players lp
            JOIN users u ON lp.user_id = u.telegram_id
            WHERE lp.league_id = (SELECT id FROM leagues WHERE code = $1)
            ORDER BY lp.score DESC
            LIMIT 1
        `, [leagueCode]);

        const winner = winnerResult.rows[0];

        // ارسال وضعیت نهایی
        await emitLeagueState(leagueCode);

        // اطلاع‌رسانی پایان لیگ
        io.to(leagueCode).emit('leagueEnded', {
            code: leagueCode,
            status: 'ended',
            winner: winner
        });

        console.log(`🏆 لیگ ${leagueCode} به پایان رسید. برنده: ${winner?.name || 'نامشخص'}`);

    } catch (error) {
        console.error(`❌ خطای پایان لیگ ${leagueCode}:`, error);
    }
}

// --- منطق Socket.io ---
io.on('connection', (socket) => {
    console.log(`➕ کاربر جدید متصل شد: ${socket.id}`);

    // نگهداری اطلاعات کاربر متصل شده
    let currentUserId = null;
    let currentUserName = null;

    // --- (۱) ورود و ثبت‌نام کاربر ---
    socket.on('user_login', async ({ userId, name }) => {
        try {
            currentUserId = userId;
            currentUserName = name;
            
            // ثبت یا به‌روزرسانی کاربر (در این مرحله مجدداً اطمینان حاصل می‌شود که کاربر ثبت شده است)
            await pool.query(
                `INSERT INTO users (telegram_id, name) VALUES ($1, $2)
                ON CONFLICT (telegram_id) DO UPDATE SET name = EXCLUDED.name`,
                [userId, name]
            );

            socket.join(`user:${userId}`);
            console.log(`👤 کاربر وارد شد: ${name} (${userId})`);
            
            // --- منطق اتصال مجدد خودکار به بازی فعال ---
            const activeGamesResult = await pool.query(
                `SELECT code FROM games 
                WHERE (creator_id = $1 OR guesser_id = $1) 
                AND status IN ('waiting', 'in_progress')`, 
                [userId]
            );

            if (activeGamesResult.rows.length > 0) {
                const gameCode = activeGamesResult.rows[0].code;
                socket.join(gameCode);
                console.log(`🔗 کاربر ${userId} به بازی فعال ${gameCode} ملحق شد.`);
                
                // ارسال وضعیت بازی برای کلاینت متصل شده
                await emitGameState(gameCode); 
            }

            // --- NEW: منطق اتصال مجدد خودکار به لیگ فعال ---
            const activeLeaguesResult = await pool.query(`
                SELECT l.code 
                FROM leagues l
                JOIN league_players lp ON l.id = lp.league_id
                WHERE lp.user_id = $1 AND l.status IN ('waiting', 'starting', 'in_progress')
            `, [userId]);

            if (activeLeaguesResult.rows.length > 0) {
                const leagueCode = activeLeaguesResult.rows[0].code;
                socket.join(leagueCode);
                console.log(`🔗 کاربر ${userId} به لیگ فعال ${leagueCode} ملحق شد.`);
                
                // ارسال وضعیت لیگ برای کلاینت متصل شده
                await emitLeagueState(leagueCode);
            }
            // --- END NEW LOGIC ---

            // ارسال وضعیت خوشامدگویی
            socket.emit('login_success', { name, userId });

            // ارسال جدول رتبه‌بندی اولیه
            await emitLeaderboard();

            // --- NEW: ارسال وضعیت لیگ‌های فعال ---
            const waitingLeaguesResult = await pool.query(`
                SELECT l.code, l.status, COUNT(lp.user_id) as player_count
                FROM leagues l
                LEFT JOIN league_players lp ON l.id = lp.league_id
                WHERE l.status IN ('waiting', 'starting', 'in_progress')
                GROUP BY l.code, l.status
            `);

            socket.emit('leagueStatus', {
                status: 'waiting',
                players: [],
                currentLeagues: waitingLeaguesResult.rows
            });

        } catch (error) {
            console.error('❌ خطای ورود کاربر:', error);
            socket.emit('login_error', { message: 'خطا در ثبت اطلاعات کاربری.' });
        }
    });

    // --- (۲) ایجاد بازی ---
    socket.on('create_game', async ({ userId, word, category }) => {
        if (!userId || !word || !category) return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });

        try {
            const gameCode = generateGameCode();
            const maxGuesses = Math.ceil(word.length * 1.5);
            const revealedLetters = {};
            
            // کلمه باید با حروف فارسی و حداقل 3 حرف باشد
            if (!/^[\u0600-\u06FF\s]+$/.test(word) || word.length < 3) {
                 return socket.emit('game_error', { message: 'کلمه وارد شده نامعتبر است. فقط حروف فارسی و حداقل ۳ حرف.' });
            }
            
            const result = await pool.query(
                `INSERT INTO games (code, creator_id, word, category, max_guesses, guesses_left, revealed_letters, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'waiting') RETURNING *`,
                [gameCode, userId, word, category, maxGuesses, maxGuesses, revealedLetters]
            );
            
            const newGame = result.rows[0];
            socket.join(gameCode);
            socket.emit('game_created', { code: gameCode });
            console.log(`🎮 بازی جدید ایجاد شد: ${gameCode} توسط ${userId}`);
            await emitGameState(gameCode); // ارسال وضعیت اولیه
            
        } catch (error) {
            console.error('❌ خطای ایجاد بازی:', error);
            socket.emit('game_error', { message: 'خطا در ایجاد بازی.' });
        }
    });

    // --- (۳) لیست بازی‌های منتظر ---
    socket.on('list_waiting_games', async () => {
        try {
            const result = await pool.query(`
                SELECT g.code, g.category, u.name as creator_name, g.word, g.max_guesses
                FROM games g JOIN users u ON g.creator_id = u.telegram_id
                WHERE g.status = 'waiting' AND g.creator_id != $1
            `, [currentUserId]);
            
            // کلمه اصلی را در اینجا فیلتر می‌کنیم
            const waitingGames = result.rows.map(game => ({
                code: game.code,
                category: game.category,
                creatorName: game.creator_name,
                wordLength: game.word.length,
                maxGuesses: game.max_guesses
            }));
            
            socket.emit('waiting_games_list', waitingGames);
        } catch (error) {
            console.error('❌ خطای دریافت لیست بازی‌ها:', error);
            socket.emit('game_error', { message: 'خطا در دریافت لیست بازی‌ها.' });
        }
    });

    // --- (۴) پیوستن به بازی ---
    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2 AND creator_id != $3', [gameCode, 'waiting', userId]);
            const game = gameResult.rows[0];

            if (!game) {
                return socket.emit('game_error', { message: 'بازی پیدا نشد یا قبلاً شروع شده است.' });
            }

            // به‌روزرسانی بازی: تعیین حدس زننده و شروع زمان
            await pool.query(
                'UPDATE games SET guesser_id = $1, status = $2, start_time = NOW() WHERE code = $3',
                [userId, 'in_progress', gameCode]
            );

            socket.join(gameCode);
            socket.emit('game_joined', { code: gameCode });
            
            // اطلاع به هر دو کاربر (سازنده و حدس زننده)
            io.to(`user:${game.creator_id}`).socketsLeave(`user:${game.creator_id}`);
            io.to(`user:${userId}`).socketsLeave(`user:${userId}`);
            
            // کلاینت‌ها باید به اتاق بازی جوین شوند و وضعیت جدید را دریافت کنند
            await emitGameState(gameCode);
            
            console.log(`🔗 کاربر ${userId} به بازی ${gameCode} پیوست.`);
            
        } catch (error) {
            console.error('❌ خطای پیوستن به بازی:', error);
            socket.emit('game_error', { message: 'خطا در پیوستن به بازی.' });
        }
    });
    
    // --- (۵) مدیریت بازی (حدس زدن) ---
    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];
            
            if (!game || game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به حدس زدن در این بازی نیستید.' });
            }
            
            const normalizedLetter = letter.trim().toLowerCase();
            
            if (normalizedLetter.length !== 1 || !/^[\u0600-\u06FF]$/.test(normalizedLetter)) {
                return socket.emit('game_error', { message: 'لطفا فقط یک حرف فارسی وارد کنید.' });
            }
            
            if (game.guessed_letters.includes(normalizedLetter)) {
                 // اطلاع به هر دو کاربر که حرف تکراری است
                io.to(gameCode).emit('message', { 
                    type: 'warning', 
                    text: `⚠️ حرف "${normalizedLetter}" قبلاً حدس زده شده است.` 
                });
                return;
            }

            let isCorrect = false;
            let newRevealed = { ...game.revealed_letters };
            let indices = [];
            
            // پیدا کردن تمام موقعیت‌های حرف در کلمه
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
            
            // به‌روزرسانی وضعیت در دیتابیس
            await pool.query(
                `UPDATE games SET 
                guesses_left = $1, 
                correct_guesses = $2, 
                incorrect_guesses = $3, 
                revealed_letters = $4,
                guessed_letters = array_append(guessed_letters, $5)
                WHERE code = $6`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, normalizedLetter, gameCode]
            );

            // ارسال پیام به هر دو کاربر
            const messageType = isCorrect ? 'success' : 'error';
            io.to(gameCode).emit('message', { 
                type: messageType, 
                text: `${currentUserName} حدس زد: "${normalizedLetter}" - ${isCorrect ? '✅ درست' : '❌ غلط'}` 
            });

            // بررسی پایان بازی (تمام شدن حدس‌ها یا تکمیل کلمه)
            const allLetters = Array.from(new Set(game.word.split('')));
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount === game.word.length) {
                gameStatus = 'finished';
                winnerId = userId;
                
                const timeTaken = (Date.now() - game.start_time) / 1000; // ثانیه
                
                // فرمول امتیازدهی: 1000 - (10 * غلط) - (1 * زمان) + (50 * تعداد حرف)
                pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * newIncorrectGuesses) - (timeTaken) + (50 * game.word.length)
                ));
                
                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                    [gameStatus, winnerId, gameCode]
                );
                await updateScoreAndEmitLeaderboard(winnerId, pointsGained);
            } else if (newGuessesLeft <= 0) {
                gameStatus = 'finished';
                // کسی برنده نشد یا امتیاز منفی ناچیز به حدس زننده
                pointsGained = -5; // امتیاز منفی برای بازی باخته
                winnerId = null;
                
                 await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW() WHERE code = $2',
                    [gameStatus, gameCode]
                );
                await updateScoreAndEmitLeaderboard(userId, pointsGained); // کسر امتیاز
            }

            // ارسال به‌روزرسانی نهایی یا مرحله‌ای
            if (gameStatus === 'finished') {
                io.to(gameCode).emit('game_finished', { 
                    winnerName: winnerId ? currentUserName : 'هیچکس', 
                    points: pointsGained,
                    word: game.word
                });
            }
            
            // وضعیت بازی برای همه ارسال شود
            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای حدس زدن:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس.' });
        }
    });
    
    // --- (۶) راهنمایی (Hint) ---
    socket.on('request_hint', async ({ userId, gameCode, letterPosition }) => {
        try {
            const gameResult = await pool.query('SELECT * FROM games WHERE code = $1 AND status = $2', [gameCode, 'in_progress']);
            const game = gameResult.rows[0];

            if (!game || game.guesser_id !== userId) {
                return socket.emit('game_error', { message: 'شما مجاز به درخواست راهنمایی در این بازی نیستید.' });
            }

            // چک کردن اینکه کاربر قبلاً چند راهنمایی استفاده کرده
            // نکته: منطق صحیح برای دو راهنمایی باید در سمت کلاینت/دیتابیس کنترل شود، اما اینجا یک کنترل ساده گذاشته شده است
            // برای سادگی، فعلاً فقط اجازه دو درخواست راهنمایی از هر کاربر داده می‌شود.
            // این بخش در حال حاضر فیلتر خاصی بر اساس تعداد استفاده شده ندارد، اما هر بار ۱۵ امتیاز کم می‌شود.
            
            const requestedIndex = parseInt(letterPosition);
            if (requestedIndex < 0 || requestedIndex >= game.word.length || isNaN(requestedIndex)) {
                return socket.emit('game_error', { message: 'موقعیت حرف نامعتبر است.' });
            }

            const letter = game.word[requestedIndex];
            
            // اگر حرف قبلاً پیدا شده باشد، نباید امتیاز کم شود.
            // این منطق بررسی می کند که آیا حرف در این موقعیت (requestedIndex) قبلاً فاش شده است یا خیر.
            if (game.revealed_letters && game.revealed_letters[letter] && game.revealed_letters[letter].includes(requestedIndex)) {
                return socket.emit('message', { type: 'info', text: '⚠️ این حرف قبلاً در این موقعیت مشخص شده است.' });
            }

            // کسر امتیاز
            const hintCost = 15;
            await updateScoreAndEmitLeaderboard(userId, -hintCost); // کسر امتیاز

            // اضافه کردن حرف به حروف کشف شده
            let newRevealed = { ...game.revealed_letters };
            let indices = newRevealed[letter] || [];
            
            // پیدا کردن تمام موقعیت‌های این حرف
            for (let i = 0; i < game.word.length; i++) {
                if (game.word[i] === letter && !indices.includes(i)) {
                    indices.push(i);
                }
            }
            newRevealed[letter] = indices.sort((a, b) => a - b);
            
            // به‌روزرسانی دیتابیس
            await pool.query(
                `UPDATE games SET 
                revealed_letters = $1
                WHERE code = $2`,
                [newRevealed, gameCode]
            );

            io.to(gameCode).emit('message', { 
                type: 'hint', 
                text: `${currentUserName} درخواست راهنمایی کرد (-${hintCost} امتیاز) و حرف در موقعیت ${requestedIndex + 1} کشف شد.` 
            });
            
            // بررسی برد پس از راهنمایی (اگر کلمه تکمیل شد)
            const revealedCount = Object.values(newRevealed).flat().length;

            if (revealedCount === game.word.length) {
                const timeTaken = (Date.now() - game.start_time) / 1000;
                let pointsGained = Math.max(10, Math.floor(
                    1000 - (10 * game.incorrect_guesses) - (timeTaken) + (50 * game.word.length) - (2 * hintCost) // کسر مضاعف به دلیل استفاده از راهنما
                ));
                
                await pool.query(
                    'UPDATE games SET status = $1, end_time = NOW(), winner_id = $2 WHERE code = $3',
                    ['finished', userId, gameCode]
                );
                await updateScoreAndEmitLeaderboard(userId, pointsGained);
                
                io.to(gameCode).emit('game_finished', { 
                    winnerName: currentUserName, 
                    points: pointsGained,
                    word: game.word
                });
            }

            await emitGameState(gameCode);

        } catch (error) {
            console.error('❌ خطای درخواست راهنمایی:', error);
            socket.emit('game_error', { message: 'خطا در ارائه راهنمایی.' });
        }
    });

    // --- NEW: منطق لیگ ---

    // --- (۸) پیوستن به لیگ ---
    socket.on('joinLeague', async ({ userId, userName }) => {
        try {
            if (!userId || !userName) {
                return socket.emit('game_error', { message: 'اطلاعات کاربر کامل نیست.' });
            }

            // پیدا کردن لیگ در حال انتظار
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
                // پیوستن به لیگ موجود
                league = waitingLeagueResult.rows[0];
            } else {
                // ایجاد لیگ جدید
                const leagueCode = generateGameCode();
                const result = await pool.query(`
                    INSERT INTO leagues (code, status) 
                    VALUES ($1, 'waiting') 
                    RETURNING *
                `, [leagueCode]);
                
                league = result.rows[0];
            }

            // بررسی اینکه کاربر قبلاً در این لیگ نباشد
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

            // اضافه کردن کاربر به لیگ
            await pool.query(`
                INSERT INTO league_players (league_id, user_id, score, correct_words, total_time)
                VALUES ($1, $2, 0, 0, 0)
            `, [league.id, userId]);

            socket.join(league.code);
            
            // دریافت تعداد بازیکنان فعلی
            const playerCountResult = await pool.query(`
                SELECT COUNT(*) FROM league_players WHERE league_id = $1
            `, [league.id]);
            
            const playerCount = parseInt(playerCountResult.rows[0].count);

            // اطلاع‌رسانی به تمام بازیکنان لیگ
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

            // اگر تعداد بازیکنان به 5 رسید، لیگ را شروع کن
            if (playerCount >= 5) {
                await startLeague(league.code);
            }

            // ارسال وضعیت لیگ
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

    // --- (۹) حدس زدن در لیگ ---
    socket.on('submitLeagueGuess', async ({ userId, letter }) => {
        try {
            if (!userId || !letter) {
                return socket.emit('game_error', { message: 'اطلاعات کامل نیست.' });
            }

            // پیدا کردن لیگ فعال کاربر
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

            // بررسی اعتبار حرف
            if (normalizedLetter.length !== 1 || !/^[\u0600-\u06FF]$/.test(normalizedLetter)) {
                return socket.emit('game_error', { message: 'لطفا فقط یک حرف فارسی وارد کنید.' });
            }

            // بررسی تکراری نبودن حرف
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
            
            // پیدا کردن موقعیت‌های حرف در کلمه
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

            // محاسبه زمان صرف شده
            const timeTaken = Math.floor((Date.now() - new Date(leagueData.start_time)) / 1000);

            // به‌روزرسانی وضعیت در دیتابیس
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

            // بررسی تکمیل کلمه
            const revealedCount = Object.values(newRevealed).flat().length;
            let wordCompleted = false;
            let pointsEarned = 0;

            if (revealedCount === leagueData.word.length) {
                wordCompleted = true;
                
                // فرمول امتیازدهی برای لیگ
                pointsEarned = Math.max(50, Math.floor(
                    1000 - (10 * newIncorrectGuesses) - (timeTaken * 2) + (50 * leagueData.word.length)
                ));

                // به‌روزرسانی وضعیت کلمه
                await pool.query(`
                    UPDATE league_player_words SET 
                    status = 'completed',
                    score_earned = $1,
                    end_time = NOW()
                    WHERE league_id = $2 AND user_id = $3 AND word_number = $4
                `, [pointsEarned, leagueData.league_id, userId, leagueData.word_number]);

                // به‌روزرسانی امتیاز کلی کاربر در لیگ
                await pool.query(`
                    UPDATE league_players SET 
                    score = score + $1,
                    correct_words = correct_words + 1,
                    total_time = total_time + $2
                    WHERE league_id = $3 AND user_id = $4
                `, [pointsEarned, timeTaken, leagueData.league_id, userId]);

                // بررسی اینکه آیا همه بازیکنان این کلمه را تکمیل کرده‌اند
                const remainingPlayersResult = await pool.query(`
                    SELECT COUNT(*) FROM league_player_words
                    WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'
                `, [leagueData.league_id, leagueData.word_number]);

                const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);

                if (remainingPlayers === 0) {
                    // همه بازیکنان این کلمه را تکمیل کرده‌اند، کلمه بعدی را شروع کن
                    if (leagueData.word_number < leagueData.total_words) {
                        setTimeout(() => {
                            startLeagueWord(leagueData.code, leagueData.word_number + 1);
                        }, 3000);
                    } else {
                        // لیگ به پایان رسیده
                        setTimeout(() => {
                            endLeague(leagueData.code);
                        }, 3000);
                    }
                }
            } else if (newGuessesLeft <= 0) {
                // حدس‌ها تمام شد، کلمه شکست خورده
                await pool.query(`
                    UPDATE league_player_words SET 
                    status = 'failed',
                    end_time = NOW()
                    WHERE league_id = $1 AND user_id = $2 AND word_number = $3
                `, [leagueData.league_id, userId, leagueData.word_number]);

                // بررسی اینکه آیا همه بازیکنان این کلمه را تکمیل کرده‌اند
                const remainingPlayersResult = await pool.query(`
                    SELECT COUNT(*) FROM league_player_words
                    WHERE league_id = $1 AND word_number = $2 AND status = 'in_progress'
                `, [leagueData.league_id, leagueData.word_number]);

                const remainingPlayers = parseInt(remainingPlayersResult.rows[0].count);

                if (remainingPlayers === 0) {
                    // همه بازیکنان این کلمه را تکمیل کرده‌اند، کلمه بعدی را شروع کن
                    if (leagueData.word_number < leagueData.total_words) {
                        setTimeout(() => {
                            startLeagueWord(leagueData.code, leagueData.word_number + 1);
                        }, 3000);
                    } else {
                        // لیگ به پایان رسیده
                        setTimeout(() => {
                            endLeague(leagueData.code);
                        }, 3000);
                    }
                }
            }

            // ارسال نتیجه به کاربر
            socket.emit('leagueGuessResult', {
                isCorrect: isCorrect,
                pointsEarned: pointsEarned,
                wordCompleted: wordCompleted,
                guessesLeft: newGuessesLeft
            });

            // ارسال وضعیت به‌روزرسانی شده لیگ
            await emitLeagueState(leagueData.code);

            console.log(`🎯 کاربر ${userId} در لیگ ${leagueData.code} حدس زد: "${normalizedLetter}" - ${isCorrect ? 'درست' : 'غلط'}`);

        } catch (error) {
            console.error('❌ خطای حدس زدن در لیگ:', error);
            socket.emit('game_error', { message: 'خطا در پردازش حدس لیگ.' });
        }
    });

    // --- (۱۰) دریافت وضعیت لیگ ---
    socket.on('getLeagueStatus', async () => {
        try {
            if (!currentUserId) return;

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

    // --- (۷) جوین شدن به اتاق بازی برای سازنده (فقط برای اطمینان در مورد بازی های قدیمی) ---
    // این تابع اکنون با منطق rejoin در user_login همپوشانی دارد.
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
