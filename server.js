// server.js
// Node.js + Express + Socket.IO + Postgres + Telegram Bot
// اجرا: NODE_ENV=production node server.js  (یا از Render سرویس‌دهی شود)

const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const socketio = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = socketio(server, { cors: { origin: "*"} });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Postgres pool with SSL (for Render)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false
  }
});

// Init Telegram bot (polling false for webhook-less sendMessage usage)
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// Utility: mask a word for display, show special token for space
function maskWord(word, revealedIndices = new Set()) {
  // show letter if index in revealedIndices; for space show a placeholder box
  let arr = [];
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (ch === ' ') {
      arr.push('□'); // space box visual
    } else if (revealedIndices.has(i)) {
      arr.push(ch);
    } else {
      arr.push('_');
    }
  }
  return arr.join(' ');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// Score formula
function calculateScore({ correctLetters, wrongLetters, timeSeconds, hintsUsed }) {
  const base = correctLetters * 100;
  const timePenalty = timeSeconds * 2;
  const wrongPenalty = wrongLetters * 10;
  const hintPenalty = hintsUsed * 15;
  const raw = Math.round(base - timePenalty - wrongPenalty - hintPenalty);
  return Math.max(0, raw);
}


ensureTables()
    .then(() => console.log('✅ Database is ready.'))
    .catch(err => console.error('❌ Database initialization failed:', err));

