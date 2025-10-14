require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';

// تنظیمات PostgreSQL با پارامترهای بهینه برای render.com
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// Middleware
app.use(cors());
app.use(express.json());

// تنظیمات پیشرفته connection pool برای render.com
const poolConfig = {
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  // تنظیمات بهینه برای render.com
  max: 10, // کاهش تعداد connection های همزمان
  idleTimeoutMillis: 30000, // 30 ثانیه
  connectionTimeoutMillis: 10000, // 10 ثانیه timeout برای connection جدید
  maxUses: 7500, // حداکثر استفاده از هر connection قبل از بسته شدن
};

const pool = new Pool(poolConfig);

// مدیریت errors در pool
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// تابع برای تست connection به دیتابیس
async function testDatabaseConnection() {
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      console.log('Database connection successful:', result.rows[0]);
      client.release();
      return true;
    } catch (error) {
      console.error(`Database connection failed. Retries left: ${retries - 1}`, error.message);
      retries--;
      
      if (retries === 0) {
        console.error('All database connection attempts failed');
        return false;
      }
      
      // انتظار قبل از تلاش مجدد
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// ایجاد جداول مورد نیاز با مدیریت خطا
async function initializeDatabase() {
  try {
    console.log('Attempting to initialize database...');
    
    const connectionSuccess = await testDatabaseConnection();
    if (!connectionSuccess) {
      throw new Error('Could not establish database connection');
    }

    // ایجاد جدول بازی‌های فعال
    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_games (
        game_id VARCHAR(20) PRIMARY KEY,
        creator_id BIGINT NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        opponent_id BIGINT,
        opponent_name VARCHAR(255),
        word VARCHAR(50),
        category VARCHAR(100),
        max_attempts INTEGER NOT NULL DEFAULT 0,
        current_attempt INTEGER DEFAULT 0,
        used_letters TEXT DEFAULT '',
        correct_letters TEXT DEFAULT '',
        game_status VARCHAR(20) DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        help_used INTEGER DEFAULT 0
      )
    `);

    // ایجاد جدول امتیازات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        user_name VARCHAR(255) NOT NULL,
        score INTEGER NOT NULL,
        game_id VARCHAR(20) NOT NULL,
        time_spent INTEGER,
        hints_used INTEGER,
        correct_letters INTEGER,
        wrong_letters INTEGER,
        word_guessed BOOLEAN,
        played_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Database initialized successfully');
    return true;
  } catch (error) {
    console.error('Database initialization error:', error.message);
    return false;
  }
}

// راه‌اندازی ربات فقط اگر توکن وجود دارد
let bot;
if (BOT_TOKEN && BOT_TOKEN !== '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo') {
  bot = new Telegraf(BOT_TOKEN);
  
  // میدلور session
  bot.use(session());

  // میدلور برای ذخیره اطلاعات کاربر
  bot.use((ctx, next) => {
    if (ctx.from) {
      ctx.session = ctx.session || {};
      ctx.session.userId = ctx.from.id;
      ctx.session.username = ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : '');
    }
    return next();
  });

  // دستور start
  bot.start((ctx) => {
    const menuText = `🎮 به بازی Wordly خوش آمدید ${ctx.from.first_name}!

در این بازی می‌توانید با دوستان خود به رقابت بپردازید و کلمات را حدس بزنید.`;

    ctx.reply(menuText, Markup.inlineKeyboard([
      [Markup.button.webApp('🎮 شروع بازی دو نفره', `${WEB_APP_URL}/game.html`)],
      [Markup.button.callback('🏆 جدول رده‌بندی', 'leaderboard')],
      [Markup.button.callback('ℹ️ راهنما', 'help')]
    ]));
  });

  // نمایش جدول رده‌بندی
  bot.action('leaderboard', async (ctx) => {
    try {
      const result = await pool.query(`
        SELECT user_name, score, played_at 
        FROM leaderboard 
        ORDER BY score DESC 
        LIMIT 10
      `);
      
      let leaderboardText = '🏆 10 نفر برتر:\n\n';
      
      if (result.rows.length === 0) {
        leaderboardText += 'هنوز بازی‌ای ثبت نشده است.';
      } else {
        result.rows.forEach((row, index) => {
          const date = new Date(row.played_at).toLocaleDateString('fa-IR');
          leaderboardText += `${index + 1}. ${row.user_name} - ${row.score} امتیاز\n`;
        });
      }
      
      ctx.reply(leaderboardText, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت', 'back_to_menu')]
      ]));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      ctx.reply('خطا در دریافت اطلاعات.');
    }
  });

  // راهنمای بازی
  bot.action('help', (ctx) => {
    const helpText = `📖 راهنمای بازی:

🎮 نحوه بازی:
1. "شروع بازی دو نفره" را بزنید
2. لینک را برای دوست خود بفرستید
3. پس از پیوستن دوست، کلمه و دسته‌بندی را وارد کنید
4. دوست شما باید کلمه را حدس بزند`;

    ctx.reply(helpText, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت', 'back_to_menu')]
    ]));
  });

  // بازگشت به منوی اصلی
  bot.action('back_to_menu', (ctx) => {
    ctx.deleteMessage();
    ctx.reply('منوی اصلی:', Markup.inlineKeyboard([
      [Markup.button.webApp('🎮 شروع بازی دو نفره', `${WEB_APP_URL}/game.html`)],
      [Markup.button.callback('🏆 جدول رده‌بندی', 'leaderboard')],
      [Markup.button.callback('ℹ️ راهنما', 'help')]
    ]));
  });

  // راه‌اندازی ربات
  bot.launch().then(() => {
    console.log('Bot is running');
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('Bot token not provided, running in API-only mode');
}

// Middleware برای مدیریت database errors
app.use(async (req, res, next) => {
  try {
    // تست connection قبل از هر درخواست
    await pool.query('SELECT 1');
    next();
  } catch (error) {
    console.error('Database connection lost, reconnecting...');
    await initializeDatabase();
    next();
  }
});

// API Routes با مدیریت خطا
app.post('/api/create-game', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const gameId = generateGameId();
    
    await pool.query(
      'INSERT INTO active_games (game_id, creator_id, creator_name) VALUES ($1, $2, $3)',
      [gameId, userId, userName]
    );
    
    res.json({ success: true, gameId });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ success: false, error: 'خطا در ایجاد بازی' });
  }
});

app.post('/api/join-game', async (req, res) => {
  try {
    const { gameId, userId, userName } = req.body;
    
    const result = await pool.query(
      'UPDATE active_games SET opponent_id = $1, opponent_name = $2, game_status = $3 WHERE game_id = $4 AND opponent_id IS NULL RETURNING *',
      [userId, userName, 'joined', gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'بازی یافت نشد' });
    }
    
    res.json({ success: true, game: result.rows[0] });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ success: false, error: 'خطا در پیوستن به بازی' });
  }
});

// سایر API ها به همان شکل قبلی (کوتاه شده برای brevity)
app.post('/api/set-word', async (req, res) => {
  try {
    const { gameId, word, category } = req.body;
    const maxAttempts = Math.floor(word.length * 1.5);
    
    const result = await pool.query(
      'UPDATE active_games SET word = $1, category = $2, max_attempts = $3, game_status = $4, started_at = NOW() WHERE game_id = $5 RETURNING *',
      [word.toUpperCase(), category, maxAttempts, 'active', gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'بازی یافت نشد' });
    }
    
    res.json({ success: true, maxAttempts });
  } catch (error) {
    console.error('Error setting word:', error);
    res.status(500).json({ success: false, error: 'خطا در ذخیره کلمه' });
  }
});

// سایر API ها...
app.get('/api/game-status/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'بازی یافت نشد' });
    }
    
    res.json({ success: true, game: result.rows[0] });
  } catch (error) {
    console.error('Error fetching game status:', error);
    res.status(500).json({ success: false, error: 'خطا در دریافت وضعیت بازی' });
  }
});

// API سلامت
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// تابع برای تولید شناسه بازی
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// راه‌اندازی سرور
const PORT = process.env.PORT || 3000;

async function startServer() {
  console.log('Starting server...');
  
  // ابتدا دیتابیس رو initialize کن
  const dbInitialized = await initializeDatabase();
  
  if (!dbInitialized) {
    console.log('Server starting without database connection...');
  }
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check: http://0.0.0.0:${PORT}/health`);
  });
}

startServer();
