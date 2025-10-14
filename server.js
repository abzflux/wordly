require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware برای فایل‌های استاتیک
app.use(express.static('public'));

// Initialize bot
let bot;
if (process.env.TELEGRAM_TOKEN) {
    try {
        bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
        console.log('✅ Bot initialized with polling');
        
        // Web App URL - حالا از همین سرور استفاده می‌کنیم
        const WEB_APP_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-app.onrender.com'}`;

        // Start command
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const firstName = msg.from.first_name;
            
            bot.sendMessage(chatId, `👋 سلام ${firstName}! به بازی کلمه خوش آمدید!`, {
                reply_markup: {
                    keyboard: [
                        [{ text: '🎮 بازی دو نفره' }, { text: '🏆 لیگ' }],
                        [{ text: '📊 جدول رتبه‌بندی' }, { text: 'ℹ️ راهنما' }]
                    ],
                    resize_keyboard: true
                }
            });
        });

        // Handle بازی دو نفره
        bot.on('message', async (msg) => {
            if (msg.text === '🎮 بازی دو نفره') {
                const chatId = msg.chat.id;
                
                // Generate game code
                const gameCode = generateGameCode();
                
                // Save to database (ساده شده)
                const { query } = require('./database/db');
                try {
                    await query(
                        'INSERT INTO games (code, creator_id, max_attempts) VALUES ($1, $2, $3)',
                        [gameCode, msg.from.id, 10]
                    );

                    // Web App URL - از همین سرور
                    const webAppUrl = `${WEB_APP_URL}/create.html?code=${gameCode}`;
                    
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
            }
        });

        // Join command
        bot.onText(/\/join (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const gameCode = match[1].toUpperCase();
            
            try {
                const { query } = require('./database/db');
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

                const webAppUrl = `${WEB_APP_URL}/game.html?code=${game.code}&player=opponent`;
                
                bot.sendMessage(chatId, `🎉 شما به بازی پیوستید!`, {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '🚀 شروع بازی', web_app: { url: webAppUrl } }
                        ]]
                    }
                });

            } catch (error) {
                console.error('Error joining game:', error);
                bot.sendMessage(chatId, '❌ خطا در پیوستن به بازی.');
            }
        });

        console.log('✅ Bot commands registered');

    } catch (error) {
        console.error('❌ Bot initialization error:', error);
    }
}

// Generate game code
function generateGameCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Serve frontend files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

app.get('/game.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        bot: bot ? 'active' : 'inactive',
        timestamp: new Date().toISOString()
    });
});


app.get('/nuke-db', async (req, res) => {
    try {
        const resetDatabase = require('./database/reset');
        await resetDatabase();
        res.json({ 
            success: true, 
            message: '💣 Database nuked successfully! Restarting...' 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Frontend served from: https://your-app.onrender.com`);
});
