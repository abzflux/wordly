require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://wordly-bot.onrender.com';

console.log('🔧 Starting server...');
console.log('BOT_TOKEN:', BOT_TOKEN ? '✅ SET' : '❌ MISSING');

// Middleware
app.use(cors({
  origin: [WEB_APP_URL, 'https://wordly.ct.ws'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
    server_url: RENDER_URL,
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
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ایجاد جداول
async function initializeDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS active_games (
        game_id VARCHAR(20) PRIMARY KEY,
        creator_id BIGINT NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        opponent_id BIGINT,
        opponent_name VARCHAR(255),
        word VARCHAR(50),
        category VARCHAR(100),
        max_attempts INTEGER DEFAULT 0,
        current_attempt INTEGER DEFAULT 0,
        used_letters TEXT DEFAULT '',
        correct_letters TEXT DEFAULT '',
        game_status VARCHAR(20) DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        help_used INTEGER DEFAULT 0
      )
    `);

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

    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

// راه‌اندازی ربات تلگرام با Webhook
let bot;
if (BOT_TOKEN) {
  console.log('🤖 Initializing Telegram Bot with Webhook...');
  
  try {
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
        console.log('📊 Leaderboard requested by:', ctx.from.first_name);
        
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
        
        await ctx.reply(leaderboardText, Markup.inlineKeyboard([
          [Markup.button.callback('🔙 بازگشت به منو', 'back_to_menu')]
        ]));
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
        await ctx.reply('خطا در دریافت اطلاعات.');
      }
    });

    // راهنمای بازی
    bot.action('help', (ctx) => {
      console.log('📖 Help requested by:', ctx.from.first_name);
      
      const helpText = `📖 راهنمای بازی Wordly:

🎮 نحوه بازی:
1. روی "شروع بازی دو نفره" کلیک کنید
2. لینک بازی را برای دوست خود بفرستید
3. پس از پیوستن دوست، کلمه و دسته‌بندی را وارد کنید
4. دوست شما باید کلمه را حدس بزند

🎯 تعداد حدس: 1.5 برابر تعداد حروف کلمه
💡 راهنما: حداکثر ۲ بار (۱۵- امتیاز)
🏆 امتیاز: بر اساس سرعت و دقت`;

      return ctx.reply(helpText, Markup.inlineKeyboard([
        [Markup.button.callback('🔙 بازگشت به منو', 'back_to_menu')]
      ]));
    });

    // بازگشت به منوی اصلی
    bot.action('back_to_menu', (ctx) => {
      ctx.deleteMessage().catch(() => {});
      ctx.reply('منوی اصلی:', Markup.inlineKeyboard([
        [Markup.button.webApp('🎮 شروع بازی دو نفره', `${WEB_APP_URL}/game.html`)],
        [Markup.button.callback('🏆 جدول رده‌بندی', 'leaderboard')],
        [Markup.button.callback('ℹ️ راهنما', 'help')]
      ]));
    });

    // تنظیم Webhook
    const setupWebhook = async () => {
      try {
        const webhookUrl = `${RENDER_URL}/telegram-webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Webhook set to: ${webhookUrl}`);
      } catch (error) {
        console.error('❌ Webhook setup failed:', error);
      }
    };

    // Route برای Webhook
    app.post('/telegram-webhook', (req, res) => {
      bot.handleUpdate(req.body, res);
    });

    // راه‌اندازی Webhook
    setupWebhook();

    console.log('✅ Telegram Bot ready with Webhook');

  } catch (error) {
    console.error('❌ Bot initialization failed:', error);
  }
} else {
  console.log('⚠️ Bot is disabled - BOT_TOKEN not set');
}

// API Routes
app.post('/api/create-game', async (req, res) => {
  console.log('📝 Creating game...', req.body);
  
  try {
    const { userId, userName } = req.body;
    
    if (!userId || !userName) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId and userName are required' 
      });
    }

    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await pool.query(
      'INSERT INTO active_games (game_id, creator_id, creator_name) VALUES ($1, $2, $3)',
      [gameId, userId, userName]
    );
    
    console.log('✅ Game created:', gameId);
    res.json({ 
      success: true, 
      gameId,
      message: 'بازی با موفقیت ایجاد شد'
    });
  } catch (error) {
    console.error('❌ Error creating game:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطا در ایجاد بازی' 
    });
  }
});

app.post('/api/join-game', async (req, res) => {
  console.log('🔗 Joining game...', req.body);
  
  try {
    const { gameId, userId, userName } = req.body;
    
    const result = await pool.query(
      'UPDATE active_games SET opponent_id = $1, opponent_name = $2, game_status = $3 WHERE game_id = $4 AND opponent_id IS NULL RETURNING *',
      [userId, userName, 'joined', gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'بازی یافت نشد یا قبلاً پر شده است' 
      });
    }
    
    console.log('✅ Player joined game:', gameId);
    res.json({ 
      success: true, 
      game: result.rows[0],
      message: 'با موفقیت به بازی پیوستید'
    });
  } catch (error) {
    console.error('❌ Error joining game:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطا در پیوستن به بازی' 
    });
  }
});

app.post('/api/set-word', async (req, res) => {
  console.log('📝 Setting word...', req.body);
  
  try {
    const { gameId, word, category } = req.body;
    
    if (!word || !category) {
      return res.status(400).json({ 
        success: false, 
        error: 'کلمه و دسته‌بندی الزامی است' 
      });
    }

    const maxAttempts = Math.floor(word.length * 1.5);
    
    const result = await pool.query(
      'UPDATE active_games SET word = $1, category = $2, max_attempts = $3, game_status = $4, started_at = NOW() WHERE game_id = $5 RETURNING *',
      [word.toUpperCase(), category, maxAttempts, 'active', gameId]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'بازی یافت نشد' 
      });
    }
    
    console.log('✅ Word set for game:', gameId);
    res.json({ 
      success: true, 
      maxAttempts,
      message: 'کلمه با موفقیت تنظیم شد'
    });
  } catch (error) {
    console.error('❌ Error setting word:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطا در ذخیره کلمه' 
    });
  }
});

app.post('/api/make-guess', async (req, res) => {
  console.log('🎯 Making guess...', req.body);
  
  try {
    const { gameId, letter } = req.body;
    const upperLetter = letter.toUpperCase();
    
    const gameResult = await pool.query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'بازی یافت نشد' 
      });
    }
    
    const game = gameResult.rows[0];
    const word = game.word;
    const usedLetters = game.used_letters || '';
    const correctLetters = game.correct_letters || '';
    let currentAttempt = game.current_attempt;
    
    if (usedLetters.includes(upperLetter)) {
      return res.json({ 
        success: true, 
        duplicate: true, 
        correct: false, 
        gameOver: false,
        currentAttempt
      });
    }
    
    const isCorrect = word.includes(upperLetter);
    let newUsedLetters = usedLetters + upperLetter;
    let newCorrectLetters = correctLetters;
    
    if (isCorrect && !correctLetters.includes(upperLetter)) {
      newCorrectLetters = correctLetters + upperLetter;
    }
    
    currentAttempt++;
    
    let gameOver = false;
    let wordGuessed = false;
    
    if (isCorrect) {
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
    
    await pool.query(
      'UPDATE active_games SET used_letters = $1, correct_letters = $2, current_attempt = $3, game_status = $4 WHERE game_id = $5',
      [newUsedLetters, newCorrectLetters, currentAttempt, gameOver ? 'finished' : 'active', gameId]
    );
    
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
    console.error('❌ Error making guess:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطا در ثبت حدس' 
    });
  }
});

app.post('/api/use-hint', async (req, res) => {
  console.log('💡 Using hint...', req.body);
  
  try {
    const { gameId } = req.body;
    
    const gameResult = await pool.query(
      'SELECT * FROM active_games WHERE game_id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'بازی یافت نشد' 
      });
    }
    
    const game = gameResult.rows[0];
    
    if (game.help_used >= 2) {
      return res.json({ 
        success: false, 
        error: 'شما بیشتر از دو بار نمی‌توانید از راهنما استفاده کنید' 
      });
    }
    
    const word = game.word;
    const correctLetters = game.correct_letters || '';
    const unusedLetters = word.split('').filter(char => 
      char !== ' ' && !correctLetters.includes(char)
    );
    
    if (unusedLetters.length === 0) {
      return res.json({ 
        success: false, 
        error: 'همه حروف قبلاً حدس زده شده‌اند' 
      });
    }
    
    const randomLetter = unusedLetters[Math.floor(Math.random() * unusedLetters.length)];
    
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
    console.error('❌ Error using hint:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطا در استفاده از راهنما' 
    });
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
      return res.status(404).json({ 
        success: false, 
        error: 'بازی یافت نشد' 
      });
    }
    
    res.json({ 
      success: true, 
      game: result.rows[0] 
    });
  } catch (error) {
    console.error('❌ Error fetching game status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'خطا در دریافت وضعیت بازی' 
    });
  }
});

// API تست
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API is working!',
    bot: BOT_TOKEN ? 'enabled' : 'disabled',
    timestamp: new Date().toISOString()
  });
});

// راه‌اندازی سرور
const PORT = process.env.PORT || 10000;

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API Base: ${RENDER_URL}`);
    console.log(`📍 Web App: ${WEB_APP_URL}`);
    console.log(`📍 Health: ${RENDER_URL}/health`);
    console.log(`📍 Debug: ${RENDER_URL}/debug`);
    
    if (BOT_TOKEN) {
      console.log('✅ Telegram Bot is ready with Webhook');
    } else {
      console.log('⚠️ BOT_TOKEN is missing - bot will not function');
    }
  });
}

startServer();
