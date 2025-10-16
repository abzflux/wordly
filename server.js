require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { Client } = require('pg');
const express = require('express');  // برای سرور webhook

const token = process.env.TELEGRAM_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const bot = new TelegramBot(token, { polling: false });  // webhook mode
const app = express();
app.use(express.json());

// اتصال به PostgreSQL
const dbClient = new Client({ connectionString: databaseUrl });
dbClient.connect().then(() => {
  console.log('Connected to PostgreSQL');
  // ساخت جدول users اگر نباشه
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

// هندل /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;  // نام، ID و غیره
  const username = user.username || 'بدون یوزرنیم';
  const firstName = user.first_name || 'کاربر عزیز';

  // پیام اولیه loading با spinner inline keyboard
  const loadingMarkup = {
    reply_markup: {
      inline_keyboard: [[
        { text: '⏳ در حال بارگذاری...', callback_data: 'loading_spinner' }
      ]]
    }
  };
  await bot.sendMessage(chatId, '🌸 به ربات Twintail خوش آمدید! 🌸\n(صفحه در حال لود...)', loadingMarkup);

  // Callback برای spinner (تلگرام spinner رو خودکار نشون می‌ده، اما ما edit می‌کنیم)
  bot.on('callback_query', async (callbackQuery) => {
    const cbChatId = callbackQuery.message.chat.id;
    const cbMessageId = callbackQuery.message.message_id;

    if (callbackQuery.data === 'loading_spinner') {
      // تأخیر برای simulate loading (در واقعیت می‌تونی DB query یا API بزنی)
      setTimeout(async () => {
        // پاک کردن spinner و edit پیام به خوش‌آمدگویی جذاب
        const welcomeText = `
🌸 *سلام ${firstName} جان! 👋* 🌸

به دنیای Twintail خوش اومدی! 😍
- نام: ${firstName}
- یوزرنیم: @${username}
- آیدی: \`${user.id}\`

اینجا همه چیز پر از انرژی انیمه‌ای و جذابه! 💖
دفعه بعد چیکار کنیم؟ /help بزن!

(با عشق ساخته شده ✨)
        `;
        await bot.editMessageText(welcomeText, {
          chat_id: cbChatId,
          message_id: cbMessageId,
          parse_mode: 'Markdown'
        });
        await bot.answerCallbackQuery(callbackQuery.id);  // پاک کردن spinner تلگرام

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
      }, 2500);  // 2.5 ثانیه loading
    }
  });
});

// Webhook endpoint (تلگرام به این URL POST می‌کنه)
app.post(`/${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ست کردن webhook (وقتی سرور بالا می‌آد)
app.listen(process.env.PORT || 3000, () => {
  const webhookUrl = `https://wordlybot.onrender.com/${token}`;  // جایگزین با URL واقعی Render
  bot.setWebHook(webhookUrl).then(() => {
    console.log(`Webhook set to ${webhookUrl}`);
  }).catch(err => console.error('Webhook Error:', err));
});

console.log('Server running...');
