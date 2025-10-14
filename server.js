const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const path = require('path');
const app = express();

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';

// تنظیمات PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// اتصال به دیتابیس
const pool = new Pool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

// ایجاد جداول مورد نیاز
async function initializeDatabase() {
  try {
    // جدول بازی‌های فعال
    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_games (
        game_id VARCHAR(20) PRIMARY KEY,
        creator_id BIGINT NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        opponent_id BIGINT,
        opponent_name VARCHAR(255),
        word VARCHAR(50),
        category VARCHAR(100),
        max_attempts INTEGER NOT NULL,
        current_attempt INTEGER DEFAULT 0,
        used_letters TEXT DEFAULT '',
        correct_letters TEXT DEFAULT '',
        game_status VARCHAR(20) DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        help_used INTEGER DEFAULT 0
      )
    `);

    // جدول امتیازات
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
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

initializeDatabase();

const bot = new Telegraf(BOT_TOKEN);

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

در این بازی می‌توانید با دوستان خود به رقابت بپردازید و کلمات را حدس بزنید.

🔄 امکانات بازی:
• بازی دو نفره
• سیستم امتیازدهی پیشرفته
• جدول رده‌بندی
• رابط کاربری زیبا و فارسی`;

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
    
    let leaderboardText = '🏆 10 نفر برتر جدول رده‌بندی:\n\n';
    
    if (result.rows.length === 0) {
      leaderboardText += 'هنوز بازی‌ای ثبت نشده است.';
    } else {
      result.rows.forEach((row, index) => {
        const date = new Date(row.played_at).toLocaleDateString('fa-IR');
        leaderboardText += `${index + 1}. ${row.user_name} - ${row.score} امتیاز (${date})\n`;
      });
    }
    
    ctx.reply(leaderboardText, Markup.inlineKeyboard([
      [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'back_to_menu')]
    ]));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    ctx.reply('خطا در دریافت اطلاعات جدول رده‌بندی.');
  }
});

// راهنمای بازی
bot.action('help', (ctx) => {
  const helpText = `📖 راهنمای بازی Wordly:

🎮 نحوه بازی:
1. ابتدا با کلیک روی "شروع بازی دو نفره" یک بازی جدید ایجاد کنید
2. لینک بازی را برای دوست خود ارسال کنید
3. پس از پیوستن دوستتان، کلمه و دسته‌بندی آن را وارد کنید
4. دوست شما باید کلمه را با توجه به تعداد حروف و دسته‌بندی حدس بزند

📊 سیستم امتیازدهی:
• حدس صحیح کلمه: 100 امتیاز
• هر حرف صحیح: 10 امتیاز
• هر حرف غلط: -5 امتیاز
• استفاده از راهنما: -15 امتیاز
• امتیاز زمان: (زمان کمتر = امتیاز بیشتر)

🎯 نکات:
• تعداد حدس‌ها 1.5 برابر تعداد حروف کلمه است
• حروف تکراری فقط یک بار محاسبه می‌شوند
• می‌توانید حداکثر دو بار از راهنما استفاده کنید`;

  ctx.reply(helpText, Markup.inlineKeyboard([
    [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'back_to_menu')]
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

// تنظیم express برای سرو فایل‌های استاتیک
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API برای ایجاد بازی جدید
app.post('/api/create-game', async (req, res) => {
  try {
    const { userId, userName } = req.body;
    const gameId = generateGameId();
    
    await pool.query(
      'INSERT INTO active_games (game_id, creator_id, creator_name, max_attempts) VALUES ($1, $2, $3, 0)',
      [gameId, userId, userName]
    );
    
    res.json({ success: true, gameId });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ success: false, error: 'خطا در ایجاد بازی' });
  }
});

// API برای پیوستن به بازی
app.post('/api/join-game', async (req, res) => {
  try {
    const { gameId, userId, userName } = req.body;
    
    const result = await pool.query(
      'UPDATE active_games SET opponent_id = $1, opponent_name = $2, game_status = $3 WHERE game_id = $4 AND opponent_id IS NULL RETURNING *',
      [userId, userName, 'joined', gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'بازی یافت نشد یا قبلاً پر شده است' });
    }
    
    res.json({ success: true, game: result.rows[0] });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ success: false, error: 'خطا در پیوستن به بازی' });
  }
});

// API برای ذخیره کلمه
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

