// server.js
// Production-ready Node/Express + Socket.IO + PostgreSQL + Telegram WebApp backend.
// Usage: set env BOT_TOKEN, DATABASE_URL, FRONTEND_URL, PORT (optional). 
// If you want to drop & recreate DB tables on startup set RESET_DB=true (use carefully).

const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// ---------- Configuration ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;
const RESET_DB = process.env.RESET_DB === 'true';

// Basic checks
if (!BOT_TOKEN) console.warn('⚠️ BOT_TOKEN not set. Telegram notifications will fail.');
if (!DATABASE_URL) console.warn('⚠️ DATABASE_URL not set. DB operations will fail.');

// ---------- App + HTTP + Socket.IO ----------
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: FRONTEND_URL || "*", methods: ["GET","POST"] } });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Postgres ----------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { require: !!DATABASE_URL && DATABASE_URL.includes('postgres'), rejectUnauthorized: false }
});

// ---------- Telegram Bot ----------
const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, { polling: false }) : null;

// ---------- Utilities ----------
function uuid6() {
  // short unique id (12 chars hex). Not RFC UUID but unique enough for game ids.
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}
function nowSeconds(){ return Math.floor(Date.now()/1000); }

function maskWord(word, revealedSet=new Set()){
  // Return array of display tokens; space -> '␣' visual token placeholder box
  const out = [];
  for (let i=0;i<word.length;i++){
    const ch = word[i];
    if (ch === ' ') out.push('␣'); // space placeholder
    else if (revealedSet.has(i)) out.push(ch);
    else out.push('_');
  }
  return out;
}

function calcScore({ correctLetters, wrongLetters, timeSeconds, hintsUsed }){
  const base = correctLetters * 100;
  const timePenalty = Math.round(timeSeconds * 1.8);
  const wrongPenalty = wrongLetters * 12;
  const hintPenalty = hintsUsed * 20;
  return Math.max(0, Math.round(base - timePenalty - wrongPenalty - hintPenalty));
}

// ---------- DB schema management ----------
async function ensureTables(){
  try{
    if (RESET_DB){
      console.log('🔥 RESET_DB=true -> dropping existing tables (CASCADE)');
      await pool.query(`
        DROP TABLE IF EXISTS events_log CASCADE;
        DROP TABLE IF EXISTS guesses CASCADE;
        DROP TABLE IF EXISTS players CASCADE;
        DROP TABLE IF EXISTS games CASCADE;
      `);
    }

    // games.id is TEXT (uuid6) so foreign keys use TEXT too — prevents type mismatch
    await pool.query(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        creator_telegram_id TEXT NOT NULL,
        creator_name TEXT,
        word TEXT NOT NULL,
        status TEXT DEFAULT 'open', -- open, playing, finished, cancelled
        max_attempts INTEGER,
        revealed_indices TEXT DEFAULT '[]', -- json array of indices
        guesses_count INTEGER DEFAULT 0,
        wrong_count INTEGER DEFAULT 0,
        hints_used INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        winner_telegram_id TEXT,
        score INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        telegram_id TEXT NOT NULL,
        name TEXT,
        is_creator BOOLEAN DEFAULT false,
        joined_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS guesses (
        id SERIAL PRIMARY KEY,
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        telegram_id TEXT,
        guess_time TIMESTAMP DEFAULT NOW(),
        type TEXT, -- letter | full
        letter TEXT,
        correct BOOLEAN,
        revealed_positions TEXT DEFAULT '[]'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS events_log (
        id SERIAL PRIMARY KEY,
        game_id TEXT,
        event_time TIMESTAMP DEFAULT NOW(),
        actor_telegram_id TEXT,
        type TEXT,
        payload JSONB
      );
    `);

    console.log('✅ DB tables ensured.');
  } catch (err){
    console.error('DB init error:', err);
    throw err;
  }
}

// ---------- Telegram helpers ----------
async function safeNotifyTelegram(telegramId, text, extra={}){
  if (!bot || !telegramId) return;
  try{
    await bot.sendMessage(telegramId, text, extra);
  }catch(e){
    console.warn('Telegram send error', e?.response?.body || e.message || e);
  }
}

// ---------- HTTP API ----------

// Simple health
app.get('/health', (req,res) => res.json({ ok: true, now: new Date().toISOString() }));

// create or upsert user when opening webapp (optional)
app.post('/api/login', async (req,res) => {
  const { telegram_id, name } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    // upsert into players table? we simply return OK and client will use telegram_id for actions
    return res.json({ ok: true, telegram_id, name });
  } catch (err){
    console.error(err);
    return res.status(500).json({ error: 'db' });
  }
});

// create game
app.post('/api/games', async (req,res) => {
  const { telegram_id, name, word } = req.body;
  if (!telegram_id || !word) return res.status(400).json({ error: 'telegram_id and word required' });
  try {
    const id = uuid6();
    const lettersCount = word.length;
    const maxAttempts = Math.ceil(lettersCount * 1.5);
    await pool.query(`
      INSERT INTO games(id, creator_telegram_id, creator_name, word, max_attempts)
      VALUES ($1,$2,$3,$4,$5)
    `, [id, telegram_id, name || null, word, maxAttempts]);
    // add creator to players
    await pool.query(`INSERT INTO players(game_id, telegram_id, name, is_creator) VALUES($1,$2,$3,TRUE)`, [id, telegram_id, name || null]);
    await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'game_created',$3)`, [id, telegram_id, { wordLength: word.length }]);
    res.json({ ok: true, gameId: id, maxAttempts });
  } catch (err){ console.error(err); res.status(500).json({ error: 'db' }); }
});

