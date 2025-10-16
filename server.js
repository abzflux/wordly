/**
 * server.js
 * WordlyBot Mini App backend
 *
 * - Express static serving (index.html)
 * - Socket.IO for real-time gameplay and in-app notifications
 * - PostgreSQL Pool (SSL: rejectUnauthorized=false)
 * - Telegraf for sending Telegram notifications (bot only not handling commands)
 * - On startup: DROP TABLE IF EXISTS ... then CREATE TABLES (برای اولین اجرا)
 *
 * Run:
 *   npm install express socket.io pg telegraf cors uuid
 *   BOT_TOKEN=8408419647:... DATABASE_URL=postgresql://... PORT=3000 node server.js
 *
 * Note: For render.com put env vars in service settings.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const { Telegraf } = require('telegraf');
const { v4: uuidv4 } = require('uuid');

// ---------- Config ----------
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://abolfazl:4scuYwwndssdrtMHcerfZh0SPb3h9Gy7@dpg-d3ogfobe5dus73antd2g-a.frankfurt-postgres.render.com/wordlydb_zjj5';
const PORT = parseInt(process.env.PORT || '3000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';
const WEBHOOK_URL = process.env.WEBHOOK_URL || ''; // optional

// ---------- Postgres Pool ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ---------- Telegram bot (notifications only) ----------
const bot = new Telegraf(BOT_TOKEN);
// Do not register commands — bot only used to send messages from server
bot.launch().then(() => {
  console.log('✅ Telegraf bot launched (for notifications)');
}).catch(err => {
  console.warn('⚠️ Telegraf init warning:', err.message || err);
});

// If webhook URL set, set webhook (optional)
if (WEBHOOK_URL) {
  (async () => {
    try {
      await bot.telegram.setWebhook(WEBHOOK_URL);
      console.log('✅ Telegram webhook set to', WEBHOOK_URL);
    } catch (e) {
      console.warn('⚠️ Could not set webhook:', e.message || e);
    }
  })();
}

// ---------- Utility: mask word ----------
function maskWord(word) {
  // Keep punctuation (non-letter, non-space) as-is, space as ' ', letters as '_'
  // Use unicode-letter detection
  const lettersRegex = /\p{L}/u;
  let masked = '';
  for (let ch of Array.from(word)) {
    if (ch === ' ') masked += ' ';
    else if (lettersRegex.test(ch)) masked += '_';
    else masked += ch; // keep punctuation
  }
  return masked;
}

function revealIndexes(word, currentMasked, letter) {
  // returns { newMasked, revealedIndexes }
  const letters = Array.from(word);
  let maskedArr = Array.from(currentMasked);
  const revealed = [];
  for (let i = 0; i < letters.length; i++) {
    if (letters[i].toLowerCase() === letter.toLowerCase()) {
      maskedArr[i] = letters[i];
      revealed.push(i);
    }
  }
  return { newMasked: maskedArr.join(''), revealed };
}

// ---------- In-memory state ----------
/**
 * games: {
 *   [gameId]: { id, ownerId, type, word, maskedWord, players: [{telegram_id, username, socketId, score, is_bot}], status, round_no, created_at }
 * }
 */
const games = {};
const userSocketMap = new Map(); // telegram_id -> socket.id
const socketUserMap = new Map(); // socket.id -> telegram_id

