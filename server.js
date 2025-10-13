// ===============================
// 📦 Wordly Multiplayer Server
// ===============================

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

// -------------------------------
// 🛠 تنظیمات اولیه
// -------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// توکن ربات تلگرام و آدرس‌های اصلی
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || `https://wordly.ct.ws/`;

// اتصال به دیتابیس PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// -------------------------------
// 🌐 تنظیمات عمومی سرور
// -------------------------------
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());

app.use(express.json());
app.use(express.static('public'));

// -------------------------------
// 🤖 ربات تلگرام
// -------------------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// -------------------------------
// 💾 کلاس اصلی بازی
// -------------------------------
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

    console.log('🎮 ربات بازی راه‌اندازی شد');
  }

  log(message) {
    const ts = new Date().toLocaleString('fa-IR');
    console.log(`[${ts}] ${message}`);
  }

  // -------------------------------
  // 📡 اتصال به دیتابیس
  // -------------------------------
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
      this.dbConnected = true;
      this.log('✅ اتصال موفق به دیتابیس');

      await this.createTables();
      await this.loadActiveGames();
    } catch (error) {
      this.dbConnected = false;
      this.log(`❌ خطا در اتصال به دیتابیس: ${error.message}`);
    }
  }

  // -------------------------------
  // 🧱 ایجاد جدول‌ها
  // -------------------------------
  async createTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        game_id VARCHAR(10) UNIQUE,
        creator_id BIGINT,
        creator_name TEXT,
        opponent_id BIGINT,
        opponent_name TEXT,
        category TEXT,
        word TEXT,
        word_display TEXT,
        guessed_letters TEXT[],
        status TEXT DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await this.db.query(sql);
    this.log('📂 جدول games بررسی یا ایجاد شد');
  }

  // -------------------------------
  // 🔄 بارگذاری بازی‌های فعال
  // -------------------------------
  async loadActiveGames() {
    try {
      const { rows } = await this.db.query("SELECT * FROM games WHERE status != 'finished'");
      rows.forEach(g => this.activeGames.set(g.game_id, g));
      this.log(`♻️ ${rows.length} بازی فعال بارگذاری شد`);
    } catch (err) {
      this.log('⚠️ خطا در بارگذاری بازی‌ها: ' + err.message);
    }
  }

  // -------------------------------
  // 📤 ارسال پیام تلگرام
  // -------------------------------
  async safeSend(chatId, text, opts = {}) {
    try {
      await bot.sendMessage(chatId, text, opts);
    } catch (e) {
      console.error('❌ خطا در ارسال پیام:', e.message);
    }
  }

  // -------------------------------
  // 🕹 ایجاد بازی جدید
  // -------------------------------
  async createGame(creatorId, creatorName, category, word) {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const wordDisplay = '_'.repeat(word.length);

    await this.db.query(
      `INSERT INTO games (game_id, creator_id, creator_name, category, word, word_display, guessed_letters, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [gameId, creatorId, creatorName, category, word, wordDisplay, [], 'waiting']
    );

    const newGame = { gameId, creatorId, creatorName, category, word, wordDisplay, status: 'waiting' };
    this.activeGames.set(gameId, newGame);
    return newGame;
  }

  // -------------------------------
  // 🧠 پردازش پیام تلگرام
  // -------------------------------
  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();

    if (text === '/start') {
      await this.safeSend(chatId, `🎯 به بازی حدس کلمه خوش آمدی!
برای شروع بازی، روی دکمه زیر بزن 👇`, {
        reply_markup: {
          keyboard: [[{ text: "🎮 ایجاد بازی جدید" }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }

    if (text === "🎮 ایجاد بازی جدید") {
      const keyboard = {
        inline_keyboard: [
          [{ text: "🍎 میوه", callback_data: "cat_میوه" }],
          [{ text: "🐻 حیوانات", callback_data: "cat_حیوانات" }],
          [{ text: "🏙 شهرها", callback_data: "cat_شهرها" }],
          [{ text: "🍛 غذاها", callback_data: "cat_غذاها" }],
        ],
      };
      await this.safeSend(chatId, "دسته‌بندی کلمه را انتخاب کن:", { reply_markup: keyboard });
    }
  }

  // -------------------------------
  // 🎛 مدیریت کلیک دکمه‌ها
  // -------------------------------
  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('cat_')) {
      const category = data.split('_')[1];
      const wordList = this.wordCategories[category];
      const word = wordList[Math.floor(Math.random() * wordList.length)];
      const game = await this.createGame(chatId, query.from.first_name, category, word);

      const gameUrl = `${WEB_APP_URL}game.html?gameId=${game.gameId}&userId=${chatId}&role=creator`;

      await this.safeSend(chatId, `✅ بازی ساخته شد!\n\nکد بازی: ${game.gameId}\nدسته: ${category}\n\nورود به بازی 👇\n${gameUrl}`);
    }
  }

  // -------------------------------
  // 🚀 اجرای سرور و ربات
  // -------------------------------
  async start() {
    await this.connectDB();

    // مسیر تست
    app.get('/api/test', (req, res) => {
      res.json({ success: true, message: '✅ سرور در حال کار است' });
    });

    // مسیر گرفتن بازی
    app.get('/api/game/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const { rows } = await this.db.query('SELECT * FROM games WHERE game_id=$1', [id]);
        if (!rows.length) return res.json({ success: false, error: 'بازی یافت نشد' });
        res.json({ success: true, game: rows[0] });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // مسیر ارسال حدس
    app.post('/api/game/:id/guess', async (req, res) => {
      const id = req.params.id;
      const { guess } = req.body;

      try {
        const { rows } = await this.db.query('SELECT * FROM games WHERE game_id=$1', [id]);
        if (!rows.length) return res.json({ success: false, error: 'بازی یافت نشد' });
        const game = rows[0];

        const word = game.word;
        let wordDisplay = game.word_display.split('');
        let guessed = new Set(game.guessed_letters || []);
        guessed.add(guess);

        let correct = false;
        for (let i = 0; i < word.length; i++) {
          if (word[i] === guess) {
            wordDisplay[i] = guess;
            correct = true;
          }
        }

        await this.db.query(
          `UPDATE games SET word_display=$1, guessed_letters=$2 WHERE game_id=$3`,
          [wordDisplay.join(''), Array.from(guessed), id]
        );

        res.json({ success: true, correct });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.listen(PORT, () => {
      this.log(`🚀 سرور روی پورت ${PORT} اجرا شد`);
    });

    bot.on('message', (msg) => this.handleMessage(msg));
    bot.on('callback_query', (query) => this.handleCallbackQuery(query));
  }
}

// -------------------------------
// 🟢 شروع سرور
// -------------------------------
const wordly = new WordGameBot();
wordly.start();
