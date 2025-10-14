require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { query } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Import API routes
const gameRoutes = require('./routes/game');
const leaderboardRoutes = require('./routes/leaderboard');

// Use API routes
app.use('/api/game', gameRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// از Web App خارجی استفاده می‌کنیم (wordlybot.ct.ws)
const WEB_APP_URL = 'https://wordlybot.ct.ws';

// Initialize bot
let bot;
if (process.env.TELEGRAM_TOKEN) {
    try {
        bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
        console.log('✅ Bot initialized');

        // Generate game code
        const generateGameCode = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };

        // Start command
        bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const firstName = msg.from.first_name;
            
            // Save user
            await query(
                'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_id) DO UPDATE SET username = $2, first_name = $3, last_name = $4',
                [userId, msg.from.username, firstName, msg.from.last_name || '']
            );

            bot.sendMessage(chatId, `👋 سلام ${firstName}! به بازی کلمه خوش آمدید!`, {
                reply_markup: {
                    keyboard: [
                        [{ text: '🎮 بازی دو نفره' }],
                        [{ text: '📊 جدول رتبه‌بندی' }]
                    ],
                    resize_keyboard: true
                }
            });
        });

        // ایجاد بازی با Web App
        bot.on('message', async (msg) => {
            if (msg.text === '🎮 بازی دو نفره') {
                const chatId = msg.chat.id;
                const gameCode = generateGameCode();
                
                try {
                    await query(
                        'INSERT INTO games (code, creator_id, max_attempts, status) VALUES ($1, $2, $3, $4)',
                        [gameCode, msg.from.id, 10, 'waiting']
                    );

                    const webAppUrl = `${WEB_APP_URL}/create.html?code=${gameCode}`;
                    
                    bot.sendMessage(chatId, `🎯 بازی جدید ایجاد شد!\n\nکد بازی: ${gameCode}`, {
                        reply_markup: {
                            inline_keyboard: [
                                [{ 
                                    text: '📝 انتخاب کلمه', 
                                    web_app: { url: webAppUrl } 
                                }],
                                [{ 
                                    text: '🔗 دعوت از دوست', 
                                    switch_inline_query: `برای پیوستن به بازی از دستور /join ${gameCode} استفاده کن!` 
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

        // Join command
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
                
                await query(
                    'UPDATE games SET opponent_id = $1, status = $2 WHERE code = $3',
                    [msg.from.id, 'ready', game.code]
                );

                const webAppUrl = `${WEB_APP_URL}/game.html?code=${game.code}&player=opponent`;
                
                bot.sendMessage(chatId, `🎉 شما به بازی پیوستید!`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: '🚀 شروع بازی', 
                                web_app: { url: webAppUrl } 
                            }
                        ]]
                    }
                });

                // اطلاع به سازنده
                const creatorWebAppUrl = `${WEB_APP_URL}/game.html?code=${game.code}&player=creator`;
                bot.sendMessage(game.creator_id, `🎊 کاربری به بازی شما پیوست!`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { 
                                text: '🚀 شروع بازی', 
                                web_app: { url: creatorWebAppUrl } 
                            }
                        ]]
                    }
                });

            } catch (error) {
                console.error('Error joining game:', error);
                bot.sendMessage(chatId, '❌ خطا در پیوستن به بازی.');
            }
        });

        // جدول رتبه‌بندی
        bot.on('message', async (msg) => {
            if (msg.text === '📊 جدول رتبه‌بندی') {
                try {
                    const leaderboard = await query(`
                        SELECT u.first_name, l.score 
                        FROM leaderboard l 
                        JOIN users u ON l.user_id = u.telegram_id 
                        ORDER BY l.score DESC 
                        LIMIT 5
                    `);
                    
                    let leaderboardText = '🏆 جدول رتبه‌بندی:\n\n';
                    leaderboard.rows.forEach((row, index) => {
                        leaderboardText += `${index + 1}. ${row.first_name} - ${row.score} امتیاز\n`;
                    });
                    
                    bot.sendMessage(msg.chat.id, leaderboardText);
                    
                } catch (error) {
                    bot.sendMessage(msg.chat.id, '📊 هنوز بازی‌ای ثبت نشده است!');
                }
            }
        });

        console.log('✅ Bot started successfully!');

    } catch (error) {
        console.error('❌ Bot initialization error:', error);
    }
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        bot: bot ? 'active' : 'inactive',
        web_app_url: WEB_APP_URL,
        timestamp: new Date().toISOString()
    });
});

// تست Web App URL
app.get('/test-webapp', (req, res) => {
    res.json({
        web_app_url: WEB_APP_URL,
        create_url: `${WEB_APP_URL}/create.html`,
        game_url: `${WEB_APP_URL}/game.html`,
        status: 'Check if these URLs work in browser'
    });
});

// API health check
app.get('/api/game/health', (req, res) => {
    res.json({ 
        status: 'API is working!',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Web App: ${WEB_APP_URL}`);
    console.log(`📍 Health: https://wordlybot.onrender.com/health`);
    console.log(`🔗 API Health: https://wordlybot.onrender.com/api/game/health`);
});
