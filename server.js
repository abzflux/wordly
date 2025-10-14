require('dotenv').config();
const express = require('express');
const { Telegraf, Markup, session } = require('telegraf');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws';
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Wordly Server...');

// Middleware
app.use(cors({
  origin: [WEB_APP_URL, 'https://wordly.ct.ws'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// دیتابیس ساده در حافظه
const games = new Map();
const words = ['TABLE', 'CHAIR', 'PHONE', 'WATER', 'BRAIN', 'CLOUD', 'EARTH', 'FRUIT', 'GREEN', 'HOUSE', 'MUSIC', 'PARTY', 'RIVER', 'SMILE', 'TIGER', 'WOMAN', 'YOUTH', 'ZEBRA', 'APPLE', 'BEACH'];

// Route اصلی
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// ایجاد بازی جدید
app.post('/api/game/create', (req, res) => {
  const { player1 } = req.body;
  const gameId = generateGameId();
  const word = words[Math.floor(Math.random() * words.length)];
  
  const game = {
    id: gameId,
    player1,
    player2: null,
    word: word.toUpperCase(),
    attempts: [],
    currentPlayer: player1,
    status: 'waiting',
    maxAttempts: 6,
    createdAt: new Date()
  };
  
  games.set(gameId, game);
  
  res.json({
    success: true,
    gameId,
    joinLink: `${WEB_APP_URL}/game.html?join=${gameId}`
  });
});

// پیوستن به بازی
app.post('/api/game/join', (req, res) => {
  const { gameId, player2 } = req.body;
  const game = games.get(gameId);
  
  if (!game) {
    return res.json({ success: false, error: 'بازی یافت نشد' });
  }
  
  if (game.player2) {
    return res.json({ success: false, error: 'بازی کامل است' });
  }
  
  game.player2 = player2;
  game.status = 'active';
  
  res.json({ success: true, game });
});

// ارسال حدس
app.post('/api/game/guess', (req, res) => {
  const { gameId, player, guess } = req.body;
  const game = games.get(gameId);
  
  if (!game) {
    return res.json({ success: false, error: 'بازی یافت نشد' });
  }
  
  if (game.status !== 'active') {
    return res.json({ success: false, error: 'بازی فعال نیست' });
  }
  
  if (game.currentPlayer !== player) {
    return res.json({ success: false, error: 'نوبت شما نیست' });
  }
  
  const guessUpper = guess.toUpperCase();
  
  // بررسی طول کلمه
  if (guessUpper.length !== 5) {
    return res.json({ success: false, error: 'کلمه باید ۵ حرفی باشد' });
  }
  
  // بررسی حدس تکراری
  if (game.attempts.some(attempt => attempt.player === player && attempt.guess === guessUpper)) {
    return res.json({ success: false, error: 'این کلمه را قبلاً حدس زده‌اید' });
  }
  
  const feedback = checkGuess(guessUpper, game.word);
  const attempt = {
    player,
    guess: guessUpper,
    feedback,
    timestamp: new Date()
  };
  
  game.attempts.push(attempt);
  
  // بررسی برنده
  if (guessUpper === game.word) {
    game.status = 'finished';
    game.winner = player;
  } else if (game.attempts.filter(a => a.player === player).length >= game.maxAttempts) {
    // اگر بازیکن فعلی تمام حدس‌هایش را استفاده کرد
    game.currentPlayer = game.currentPlayer === game.player1 ? game.player2 : game.player1;
  } else {
    // اگر هنوز حدس باقی مانده، نوبت همان بازیکن می‌ماند
    game.currentPlayer = player;
  }
  
  // اگر هر دو بازیکن تمام حدس‌هایشان را استفاده کردند
  const player1Attempts = game.attempts.filter(a => a.player === game.player1).length;
  const player2Attempts = game.attempts.filter(a => a.player === game.player2).length;
  
  if (player1Attempts >= game.maxAttempts && player2Attempts >= game.maxAttempts && !game.winner) {
    game.status = 'finished';
  }
  
  res.json({ success: true, attempt, game });
});

// دریافت وضعیت بازی
app.get('/api/game/:gameId', (req, res) => {
  const game = games.get(req.params.gameId);
  
  if (!game) {
    return res.json({ success: false, error: 'بازی یافت نشد' });
  }
  
  res.json({ success: true, game });
});

// تابع بررسی حدس
function checkGuess(guess, word) {
  const feedback = [];
  const wordLetters = word.split('');
  const guessLetters = guess.split('');
  
  // اول حروف درست در جای درست
  for (let i = 0; i < guessLetters.length; i++) {
    if (guessLetters[i] === wordLetters[i]) {
      feedback[i] = { letter: guessLetters[i], status: 'correct' };
      wordLetters[i] = null; // علامت گذاری به عنوان استفاده شده
    }
  }
  
  // سپس حروف درست در جای غلط
  for (let i = 0; i < guessLetters.length; i++) {
    if (!feedback[i]) {
      const indexInWord = wordLetters.indexOf(guessLetters[i]);
      if (indexInWord !== -1) {
        feedback[i] = { letter: guessLetters[i], status: 'present' };
        wordLetters[indexInWord] = null;
      } else {
        feedback[i] = { letter: guessLetters[i], status: 'absent' };
      }
    }
  }
  
  return feedback;
}

// تولید آیدی بازی
function generateGameId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// راه اندازی سرور
app.listen(PORT, () => {
  console.log(`🎮 Wordly Server running on port ${PORT}`);
  console.log(`🌐 Web App: ${WEB_APP_URL}`);
});
