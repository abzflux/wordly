const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { query } = require('../database/db');
const GameLogic = require('../utils/gameLogic');

const router = express.Router();

// Initialize bot
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Web App URL - باید HTTPS باشد
const WEB_APP_URL = 'https://wordlybot.ct.ws';

// /start command با منوی درست
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

    // منوی اصلی با دکمه Web App
    const menu = {
        reply_markup: {
            keyboard: [
                [{ text: '🎮 بازی دو نفره' }],
                [{ text: '🏆 حالت لیگ' }],
                [{ text: '📊 جدول رتبه‌بندی' }]
            ],
            resize_keyboard: true
        }
    };

    bot.sendMessage(chatId, `👋 سلام ${firstName}! به بازی کلمه خوش آمدید!\n\nبرای شروع بازی از گزینه‌های زیر استفاده کنید:`, menu);
});

// ایجاد بازی دو نفره - با Mini App درست
bot.on('message', async (msg) => {
    if (msg.text === '🎮 بازی دو نفره') {
        const chatId = msg.chat.id;
        const gameCode = GameLogic.generateGameCode();
        
        try {
            await query(
                'INSERT INTO games (code, creator_id, max_attempts) VALUES ($1, $2, $3)',
                [gameCode, msg.from.id, 10]
            );

            // ایجاد لینک Mini App درست
            const miniAppUrl = `${WEB_APP_URL}/create.html?code=${gameCode}&startapp=${gameCode}`;
            
            bot.sendMessage(chatId, `🎯 *بازی جدید ایجاد شد!*\n\n🏷️ کد بازی: \`${gameCode}\`\n\nبرای تنظیم کلمه روی دکمه زیر کلیک کنید:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ 
                            text: '📝 تنظیم کلمه', 
                            web_app: { url: miniAppUrl } 
                        }],
                        [{ 
                            text: '🔗 دعوت از دوست', 
                            switch_inline_query: `برای پیوستن به بازی از دستور زیر استفاده کن:\n/join ${gameCode}`
                        }]
                    ]
                }
            });

        } catch (error) {
            console.error('Error creating game:', error);
            bot.sendMessage(chatId, '❌ خطا در ایجاد بازی.');
        }
    }
});

// دستور join با Mini App
bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const gameCode = match[1].toUpperCase();
    
    try {
        const gameResult = await query(
            'SELECT * FROM games WHERE code = $1 AND status IN ($2, $3)',
            [gameCode, 'waiting', 'ready']
        );

        if (gameResult.rows.length === 0) {
            return bot.sendMessage(chatId, '❌ بازی یافت نشد یا قبلاً شروع شده است.');
        }

        const game = gameResult.rows[0];
        
        // اگر بازی آماده است، حریف رو اضافه کن
        if (game.status === 'waiting') {
            await query(
                'UPDATE games SET opponent_id = $1, status = $2 WHERE code = $3',
                [msg.from.id, 'ready', game.code]
            );
        }

        // لینک Mini App برای حریف
        const miniAppUrl = `${WEB_APP_URL}/game.html?code=${game.code}&player=opponent&startapp=${game.code}`;
        
        bot.sendMessage(chatId, `🎉 *شما به بازی پیوستید!*\n\n🏷️ کد بازی: \`${game.code}\`\n\nبرای شروع بازی روی دکمه زیر کلیک کنید:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { 
                        text: '🚀 شروع بازی', 
                        web_app: { url: miniAppUrl } 
                    }
                ]]
            }
        });

        // اطلاع به سازنده بازی
        if (game.creator_id !== msg.from.id) {
            const creatorMiniAppUrl = `${WEB_APP_URL}/game.html?code=${game.code}&player=creator&startapp=${game.code}`;
            bot.sendMessage(game.creator_id, `🎊 *یک کاربر به بازی شما پیوست!*\n\nبرای شروع بازی روی دکمه زیر کلیک کنید:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { 
                            text: '🚀 شروع بازی', 
                            web_app: { url: creatorMiniAppUrl } 
                        }
                    ]]
                }
            });
        }

    } catch (error) {
        console.error('Error joining game:', error);
        bot.sendMessage(chatId, '❌ خطا در پیوستن به بازی.');
    }
});

// سایر دستورات...
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '📊 جدول رتبه‌بندی') {
        try {
            const leaderboard = await query(`
                SELECT u.first_name, u.username, l.score 
                FROM leaderboard l 
                JOIN users u ON l.user_id = u.telegram_id 
                ORDER BY l.score DESC 
                LIMIT 10
            `);
            
            let leaderboardText = '🏆 *جدول رتبه‌بندی:*\n\n';
            leaderboard.rows.forEach((row, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                leaderboardText += `${medal} ${row.first_name} - ${row.score} امتیاز\n`;
            });
            
            bot.sendMessage(chatId, leaderboardText, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            bot.sendMessage(chatId, '❌ خطا در دریافت جدول رتبه‌بندی.');
        }
    }
});

module.exports = router;
