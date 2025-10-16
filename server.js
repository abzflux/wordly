const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const { Pool } = require('pg');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "https://wordlybot.ct.ws",
    methods: ["GET", "POST"]
  }
});

// تنظیمات دیتابیس
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// تلگرام بات
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// میدلورها
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// بازی‌های فعال در حافظه
const activeGames = new Map();
const userSockets = new Map();

// مقداردهی اولیه دیتابیس
async function initializeDatabase() {
  try {
    console.log('در حال راه‌اندازی دیتابیس...');
    
    // حذف جداول قدیمی
    await pool.query(`
      DROP TABLE IF EXISTS reports CASCADE;
      DROP TABLE IF EXISTS leaderboard CASCADE;
      DROP TABLE IF EXISTS rounds CASCADE;
      DROP TABLE IF EXISTS games CASCADE;
      DROP TABLE IF EXISTS words CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // ایجاد جداول جدید
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT UNIQUE NOT NULL,
        username TEXT,
        display_name TEXT NOT NULL,
        rating INTEGER DEFAULT 1000,
        coins INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE words (
        id SERIAL PRIMARY KEY,
        word TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        language TEXT DEFAULT 'fa',
        category TEXT DEFAULT 'general'
      );

      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        type TEXT NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE rounds (
        id SERIAL PRIMARY KEY,
        game_id TEXT REFERENCES games(id),
        round_no INTEGER NOT NULL,
        word_id INTEGER REFERENCES words(id),
        result_json JSONB,
        duration INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE leaderboard (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        points INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id),
        target_id INTEGER REFERENCES users(id),
        reason TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // اضافه کردن کلمات نمونه
    const sampleWords = [
      'تهران', 'ایران', 'کتاب', 'مدرسه', 'دانشگاه', 'رایانه', 'برنامه', 'زبان',
      'سلام', 'دنیا', 'گل', 'درخت', 'آب', 'آتش', 'باد', 'خاک', 'طلا', 'نقره',
      'ماه', 'خورشید', 'ستاره', 'آسمان', 'زمین', 'دریا', 'کوه', 'جنگل', 'شهر',
      'روستا', 'خیابان', 'ماشین', 'هواپیما', 'کشتی', 'قطار', 'اتوبوس', 'موتور'
    ];

    for (const word of sampleWords) {
      await pool.query(
        'INSERT INTO words (word, difficulty, language, category) VALUES ($1, $2, $3, $4)',
        [word, 'medium', 'fa', 'general']
      );
    }

    console.log('دیتابیس با موفقیت راه‌اندازی شد');
  } catch (error) {
    console.error('خطا در راه‌اندازی دیتابیس:', error);
  }
}

// تابع mask کردن کلمه
function maskWord(word, guessedLetters = []) {
  return word.split('').map(char => {
    if (char === ' ') return ' ';
    if (/[\u0600-\u06FF]/.test(char)) { // حروف فارسی
      return guessedLetters.includes(char) ? char : '_';
    }
    return /[a-zA-Z]/.test(char) ? (guessedLetters.includes(char) ? char : '_') : char;
  }).join('');
}

// ارسال نوتیفیکیشن تلگرام
async function sendTelegramNotification(telegramId, message) {
  try {
    await bot.telegram.sendMessage(telegramId, message);
  } catch (error) {
    console.error('خطا در ارسال نوتیفیکیشن تلگرام:', error);
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('کاربر متصل شد:', socket.id);

  // ثبت کاربر
  socket.on('register', async (data) => {
    try {
      const { telegram_id, username, display_name } = data;
      
      let user = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegram_id]
      );

      if (user.rows.length === 0) {
        user = await pool.query(
          'INSERT INTO users (telegram_id, username, display_name) VALUES ($1, $2, $3) RETURNING *',
          [telegram_id, username, display_name]
        );
      } else {
        user = await pool.query(
          'UPDATE users SET username = $1, display_name = $2 WHERE telegram_id = $3 RETURNING *',
          [username, display_name, telegram_id]
        );
      }

      userSockets.set(telegram_id, socket.id);
      socket.userId = telegram_id;
      
      socket.emit('registered', { user: user.rows[0] });
    } catch (error) {
      console.error('خطا در ثبت کاربر:', error);
      socket.emit('error', { message: 'خطا در ثبت کاربر' });
    }
  });

  // ایجاد بازی جدید
  socket.on('create_game', async (data) => {
    try {
      const { type, settings } = data;
      const gameId = Math.random().toString(36).substring(7);
      
      const user = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [socket.userId]
      );

      if (user.rows.length === 0) {
        socket.emit('error', { message: 'کاربر یافت نشد' });
        return;
      }

      // انتخاب کلمه تصادفی
      const wordResult = await pool.query(
        'SELECT * FROM words ORDER BY RANDOM() LIMIT 1'
      );
      
      const word = wordResult.rows[0];
      const maskedWord = maskWord(word.word);

      const gameState = {
        type,
        settings,
        players: [{
          id: user.rows[0].telegram_id,
          username: user.rows[0].username,
          display_name: user.rows[0].display_name,
          score: 0
        }],
        word: word.word,
        maskedWord,
        guessedLetters: [],
        incorrectGuesses: 0,
        maxIncorrectGuesses: 6,
        status: 'waiting',
        currentPlayer: null,
        hintsUsed: 0,
        maxHints: 3
      };

      await pool.query(
        'INSERT INTO games (id, owner_id, type, state) VALUES ($1, $2, $3, $4)',
        [gameId, user.rows[0].id, type, gameState]
      );

      activeGames.set(gameId, gameState);
      socket.join(gameId);
      socket.currentGame = gameId;

      socket.emit('game_created', { game_id: gameId, state: gameState });
      
      // ارسال نوتیفیکیشن
      await sendTelegramNotification(
        socket.userId,
        `🎮 بازی جدید ایجاد شد!\nشناسه بازی: ${gameId}\n\nبازی در انتظار بازیکنان دیگر است...`
      );
    } catch (error) {
      console.error('خطا در ایجاد بازی:', error);
      socket.emit('error', { message: 'خطا در ایجاد بازی' });
    }
  });

  // پیوستن به بازی
  socket.on('join_game', async (data) => {
    try {
      const { game_id } = data;
      const gameState = activeGames.get(game_id);

      if (!gameState) {
        socket.emit('error', { message: 'بازی یافت نشد' });
        return;
      }

      if (gameState.status !== 'waiting') {
        socket.emit('error', { message: 'بازی已经开始 شده است' });
        return;
      }

      const user = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [socket.userId]
      );

      if (user.rows.length === 0) {
        socket.emit('error', { message: 'کاربر یافت نشد' });
        return;
      }

      // بررسی وجود کاربر در بازی
      const existingPlayer = gameState.players.find(p => p.id === socket.userId);
      if (existingPlayer) {
        socket.emit('error', { message: 'شما قبلاً در این بازی عضو شده‌اید' });
        return;
      }

      gameState.players.push({
        id: user.rows[0].telegram_id,
        username: user.rows[0].username,
        display_name: user.rows[0].display_name,
        score: 0
      });

      socket.join(game_id);
      socket.currentGame = game_id;

      // بروزرسانی دیتابیس
      await pool.query(
        'UPDATE games SET state = $1 WHERE id = $2',
        [gameState, game_id]
      );

      io.to(game_id).emit('player_joined', {
        game_id,
        user: {
          id: user.rows[0].telegram_id,
          username: user.rows[0].username,
          display_name: user.rows[0].display_name
        }
      });

      io.to(game_id).emit('state_update', {
        game_id,
        state: gameState
      });

      // ارسال نوتیفیکیشن
      await sendTelegramNotification(
        socket.userId,
        `🎯 شما به بازی ${game_id} پیوستید!\n\nمنتظر شروع بازی باشید...`
      );
    } catch (error) {
      console.error('خطا در پیوستن به بازی:', error);
      socket.emit('error', { message: 'خطا در پیوستن به بازی' });
    }
  });

  // شروع بازی
  socket.on('start_game', async (data) => {
    try {
      const { game_id } = data;
      const gameState = activeGames.get(game_id);

      if (!gameState) {
        socket.emit('error', { message: 'بازی یافت نشد' });
        return;
      }

      if (gameState.players[0].id !== socket.userId) {
        socket.emit('error', { message: 'فقط سازنده بازی می‌تواند بازی را شروع کند' });
        return;
      }

      if (gameState.players.length < 1) {
        socket.emit('error', { message: 'تعداد بازیکنان کافی نیست' });
        return;
      }

      gameState.status = 'playing';
      gameState.currentPlayer = gameState.players[0].id;

      // بروزرسانی دیتابیس
      await pool.query(
        'UPDATE games SET state = $1 WHERE id = $2',
        [gameState, game_id]
      );

      io.to(game_id).emit('game_started', {
        game_id,
        state: gameState
      });

      // ارسال نوتیفیکیشن به همه بازیکنان
      for (const player of gameState.players) {
        await sendTelegramNotification(
          player.id,
          `🚀 بازی شروع شد!\n\nکلمه: ${gameState.maskedWord}\n\nنوبت: ${gameState.players.find(p => p.id === gameState.currentPlayer)?.display_name}`
        );
      }
    } catch (error) {
      console.error('خطا در شروع بازی:', error);
      socket.emit('error', { message: 'خطا در شروع بازی' });
    }
  });

  // حدس حرف
  socket.on('guess_letter', async (data) => {
    try {
      const { game_id, letter } = data;
      const gameState = activeGames.get(game_id);

      if (!gameState) {
        socket.emit('error', { message: 'بازی یافت نشد' });
        return;
      }

      if (gameState.status !== 'playing') {
        socket.emit('error', { message: 'بازی در حال انجام نیست' });
        return;
      }

      if (gameState.currentPlayer !== socket.userId) {
        socket.emit('error', { message: 'نوبت شما نیست' });
        return;
      }

      // بررسی تکراری نبودن حدس
      if (gameState.guessedLetters.includes(letter)) {
        socket.emit('error', { message: 'این حرف قبلاً حدس زده شده است' });
        return;
      }

      gameState.guessedLetters.push(letter);

      let correctGuess = false;
      const indexes = [];

      // بررسی وجود حرف در کلمه
      for (let i = 0; i < gameState.word.length; i++) {
        if (gameState.word[i] === letter) {
          correctGuess = true;
          indexes.push(i);
        }
      }

      if (correctGuess) {
        // بروزرسانی امتیاز
        const playerIndex = gameState.players.findIndex(p => p.id === socket.userId);
        gameState.players[playerIndex].score += 10;

        // بروزرسانی masked word
        const wordArray = gameState.maskedWord.split('');
        indexes.forEach(index => {
          wordArray[index] = letter;
        });
        gameState.maskedWord = wordArray.join('');

        // بررسی برنده شدن
        if (gameState.maskedWord === gameState.word) {
          gameState.status = 'finished';
          gameState.winner = socket.userId;

          io.to(game_id).emit('round_result', {
            game_id,
            result: {
              winner: socket.userId,
              scores: gameState.players,
              word: gameState.word
            }
          });

          // ارسال نوتیفیکیشن
          for (const player of gameState.players) {
            await sendTelegramNotification(
              player.id,
              `🎉 بازی به پایان رسید!\n\nبرنده: ${gameState.players.find(p => p.id === socket.userId)?.display_name}\nکلمه: ${gameState.word}`
            );
          }

          activeGames.delete(game_id);
          return;
        }

        socket.emit('letter_revealed', {
          game_id,
          indexes,
          letter
        });
      } else {
        gameState.incorrectGuesses++;
        
        // بررسی باخت
        if (gameState.incorrectGuesses >= gameState.maxIncorrectGuesses) {
          gameState.status = 'finished';
          
          io.to(game_id).emit('round_result', {
            game_id,
            result: {
              winner: null,
              scores: gameState.players,
              word: gameState.word
            }
          });

          // ارسال نوتیفیکیشن
          for (const player of gameState.players) {
            await sendTelegramNotification(
              player.id,
              `💀 بازی به پایان رسید!\n\nهیچ کس برنده نشد!\nکلمه: ${gameState.word}`
            );
          }

          activeGames.delete(game_id);
          return;
        }
      }

      // تغییر نوبت
      const currentPlayerIndex = gameState.players.findIndex(p => p.id === gameState.currentPlayer);
      const nextPlayerIndex = (currentPlayerIndex + 1) % gameState.players.length;
      gameState.currentPlayer = gameState.players[nextPlayerIndex].id;

      // بروزرسانی دیتابیس
      await pool.query(
        'UPDATE games SET state = $1 WHERE id = $2',
        [gameState, game_id]
      );

      io.to(game_id).emit('state_update', {
        game_id,
        state: gameState
      });

    } catch (error) {
      console.error('خطا در حدس حرف:', error);
      socket.emit('error', { message: 'خطا در حدس حرف' });
    }
  });

  // درخواست راهنما
  socket.on('request_hint', async (data) => {
    try {
      const { game_id } = data;
      const gameState = activeGames.get(game_id);

      if (!gameState) {
        socket.emit('error', { message: 'بازی یافت نشد' });
        return;
      }

      if (gameState.hintsUsed >= gameState.maxHints) {
        socket.emit('error', { message: 'تعداد راهنماها تمام شده است' });
        return;
      }

      // پیدا کردن حرفی که هنوز حدس زده نشده
      const availableLetters = gameState.word.split('').filter((char, index) => {
        return char !== ' ' && !gameState.guessedLetters.includes(char) && gameState.maskedWord[index] === '_';
      });

      if (availableLetters.length === 0) {
        socket.emit('error', { message: 'هیچ راهنمایی موجود نیست' });
        return;
      }

      const randomLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
      gameState.hintsUsed++;

      socket.emit('notification', {
        message: `💡 راهنما: حرف "${randomLetter}" در کلمه وجود دارد`
      });

      // بروزرسانی دیتابیس
      await pool.query(
        'UPDATE games SET state = $1 WHERE id = $2',
        [gameState, game_id]
      );

    } catch (error) {
      console.error('خطا در دریافت راهنما:', error);
      socket.emit('error', { message: 'خطا در دریافت راهنما' });
    }
  });

  // ترک بازی
  socket.on('leave_game', async (data) => {
    try {
      const { game_id } = data;
      const gameState = activeGames.get(game_id);

      if (gameState) {
        gameState.players = gameState.players.filter(p => p.id !== socket.userId);
        
        if (gameState.players.length === 0) {
          activeGames.delete(game_id);
        } else {
          // بروزرسانی دیتابیس
          await pool.query(
            'UPDATE games SET state = $1 WHERE id = $2',
            [gameState, game_id]
          );

          io.to(game_id).emit('state_update', {
            game_id,
            state: gameState
          });
        }

        socket.leave(game_id);
        socket.currentGame = null;

        await sendTelegramNotification(
          socket.userId,
          '👋 شما از بازی خارج شدید'
        );
      }
    } catch (error) {
      console.error('خطا در ترک بازی:', error);
      socket.emit('error', { message: 'خطا در ترک بازی' });
    }
  });

  // قطع اتصال
  socket.on('disconnect', () => {
    console.log('کاربر قطع شد:', socket.id);
    if (socket.userId) {
      userSockets.delete(socket.userId);
    }
  });
});

// وب‌هوک تلگرام
app.post('/webhook/telegram', (req, res) => {
  // فقط برای دریافت آپدیت‌ها - هیچ command ای پردازش نمی‌شود
  console.log('دریافت وب‌هوک تلگرام:', req.body);
  res.sendStatus(200);
});

// راه‌اندازی وب‌هوک
bot.launch({
  webhook: {
    domain: process.env.WEBHOOK_URL,
    port: process.env.PORT || 3000
  }
}).then(() => {
  console.log('ربات تلگرام راه‌اندازی شد');
});

// روت اصلی
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API برای دریافت وضعیت بازی‌های فعال
app.get('/api/games', (req, res) => {
  const games = Array.from(activeGames.entries()).map(([id, state]) => ({
    id,
    type: state.type,
    players: state.players.length,
    status: state.status
  }));
  res.json(games);
});

// راه‌اندازی سرور
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initializeDatabase();
  
  server.listen(PORT, () => {
    console.log(`سرور در پورت ${PORT} راه‌اندازی شد`);
    console.log(`آدرس frontend: ${process.env.FRONTEND_URL}`);
    console.log(`آدرس webhook: ${process.env.WEBHOOK_URL}`);
  });
}

startServer().catch(console.error);
