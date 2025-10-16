import express from "express";
import { Pool } from "pg";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// --- تنظیم مسیرها و dotenv ---
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- تنظیمات ---
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// --- راه‌اندازی تلگرام ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// --- راه‌اندازی پایگاه داده ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { require: true, rejectUnauthorized: false },
});

// --- ایجاد جداول ---
async function setupTables() {
  await pool.query(`
    DROP TABLE IF EXISTS guesses, players, games CASCADE;

    CREATE TABLE games (
      id SERIAL PRIMARY KEY,
      creator_id BIGINT,
      creator_name TEXT,
      word TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE players (
      id SERIAL PRIMARY KEY,
      user_id BIGINT,
      username TEXT,
      game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
      score INTEGER DEFAULT 0,
      joined_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE guesses (
      id SERIAL PRIMARY KEY,
      game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
      user_id BIGINT,
      letter CHAR(1),
      correct BOOLEAN,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("✅ Tables dropped and recreated successfully!");
}
setupTables().catch(console.error);

// --- راه‌اندازی Express ---
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- APIها ---
app.post("/api/create", async (req, res) => {
  const { creator_id, creator_name, word } = req.body;
  const result = await pool.query(
    `INSERT INTO games (creator_id, creator_name, word) VALUES ($1, $2, $3) RETURNING *`,
    [creator_id, creator_name, word.trim()]
  );
  res.json(result.rows[0]);
});

app.get("/api/games", async (req, res) => {
  const { user_id } = req.query;
  const mine = await pool.query(`SELECT * FROM games WHERE creator_id = $1 ORDER BY created_at DESC`, [user_id]);
  const others = await pool.query(`SELECT * FROM games WHERE creator_id != $1 AND is_active = TRUE ORDER BY created_at DESC`, [user_id]);
  res.json({ mine: mine.rows, others: others.rows });
});

app.post("/api/join", async (req, res) => {
  const { user_id, username, game_id } = req.body;
  await pool.query(`INSERT INTO players (user_id, username, game_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [user_id, username, game_id]);
  res.json({ success: true });
});

// --- شروع ربات تلگرام ---
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  const webAppUrl = `${FRONTEND_URL}?user_id=${user.id}&username=${encodeURIComponent(user.first_name || user.username)}`;

  await bot.sendMessage(chatId, `🎮 سلام ${user.first_name}! به بازی حدس کلمه خوش اومدی!`, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🚀 شروع بازی",
            web_app: { url: webAppUrl },
          },
        ],
      ],
    },
  });
});

// --- اجرای سرور ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
