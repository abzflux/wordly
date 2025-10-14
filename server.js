const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// فعال کردن CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const bot = new Telegraf(BOT_TOKEN);

// وضعیت کاربران
const userStates = new Map();

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

    // جدول کاربران وب
    await pool.query(`
      CREATE TABLE IF NOT EXISTS web_users (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) UNIQUE NOT NULL,
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
        user_type VARCHAR(10) NOT NULL,
        user_identifier VARCHAR(50) NOT NULL,
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

// ثبت کاربر جدید تلگرام
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

// ثبت کاربر وب
async function registerWebUser(userId) {
  try {
    await pool.query(
      'INSERT INTO web_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
      [userId]
    );
    return true;
  } catch (error) {
    console.error('Error registering web user:', error);
    return false;
  }
}

// منوی اصلی
function getMainMenu() {
  return Markup.keyboard([
    ['🎮 شروع بازی جدید', '🏆 پیوستن به بازی'],
    ['📊 رتبه‌بندی جهانی', '📋 بازی‌های فعال من'],
    ['ℹ️ راهنمای بازی', '👤 پروفایل من']
  ]).resize();
}

// منوی بازگشت
function getBackMenu() {
  return Markup.keyboard([
    ['🔙 بازگشت به منوی اصلی']
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
      ORDER BY g.created_at DESC
      LIMIT 10
    `);
    return result.rows;
  } catch (error) {
    console.error('Error getting waiting games:', error);
    return [];
  }
}

