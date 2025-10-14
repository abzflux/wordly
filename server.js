const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// اتصال به دیتابیس PostgreSQL
const pool = new Pool({
  user: 'abolfazl',
  host: 'dpg-d3n66fali9vc738qmm20-a.frankfurt-postgres.render.com',
  database: 'wordlydb_446t',
  password: 'SlnZemyMHIZzEHKgC5IKiyJECwd8oB6h',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

// راه‌اندازی بات تلگرام
const bot = new Telegraf('8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ');

// ایجاد جداول (فقط یک بار)
async function createTables() {
  try {
    // جدول کاربران
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول بازی‌ها
    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) UNIQUE NOT NULL,
        creator_id BIGINT NOT NULL REFERENCES users(telegram_id),
        player_id BIGINT REFERENCES users(telegram_id),
        target_word VARCHAR(50) NOT NULL,
        max_attempts INTEGER NOT NULL,
        current_attempt INTEGER DEFAULT 0,
        game_status VARCHAR(20) DEFAULT 'waiting',
        used_hints INTEGER DEFAULT 0,
        guessed_letters TEXT[] DEFAULT '{}',
        correct_letters TEXT[] DEFAULT '{}',
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        creator_score INTEGER DEFAULT 0,
        player_score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول حدس‌ها
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guesses (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id),
        user_id BIGINT REFERENCES users(telegram_id),
        guess_word VARCHAR(50) NOT NULL,
        guess_result JSONB NOT NULL,
        attempt_number INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
}

// ثبت کاربر جدید
async function registerUser(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || '';
  const firstName = ctx.from.first_name || '';
  const lastName = ctx.from.last_name || '';

  try {
    await pool.query(
      'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_id) DO NOTHING',
      [telegramId, username, firstName, lastName]
    );
    
    return `خوش آمدید ${firstName} عزیز!`;
  } catch (error) {
    console.error('Error registering user:', error);
    return 'خطا در ثبت کاربر!';
  }
}

// ایجاد منوی اصلی
function getMainMenu() {
  return Markup.keyboard([
    ['🎮 شروع بازی دونفره', '🏆 لیگ'],
    ['📊 رتبه‌بندی', 'ℹ️ راهنما']
  ]).resize();
}

// ایجاد کد بازی تصادفی
function generateGameCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ایجاد بازی جدید
async function createNewGame(creatorId, targetWord) {
  const gameCode = generateGameCode();
  const maxAttempts = Math.floor(targetWord.length * 1.5);

  try {
    const result = await pool.query(
      `INSERT INTO games (code, creator_id, target_word, max_attempts) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [gameCode, creatorId, targetWord.toLowerCase(), maxAttempts]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating game:', error);
    return null;
  }
}

// دریافت لیست بازی‌های در انتظار
async function getWaitingGames() {
  try {
    const result = await pool.query(`
      SELECT g.*, u.username as creator_username 
      FROM games g 
      JOIN users u ON g.creator_id = u.telegram_id 
      WHERE g.game_status = 'waiting'
    `);
    return result.rows;
  } catch (error) {
    console.error('Error getting waiting games:', error);
    return [];
  }
}

// پیوستن به بازی
async function joinGame(gameCode, playerId) {
  try {
    const result = await pool.query(
      `UPDATE games 
       SET player_id = $1, game_status = 'active' 
       WHERE code = $2 AND game_status = 'waiting' 
       RETURNING *`,
      [playerId, gameCode]
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error joining game:', error);
    return null;
  }
}

// محاسبه امتیاز
function calculateScore(targetWord, correctLetters, wrongLetters, usedHints, timeSpent) {
  const baseScore = 100;
  const correctBonus = correctLetters.length * 10;
  const wrongPenalty = wrongLetters.length * 5;
  const hintPenalty = usedHints * 15;
  const timePenalty = Math.floor(timeSpent / 10);
  
  return Math.max(0, baseScore + correctBonus - wrongPenalty - hintPenalty - timePenalty);
}

// هندلر شروع
bot.start(async (ctx) => {
  const welcomeMessage = await registerUser(ctx);
  await ctx.reply(welcomeMessage, getMainMenu());
});

// هندلر شروع بازی دونفره
bot.hears('🎮 شروع بازی دونفره', async (ctx) => {
  await ctx.reply(
    'لطفاً کلمه‌ای را برای حدس زدن حریف وارد کنید:',
    Markup.removeKeyboard()
  );
});

// هندلر لیگ
bot.hears('🏆 لیگ', async (ctx) => {
  const waitingGames = await getWaitingGames();
  
  if (waitingGames.length === 0) {
    await ctx.reply('در حال حاضر هیچ بازی در انتظار وجود ندارد.', getMainMenu());
    return;
  }

  let message = '🎮 بازی‌های در انتظار:\n\n';
  waitingGames.forEach((game, index) => {
    message += `${index + 1}. کد: ${game.code} - ایجاد شده توسط: ${game.creator_username}\n`;
  });

  message += '\nبرای پیوستن به بازی، کد بازی را ارسال کنید.';
  await ctx.reply(message, Markup.removeKeyboard());
});

// هندلر رتبه‌بندی
bot.hears('📊 رتبه‌بندی', async (ctx) => {
  try {
    const result = await pool.query(`
      SELECT username, score 
      FROM users 
      WHERE score > 0 
      ORDER BY score DESC 
      LIMIT 10
    `);

    let message = '🏆 10 رتبه برتر:\n\n';
    result.rows.forEach((user, index) => {
      message += `${index + 1}. ${user.username || 'بی‌نام'}: ${user.score} امتیاز\n`;
    });

    await ctx.reply(message, getMainMenu());
  } catch (error) {
    console.error('Error getting rankings:', error);
    await ctx.reply('خطا در دریافت رتبه‌بندی!', getMainMenu());
  }
});

// هندلر راهنما
bot.hears('ℹ️ راهنما', (ctx) => {
  const helpMessage = `
🎮 راهنمای بازی Wordly:

1. **شروع بازی دونفره**: یک بازی جدید ایجاد کنید
2. **لیگ**: به بازی‌های موجود بپیوندید
3. **رتبه‌بندی**: مشاهده بهترین بازیکنان
4. **راهنما**: این صفحه

📝 قوانین بازی:
- کلمه را حرف به حرف حدس بزنید
- حروف تکراری مجاز نیستند
- ۲ بار می‌توانید راهنمایی بگیرید
- امتیاز بر اساس سرعت و دقت محاسبه می‌شود
  `;

  ctx.reply(helpMessage, getMainMenu());
});

// هندلر دریافت کلمه برای بازی جدید
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  // اگر متن یک کد بازی باشد (6 حرفی)
  if (text.length === 6 && /^[A-Z0-9]+$/i.test(text)) {
    const game = await joinGame(text.toUpperCase(), userId);
    
    if (game) {
      // اطلاع به سازنده بازی
      try {
        await ctx.telegram.sendMessage(
          game.creator_id,
          `🎉 کاربر ${ctx.from.first_name} به بازی شما پیوست!\n\n` +
          `برای شروع بازی به لینک زیر مراجعه کنید:\n` +
          `https://wordly.ct.ws/game.html?game=${game.code}`
        );
      } catch (error) {
        console.error('Error notifying creator:', error);
      }

      await ctx.reply(
        `✅ با موفقیت به بازی پیوستید!\n\n` +
        `برای شروع بازی به لینک زیر مراجعه کنید:\n` +
        `https://wordly.ct.ws/game.html?game=${game.code}`,
        getMainMenu()
      );
    } else {
      await ctx.reply('❌ بازی یافت نشود یا قبلاً شروع شده است!', getMainMenu());
    }
    return;
  }

  // اگر متن یک کلمه برای بازی جدید باشد
  if (text.length >= 3 && text.length <= 10 && /^[آ-یa-z]+$/i.test(text)) {
    const game = await createNewGame(userId, text);
    
    if (game) {
      await ctx.reply(
        `🎮 بازی جدید ایجاد شد!\n\n` +
        `📝 کلمه هدف: ${text}\n` +
        `🔢 کد بازی: ${game.code}\n` +
        `🎯 تعداد حدس مجاز: ${game.max_attempts}\n\n` +
        `منتظر پیوستن حریف باشید...\n\n` +
        `برای مشاهده بازی به لینک زیر مراجعه کنید:\n` +
        `https://wordly.ct.ws/game.html?game=${game.code}`,
        getMainMenu()
      );
    } else {
      await ctx.reply('❌ خطا در ایجاد بازی!', getMainMenu());
    }
    return;
  }
});

