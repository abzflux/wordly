require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// تنظیمات
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';

console.log('🔧 Starting API Server...');

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
    message: '🎮 Wordly Game API Server',
    status: 'active',
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
});

// ایجاد جداول با تنظیمات درست
async function initializeDatabase() {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    // حذف جدول‌های قدیمی اگر وجود دارند
    try {
      await pool.query('DROP TABLE IF EXISTS leaderboard CASCADE');
      await pool.query('DROP TABLE IF EXISTS active_games CASCADE');
      console.log('✅ Old tables dropped');
    } catch (error) {
      console.log('ℹ️ No old tables to drop');
    }

    // ایجاد جدول بازی‌های فعال
    await pool.query(`
      CREATE TABLE active_games (
        game_id VARCHAR(20) PRIMARY KEY,
        creator_id BIGINT NOT NULL,
        creator_name VARCHAR(255) NOT NULL,
        opponent_id BIGINT,
        opponent_name VARCHAR(255),
        word VARCHAR(50),
        category VARCHAR(100),
        max_attempts INTEGER DEFAULT 10 NOT NULL,
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
      CREATE TABLE leaderboard (
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

    console.log('✅ Database tables created successfully');
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

// API ایجاد بازی
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
    
    // مقدار پیش‌فرض برای max_attempts
    const maxAttempts = 10;
    
    await pool.query(
      'INSERT INTO active_games (game_id, creator_id, creator_name, max_attempts) VALUES ($1, $2, $3, $4)',
      [gameId, userId, userName, maxAttempts]
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

// API پیوستن به بازی
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

// API تنظیم کلمه
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

// API ثبت حدس
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

// API استفاده از راهنما
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

// API دریافت وضعیت بازی
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
    console.log(`📍 Health: http://0.0.0.0:${PORT}/health`);
    console.log(`✅ API is ready!`);
  });
}

startServer();