// API برای ثبت حدس
app.post('/api/make-guess', async (req, res) => {
  try {
    const { gameId, letter } = req.body;
    const upperLetter = letter.toUpperCase();
    
    // دریافت اطلاعات بازی
    const gameResult = await pool.query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'بازی یافت نشد' });
    }
    
    const game = gameResult.rows[0];
    const word = game.word;
    const usedLetters = game.used_letters || '';
    const correctLetters = game.correct_letters || '';
    let currentAttempt = game.current_attempt;
    
    // بررسی تکراری نبودن حرف
    if (usedLetters.includes(upperLetter)) {
      return res.json({ 
        success: true, 
        duplicate: true, 
        correct: false, 
        gameOver: false,
        currentAttempt,
        maxAttempts: game.max_attempts
      });
    }
    
    // بررسی صحیح بودن حرف
    const isCorrect = word.includes(upperLetter);
    let newUsedLetters = usedLetters + upperLetter;
    let newCorrectLetters = correctLetters;
    
    if (isCorrect && !correctLetters.includes(upperLetter)) {
      newCorrectLetters = correctLetters + upperLetter;
    }
    
    // افزایش تعداد حدس‌ها
    currentAttempt++;
    
    // بررسی پایان بازی
    let gameOver = false;
    let wordGuessed = false;
    
    if (isCorrect) {
      // بررسی اینکه آیا همه حروف کلمه حدس زده شده‌اند
      const allLettersGuessed = word.split('').every(char => 
        newCorrectLetters.includes(char) || char === ' '
      );
      
      if (allLettersGuessed) {
        gameOver = true;
        wordGuessed = true;
      }
    }
    
    if (currentAttempt >= game.max_attempts && !wordGuessed) {
      gameOver = true;
    }
    
    // به‌روزرسانی بازی
    await pool.query(
      'UPDATE active_games SET used_letters = $1, correct_letters = $2, current_attempt = $3, game_status = $4 WHERE game_id = $5',
      [newUsedLetters, newCorrectLetters, currentAttempt, gameOver ? 'finished' : 'active', gameId]
    );
    
    // اگر بازی تمام شده، امتیاز را محاسبه و ذخیره کنید
    if (gameOver) {
      await calculateAndSaveScore(gameId, wordGuessed, currentAttempt, game.help_used);
    }
    
    res.json({
      success: true,
      correct: isCorrect,
      gameOver,
      wordGuessed,
      currentAttempt,
      maxAttempts: game.max_attempts,
      correctLetters: newCorrectLetters,
      word: gameOver ? word : undefined
    });
    
  } catch (error) {
    console.error('Error making guess:', error);
    res.status(500).json({ success: false, error: 'خطا در ثبت حدس' });
  }
});

// API برای استفاده از راهنما
app.post('/api/use-hint', async (req, res) => {
  try {
    const { gameId } = req.body;
    
    const gameResult = await pool.query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'بازی یافت نشد' });
    }
    
    const game = gameResult.rows[0];
    
    if (game.help_used >= 2) {
      return res.json({ success: false, error: 'شما بیشتر از دو بار نمی‌توانید از راهنما استفاده کنید' });
    }
    
    // پیدا کردن یک حرف تصادفی که هنوز حدس زده نشده
    const word = game.word;
    const correctLetters = game.correct_letters || '';
    const unusedLetters = word.split('').filter(char => 
      char !== ' ' && !correctLetters.includes(char)
    );
    
    if (unusedLetters.length === 0) {
      return res.json({ success: false, error: 'همه حروف قبلاً حدس زده شده‌اند' });
    }
    
    const randomLetter = unusedLetters[Math.floor(Math.random() * unusedLetters.length)];
    
    // افزایش تعداد راهنماهای استفاده شده
    await pool.query(
      'UPDATE active_games SET help_used = help_used + 1 WHERE game_id = $1',
      [gameId]
    );
    
    res.json({
      success: true,
      hint: randomLetter,
      hintsUsed: game.help_used + 1
    });
    
  } catch (error) {
    console.error('Error using hint:', error);
    res.status(500).json({ success: false, error: 'خطا در استفاده از راهنما' });
  }
});

// API برای دریافت وضعیت بازی
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

// تابع برای تولید شناسه بازی
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// تابع برای محاسبه و ذخیره امتیاز
async function calculateAndSaveScore(gameId, wordGuessed, attempts, hintsUsed) {
  try {
    const gameResult = await pool.query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) return;
    
    const game = gameResult.rows[0];
    const word = game.word;
    const correctLetters = game.correct_letters || '';
    
    // محاسبه امتیاز
    let score = 0;
    
    // امتیاز برای حدس صحیح کلمه
    if (wordGuessed) {
      score += 100;
    }
    
    // امتیاز برای حروف صحیح
    const uniqueCorrectLetters = [...new Set(correctLetters.split(''))];
    score += uniqueCorrectLetters.length * 10;
    
    // جریمه برای حروف غلط
    const usedLetters = game.used_letters || '';
    const wrongLetters = usedLetters.split('').filter(letter => 
      !word.includes(letter)
    );
    const uniqueWrongLetters = [...new Set(wrongLetters)];
    score -= uniqueWrongLetters.length * 5;
    
    // جریمه برای استفاده از راهنما
    score -= hintsUsed * 15;
    
    // امتیاز زمان (زمان کمتر = امتیاز بیشتر)
    const startTime = new Date(game.started_at);
    const endTime = new Date();
    const timeSpent = Math.floor((endTime - startTime) / 1000); // به ثانیه
    
    // اگر کمتر از 60 ثانیه باشد، امتیاز اضافه
    if (timeSpent < 60) {
      score += Math.floor((60 - timeSpent) / 5);
    }
    
    // اطمینان از مثبت بودن امتیاز
    score = Math.max(score, 0);
    
    // ذخیره امتیاز برای حدس‌زن
    await pool.query(
      `INSERT INTO leaderboard 
      (user_id, user_name, score, game_id, time_spent, hints_used, correct_letters, wrong_letters, word_guessed) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        game.opponent_id,
        game.opponent_name,
        score,
        gameId,
        timeSpent,
        hintsUsed,
        uniqueCorrectLetters.length,
        uniqueWrongLetters.length,
        wordGuessed
      ]
    );
    
  } catch (error) {
    console.error('Error calculating score:', error);
  }
}

// راه‌اندازی سرور
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// راه‌اندازی ربات
bot.launch().then(() => {
  console.log('Bot is running');
});

// فعال‌سازی graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