// list games (created by user and joinable by user)
app.get('/api/games', async (req,res) => {
  const telegram_id = req.query.telegram_id;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    const created = await pool.query(`SELECT id, creator_name, LENGTH(word) as word_len, created_at, status FROM games WHERE creator_telegram_id=$1 ORDER BY created_at DESC`, [telegram_id]);
    const joinable = await pool.query(`SELECT id, creator_name, LENGTH(word) as word_len, created_at, status, creator_telegram_id FROM games WHERE creator_telegram_id <> $1 AND status='open' ORDER BY created_at DESC`, [telegram_id]);
    res.json({ created: created.rows, joinable: joinable.rows });
  } catch (err){ console.error(err); res.status(500).json({ error: 'db' }); }
});

// join game
app.post('/api/games/:id/join', async (req,res) => {
  const id = req.params.id;
  const { telegram_id, name } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [id]);
    if (!g.rowCount) return res.status(404).json({ error: 'game not found' });
    const game = g.rows[0];
    if (game.creator_telegram_id === telegram_id) return res.status(400).json({ error: 'cannot join your own game' });
    if (game.status !== 'open') return res.status(400).json({ error: 'game not open' });
    await pool.query(`INSERT INTO players(game_id, telegram_id, name, is_creator) VALUES($1,$2,$3,FALSE)`, [id, telegram_id, name || null]);
    await pool.query(`UPDATE games SET status='playing', started_at=NOW() WHERE id=$1`, [id]);
    await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'player_joined',$3)`, [id, telegram_id, { name }]);
    // notify creator
    await safeNotifyTelegram(game.creator_telegram_id, `🔔 کاربر ${name || telegram_id} به بازی ${id} پیوست.`);
    // emit to sockets
    io.to(game.creator_telegram_id).emit('player_joined', { gameId: id, player: { telegram_id, name } });
    io.to(telegram_id).emit('joined', { gameId: id });
    res.json({ ok: true, gameId: id });
  } catch (err){ console.error(err); res.status(500).json({ error: 'db' }); }
});

// get public masked state
app.get('/api/games/:id/state', async (req,res) => {
  const id = req.params.id;
  try {
    const g = await pool.query(`SELECT id, creator_telegram_id, creator_name, word, status, max_attempts, revealed_indices FROM games WHERE id=$1`, [id]);
    if (!g.rowCount) return res.status(404).json({ error: 'not found' });
    const game = g.rows[0];
    const revealed = JSON.parse(game.revealed_indices || '[]').map(Number);
    const maskArr = maskWord(game.word, new Set(revealed));
    res.json({ id: game.id, creator_name: game.creator_name, status: game.status, max_attempts: game.max_attempts, mask: maskArr, length: game.word.length });
  } catch (err){ console.error(err); res.status(500).json({ error: 'db' }); }
});

// forfeit endpoint (player gives up)
app.post('/api/games/:id/forfeit', async (req,res) => {
  const id = req.params.id; const { telegram_id } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'telegram_id required' });
  try {
    // mark finished, set winner to creator
    const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [id]);
    if (!g.rowCount) return res.status(404).json({ error: 'notfound' });
    const game = g.rows[0];
    await pool.query(`UPDATE games SET status='finished', winner_telegram_id=$1, finished_at=NOW(), score=0 WHERE id=$2`, [game.creator_telegram_id, id]);
    await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'forfeit',$3)`, [id, telegram_id, {}]);
    // notify both
    const rows = await pool.query(`SELECT telegram_id FROM players WHERE game_id=$1`, [id]);
    for (let p of rows.rows) await safeNotifyTelegram(p.telegram_id, `⚠️ بازی ${id} به دلیل انصراف یکی از بازیکنان به پایان رسید. امتیاز: 0`);
    io.to(`game_${id}`).emit('game_finished', { gameId: id, winner: game.creator_telegram_id, score: 0 });
    res.json({ ok: true });
  } catch (err){ console.error(err); res.status(500).json({ error: 'db' }); }
});

