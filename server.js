// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Pool } = require('pg');
const { Telegraf } = require('telegraf');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files including index.html

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// Telegram bot for notifications only
const bot = new Telegraf(process.env.BOT_TOKEN);

// Optional webhook setup (bot doesn't handle commands, just for init)
if (process.env.WEBHOOK_URL) {
  bot.telegram.setWebhook(process.env.WEBHOOK_URL);
}
app.post('/webhook/telegram', bot.webhookCallback('/webhook/telegram')); // Dummy endpoint

// Helper to send notification
async function sendTelegramNotification(telegramId, message) {
  if (telegramId) {
    try {
      await bot.telegram.sendMessage(telegramId, message);
    } catch (err) {
      console.error('Telegram send error:', err);
    }
  }
}

// DB reset and schema creation
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('DROP TABLE IF EXISTS reports, leaderboard, rounds, games, words, users CASCADE;');

    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        telegram_id TEXT UNIQUE NOT NULL,
        username TEXT,
        display_name TEXT,
        rating INTEGER DEFAULT 1000,
        coins INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE words (
        id SERIAL PRIMARY KEY,
        word TEXT NOT NULL,
        difficulty TEXT DEFAULT 'medium',
        language TEXT DEFAULT 'fa',
        category TEXT DEFAULT 'general'
      );
    `);

    await client.query(`
      CREATE TABLE games (
        id TEXT PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id),
        type TEXT,
        state JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE rounds (
        id SERIAL PRIMARY KEY,
        game_id TEXT REFERENCES games(id),
        round_no INTEGER,
        word_id INTEGER REFERENCES words(id),
        result_json JSONB,
        duration INTEGER
      );
    `);

    await client.query(`
      CREATE TABLE leaderboard (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        points INTEGER,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER REFERENCES users(id),
        target_id INTEGER,
        reason TEXT,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed some Persian words
    const persianWords = [
      {word: 'تهران', difficulty: 'easy', category: 'city'}, 
      {word: 'ایران', difficulty: 'easy', category: 'country'},
      {word: 'کتابخانه', difficulty: 'medium', category: 'general'},
      {word: 'کامپیوتر', difficulty: 'medium', category: 'tech'},
      {word: 'تلگرام', difficulty: 'easy', category: 'app'},
      {word: 'حدس زدن', difficulty: 'medium', category: 'action'},
      {word: 'بازیکن', difficulty: 'easy', category: 'game'},
      {word: 'خانواده', difficulty: 'easy', category: 'general'},
      {word: 'دانشگاه', difficulty: 'medium', category: 'education'},
      {word: 'خورشید', difficulty: 'easy', category: 'nature'},
      'مدرسه', 'غذا', 'آب', 'آسمان', 'زمین', 'ماه', 'ستاره', 'درخت', 'کوهستان', 'دریا'
    ];
    for (const item of persianWords) {
      const word = typeof item === 'string' ? item : item.word;
      const difficulty = typeof item === 'object' ? item.difficulty : 'medium';
      const category = typeof item === 'object' ? item.category : 'general';
      await client.query('INSERT INTO words (word, difficulty, language, category) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING;', [word, difficulty, 'fa', category]);
    }
    console.log('DB initialized and seeded with Persian words.');
  } catch (err) {
    console.error('DB init error:', err);
  } finally {
    client.release();
  }
}

initDB();

// In-memory games cache (sync with DB on changes)
const games = {};

// Mask word function
function maskWord(word, revealed = []) {
  return word.split('').map((char, idx) => {
    if (revealed[idx]) return char;
    if (/\s/.test(char)) return ' ';
    if (/[a-zA-Z\p{Script=Arabic}\p{Script=Persian}]/u.test(char)) return '_'; // Letters including Persian/Arabic script
    return char; // Punctuation as per policy
  }).join('');
}

