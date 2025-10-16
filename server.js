const express = require('express');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- تنظیمات و متغیرهای محیطی ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی دیتابیس PostgreSQL ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// ایجاد جداول مورد نیاز
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        total_score INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        creator_id BIGINT NOT NULL REFERENCES users(telegram_id),
        word VARCHAR(255) NOT NULL,
        max_attempts INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'waiting',
        guesser_id BIGINT REFERENCES users(telegram_id),
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS guesses (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id),
        user_id BIGINT REFERENCES users(telegram_id),
        guess_word VARCHAR(255) NOT NULL,
        correct_positions INTEGER[],
        incorrect_positions INTEGER[],
        wrong_letters VARCHAR[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS game_sessions (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id),
        user_id BIGINT REFERENCES users(telegram_id),
        socket_id VARCHAR(255),
        is_online BOOLEAN DEFAULT false,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// --- راه‌اندازی ربات تلگرام ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// سرویس فایل استاتیک برای مینی اپ
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- API Routes ---

// دریافت اطلاعات کاربر
app.get('/api/user/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const result = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ایجاد بازی جدید
app.post('/api/games', async (req, res) => {
  try {
    const { creatorId, word } = req.body;
    
    // ثبت یا به‌روزرسانی کاربر
    await pool.query(`
      INSERT INTO users (telegram_id, username, first_name, last_name) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name
    `, [creatorId, req.body.username, req.body.firstName, req.body.lastName]);
    
    const maxAttempts = Math.floor(word.length * 1.5);
    
    const gameResult = await pool.query(`
      INSERT INTO games (creator_id, word, max_attempts) 
      VALUES ($1, $2, $3) RETURNING *
    `, [creatorId, word.toUpperCase(), maxAttempts]);
    
    res.json(gameResult.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// دریافت بازی‌های در انتظار
app.get('/api/games/waiting', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*, u.first_name, u.username 
      FROM games g 
      JOIN users u ON g.creator_id = u.telegram_id 
      WHERE g.status = 'waiting'
      ORDER BY g.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// پیوستن به بازی
app.post('/api/games/:gameId/join', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { guesserId, username, firstName, lastName } = req.body;
    
    // ثبت یا به‌روزرسانی کاربر
    await pool.query(`
      INSERT INTO users (telegram_id, username, first_name, last_name) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (telegram_id) DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name
    `, [guesserId, username, firstName, lastName]);
    
    const gameResult = await pool.query(`
      UPDATE games 
      SET guesser_id = $1, status = 'in_progress', started_at = CURRENT_TIMESTAMP 
      WHERE id = $2 AND status = 'waiting' 
      RETURNING *
    `, [guesserId, gameId]);
    
    if (gameResult.rows.length === 0) {
      return res.status(400).json({ error: 'Game not available' });
    }
    
    // اطلاع‌رسانی به سازنده بازی
    const game = gameResult.rows[0];
    const creator = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [game.creator_id]
    );
    
    if (creator.rows[0]) {
      bot.sendMessage(
        game.creator_id,
        `🎮 بازیکن ${firstName} به بازی شما پیوست! \nکلمه: ${'▢ '.repeat(game.word.length)}`
      );
    }
    
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ثبت حدس
app.post('/api/games/:gameId/guess', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, guessWord } = req.body;
    
    const gameResult = await pool.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const game = gameResult.rows[0];
    const targetWord = game.word.toUpperCase();
    const userGuess = guessWord.toUpperCase();
    
    // تحلیل حدس
    const correctPositions = [];
    const incorrectPositions = [];
    const wrongLetters = [];
    
    for (let i = 0; i < targetWord.length; i++) {
      if (userGuess[i] === targetWord[i]) {
        correctPositions.push(i);
      } else if (targetWord.includes(userGuess[i])) {
        incorrectPositions.push(i);
      } else if (userGuess[i] && !wrongLetters.includes(userGuess[i])) {
        wrongLetters.push(userGuess[i]);
      }
    }
    
    // ثبت حدس
    const guessResult = await pool.query(`
      INSERT INTO guesses (game_id, user_id, guess_word, correct_positions, incorrect_positions, wrong_letters) 
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [gameId, userId, userGuess, correctPositions, incorrectPositions, wrongLetters]);
    
    // بررسی برد
    const isWinner = correctPositions.length === targetWord.length;
    let gameStatus = game.status;
    
    if (isWinner) {
      gameStatus = 'finished';
      await pool.query(
        'UPDATE games SET status = $1, finished_at = CURRENT_TIMESTAMP WHERE id = $2',
        [gameStatus, gameId]
      );
      
      // محاسبه امتیاز
      const score = calculateScore(game, guessResult.rows[0]);
      await pool.query(
        'UPDATE users SET total_score = total_score + $1, games_won = games_won + 1 WHERE telegram_id = $2',
        [score, userId]
      );
    }
    
    // دریافت تمام حدس‌ها
    const guessesResult = await pool.query(
      'SELECT * FROM guesses WHERE game_id = $1 ORDER BY created_at',
      [gameId]
    );
    
    const response = {
      guess: guessResult.rows[0],
      isWinner,
      gameStatus,
      guesses: guessesResult.rows,
      remainingAttempts: game.max_attempts - guessesResult.rows.length
    };
    
    // ارسال بروزرسانی به تمام کاربران متصل
    io.to(`game_${gameId}`).emit('guess_update', response);
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// درخواست راهنمایی
app.post('/api/games/:gameId/hint', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { userId, position } = req.body;
    
    const gameResult = await pool.query(
      'SELECT * FROM games WHERE id = $1',
      [gameId]
    );
    
    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    const game = gameResult.rows[0];
    const targetWord = game.word.toUpperCase();
    const hintLetter = targetWord[position];
    
    // کسر امتیاز برای راهنمایی
    const hintCost = 20;
    await pool.query(
      'UPDATE users SET total_score = GREATEST(0, total_score - $1) WHERE telegram_id = $2',
      [hintCost, userId]
    );
    
    res.json({ hintLetter, position, cost: hintCost });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// محاسبه امتیاز
function calculateScore(game, guess) {
  const baseScore = 100;
  const timeBonus = Math.max(0, 300 - ((new Date() - new Date(game.started_at)) / 1000));
  const accuracyBonus = (guess.correct_positions.length / game.word.length) * 50;
  const efficiencyBonus = Math.max(0, (game.max_attempts - (guess.id)) * 10);
  
  return Math.round(baseScore + timeBonus + accuracyBonus + efficiencyBonus);
}

// --- WebSocket Connections ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_game', (data) => {
    socket.join(`game_${data.gameId}`);
    socket.gameId = data.gameId;
    socket.userId = data.userId;
    
    // به‌روزرسانی وضعیت آنلاین
    pool.query(`
      INSERT INTO game_sessions (game_id, user_id, socket_id, is_online) 
      VALUES ($1, $2, $3, true)
      ON CONFLICT (socket_id) DO UPDATE SET is_online = true
    `, [data.gameId, data.userId, socket.id]);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // به‌روزرسانی وضعیت آفلاین
    pool.query(
      'UPDATE game_sessions SET is_online = false WHERE socket_id = $1',
      [socket.id]
    );
  });
});

// --- راه‌اندازی سرور ---
initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

module.exports = app;