// ---------- Socket.IO realtime ----------
io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('identify', ({ telegram_id }) => {
    if (!telegram_id) return;
    socket.join(telegram_id);
    socket.telegram_id = telegram_id;
    console.log(`socket ${socket.id} joined room ${telegram_id}`);
  });

  socket.on('subscribe_game', async ({ telegram_id, gameId }) => {
    if (!gameId) return;
    socket.join(`game_${gameId}`);
    // send current masked state + small logs
    try{
      const g = await pool.query(`SELECT word, revealed_indices, status, max_attempts, started_at FROM games WHERE id=$1`, [gameId]);
      if (g.rowCount){
        const game = g.rows[0];
        const revealed = JSON.parse(game.revealed_indices || '[]').map(Number);
        const mask = maskWord(game.word, new Set(revealed));
        socket.emit('game_state', { gameId, mask, status: game.status, max_attempts: game.max_attempts, started_at: game.started_at });
      }
      const logs = await pool.query(`SELECT * FROM events_log WHERE game_id=$1 ORDER BY event_time ASC LIMIT 200`, [gameId]);
      socket.emit('logs', logs.rows);
    }catch(e){ console.error(e); }
  });

  socket.on('guess_letter', async ({ gameId, telegram_id, letter }) => {
    if (!gameId || !telegram_id || !letter) return;
    letter = String(letter)[0];
    try{
      const gq = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]);
      if (!gq.rowCount) { socket.emit('error', { msg: 'game not found' }); return; }
      const game = gq.rows[0];
      if (game.status !== 'playing') { socket.emit('error', { msg: 'game not playing' }); return; }

      const word = game.word;
      const lowerWord = word.toLowerCase();
      const lowerLetter = letter.toLowerCase();

      const revealedSet = new Set(JSON.parse(game.revealed_indices || '[]').map(Number));
      const revealedPositions = [];
      for (let i=0;i<lowerWord.length;i++){
        if (lowerWord[i] === lowerLetter && !revealedSet.has(i)){
          revealedSet.add(i);
          revealedPositions.push(i);
        }
      }

      const correct = revealedPositions.length > 0;
      await pool.query(`UPDATE games SET revealed_indices=$1, guesses_count = guesses_count + 1, wrong_count = wrong_count + $2 WHERE id=$3`, [JSON.stringify(Array.from(revealedSet).sort((a,b)=>a-b)), correct ? 0 : 1, gameId]);
      await pool.query(`INSERT INTO guesses(game_id, telegram_id, type, letter, correct, revealed_positions) VALUES($1,$2,'letter',$3,$4,$5)`, [gameId, telegram_id, letter, correct, JSON.stringify(revealedPositions)]);
      await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'guess_letter',$3)`, [gameId, telegram_id, { letter, correct, revealedPositions }]);

      const mask = maskWord(word, revealedSet);
      io.to(`game_${gameId}`).emit('mask_update', { gameId, mask, actor: telegram_id, letter, correct, revealed_positions: revealedPositions });

      // notify opponent players via socket + telegram
      const playersRes = await pool.query(`SELECT telegram_id, name FROM players WHERE game_id=$1 AND telegram_id <> $2`, [gameId, telegram_id]);
      for (let p of playersRes.rows){
        io.to(p.telegram_id).emit('notify', { title: 'حدس زده شد', text: `${telegram_id} حرف '${letter}' را حدس زد — ${correct ? 'درست' : 'نادرست'}` });
        await safeNotifyTelegram(p.telegram_id, `🔔 در بازی ${gameId}، کاربر ${telegram_id} حرف '${letter}' را حدس زد — ${correct ? 'درست' : 'نادرست'}`);
      }

      // finalize checks
      let allRevealed = true;
      for (let i=0;i<word.length;i++){
        if (word[i] === ' ') continue;
        if (!revealedSet.has(i)) { allRevealed = false; break; }
      }

      const updated = await pool.query(`SELECT guesses_count, wrong_count, max_attempts, started_at, hints_used FROM games WHERE id=$1`, [gameId]);
      const g2 = updated.rows[0];

      let finalize=false, winner=null, score=0;
      if (allRevealed){
        finalize = true; winner = telegram_id;
      } else if (g2.wrong_count >= g2.max_attempts){
        finalize = true; winner = game.creator_telegram_id;
      }

      if (finalize){
        const start = g2.started_at ? Math.floor(new Date(g2.started_at).getTime()/1000) : nowSeconds();
        const timeSeconds = nowSeconds() - start;
        const correctLetters = (await pool.query(`SELECT SUM(jsonb_array_length(revealed_positions::jsonb)) as cnt FROM guesses WHERE game_id=$1 AND correct = true`, [gameId])).rows[0].cnt || 0;
        const wrongLetters = (await pool.query(`SELECT COUNT(*) as cnt FROM guesses WHERE game_id=$1 AND correct = false`, [gameId])).rows[0].cnt || 0;
        const hintsUsed = g2.hints_used || 0;
        score = calcScore({ correctLetters: Number(correctLetters), wrongLetters: Number(wrongLetters), timeSeconds, hintsUsed: Number(hintsUsed) });
        await pool.query(`UPDATE games SET status='finished', winner_telegram_id=$1, finished_at=NOW(), score=$2 WHERE id=$3`, [winner, score, gameId]);
        io.to(`game_${gameId}`).emit('game_finished', { gameId, winner, score });
        const players = await pool.query(`SELECT telegram_id FROM players WHERE game_id=$1`, [gameId]);
        for (let p of players.rows) await safeNotifyTelegram(p.telegram_id, `🏁 بازی ${gameId} تمام شد. برنده: ${winner} — امتیاز: ${score}`);
      }

    }catch(e){ console.error(e); socket.emit('error',{ msg:'server error' }); }
  });

  socket.on('request_hint', async ({ gameId, telegram_id }) => {
    try{
      const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]); if (!g.rowCount) return;
      const game = g.rows[0];
      await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'hint_requested',$3)`, [gameId, telegram_id, {}]);
      // notify creator
      io.to(game.creator_telegram_id).emit('hint_request', { gameId, from: telegram_id });
      await safeNotifyTelegram(game.creator_telegram_id, `🔎 درخواست راهنمایی از ${telegram_id} در بازی ${gameId}`);
    }catch(e){ console.error(e); }
  });

  socket.on('confirm_hint', async ({ gameId, creator_telegram_id, targetIndex }) => {
    try{
      const g = await pool.query(`SELECT * FROM games WHERE id=$1`, [gameId]); if (!g.rowCount) return;
      const game = g.rows[0];
      const word = game.word;
      const revealed = new Set(JSON.parse(game.revealed_indices || '[]').map(Number));
      const unrevealed = [];
      for (let i=0;i<word.length;i++){ if (word[i]===' ') continue; if (!revealed.has(i)) unrevealed.push(i); }
      if (unrevealed.length===0) return;
      let idxToReveal = null;
      if (typeof targetIndex === 'number' && unrevealed.includes(targetIndex)) idxToReveal = targetIndex;
      else idxToReveal = unrevealed[Math.floor(Math.random()*unrevealed.length)];
      revealed.add(idxToReveal);
      await pool.query(`UPDATE games SET revealed_indices=$1, hints_used = hints_used + 1 WHERE id=$2`, [JSON.stringify(Array.from(revealed).sort((a,b)=>a-b)), gameId]);
      await pool.query(`INSERT INTO events_log(game_id, actor_telegram_id, type, payload) VALUES($1,$2,'hint_given',$3)`, [gameId, creator_telegram_id, { revealed_index: idxToReveal }]);
      const mask = maskWord(word, revealed);
      io.to(`game_${gameId}`).emit('mask_update', { gameId, mask, actor: creator_telegram_id, hint: true, revealed_index: idxToReveal });
      // notify players
      const players = await pool.query(`SELECT telegram_id FROM players WHERE game_id=$1`, [gameId]);
      for (let p of players.rows) await safeNotifyTelegram(p.telegram_id, `💡 در بازی ${gameId} یک راهنمایی اعمال شد.`);
    }catch(e){ console.error(e); }
  });

  socket.on('get_logs', async ({ gameId }) => {
    try{
      const logs = await pool.query(`SELECT * FROM events_log WHERE game_id=$1 ORDER BY event_time ASC LIMIT 500`, [gameId]);
      socket.emit('logs', logs.rows);
    }catch(e){ console.error(e); }
  });

  socket.on('disconnect', () => {/* noop */});
});

// ---------- Telegram / Bot WebApp helper route ----------
// This returns a small HTML page used for web_app button fallback if needed.
app.get('/webapp', (req,res) => {
  res.sendFile(path.join(__dirname, 'front.html'));
});

// ---------- start ----------
(async () => {
  try{
    await ensureTables();
    server.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
      if (BOT_TOKEN) console.log('Telegram bot configured.');
    });
  }catch(err){
    console.error('startup error', err);
    process.exit(1);
  }
})();
