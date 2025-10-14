require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';
const API_BASE_URL = process.env.RENDER_EXTERNAL_URL || 'https://wordly-bot.onrender.com';

console.log('🔧 Starting server...');
console.log('WEB_APP_URL:', WEB_APP_URL);

// CORS configuration
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
    api_base: API_BASE_URL,
    web_app: WEB_APP_URL,
    timestamp: new Date().toISOString()
  });
});

// Route دیباگ
app.get('/debug', (req, res) => {
  res.json({
    status: 'active',
    api_base_url: API_BASE_URL,
    web_app_url: WEB_APP_URL,
    cors_allowed: WEB_APP_URL,
    timestamp: new Date().toISOString()
  });
});

// Route سلامت
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
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
    timestamp: new Date().toISOString()
  });
});

// راه‌اندازی سرور
const PORT = process.env.PORT || 10000;

async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API Base: ${API_BASE_URL}`);
    console.log(`📍 Web App: ${WEB_APP_URL}`);
    console.log(`📍 Health: ${API_BASE_URL}/health`);
    console.log(`📍 API Test: ${API_BASE_URL}/api/test`);
  });
}

startServer();