// ---------- Ensure DB and tables (drop then create) ----------
(async function ensureDB() {
  try {
    await pool.query('SELECT 1'); // test connection
    console.log('✅ Connected to PostgreSQL');
  } catch (err) {
    console.error('❌ PostgreSQL connection error:', err);
    process.exit(1);
  }

  // Drop tables if exist (safe for first-run/test)
  const dropOrder = [
    'leaderboard',
    'rounds',
    'games',
    'words',
    'reports',
    'users'
  ];
  for (const t of dropOrder) {
    try {
      await pool.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
      console.log(`🗑 Dropped table if exists: ${t}`);
    } catch (e) {
      console.warn(`⚠️ Drop table ${t} failed:`, e.message || e);
    }
  }

  // Create tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id TEXT UNIQUE,
      username TEXT,
      display_name TEXT,
      rating INTEGER DEFAULT 1000,
      coins INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS words (
      id SERIAL PRIMARY KEY,
      word TEXT NOT NULL,
      difficulty TEXT DEFAULT 'medium',
      language TEXT DEFAULT 'fa',
      category TEXT DEFAULT 'general'
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      owner_id INTEGER,
      type TEXT,
      state JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rounds (
      id SERIAL PRIMARY KEY,
      game_id TEXT REFERENCES games(id),
      round_no INTEGER,
      word_id INTEGER REFERENCES words(id),
      result_json JSONB,
      duration INTEGER
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      points INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER,
      target_id INTEGER,
      reason TEXT,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('✅ Created tables');

  // Seed words if empty
  const { rows } = await pool.query('SELECT count(*) FROM words');
  const cnt = parseInt(rows[0].count, 10);
  if (cnt === 0) {
    const seed = [
      ['تهران', 'easy'],
      ['سیب', 'easy'],
      ['برف', 'easy'],
      ['دوچرخه', 'medium'],
      ['تلگرام', 'medium'],
      ['برنامه‌نویسی', 'hard'],
      ['معماری', 'medium'],
      ['موسیقی', 'easy'],
      ['فلسفه', 'hard'],
      ['ماشین', 'easy'],
      ['تهران بزرگ', 'medium'],
      ['سلام دنیا', 'easy']
    ];
    for (const [w, d] of seed) {
      await pool.query('INSERT INTO words (word, difficulty) VALUES ($1, $2)', [w, d]);
    }
    console.log('✅ Seeded words table');
  } else {
    console.log('ℹ️ Words table already has rows');
  }

})().catch(err => {
  console.error('DB init error', err);
  process.exit(1);
});

// ---------- Express + Socket.IO ----------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (index.html should be in same folder)
const staticDir = path.join(__dirname, '.');
app.use(express.static(staticDir));

// Simple API: get leaderboard (optional)
app.get('/api/leaderboard', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT u.telegram_id, u.username, l.points
      FROM leaderboard l
      LEFT JOIN users u ON u.id = l.user_id
      ORDER BY l.points DESC
      LIMIT 50
    `);
    res.json({ ok: true, rows: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Webhook endpoint (optional) - bot does not process commands here, placeholder
app.post('/webhook/telegram', (req, res) => {
  // If you want to inspect updates
  res.sendStatus(200);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ---------- Socket.IO events ----------
io.on('connection', (socket) => {
  console.log('🔌 socket connected', socket.id);

  socket.on('register', async (payload) => {
    // payload: { telegram_id, username, display_name }
    try {
      const { telegram_id, username, display_name } = payload || {};
      if (!telegram_id) {
        socket.emit('error', { message: 'telegram_id required for register' });
        return;
      }

      // upsert user
      const upsert = await pool.query(
        `INSERT INTO users (telegram_id, username, display_name)
         VALUES ($1,$2,$3)
         ON CONFLICT (telegram_id) DO UPDATE SET username = $2, display_name = $3
         RETURNING id, telegram_id, username, display_name`,
        [telegram_id.toString(), username || null, display_name || null]
      );
      const user = upsert.rows[0];

      userSocketMap.set(telegram_id.toString(), socket.id);
      socketUserMap.set(socket.id, telegram_id.toString());

      socket.emit('registered', { user });
      console.log('✅ registered user', user.telegram_id);

      // optional: send welcome notification via bot
      try {
        await bot.telegram.sendMessage(telegram_id, `سلام ${display_name || username || ''} — خوش آمدی به WordlyBot! بازی‌ها را از داخل Mini App شروع کن.`);
      } catch (e) {
        // ignore send errors (user may not have started bot)
      }
    } catch (e) {
      console.error('register error', e);
      socket.emit('error', { message: 'register failed' });
    }
  });

  socket.on('create_game', async (payload) => {
    // payload: { type, settings, telegram_id }
    try {
      const { type = 'multiplayer', settings = {}, telegram_id } = payload || {};
      if (!telegram_id) {
        socket.emit('error', { message: 'telegram_id required to create game' });
        return;
      }

      // select random word based on difficulty if settings.difficulty provided
      const difficulty = settings.difficulty || 'medium';
      const wq = await pool.query('SELECT id, word FROM words WHERE difficulty=$1 ORDER BY RANDOM() LIMIT 1', [difficulty]);
      const w = (wq.rows[0] && wq.rows[0].word) ? wq.rows[0] : null;
      const wordText = w ? w.word : 'سلام';
      const masked = maskWord(wordText);

      const gameId = `g_${Date.now().toString(36)}_${Math.floor(Math.random()*1000)}`;
      const ownerRes = await pool.query('SELECT id FROM users WHERE telegram_id=$1', [telegram_id.toString()]);
      const ownerId = (ownerRes.rows[0] && ownerRes.rows[0].id) ? ownerRes.rows[0].id : null;

      const initialState = {
        word: wordText,
        word_id: w ? w.id : null,
        masked_word: masked,
        revealed_indexes: [],
        players: [{
          telegram_id: telegram_id.toString(),
          username: socket.handshake.auth?.username || null,
          socketId: socket.id,
          score: 0,
          is_bot: false
        }],
        status: 'waiting',
        round_no: 1,
        settings,
        created_at: new Date().toISOString()
      };

      // persist
      await pool.query('INSERT INTO games (id, owner_id, type, state) VALUES ($1,$2,$3,$4)', [gameId, ownerId, type, initialState]);

      // in-memory
      games[gameId] = { id: gameId, owner_id: ownerId, type, state: initialState };

      socket.join(gameId);
      io.to(socket.id).emit('game_created', { game_id: gameId, state: initialState });
      io.to(gameId).emit('notification', { message: `Lobby ساخته شد: ${gameId}` });

      // send telegram notification to owner
      try {
        await bot.telegram.sendMessage(telegram_id, `✅ لابی ساخته شد. کد لابی: ${gameId}. بازیکن: شما.`);
      } catch (e) {
        // ignore
      }

      console.log('Game created', gameId);
    } catch (e) {
      console.error('create_game error', e);
      socket.emit('error', { message: 'create_game failed' });
    }
  });

  socket.on('join_game', async (payload) => {
    // payload: { game_id, telegram_id }
    try {
      const { game_id, telegram_id } = payload || {};
      if (!game_id || !telegram_id) {
        socket.emit('error', { message: 'game_id and telegram_id required' });
        return;
      }
      const g = games[game_id];
      if (!g) {
        // try load from DB
        const r = await pool.query('SELECT state FROM games WHERE id=$1', [game_id]);
        if (r.rows.length === 0) {
          socket.emit('error', { message: 'game not found' });
          return;
        } else {
          games[game_id] = { id: game_id, state: r.rows[0].state };
        }
      }

      // add player if not exists
      const exists = (games[game_id].state.players || []).some(p => p.telegram_id === telegram_id.toString());
      if (!exists) {
        const player = { telegram_id: telegram_id.toString(), username: socket.handshake.auth?.username || null, socketId: socket.id, score: 0, is_bot: false };
        games[game_id].state.players.push(player);
        await pool.query('UPDATE games SET state=$1 WHERE id=$2', [games[game_id].state, game_id]);
      }

      socket.join(game_id);
      userSocketMap.set(telegram_id.toString(), socket.id);
      socketUserMap.set(socket.id, telegram_id.toString());

      io.to(game_id).emit('player_joined', { game_id, user: { telegram_id } });
      io.to(game_id).emit('notification', { message: `بازیکن جدید به لابی پیوست.` });

      // notify via telegram to owner & joining user
      try {
        // notify owner
        const ownerId = games[game_id].owner_id;
        if (ownerId) {
          const ownerRow = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [ownerId]);
          if (ownerRow.rows[0] && ownerRow.rows[0].telegram_id) {
            await bot.telegram.sendMessage(ownerRow.rows[0].telegram_id, `کسی به لابی شما پیوست: ${game_id}`);
          }
        }
        // notify joining user
        await bot.telegram.sendMessage(telegram_id, `شما به لابی ${game_id} پیوستید. بازی را داخل Mini App شروع کنید.`);
      } catch (e) {
        // ignore
      }

    } catch (e) {
      console.error('join_game error', e);
      socket.emit('error', { message: 'join_game failed' });
    }
  });

  socket.on('start_game', async (payload) => {
    // payload: { game_id }
    try {
      const { game_id } = payload || {};
      if (!game_id) { socket.emit('error', { message: 'game_id required' }); return; }
      const g = games[game_id];
      if (!g) { socket.emit('error', { message: 'game not found' }); return; }

      // update status
      g.state.status = 'in_progress';
      g.state.started_at = new Date().toISOString();
      await pool.query('UPDATE games SET state=$1 WHERE id=$2', [g.state, game_id]);

      io.to(game_id).emit('game_started', { game_id, state: g.state });
      io.to(game_id).emit('notification', { message: 'بازی شروع شد!' });

      // notify via telegram to all players
      for (const p of g.state.players) {
        try {
          if (p.telegram_id) await bot.telegram.sendMessage(p.telegram_id, `🎮 بازی شروع شد! لابی: ${game_id}`);
        } catch (e) {}
      }
    } catch (e) {
      console.error('start_game error', e);
      socket.emit('error', { message: 'start_game failed' });
    }
  });

  socket.on('guess_letter', async (payload) => {
    // payload: { game_id, letter, telegram_id }
    try {
      const { game_id, letter, telegram_id } = payload || {};
      if (!game_id || !letter) { socket.emit('error', { message: 'game_id & letter required' }); return; }
      const g = games[game_id];
      if (!g) { socket.emit('error', { message: 'game not found' }); return; }

      // reveal indexes
      const { newMasked, revealed } = revealIndexes(g.state.word, g.state.masked_word, letter);
      g.state.masked_word = newMasked;
      g.state.revealed_indexes = Array.from(new Set([...(g.state.revealed_indexes||[]), ...revealed]));
      // score: +10 per revealed index for that player
      const player = g.state.players.find(p => p.telegram_id === (telegram_id ? telegram_id.toString() : socketUserMap.get(socket.id)));
      if (player) {
        player.score = (player.score || 0) + (revealed.length * 10);
      }

      // persist
      await pool.query('UPDATE games SET state=$1 WHERE id=$2', [g.state, game_id]);

      io.to(game_id).emit('state_update', { game_id, state: g.state });
      if (revealed.length > 0) {
        io.to(game_id).emit('letter_revealed', { game_id, indexes: revealed, letter });
      } else {
        io.to(game_id).emit('notification', { message: `حرف '${letter}' وجود نداشت.` });
      }

      // check if word fully revealed
      if (!g.state.masked_word.includes('_')) {
        g.state.status = 'finished';
        await pool.query('UPDATE games SET state=$1 WHERE id=$2', [g.state, game_id]);
        io.to(game_id).emit('round_result', { game_id, result: { winner: player ? player.telegram_id : null, players: g.state.players } });
        // notify telegram
        for (const p of g.state.players) {
          try {
            await bot.telegram.sendMessage(p.telegram_id, `🏁 دور تمام شد. لابی: ${game_id} — برنده: ${player ? player.telegram_id : '—'}`);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('guess_letter error', e);
      socket.emit('error', { message: 'guess_letter failed' });
    }
  });

  socket.on('guess_word', async (payload) => {
    // payload: { game_id, word, telegram_id }
    try {
      const { game_id, word, telegram_id } = payload || {};
      if (!game_id || !word) { socket.emit('error', { message: 'game_id & word required' }); return; }
      const g = games[game_id];
      if (!g) { socket.emit('error', { message: 'game not found' }); return; }

      if (g.state.word.toLowerCase() === word.toLowerCase()) {
        // correct
        g.state.masked_word = g.state.word;
        g.state.status = 'finished';
        // award big bonus to guesser
        const player = g.state.players.find(p => p.telegram_id === (telegram_id ? telegram_id.toString() : socketUserMap.get(socket.id)));
        if (player) player.score = (player.score || 0) + 100;
        await pool.query('UPDATE games SET state=$1 WHERE id=$2', [g.state, game_id]);
        io.to(game_id).emit('round_result', { game_id, result: { winner: player ? player.telegram_id : null, players: g.state.players } });

        // notify telegram
        for (const p of g.state.players) {
          try {
            await bot.telegram.sendMessage(p.telegram_id, `🏆 حدس صحیح! لابی: ${game_id} — برنده: ${player ? player.telegram_id : '—'}`);
          } catch (e) {}
        }
      } else {
        // incorrect: penalty maybe
        io.to(game_id).emit('notification', { message: `حدس کلمه نادرست بود.` });
      }
    } catch (e) {
      console.error('guess_word error', e);
      socket.emit('error', { message: 'guess_word failed' });
    }
  });

  socket.on('request_hint', async (payload) => {
    // payload: { game_id, telegram_id }
    try {
      const { game_id, telegram_id } = payload || {};
      if (!game_id) { socket.emit('error', { message: 'game_id required' }); return; }
      const g = games[game_id];
      if (!g) { socket.emit('error', { message: 'game not found' }); return; }

      // find unrevealed letter indexes
      const unrevealed = [];
      const letters = Array.from(g.state.word);
      for (let i = 0; i < letters.length; i++) {
        if (g.state.masked_word[i] === '_' && letters[i] !== ' ') unrevealed.push(i);
      }
      if (unrevealed.length === 0) {
        socket.emit('notification', { message: 'هیچ حرفی برای لو دادن وجود ندارد.' });
        return;
      }
      const idx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      const letter = letters[idx];
      const { newMasked, revealed } = revealIndexes(g.state.word, g.state.masked_word, letter);
      g.state.masked_word = newMasked;
      g.state.revealed_indexes = Array.from(new Set([...(g.state.revealed_indexes||[]), ...revealed]));

      // deduct coin from requester
      const resUser = await pool.query('SELECT id, coins FROM users WHERE telegram_id=$1', [telegram_id.toString()]);
      if (resUser.rows[0]) {
        const uid = resUser.rows[0].id;
        const coins = (resUser.rows[0].coins || 0) - 10;
        await pool.query('UPDATE users SET coins=$1 WHERE id=$2', [Math.max(0, coins), uid]);
      }

      await pool.query('UPDATE games SET state=$1 WHERE id=$2', [g.state, game_id]);
      io.to(game_id).emit('state_update', { game_id, state: g.state });
      io.to(game_id).emit('notification', { message: `یک hint لو داده شد: '${letter}'` });

      // notify telegram
      for (const p of g.state.players) {
        try { await bot.telegram.sendMessage(p.telegram_id, `🔎 Hint در لابی ${game_id} استفاده شد.`); } catch(e) {}
      }

    } catch (e) {
      console.error('request_hint error', e);
      socket.emit('error', { message: 'request_hint failed' });
    }
  });

  socket.on('leave_game', async (payload) => {
    const { game_id, telegram_id } = payload || {};
    try {
      if (!game_id || !telegram_id) { socket.emit('error', { message: 'game_id & telegram_id required' }); return; }
      const g = games[game_id];
      if (!g) { socket.leave(game_id); socket.emit('notification', { message: 'left' }); return; }
      g.state.players = (g.state.players || []).filter(p => p.telegram_id !== telegram_id.toString());
      await pool.query('UPDATE games SET state=$1 WHERE id=$2', [g.state, game_id]);
      socket.leave(game_id);
      io.to(game_id).emit('notification', { message: 'یک بازیکن لابی را ترک کرد.' });
      // telegram notify owner
      try {
        const ownerId = g.owner_id;
        if (ownerId) {
          const r = await pool.query('SELECT telegram_id FROM users WHERE id=$1', [ownerId]);
          if (r.rows[0] && r.rows[0].telegram_id) {
            await bot.telegram.sendMessage(r.rows[0].telegram_id, `یک بازیکن لابی ${game_id} را ترک کرد.`);
          }
        }
      } catch (e) {}
    } catch (e) {
      console.error('leave_game error', e);
      socket.emit('error', { message: 'leave_game failed' });
    }
  });

  socket.on('disconnect', () => {
    const tid = socketUserMap.get(socket.id);
    if (tid) {
      userSocketMap.delete(tid);
      socketUserMap.delete(socket.id);
    }
    console.log('🔌 socket disconnected', socket.id);
  });

});

// ---------- Start server ----------
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Frontend should be served at /index.html (or ${FRONTEND_URL})`);
});
