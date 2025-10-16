// === server.js ===
import express from "express";
import bodyParser from "body-parser";
import { Pool } from "pg";
import TelegramBot from "node-telegram-bot-api";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || "8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://wordlybot.ct.ws";
const PORT = process.env.PORT || 3000;

// === Express + Socket.io setup ===
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND_URL, methods: ["GET", "POST"] }
});

app.use(bodyParser.json());
app.use(express.static("public"));

// === PostgreSQL ===
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false },
});

// === Telegram Bot ===
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Database setup ===
async function ensureTables() {
  try {
    console.log("🧩 Resetting tables...");
    await pool.query(`
      DROP TABLE IF EXISTS guesses CASCADE;
      DROP TABLE IF EXISTS players CASCADE;
      DROP TABLE IF EXISTS games CASCADE;
    `);

    await pool.query(`
      CREATE TABLE games (
        id SERIAL PRIMARY KEY,
        creator_id TEXT NOT NULL,
        creator_name TEXT,
        word TEXT NOT NULL,
        status TEXT DEFAULT 'waiting',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE players (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        score INTEGER DEFAULT 0,
        joined_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE guesses (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        letter TEXT NOT NULL,
        correct BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Tables created successfully!");
  } catch (err) {
    console.error("❌ Error creating tables:", err);
  }
}

// === Telegram Bot Handlers ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const url = `${FRONTEND_URL}?user_id=${msg.from.id}&username=${encodeURIComponent(msg.from.username || msg.from.first_name)}`;
  const opts = {
    reply_markup: {
      inline_keyboard: [[{ text: "🎮 ورود به بازی حدس کلمه", web_app: { url } }]],
    },
  };
  bot.sendMessage(chatId, `سلام ${msg.from.first_name}! 👋\nبه بازی حدس کلمه خوش اومدی!`, opts);
});

// === API Endpoints ===
app.post("/api/create-game", async (req, res) => {
  const { creator_id, creator_name, word } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO games (creator_id, creator_name, word, status) VALUES ($1, $2, $3, 'waiting') RETURNING *",
      [creator_id, creator_name, word]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating game");
  }
});

app.get("/api/games", async (req, res) => {
  const { user_id } = req.query;
  try {
    const created = await pool.query("SELECT * FROM games WHERE creator_id=$1 ORDER BY created_at DESC", [user_id]);
    const others = await pool.query("SELECT * FROM games WHERE creator_id<>$1 AND status='waiting' ORDER BY created_at DESC", [user_id]);
    res.json({ created: created.rows, others: others.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching games");
  }
});

app.post("/api/join", async (req, res) => {
  const { user_id, username, game_id } = req.body;
  try {
    await pool.query(
      "INSERT INTO players (user_id, username, game_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [user_id, username, game_id]
    );
    await pool.query("UPDATE games SET status='playing' WHERE id=$1", [game_id]);
    const creator = await pool.query("SELECT creator_id FROM games WHERE id=$1", [game_id]);
    bot.sendMessage(creator.rows[0].creator_id, `🎯 بازیکن جدیدی (${username}) به بازی شما پیوست!`);
    io.emit("playerJoined", { game_id, username });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error joining game");
  }
});

io.on("connection", (socket) => {
  console.log("🔗 User connected to Socket.io");
  socket.on("guessLetter", async (data) => {
    const { game_id, user_id, letter } = data;
    try {
      const game = await pool.query("SELECT word, creator_id FROM games WHERE id=$1", [game_id]);
      if (!game.rows[0]) return;

      const correct = game.rows[0].word.toLowerCase().includes(letter.toLowerCase());
      await pool.query("INSERT INTO guesses (game_id, user_id, letter, correct) VALUES ($1, $2, $3, $4)", [game_id, user_id, letter, correct]);
      io.emit("letterGuessed", { game_id, letter, correct });
    } catch (err) {
      console.error(err);
    }
  });
});

// === Start Server ===
server.listen(PORT, async () => {
  await ensureTables();
  console.log(`🚀 Server running on port ${PORT}`);
});