// دریافت بازی‌های فعال کاربر
async function getUserActiveGames(userId) {
  try {
    const result = await pool.query(`
      SELECT g.*, 
             u1.username as creator_username,
             u2.username as player_username
      FROM games g
      LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
      LEFT JOIN users u2 ON g.player_id = u2.telegram_id
      WHERE (g.creator_id = $1 OR g.player_id = $1) 
        AND g.game_status = 'active'
      ORDER BY g.created_at DESC
    `, [userId]);

    return result.rows;
  } catch (error) {
    console.error('Error getting user games:', error);
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

// دریافت اطلاعات پروفایل کاربر
async function getUserProfile(userId) {
  try {
    const result = await pool.query(`
      SELECT u.*,
             (SELECT COUNT(*) FROM games WHERE creator_id = u.telegram_id) as created_games,
             (SELECT COUNT(*) FROM games WHERE player_id = u.telegram_id) as joined_games,
             (SELECT COUNT(*) FROM games WHERE (creator_id = u.telegram_id OR player_id = u.telegram_id) AND game_status = 'completed') as completed_games
      FROM users u
      WHERE u.telegram_id = $1
    `, [userId]);

    return result.rows[0];
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

// هندلر شروع
bot.start(async (ctx) => {
  const welcomeMessage = await registerUser(ctx);
  userStates.set(ctx.from.id, 'main');
  
  await ctx.reply(
    `${welcomeMessage}\n\n` +
    `🎮 به بازی Wordly خوش آمدید!\n` +
    `یک بازی کلمه‌ای جذاب و رقابتی\n\n` +
    `لطفاً یکی از گزینه‌های زیر را انتخاب کنید:`,
    getMainMenu()
  );
});

// هندلر بازگشت به منوی اصلی
bot.hears('🔙 بازگشت به منوی اصلی', async (ctx) => {
  userStates.set(ctx.from.id, 'main');
  await ctx.reply(
    'منوی اصلی:',
    getMainMenu()
  );
});

// هندلر شروع بازی جدید
bot.hears('🎮 شروع بازی جدید', async (ctx) => {
  userStates.set(ctx.from.id, 'waiting_for_word');
  await ctx.reply(
    '📝 لطفاً کلمه‌ای را برای حدس زدن حریف وارد کنید:\n\n' +
    '• کلمه باید بین ۳ تا ۱۰ حرف باشد\n' +
    '• فقط حروف فارسی مجاز است\n' +
    '• مثال: سلام، کتاب، کامپیوتر\n\n' +
    'برای لغو، از دکمه بازگشت استفاده کنید.',
    getBackMenu()
  );
});

// هندلر پیوستن به بازی
bot.hears('🏆 پیوستن به بازی', async (ctx) => {
  const waitingGames = await getWaitingGames();
  
  if (waitingGames.length === 0) {
    await ctx.reply(
      '⏳ در حال حاضر هیچ بازی در انتظار وجود ندارد.\n\n' +
      'می‌توانید خودتان یک بازی جدید ایجاد کنید!',
      getMainMenu()
    );
    return;
  }

  let message = '🎮 بازی‌های در انتظار:\n\n';
  waitingGames.forEach((game, index) => {
    message += `${index + 1}. کد: ${game.code}\n`;
    message += `   ایجاد شده توسط: ${game.creator_username}\n`;
    message += `   تعداد حروف: ${game.target_word.length}\n`;
    message += `   تعداد حدس: ${game.max_attempts}\n\n`;
  });

  message += 'برای پیوستن به بازی، کد ۶ رقمی بازی را ارسال کنید.\n';
  message += 'برای بازگشت، از دکمه زیر استفاده کنید.';

  userStates.set(ctx.from.id, 'waiting_for_game_code');
  await ctx.reply(message, getBackMenu());
});

// هندلر رتبه‌بندی جهانی
bot.hears('📊 رتبه‌بندی جهانی', async (ctx) => {
  try {
    const result = await pool.query(`
      SELECT username, score, created_at 
      FROM users 
      WHERE score > 0 
      ORDER BY score DESC 
      LIMIT 15
    `);

    let message = '🏆 ۱۵ رتبه برتر جهانی:\n\n';
    
    if (result.rows.length === 0) {
      message += 'هنوز هیچ امتیازی ثبت نشده است!\n';
      message += 'اولین نفری باشید که بازی می‌کند!';
    } else {
      result.rows.forEach((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        message += `${medal} ${user.username || 'بی‌نام'}\n`;
        message += `   امتیاز: ${user.score}\n\n`;
      });
    }

    await ctx.reply(message, getMainMenu());
  } catch (error) {
    console.error('Error getting rankings:', error);
    await ctx.reply('❌ خطا در دریافت رتبه‌بندی!', getMainMenu());
  }
});

// هندلر بازی‌های فعال من
bot.hears('📋 بازی‌های فعال من', async (ctx) => {
  const activeGames = await getUserActiveGames(ctx.from.id);
  
  if (activeGames.length === 0) {
    await ctx.reply(
      '📭 شما هیچ بازی فعالی ندارید.\n\n' +
      'می‌توانید یک بازی جدید ایجاد کنید یا به بازی‌های موجود بپیوندید!',
      getMainMenu()
    );
    return;
  }

  let message = '🎯 بازی‌های فعال شما:\n\n';
  
  activeGames.forEach((game, index) => {
    const role = game.creator_id === ctx.from.id ? 'سازنده' : 'بازیکن';
    const opponent = game.creator_id === ctx.from.id ? 
      (game.player_username || 'در انتظار بازیکن') : 
      game.creator_username;
    
    message += `${index + 1}. کد: ${game.code}\n`;
    message += `   نقش: ${role}\n`;
    message += `   حریف: ${opponent}\n`;
    message += `   وضعیت: فعال\n`;
    message += `   لینک بازی: https://wordlybot.ct.ws/game.html?game=${game.code}\n\n`;
  });

  message += 'برای بازی کردن، روی لینک بازی کلیک کنید.';

  await ctx.reply(message, getMainMenu());
});

// هندلر راهنمای بازی
bot.hears('ℹ️ راهنمای بازی', async (ctx) => {
  const helpMessage = `
🎮 راهنمای کامل بازی Wordly:

📝 **چگونه بازی کنیم:**
1. یک بازی جدید ایجاد کنید یا به بازی موجود بپیوندید
2. در صفحه وب بازی، کلمه را حرف به حرف حدس بزنید
3. از راهنمایی‌ها هوشمندانه استفاده کنید
4. امتیاز خود را افزایش دهید

🎯 **قوانین بازی:**
• کلمه باید بین ۳ تا ۱۰ حرف باشد
• تعداد حدس: ۱.۵ برابر تعداد حروف کلمه
• حروف تکراری مجاز نیستند
• ۲ بار راهنمایی دارید (هر بار ۱۵ امتیاز هزینه)

🏆 **سیستم امتیازدهی:**
• امتیاز پایه: ۱۰۰
• هر حرف صحیح: +۱۰ امتیاز
• هر حرف اشتباه: -۵ امتیاز
• هر راهنمایی: -۱۵ امتیاز
• پنالتی زمان: ۱ امتیاز به ازای هر ۱۰ ثانیه

💡 **نکات طلایی:**
• با حروف پرتکرار شروع کنید
• از راهنمایی‌ها در موقعیت‌های سخت استفاده کنید
• سرعت عمل داشته باشید اما دقت را فراموش نکنید

برای شروع بازی، از منوی اصلی استفاده کنید!
  `;

  await ctx.reply(helpMessage, getMainMenu());
});

// هندلر پروفایل من
bot.hears('👤 پروفایل من', async (ctx) => {
  const profile = await getUserProfile(ctx.from.id);
  
  if (!profile) {
    await ctx.reply('❌ خطا در دریافت اطلاعات پروفایل!', getMainMenu());
    return;
  }

  const profileMessage = `
👤 **پروفایل شما:**

📛 نام: ${profile.first_name} ${profile.last_name || ''}
🔖 نام کاربری: ${profile.username || 'ندارد'}
🏆 امتیاز: ${profile.score}

📊 **آمار بازی:**
🎮 بازی‌های ایجاد شده: ${profile.created_games}
🤝 بازی‌های پیوسته: ${profile.joined_games}
✅ بازی‌های تکمیل شده: ${profile.completed_games}

📅 عضو since: ${new Date(profile.created_at).toLocaleDateString('fa-IR')}

برای بهبود رتبه خود، بیشتر بازی کنید!
  `;

  await ctx.reply(profileMessage, getMainMenu());
});

// هندلر دریافت متن‌های عمومی
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;
  const userState = userStates.get(userId) || 'main';

  // اگر کاربر در حالت انتظار برای کلمه باشد
  if (userState === 'waiting_for_word') {
    if (text.length >= 3 && text.length <= 10 && /^[آ-یa-z]+$/i.test(text)) {
      const game = await createNewGame(userId, text);
      
      if (game) {
        userStates.set(userId, 'main');
        await ctx.reply(
          `🎉 بازی جدید ایجاد شد!\n\n` +
          `📝 کلمه هدف: ${text}\n` +
          `🔢 کد بازی: ${game.code}\n` +
          `🎯 تعداد حدس مجاز: ${game.max_attempts}\n` +
          `⏰ زمان ایجاد: ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
          `👥 منتظر پیوستن حریف باشید...\n\n` +
          `🔗 برای مشاهده بازی به لینک زیر مراجعه کنید:\n` +
          `https://wordlybot.ct.ws/game.html?game=${game.code}\n\n` +
          `📤 کد بازی را برای دوستان خود بفرستید!`,
          getMainMenu()
        );
      } else {
        await ctx.reply('❌ خطا در ایجاد بازی! لطفاً دوباره تلاش کنید.', getBackMenu());
      }
    } else {
      await ctx.reply(
        '❌ کلمه نامعتبر!\n\n' +
        'لطفاً یک کلمه فارسی بین ۳ تا ۱۰ حرف وارد کنید.\n' +
        'مثال: سلام، کتاب، کامپیوتر',
        getBackMenu()
      );
    }
    return;
  }

  // اگر کاربر در حالت انتظار برای کد بازی باشد
  if (userState === 'waiting_for_game_code') {
    if (text.length === 6 && /^[A-Z0-9]+$/i.test(text)) {
      const game = await joinGame(text.toUpperCase(), userId);
      
      if (game) {
        userStates.set(userId, 'main');
        
        // اطلاع به سازنده بازی
        try {
          await ctx.telegram.sendMessage(
            game.creator_id,
            `🎉 کاربر ${ctx.from.first_name} به بازی شما پیوست!\n\n` +
            `🔢 کد بازی: ${game.code}\n` +
            `👤 بازیکن جدید: ${ctx.from.first_name}\n` +
            `⏰ زمان پیوستن: ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
            `🔗 برای شروع بازی به لینک زیر مراجعه کنید:\n` +
            `https://wordlybot.ct.ws/game.html?game=${game.code}`
          );
        } catch (error) {
          console.error('Error notifying creator:', error);
        }

        await ctx.reply(
          `✅ با موفقیت به بازی پیوستید!\n\n` +
          `🔢 کد بازی: ${game.code}\n` +
          `👤 سازنده بازی: ${game.creator_username}\n` +
          `🎯 تعداد حدس: ${game.max_attempts}\n` +
          `⏰ زمان شروع: ${new Date().toLocaleTimeString('fa-IR')}\n\n` +
          `🔗 برای شروع بازی به لینک زیر مراجعه کنید:\n` +
          `https://wordlybot.ct.ws/game.html?game=${game.code}\n\n` +
          `🎮 موفق باشید!`,
          getMainMenu()
        );
      } else {
        await ctx.reply(
          '❌ بازی یافت نشد!\n\n' +
          'ممکن است:\n' +
          '• کد بازی اشتباه باشد\n' +
          '• بازی قبلاً شروع شده باشد\n' +
          '• بازی لغو شده باشد\n\n' +
          'لطفاً کد صحیح را وارد کنید یا بازی‌های موجود را بررسی کنید.',
          getBackMenu()
        );
      }
    } else {
      await ctx.reply(
        '❌ کد بازی نامعتبر!\n\n' +
        'لطفاً یک کد ۶ رقمی معتبر وارد کنید.\n' +
        'مثال: A1B2C3',
        getBackMenu()
      );
    }
    return;
  }

  // اگر هیچ حالتی匹配 نشد، به منوی اصلی برگرد
  userStates.set(userId, 'main');
  await ctx.reply(
    'لطفاً از منوی زیر انتخاب کنید:',
    getMainMenu()
  );
});

// API Routes (همانند قبل)...

// راه‌اندازی سرور
async function startServer() {
  await createTables();
  
  console.log('Server starting in production mode...');
  
  // تنظیم webhook برای تلگرام
  const WEBHOOK_URL = `https://wordlybot.onrender.com/telegram-webhook`;
  
  try {
    await bot.telegram.deleteWebhook();
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log('Webhook set successfully:', WEBHOOK_URL);
    console.log('Bot is ready with webhook!');
  } catch (error) {
    console.error('Error setting webhook:', error);
    console.log('Bot will work in polling mode as fallback');
    bot.launch().then(() => {
      console.log('Bot started in polling mode');
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Available at: https://wordlybot.onrender.com`);
    console.log('Bot is ready with full menu system!');
  });
}

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('Shutting down gracefully...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('Shutting down gracefully...');
  bot.stop('SIGTERM');
  process.exit(0);
});

startServer();