// DB table creation on start
async function ensureTables() {
    try {
        console.log('🧩 Resetting and creating database tables...');

        // حذف جداول به ترتیب وابستگی (از پایین به بالا)
        await pool.query(`
            DROP TABLE IF EXISTS guesses CASCADE;
            DROP TABLE IF EXISTS players CASCADE;
            DROP TABLE IF EXISTS games CASCADE;
        `);

        // جدول بازی‌ها
        await pool.query(`
            CREATE TABLE IF NOT EXISTS games (
                id SERIAL PRIMARY KEY,
                creator_id TEXT NOT NULL,
                creator_name TEXT,
                word TEXT NOT NULL,
                status TEXT DEFAULT 'waiting',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // جدول بازیکنان (شرکت‌کنندگان)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                user_id TEXT NOT NULL,
                username TEXT,
                game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
                score INTEGER DEFAULT 0,
                joined_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // جدول حدس‌ها
        await pool.query(`
            CREATE TABLE IF NOT EXISTS guesses (
                id SERIAL PRIMARY KEY,
                game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                letter TEXT NOT NULL,
                correct BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log('✅ Tables recreated successfully.');
    } catch (err) {
        console.error('❌ Error recreating tables:', err);
        throw err;
    }
}

// Helper: send telegram message (safe wrapper)
async function notifyTelegram(telegramId, text, extra = {}) {
  try {
    if (!telegramId) return;
    await bot.sendMessage(telegramId, text, extra);
  } catch (err) {
    console.warn('Telegram send error:', err?.response?.body || err.message || err);
  }
}

// API: create or upsert user (login)
app.post('/api/login', async (req, res) => {
  const { telegram_id, first_name } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    await pool.query(`
      INSERT INTO users(telegram_id, first_name) VALUES($1, $2)
      ON CONFLICT (telegram_id) DO UPDATE SET first_name = EXCLUDED.first_name
    `, [telegram_id, first_name || null]);
    return res.json({ ok: true, telegram_id, first_name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db' });
  }
});

// API: create game
app.post('/api/games', async (req, res) => {
  const { telegram_id, name, word } = req.body;
  if (!telegram_id || !word) return res.status(400).json({ error: 'telegram_id & word required' });

  // Keep case sensitivity? we'll store as provided but for comparisons use lower-case
  const id = crypto.randomBytes(3).toString('hex').toUpperCase();
  const cleanWord = String(word);
  const lettersCount = cleanWord.length;
  const maxAttempts = Math.ceil(lettersCount * 1.5);

  const revealedIndices = JSON.stringify([]); // none initially

  try {
    await pool.query(`
      INSERT INTO games(id, creator_telegram_id, creator_name, word, max_attempts, revealed_indices)
      VALUES($1,$2,$3,$4,$5,$6)
    `, [id, telegram_id, name || null, cleanWord, maxAttempts, revealedIndices]);

    // insert creator into players
    await pool.query(`
      INSERT INTO players(game_id, telegram_id, name, is_creator) VALUES($1,$2,$3,TRUE)
    `, [id, telegram_id, name || null]);

    await pool.query(`
      INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,$3,$4)
    `, [id, telegram_id, 'game_created', { wordLength: cleanWord.length }]);

    return res.json({ ok: true, gameId: id, maxAttempts });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db error' });
  }
});

// API: list games for a user: created and joinable
app.get('/api/games', async (req, res) => {
  const telegram_id = req.query.telegram_id;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required as query param' });

  try {
    const created = await pool.query(`SELECT id, creator_name, word, created_at, status FROM games WHERE creator_telegram_id=$1 ORDER BY created_at DESC`, [telegram_id]);
    const joinable = await pool.query(`SELECT id, creator_name, LENGTH(word) as word_len, created_at, status, creator_telegram_id FROM games WHERE creator_telegram_id <> $1 AND status='open' ORDER BY created_at DESC`, [telegram_id]);
    return res.json({ created: created.rows, joinable: joinable.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db' });
  }
});

// API: join game
app.post('/api/games/:id/join', async (req, res) => {
  const gameId = req.params.id;
  const { telegram_id, name } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });

  try {
    const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]);
    if (g.rowCount === 0) return res.status(404).json({ error: 'game not found' });
    const game = g.rows[0];
    if (game.creator_telegram_id === telegram_id) return res.status(400).json({ error: 'cannot join your own game' });
    if (game.status !== 'open') return res.status(400).json({ error: 'game not open' });

    // add player
    await pool.query(`INSERT INTO players(game_id, telegram_id, name, is_creator) VALUES($1,$2,$3,FALSE)`, [gameId, telegram_id, name || null]);

    // update game status
    await pool.query(`UPDATE games SET status='playing', current_turn_telegram_id=$1, started_at=NOW() WHERE id=$2`, [telegram_id, gameId]);

    // log
    await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'player_joined',$3)`, [gameId, telegram_id, { name }]);

    // notify creator via telegram
    await notifyTelegram(game.creator_telegram_id, `⚡️ کاربر ${name || telegram_id} به بازی شما پیوست. شناسه بازی: ${gameId}`);

    // Emit socket events to both (if connected)
    io.to(game.creator_telegram_id).emit('player_joined', { gameId, player: { telegram_id, name } });
    io.to(telegram_id).emit('joined', { gameId });

    return res.json({ ok: true, gameId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db' });
  }
});

// API: get single game public state (masked)
app.get('/api/games/:id', async (req, res) => {
  const gameId = req.params.id;
  try {
    const g = await pool.query(`SELECT id, creator_telegram_id, creator_name, LENGTH(word) as length, status, max_attempts, revealed_indices, started_at, finished_at FROM games WHERE id=$1`, [gameId]);
    if (g.rowCount === 0) return res.status(404).json({ error: 'not found' });
    const game = g.rows[0];
    const revealed = JSON.parse(game.revealed_indices || '[]').map(Number);
    // create mask
    const wordRow = await pool.query(`SELECT word FROM games WHERE id=$1`, [gameId]);
    const word = wordRow.rows[0].word;
    const mask = maskWord(word, new Set(revealed));
    return res.json({ ok: true, game: { id: game.id, creator_telegram_id: game.creator_telegram_id, creator_name: game.creator_name, length: game.length, status: game.status, max_attempts: game.max_attempts, mask, started_at: game.started_at, finished_at: game.finished_at }});
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'db' });
  }
});

// SOCKET.IO realtime events
io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // client should emit 'identify' with their telegram_id to join a private room
  socket.on('identify', ({ telegram_id }) => {
    if (!telegram_id) return;
    socket.join(telegram_id);
    socket.telegram_id = telegram_id;
    console.log(`socket ${socket.id} joined room ${telegram_id}`);
  });

  // request: open a game page (subscribe)
  socket.on('subscribe_game', async ({ telegram_id, gameId }) => {
    if (!gameId) return;
    socket.join(`game_${gameId}`);
    // send current masked state + logs
    try {
      const g = await pool.query(`SELECT id, revealed_indices, status, max_attempts, started_at FROM games WHERE id=$1`, [gameId]);
      if (g.rowCount) {
        const game = g.rows[0];
        const revealed = JSON.parse(game.revealed_indices || '[]').map(Number);
        const wordRow = await pool.query(`SELECT word FROM games WHERE id=$1`, [gameId]);
        const word = wordRow.rows[0].word;
        const mask = maskWord(word, new Set(revealed));
        socket.emit('game_state', { gameId, mask, status: game.status, max_attempts: game.max_attempts, started_at: game.started_at });
      }
      const logs = await pool.query(`SELECT * FROM events_log WHERE game_id=$1 ORDER BY event_time ASC LIMIT 100`, [gameId]);
      socket.emit('logs', logs.rows);
    } catch (err) {
      console.error(err);
    }
  });

  // guess letter (single char)
  socket.on('guess_letter', async ({ gameId, telegram_id, letter }) => {
    if (!gameId || !telegram_id || !letter) return;
    letter = String(letter)[0]; // only first char
    try {
      // get game
      const gq = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]);
      if (!gq.rowCount) { socket.emit('error', { msg: 'game not found' }); return; }
      const game = gq.rows[0];
      if (game.status !== 'playing') { socket.emit('error', { msg: 'game not playing' }); return; }

      const word = game.word;
      const lowerWord = word.toLowerCase();
      const lowerLetter = letter.toLowerCase();

      // check if letter already revealed
      const revealed = new Set(JSON.parse(game.revealed_indices || '[]').map(Number));
      let revealedPositions = [];
      for (let i = 0; i < lowerWord.length; i++) {
        if (lowerWord[i] === lowerLetter && !revealed.has(i)) {
          revealed.add(i);
          revealedPositions.push(i);
        }
      }

      const correct = revealedPositions.length > 0;
      const newRevealedArr = Array.from(revealed).sort((a,b)=>a-b);
      await pool.query(`UPDATE games SET revealed_indices = $1, guesses_count = guesses_count + 1, wrong_count = wrong_count + $2 WHERE id=$3`, [JSON.stringify(newRevealedArr), correct ? 0 : 1, gameId]);

      // insert guess
      await pool.query(`INSERT INTO guesses(game_id, telegram_id, type, letter, correct, revealed_positions) VALUES($1,$2,'letter',$3,$4,$5)`, [gameId, telegram_id, letter, correct, JSON.stringify(revealedPositions)]);

      // log event
      await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'guess_letter',$3)`, [gameId, telegram_id, { letter, correct, revealed_positions: revealedPositions }]);

      // broadcast updated mask and logs to game room
      const mask = maskWord(word, revealed);
      io.to(`game_${gameId}`).emit('mask_update', { gameId, mask, actor: telegram_id, letter, correct, revealed_positions: revealedPositions });

      // notify opponent via Telegram & socket
      // get other player(s)
      const playersRes = await pool.query(`SELECT telegram_id, name FROM players WHERE game_id=$1 AND telegram_id <> $2`, [gameId, telegram_id]);
      playersRes.rows.forEach(async p => {
        io.to(p.telegram_id).emit('notify', { title: 'حرف حدس زده شد', text: `${telegram_id} حرف '${letter}' را حدس زد${correct ? ' ✅' : ' ❌'}` });
        await notifyTelegram(p.telegram_id, `🔔 در بازی ${gameId}، کاربر ${telegram_id} حرف '${letter}' را حدس زد — ${correct ? 'درست' : 'نادرست'}`);
      });

      // check win condition: all non-space letters revealed
      let allRevealed = true;
      for (let i = 0; i < word.length; i++) {
        if (word[i] === ' ') continue;
        if (!revealed.has(i)) { allRevealed = false; break; }
      }

      // check attempts exceeded
      const updatedGameRow = await pool.query(`SELECT guesses_count, wrong_count, max_attempts, started_at FROM games WHERE id=$1`, [gameId]);
      const g2 = updatedGameRow.rows[0];
      let finalize = false;
      let winner = null;
      let score = 0;

      if (allRevealed) {
        finalize = true;
        winner = telegram_id;
        // compute score using guesses table and started_at
        const start = g2.started_at ? Math.floor(new Date(g2.started_at).getTime()/1000) : nowSeconds();
        const timeSeconds = nowSeconds() - start;
        // count correct/wrong letters from guesses
        const correctLetters = (await pool.query(`SELECT SUM((jsonb_array_length(revealed_positions::jsonb))) as cnt FROM guesses WHERE game_id=$1 AND correct = true`, [gameId])).rows[0].cnt || 0;
        const wrongLetters = (await pool.query(`SELECT COUNT(*) as cnt FROM guesses WHERE game_id=$1 AND correct = false`, [gameId])).rows[0].cnt || 0;
        const hintsUsed = game.hints_used || 0;
        score = calculateScore({ correctLetters: Number(correctLetters), wrongLetters: Number(wrongLetters), timeSeconds, hintsUsed: Number(hintsUsed) });
      } else if (g2.wrong_count >= g2.max_attempts) {
        // creator wins
        finalize = true;
        winner = game.creator_telegram_id;
        const start = g2.started_at ? Math.floor(new Date(g2.started_at).getTime()/1000) : nowSeconds();
        const timeSeconds = nowSeconds() - start;
        const correctLetters = (await pool.query(`SELECT SUM((jsonb_array_length(revealed_positions::jsonb))) as cnt FROM guesses WHERE game_id=$1 AND correct = true`, [gameId])).rows[0].cnt || 0;
        const wrongLetters = (await pool.query(`SELECT COUNT(*) as cnt FROM guesses WHERE game_id=$1 AND correct = false`, [gameId])).rows[0].cnt || 0;
        const hintsUsed = game.hints_used || 0;
        score = calculateScore({ correctLetters: Number(correctLetters), wrongLetters: Number(wrongLetters), timeSeconds, hintsUsed: Number(hintsUsed) });
      }

      if (finalize) {
        await pool.query(`UPDATE games SET status='finished', winner_telegram_id=$1, finished_at=NOW(), score=$2 WHERE id=$3`, [winner, score, gameId]);
        io.to(`game_${gameId}`).emit('game_finished', { gameId, winner, score });
        // notify both players
        const allPlayers = await pool.query(`SELECT telegram_id FROM players WHERE game_id=$1`, [gameId]);
        for (let p of allPlayers.rows) {
          await notifyTelegram(p.telegram_id, `🏁 بازی ${gameId} تمام شد. برنده: ${winner} — امتیاز: ${score}`);
        }
      }

    } catch (err) {
      console.error(err);
      socket.emit('error', { msg: 'server error' });
    }
  });

  // request hint: guesser asks for hint, creator must confirm (emit event)
  socket.on('request_hint', async ({ gameId, telegram_id }) => {
    try {
      const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]);
      if (!g.rowCount) return;
      const game = g.rows[0];
      // notify creator
      io.to(game.creator_telegram_id).emit('hint_request', { gameId, from: telegram_id });
      await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'hint_requested',$3)`, [gameId, telegram_id, {}]);
      await notifyTelegram(game.creator_telegram_id, `🔎 درخواست راهنمایی از کاربر ${telegram_id} در بازی ${gameId} دریافت شد.`);
    } catch (err) {
      console.error(err);
    }
  });

  // creator confirms hint and reveals one unrevealed letter (choose random unrevealed index)
  socket.on('confirm_hint', async ({ gameId, creator_telegram_id, targetIndex }) => {
    try {
      const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]);
      if (!g.rowCount) return;
      const game = g.rows[0];
      // compute unrevealed indices
      const word = game.word;
      const revealedSet = new Set(JSON.parse(game.revealed_indices || '[]').map(Number));
      const unrevealed = [];
      for (let i = 0; i < word.length; i++) {
        if (word[i] === ' ') continue;
        if (!revealedSet.has(i)) unrevealed.push(i);
      }
      if (unrevealed.length === 0) return;
      // choose targetIndex if provided and valid, else random
      let idxToReveal;
      if (typeof targetIndex === 'number' && unrevealed.includes(targetIndex)) idxToReveal = targetIndex;
      else idxToReveal = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      revealedSet.add(idxToReveal);
      const newRevealedArr = Array.from(revealedSet).sort((a,b)=>a-b);
      await pool.query(`UPDATE games SET revealed_indices=$1, hints_used = hints_used + 1 WHERE id=$2`, [JSON.stringify(newRevealedArr), gameId]);
      await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'hint_given',$3)`, [gameId, creator_telegram_id, { revealed_index: idxToReveal }]);

      // notify sockets and telegrams
      const mask = maskWord(word, revealedSet);
      io.to(`game_${gameId}`).emit('mask_update', { gameId, mask, actor: creator_telegram_id, hint: true, revealed_index: idxToReveal });
      const players = await pool.query(`SELECT telegram_id FROM players WHERE game_id=$1`, [gameId]);
      for (let p of players.rows) {
        await notifyTelegram(p.telegram_id, `💡 در بازی ${gameId} یک راهنمایی اعمال شد (یک حرف افشا شد).`);
      }
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('get_logs', async ({ gameId }) => {
    try {
      const logs = await pool.query(`SELECT * FROM events_log WHERE game_id=$1 ORDER BY event_time ASC LIMIT 200`, [gameId]);
      socket.emit('logs', logs.rows);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

// Static route to serve front.html if placed in same folder
app.get('/', (req,res) => {
  res.sendFile(path.join(__dirname, 'front.html'));
});

// start server
(async () => {
  try {
    await ensureTables();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('startup error', err);
    process.exit(1);
  }
})();