// API Routes

// دریافت اطلاعات بازی
app.get('/api/game/:code', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*, 
             u1.username as creator_username,
             u2.username as player_username
      FROM games g
      LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
      LEFT JOIN users u2 ON g.player_id = u2.telegram_id
      WHERE g.code = $1
    `, [req.params.code]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error getting game:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ثبت حدس
app.post('/api/game/:code/guess', async (req, res) => {
  const { userId, guess } = req.body;
  const gameCode = req.params.code;

  try {
    // دریافت اطلاعات بازی
    const gameResult = await pool.query(
      'SELECT * FROM games WHERE code = $1',
      [gameCode]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameResult.rows[0];
    const targetWord = game.target_word;
    const guessWord = guess.toLowerCase();

    // بررسی اعتبار حدس
    if (guessWord.length !== targetWord.length) {
      return res.status(400).json({ error: 'طول کلمه حدس با کلمه هدف برابر نیست' });
    }

    // بررسی حروف تکراری
    const guessedLetters = game.guessed_letters || [];
    const newLetters = guessWord.split('').filter(letter => !guessedLetters.includes(letter));
    
    if (newLetters.length === 0) {
      return res.status(400).json({ error: 'همه این حروف قبلاً حدس زده شده‌اند' });
    }

    // بررسی نتیجه حدس
    const result = [];
    let correctCount = 0;

    for (let i = 0; i < targetWord.length; i++) {
      if (guessWord[i] === targetWord[i]) {
        result.push({ letter: guessWord[i], status: 'correct', position: i });
        correctCount++;
      } else if (targetWord.includes(guessWord[i])) {
        result.push({ letter: guessWord[i], status: 'wrong-position', position: i });
      } else {
        result.push({ letter: guessWord[i], status: 'wrong', position: i });
      }
    }

    // به‌روزرسانی بازی
    const newGuessedLetters = [...new Set([...guessedLetters, ...guessWord.split('')])];
    const newCorrectLetters = [...new Set([...(game.correct_letters || []), ...guessWord.split('').filter((letter, i) => letter === targetWord[i])])];

    await pool.query(
      `UPDATE games 
       SET current_attempt = current_attempt + 1,
           guessed_letters = $1,
           correct_letters = $2
       WHERE code = $3`,
      [newGuessedLetters, newCorrectLetters, gameCode]
    );

    // ثبت حدس
    await pool.query(
      `INSERT INTO guesses (game_id, user_id, guess_word, guess_result, attempt_number)
       VALUES ($1, $2, $3, $4, $5)`,
      [game.id, userId, guessWord, { result }, game.current_attempt + 1]
    );

    // بررسی پایان بازی
    let gameStatus = game.game_status;
    let endTime = game.end_time;

    if (correctCount === targetWord.length) {
      gameStatus = 'completed';
      endTime = new Date();
      
      // محاسبه امتیاز
      const timeSpent = Math.floor((endTime - game.start_time) / 1000);
      const wrongLetters = newGuessedLetters.filter(letter => !targetWord.includes(letter));
      const score = calculateScore(targetWord, newCorrectLetters, wrongLetters, game.used_hints, timeSpent);

      await pool.query(
        `UPDATE games 
         SET game_status = $1, end_time = $2, player_score = $3
         WHERE code = $4`,
        [gameStatus, endTime, score, gameCode]
      );

      // به‌روزرسانی امتیاز کاربر
      await pool.query(
        'UPDATE users SET score = score + $1 WHERE telegram_id = $2',
        [score, userId]
      );
    } else if (game.current_attempt + 1 >= game.max_attempts) {
      gameStatus = 'failed';
      endTime = new Date();
      
      await pool.query(
        `UPDATE games 
         SET game_status = $1, end_time = $2
         WHERE code = $3`,
        [gameStatus, endTime, gameCode]
      );
    }

    res.json({
      result,
      correctCount,
      totalLetters: targetWord.length,
      attemptsLeft: game.max_attempts - (game.current_attempt + 1),
      gameStatus: gameStatus || game.game_status,
      score: gameStatus === 'completed' ? calculateScore(targetWord, newCorrectLetters, 
              newGuessedLetters.filter(letter => !targetWord.includes(letter)), 
              game.used_hints, Math.floor((endTime - game.start_time) / 1000)) : 0
    });

  } catch (error) {
    console.error('Error processing guess:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// درخواست راهنمایی
app.post('/api/game/:code/hint', async (req, res) => {
  const { userId } = req.body;
  const gameCode = req.params.code;

  try {
    const gameResult = await pool.query(
      'SELECT * FROM games WHERE code = $1',
      [gameCode]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameResult.rows[0];

    // بررسی تعداد راهنمایی‌های استفاده شده
    if (game.used_hints >= 2) {
      return res.status(400).json({ error: 'حداکثر تعداد راهنمایی استفاده شده است' });
    }

    // پیدا کردن یک حرف تصادفی که هنوز حدس زده نشده
    const targetWord = game.target_word;
    const guessedLetters = game.guessed_letters || [];
    const unguessedLetters = targetWord.split('').filter(letter => !guessedLetters.includes(letter));

    if (unguessedLetters.length === 0) {
      return res.status(400).json({ error: 'هیچ حرفی برای راهنمایی وجود ندارد' });
    }

    const randomHint = unguessedLetters[Math.floor(Math.random() * unguessedLetters.length)];
    const hintPosition = targetWord.indexOf(randomHint);

    // به‌روزرسانی تعداد راهنمایی‌ها
    await pool.query(
      'UPDATE games SET used_hints = used_hints + 1 WHERE code = $1',
      [gameCode]
    );

    res.json({
      hint: randomHint,
      position: hintPosition,
      hintsUsed: game.used_hints + 1,
      hintsLeft: 2 - (game.used_hints + 1)
    });

  } catch (error) {
    console.error('Error processing hint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// دریافت تاریخچه حدس‌ها
app.get('/api/game/:code/guesses', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*, u.username 
      FROM guesses g 
      JOIN users u ON g.user_id = u.telegram_id 
      WHERE g.game_id = (SELECT id FROM games WHERE code = $1)
      ORDER BY g.attempt_number
    `, [req.params.code]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error getting guesses:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// مسیر اصلی برای تست
app.get('/', (req, res) => {
  res.json({ 
    message: 'Wordly Bot Server is running!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// راه‌اندازی سرور
async function startServer() {
  await createTables();
  
  // در Render از webhook استفاده می‌کنیم
  if (process.env.NODE_ENV === 'production') {
    const WEBHOOK_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/telegram-webhook`;
    
    // تنظیم webhook
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log('Webhook set to:', WEBHOOK_URL);
    
    // مسیر webhook برای تلگرام
    app.use(bot.webhookCallback('/telegram-webhook'));
  } else {
    // در محیط توسعه از polling استفاده می‌کنیم
    bot.launch();
    console.log('Bot started in development mode (polling)');
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Available at: https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + PORT}`);
  });
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

startServer();
