require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';

console.log('🔧 Server starting...');
console.log('BOT_TOKEN:', BOT_TOKEN ? '✅ SET' : '❌ MISSING');

// Middleware
app.use(cors());
app.use(express.json());

// Route اصلی
app.get('/', (req, res) => {
  res.json({
    message: '🎮 Wordly Game Server',
    status: 'active',
    bot: BOT_TOKEN ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString()
  });
});

// Route دیباگ
app.get('/debug', (req, res) => {
  res.json({
    bot_status: BOT_TOKEN ? '✅ ACTIVE' : '❌ DISABLED',
    web_app_url: WEB_APP_URL,
    database: 'connected',
    timestamp: new Date().toISOString()
  });
});

// Route سلامت
app.get('/health', (req, res) => {
  res.json({ 
    status: '✅ OK',
    service: 'Wordly Game API',
    timestamp: new Date().toISOString()
  });
});

// راه‌اندازی دیتابیس
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: { rejectUnauthorized: false }
});

// راه‌اندازی ربات تلگرام
if (BOT_TOKEN) {
  console.log('🤖 Starting Telegram Bot...');
  
  try {
    const bot = new Telegraf(BOT_TOKEN);
    
    bot.use(session());

    // دستور start
    bot.start((ctx) => {
      console.log('🎯 /start received from:', ctx.from.first_name);
      
      const menuText = `🎮 به بازی Wordly خوش آمدید ${ctx.from.first_name}!

با دوستان خود به رقابت بپردازید و کلمات را حدس بزنید.`;

      return ctx.reply(menuText, Markup.inlineKeyboard([
        [Markup.button.webApp('🎮 شروع بازی دو نفره', `${WEB_APP_URL}/game.html`)],
        [Markup.button.callback('🏆 جدول رده‌بندی', 'leaderboard')],
        [Markup.button.callback('ℹ️ راهنما', 'help')]
      ]));
    });

    // نمایش جدول رده‌بندی
    bot.action('leaderboard', async (ctx) => {
      try {
        const result = await pool.query(`
          SELECT user_name, score FROM leaderboard 
          ORDER BY score DESC LIMIT 10
        `);
        
        let leaderboardText = '🏆 10 نفر برتر:\n\n';
        
        if (result.rows.length === 0) {
          leaderboardText += 'هنوز بازی‌ای ثبت نشده است.';
        } else {
          result.rows.forEach((row, index) => {
            leaderboardText += `${index + 1}. ${row.user_name} - ${row.score} امتیاز\n`;
          });
        }
        
        await ctx.reply(leaderboardText);
      } catch (error) {
        await ctx.reply('خطا در دریافت اطلاعات.');
      }
    });

    // راهنمای بازی
    bot.action('help', (ctx) => {
      const helpText = `📖 راهنمای بازی:

1. "شروع بازی دو نفره" را بزنید
2. لینک را برای دوست خود بفرستید
3. کلمه و دسته‌بندی را وارد کنید
4. دوست شما کلمه را حدس می‌زند`;

      return ctx.reply(helpText);
    });

    // راه‌اندازی ربات
    bot.launch().then(() => {
      console.log('✅ Telegram Bot is running!');
    });

  } catch (error) {
    console.error('❌ Bot startup error:', error);
  }
} else {
  console.log('⚠️ Bot is disabled - BOT_TOKEN not set');
}

// API Routes (ساده شده)
app.post('/api/create-game', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await pool.query(
      'INSERT INTO active_games (game_id, creator_id, creator_name) VALUES ($1, $2, $3)',
      [gameId, userId, userName]
    );
    
    res.json({ success: true, gameId });
  } catch (error) {
    res.status(500).json({ success: false, error: 'خطا در ایجاد بازی' });
  }
});

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
    res.status(500).json({ success: false, error: 'خطا در دریافت وضعیت بازی' });
  }
});

// راه‌اندازی سرور
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 URL: https://wordly-bot.onrender.com`);
});
