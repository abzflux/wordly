const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_TOKEN, WEB_APP_URL } = require('../config/config');
const { query } = require('../database/db');
const GameLogic = require('../utils/gameLogic');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Store active games in memory (can be moved to Redis in production)
const activeGames = new Map();

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name;
  
  // Save user to database
  await query(
    'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3, last_name = $4',
    [userId, msg.from.username, firstName, msg.from.last_name]
  );

  const menu = {
    reply_markup: {
      keyboard: [
        [{ text: '🎮 بازی دو نفره' }, { text: '🏆 لیگ' }],
        [{ text: '📊 جدول رتبه‌بندی' }, { text: 'ℹ️ راهنما' }]
      ],
      resize_keyboard: true
    }
  };

  bot.sendMessage(chatId, `👋 سلام ${firstName}! به بازی کلمه‌ی خوش آمدید!`, menu);
});

bot.onText(/\/join (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const gameCode = match[1].toUpperCase();
  
  const gameResult = await query(
    'SELECT * FROM games WHERE code = $1 AND status = $2',
    [gameCode, 'waiting']
  );

  if (gameResult.rows.length === 0) {
    return bot.sendMessage(chatId, '❌ بازی یافت نشد یا قبلاً شروع شده است.');
  }

  const game = gameResult.rows[0];
  
  // Update game with opponent
  await query(
    'UPDATE games SET opponent_id = $1, status = $2, start_time = $3 WHERE id = $4',
    [msg.from.id, 'active', new Date(), game.id]
  );

  const webAppUrl = `${WEB_APP_URL}/game.html?code=${gameCode}&player=opponent`;
  
  bot.sendMessage(chatId, `🎉 شما به بازی پیوستید!`, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀 شروع بازی', web_app: { url: webAppUrl } }
      ]]
    }
  });

  // Notify creator
  const creatorWebAppUrl = `${WEB_APP_URL}/game.html?code=${gameCode}&player=creator`;
  bot.sendMessage(game.creator_id, `🎊 کاربری به بازی شما پیوست!`, {
    reply_markup: {
      inline_keyboard: [[
        { text: '🚀 شروع بازی', web_app: { url: creatorWebAppUrl } }
      ]]
    }
  });
});

bot.on('message', async (msg) => {
  if (!msg.text) return;
  
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '🎮 بازی دو نفره') {
    const gameCode = GameLogic.generateGameCode();
    
    await query(
      'INSERT INTO games (code, creator_id, max_attempts) VALUES ($1, $2, $3)',
      [gameCode, msg.from.id, 10]
    );

    const webAppUrl = `${WEB_APP_URL}/create.html?code=${gameCode}`;
    
    bot.sendMessage(chatId, `🎯 بازی جدید ایجاد شد!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📝 انتخاب کلمه', web_app: { url: webAppUrl } }],
          [{ text: '🔗 دعوت از دوست', switch_inline_query: `برای پیوستن به بازی از دستور /join ${gameCode} استفاده کن!` }]
        ]
      }
    });

  } else if (text === '🏆 لیگ') {
    // League implementation
    bot.sendMessage(chatId, '🏆 حالت لیگ به زودی اضافه خواهد شد!');
    
  } else if (text === '📊 جدول رتبه‌بندی') {
    const leaderboard = await query(`
      SELECT u.first_name, u.username, l.score 
      FROM leaderboard l 
      JOIN users u ON l.user_id = u.telegram_id 
      ORDER BY l.score DESC 
      LIMIT 10
    `);
    
    let leaderboardText = '🏆 جدول رتبه‌بندی:\n\n';
    leaderboard.rows.forEach((row, index) => {
      leaderboardText += `${index + 1}. ${row.first_name} - ${row.score} امتیاز\n`;
    });
    
    bot.sendMessage(chatId, leaderboardText);
    
  } else if (text === 'ℹ️ راهنما') {
    const helpText = `
🎮 راهنمای بازی کلمه:

• بازی دو نفره: یک بازی با دوست خود ایجاد کنید
• لیگ: در مسابقات 10 مرحله‌ای شرکت کنید
• هر بازیکن فرصت دارد حروف را حدس بزند
• زمان کمتر = امتیاز بیشتر
• استفاده از راهنما 15 امتیاز کسر دارد

موفق باشید! 🎯
    `;
    bot.sendMessage(chatId, helpText);
  }
});

module.exports = bot;
