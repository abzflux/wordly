require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg');
const express = require('express');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const frontendUrl = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';  // env var برای URL
const bot = new TelegramBot(token, { polling: false });
const app = express();
app.use(express.json());

// سرو فایل‌های استاتیک mini app
app.use(express.static(path.join(__dirname, 'public')));

// روت اصلی mini app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// اتصال به PostgreSQL
const dbClient = new Client({ connectionString: databaseUrl });
dbClient.connect().then(() => {
  console.log('Connected to PostgreSQL');
  dbClient.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255),
      first_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `).catch(err => console.error('DB Error:', err));
}).catch(err => console.error('DB Connection Error:', err));

// هندل /start - مستقیم mini app لود می‌شه با متن رسمی
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  const username = user.username || 'بدون یوزرنیم';
  const firstName = user.first_name || 'کاربر محترم';

  // ذخیره در DB
  try {
    await dbClient.query(
      'INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) ON CONFLICT (telegram_id) DO NOTHING',
      [user.id, username, firstName]
    );
    console.log(`User ${user.id} saved to DB`);
  } catch (err) {
    console.error('DB Insert Error:', err);
  }

  // پیام خوش‌آمدگویی رسمی با دکمه keyboard برای باز کردن mini app
  const welcomeText = `
*به بازی ایجاد و حدس کلمه خوش آمدید!*

سلام ${firstName} عزیز،
- نام: ${firstName}
- یوزرنیم: @${username}
- آیدی: \`${user.id}\`

این بازی هیجان‌انگیز به زودی طراحی و راه‌اندازی خواهد شد. برای ورود به داشبورد و جزئیات بیشتر، دکمه زیر را انتخاب نمایید.
  `;
  const keyboard = {
    reply_markup: {
      keyboard: [[
        { text: 'باز کردن داشبورد بازی 🎮', web_app: { url: frontendUrl } }
      ]],
      resize_keyboard: true
    },
    parse_mode: 'Markdown'
  };
  await bot.sendMessage(chatId, welcomeText, keyboard);
});

// Webhook endpoint
app.post(`/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ست کردن webhook و سرور
const port = process.env.PORT || 3000;
app.listen(port, () => {
  const webhookUrl = `${frontendUrl.replace(/\/$/, '')}/${token}`;
  bot.setWebHook(webhookUrl).then(() => {
    console.log(`Webhook set to ${webhookUrl}`);
  }).catch(err => console.error('Webhook Error:', err));
  console.log(`Server running on port ${port}`);
});