// Get or create user from Telegram initData
async function getUserFromTelegram(telegramUser) {
  const telegramId = String(telegramUser.id);
  const username = telegramUser.username || null;
  const displayName = telegramUser.first_name + (telegramUser.last_name ? ' ' + telegramUser.last_name : '');
  
  const res = await pool.query(
    'INSERT INTO users (telegram_id, username, display_name) VALUES ($1, $2, $3) ON CONFLICT (telegram_id) DO UPDATE SET username = $2, display_name = $3 RETURNING *;',
    [telegramId, username, displayName]
  );
  return res.rows[0];
}

// Simple HMAC validation for Telegram WebApp initData (production: use better validation)
function validateInitData(initData) {
  // In production, parse and verify hash with bot token using crypto
  // For simplicity here, assume valid if contains id
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (userJson) {
    try {
      return JSON.parse(userJson);
    } catch {}
  }
  return null;
}

// Socket.IO logic - Authentication via Telegram WebApp initData
io.use(async (socket, next) => {
  const initData = socket.handshake.query.initData;
  if (initData) {
    const telegramUser = validateInitData(initData);
    if (telegramUser) {
      socket.telegramUser = telegramUser;
      socket.user = await getUserFromTelegram(telegramUser);
      // Send welcome notification
      await sendTelegramNotification(telegramUser.id, `خوش آمدی ${socket.user.display_name}! آماده بازی WordlyBot هستی.`);
      return next();
    }
  }
  return next(new Error('احراز هویت تلگرام شکست خورد'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id, 'User:', socket.user.id);

  socket.emit('registered', { user: socket.user }); // Auto-registered

  // Emit active games or lobby info if needed

  socket.on('create_game', async ({ type = 'multiplayer', settings = {} }) => {
    const gameId = uuidv4().slice(0, 8);
    const initialState = {
      status: 'lobby',
      players: [{ id: socket.user.id, name: socket.user.display_name }],
      ownerId: socket.user.id,
      type,
      settings,
      scores: { [socket.user.id]: 0 },
      history: [],
      maskedWord: '',
      correctWord: '',
      revealed: [],
      hintsUsed: 0
    };
    games[gameId] = initialState;
    await pool.query(
      'INSERT INTO games (id, owner_id, type, state) VALUES ($1, $2, $3, $4);',
      [gameId, socket.user.id, type, initialState]
    );
    socket.join(gameId);
    socket.emit('game_created', { game_id: gameId, state: initialState });
    io.to(gameId).emit('state_update', { game_id: gameId, state: initialState });
    await sendTelegramNotification(socket.user.telegram_id, `بازی جدید با کد ${gameId} ساخته شد! نوع: ${type}. دوستانت رو دعوت کن.`);
  });

  socket.on('join_game', async ({ game_id }) => {
    if (!games[game_id]) return socket.emit('error', { message: 'بازی یافت نشد یا تمام شده.' });
    const game = games[game_id];
    if (game.status !== 'lobby') return socket.emit('error', { message: 'بازی شروع شده، نمی‌تونی بپیوندی.' });
    if (game.players.some(p => p.id === socket.user.id)) return socket.emit('error', { message: 'قبلاً پیوستستی.' });

    game.players.push({ id: socket.user.id, name: socket.user.display_name });
    game.scores[socket.user.id] = 0;
    await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);
    socket.join(game_id);
    io.to(game_id).emit('player_joined', { game_id, user: { id: socket.user.id, name: socket.user.display_name } });
    io.to(game_id).emit('state_update', { game_id, state: game });
    socket.emit('state_update', { game_id, state: game }); // Full state for new player
    await sendTelegramNotification(socket.user.telegram_id, `به بازی ${game_id} پیوستستی! منتظر شروع باش.`);
    // Notify owner
    const owner = game.players.find(p => p.id === game.ownerId);
    if (owner) {
      const ownerUser = await pool.query('SELECT telegram_id FROM users WHERE id = $1;', [game.ownerId]);
      await sendTelegramNotification(ownerUser.rows[0].telegram_id, `${socket.user.display_name} به بازیت پیوست!`);
    }
  });

  socket.on('start_game', async ({ game_id }) => {
    if (!games[game_id] || games[game_id].ownerId !== socket.user.id) return socket.emit('error', { message: 'فقط صاحب بازی می‌تونه شروع کنه.' });
    const game = games[game_id];
    if (game.status !== 'lobby') return socket.emit('error', { message: 'بازی قبلاً شروع شده.' });
    if (game.players.length < 1) return socket.emit('error', { message: 'حداقل یک بازیکن نیاز است.' });

    // Pick random word
    const wordRes = await pool.query('SELECT word FROM words WHERE language = $1 ORDER BY RANDOM() LIMIT 1;', ['fa']);
    if (wordRes.rows.length === 0) return socket.emit('error', { message: 'کلمه‌ای یافت نشد.' });
    const correctWord = wordRes.rows[0].word.toLowerCase();
    const masked = maskWord(correctWord);
    game.status = 'playing';
    game.maskedWord = masked;
    game.correctWord = correctWord;
    game.revealed = new Array(correctWord.length).fill(false);
    game.startTime = Date.now();
    game.currentRound = 1; // For multi-round if expanded

    await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);
    io.to(game_id).emit('game_started', { game_id, state: game });
    io.to(game_id).emit('state_update', { game_id, state: game });
    game.players.forEach(async (p) => {
      const u = await pool.query('SELECT telegram_id FROM users WHERE id = $1;', [p.id]);
      await sendTelegramNotification(u.rows[0].telegram_id, `بازی ${game_id} شروع شد! کلمه: ${masked} (طول: ${correctWord.length})`);
    });
  });

  socket.on('guess_letter', async ({ game_id, letter }) => {
    if (!games[game_id] || games[game_id].status !== 'playing') return socket.emit('error', { message: 'بازی در حال انجام نیست.' });
    const game = games[game_id];
    letter = letter.toLowerCase();
    if (letter.length !== 1 || !/[ا-ی]/.test(letter)) return socket.emit('error', { message: 'حرف معتبر فارسی وارد کن.' });

    const indexes = [];
    let found = false;
    game.correctWord.split('').forEach((char, idx) => {
      if (char === letter && !game.revealed[idx]) {
        game.revealed[idx] = true;
        indexes.push(idx);
        found = true;
      }
    });

    if (found) {
      // Update scores, etc.
      game.scores[socket.user.id] = (game.scores[socket.user.id] || 0) + 10 * indexes.length;
      game.history.push({ type: 'letter', user: socket.user.display_name, letter, result: 'correct', indexes });
    } else {
      game.history.push({ type: 'letter', user: socket.user.display_name, letter, result: 'wrong' });
    }

    game.maskedWord = maskWord(game.correctWord, game.revealed);
    await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);

    io.to(game_id).emit('letter_revealed', { game_id, indexes, letter, found });
    io.to(game_id).emit('state_update', { game_id, state: game });
    await sendTelegramNotification(socket.user.telegram_id, found ? `حرف ${letter} درست بود! موقعیت‌ها: ${indexes.join(',')}` : `حرف ${letter} اشتباه بود.`);

    // Check if won
    if (game.revealed.every(r => r)) {
      endRound(game_id, 'win', socket.user.id);
    }
  });

  socket.on('guess_word', async ({ game_id, word }) => {
    if (!games[game_id] || games[game_id].status !== 'playing') return socket.emit('error', { message: 'بازی در حال انجام نیست.' });
    const game = games[game_id];
    word = word.toLowerCase().trim();
    const correct = game.correctWord === word;

    game.history.push({ type: 'word', user: socket.user.display_name, word, result: correct ? 'correct' : 'wrong' });
    if (correct) {
      game.scores[socket.user.id] = (game.scores[socket.user.id] || 0) + 100;
      endRound(game_id, 'win', socket.user.id);
    } else {
      game.scores[socket.user.id] = Math.max(0, (game.scores[socket.user.id] || 0) - 20);
    }

    await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);
    io.to(game_id).emit('state_update', { game_id, state: game });
    await sendTelegramNotification(socket.user.telegram_id, correct ? 'آفرین! کلمه درست حدس زدی.' : `کلمه اشتباه بود. ${word} != ${game.correctWord}`);
  });

  socket.on('request_hint', async ({ game_id }) => {
    if (!games[game_id] || games[game_id].status !== 'playing') return socket.emit('error', { message: 'بازی در حال انجام نیست.' });
    const game = games[game_id];
    if (game.hintsUsed >= 3) return socket.emit('error', { message: 'حداکثر hint استفاده شد.' });
    if (socket.user.coins < 5) return socket.emit('error', { message: 'سکه کافی نداری (5 سکه نیاز است).' });

    // Reveal random unrevealed letter
    const unrevealedIdx = game.revealed.map((r, i) => r ? null : i).filter(i => i !== null);
    if (unrevealedIdx.length === 0) return socket.emit('error', { message: 'همه حروف لو رفتند.' });
    const randIdx = unrevealedIdx[Math.floor(Math.random() * unrevealedIdx.length)];
    const letter = game.correctWord[randIdx];
    game.revealed[randIdx] = true;
    game.maskedWord = maskWord(game.correctWord, game.revealed);
    game.hintsUsed++;
    // Deduct coins
    await pool.query('UPDATE users SET coins = coins - 5 WHERE id = $1;', [socket.user.id]);

    game.history.push({ type: 'hint', user: socket.user.display_name, index: randIdx, letter });
    await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);
    io.to(game_id).emit('letter_revealed', { game_id, indexes: [randIdx], letter, hint: true });
    io.to(game_id).emit('state_update', { game_id, state: game });
    await sendTelegramNotification(socket.user.telegram_id, `Hint: حرف در موقعیت ${randIdx + 1} is ${letter} (5 سکه کسر شد).`);
  });

  socket.on('leave_game', async ({ game_id }) => {
    if (!games[game_id]) return;
    const game = games[game_id];
    game.players = game.players.filter(p => p.id !== socket.user.id);
    delete game.scores[socket.user.id];
    if (game.players.length === 0) {
      delete games[game_id];
      await pool.query('DELETE FROM games WHERE id = $1;', [game_id]);
    } else {
      await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);
      io.to(game_id).emit('state_update', { game_id, state: game });
    }
    socket.leave(game_id);
    await sendTelegramNotification(socket.user.telegram_id, `از بازی ${game_id} خارج شدی.`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

async function endRound(game_id, result, winnerId = null) {
  const game = games[game_id];
  game.status = 'ended';
  game.result = result;
  // Award coins, update rating
  if (winnerId) {
    await pool.query('UPDATE users SET coins = coins + 50, rating = rating + 10 WHERE id = $1;', [winnerId]);
    // Update leaderboard
    await pool.query('INSERT INTO leaderboard (user_id, points) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET points = leaderboard.points + 1, updated_at = NOW();', [winnerId]);
  }
  await pool.query('UPDATE games SET state = $1 WHERE id = $2;', [game, game_id]);
  io.to(game_id).emit('round_result', { game_id, result: { winner: winnerId, scores: game.scores } });
  game.players.forEach(async (p) => {
    const u = await pool.query('SELECT telegram_id FROM users WHERE id = $1;', [p.id]);
    await sendTelegramNotification(u.rows[0].telegram_id, result === 'win' ? `بازی تمام! کلمه ${game.correctWord} بود. برنده: ${game.players.find(pp => pp.id === winnerId)?.name}` : 'بازی تمام شد.');
  });
  // For persistence, insert to rounds table
  const wordRes = await pool.query('SELECT id FROM words WHERE word = $1;', [game.correctWord]);
  if (wordRes.rows[0]) {
    await pool.query('INSERT INTO rounds (game_id, round_no, word_id, result_json, duration) VALUES ($1, $2, $3, $4, $5);', [game_id, 1, wordRes.rows[0].id, { scores: game.scores }, Math.floor((Date.now() - game.startTime)/1000)]);
  }
}

// Serve index.html on root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
