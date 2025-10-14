const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../database/db');
const GameLogic = require('../utils/gameLogic');

const router = express.Router();

// Initialize bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Store active games temporarily
const activeGames = new Map();

// /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    
    // Save user to database
    try {
        await query(
            'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3, last_name = $4',
            [userId, msg.from.username, firstName, msg.from.last_name || '']
        );
    } catch (error) {
        console.error('Error saving user:', error);
    }

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

// /join command
bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const gameCode = match[1].toUpperCase();
    
    try {
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
            'UPDATE games SET opponent_id = $1, status = $2 WHERE code = $3',
            [msg.from.id, 'ready', game.code]
        );

        const webAppUrl = `${process.env.WEB_APP_URL}/game.html?code=${game.code}&player=opponent`;
        
        bot.sendMessage(chatId, `🎉 شما به بازی پیوستید!`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🚀 شروع بازی', web_app: { url: webAppUrl } }
                ]]
            }
        });

        // Notify creator
        const creatorWebAppUrl = `${process.env.WEB_APP_URL}/game.html?code=${game.code}&player=creator`;
        bot.sendMessage(game.creator_id, `🎊 کاربری به بازی شما پیوست!`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🚀 شروع بازی', web_app: { url: creatorWebAppUrl } }
                ]]
            }
        });

    } catch (error) {
        console.error('Error joining game:', error);
        bot.sendMessage(chatId, '❌ خطا در پیوستن به بازی.');
    }
});

// Handle menu messages
bot.on('message', async (msg) => {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '🎮 بازی دو نفره') {
        const gameCode = GameLogic.generateGameCode();
        
        try {
            await query(
                'INSERT INTO games (code, creator_id, max_attempts) VALUES ($1, $2, $3)',
                [gameCode, msg.from.id, 10]
            );

            const webAppUrl = `${process.env.WEB_APP_URL}/create.html?code=${gameCode}`;
            
            bot.sendMessage(chatId, `🎯 بازی جدید ایجاد شد!\n\nکد بازی: ${gameCode}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📝 انتخاب کلمه', web_app: { url: webAppUrl } }],
                        [{ text: '🔗 دعوت از دوست', switch_inline_query: `برای پیوستن به بازی از دستور /join ${gameCode} استفاده کن!` }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error creating game:', error);
            bot.sendMessage(chatId, '❌ خطا در ایجاد بازی.');
        }

    } else if (text === '📊 جدول رتبه‌بندی') {
        try {
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
            
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            bot.sendMessage(chatId, '❌ خطا در دریافت جدول رتبه‌بندی.');
        }
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

// API routes
router.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Bot routes are working!',
        bot_status: 'active'
    });
});

module.exports = router;
