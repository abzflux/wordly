require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Check environment variables
console.log('🔍 Checking environment variables...');
console.log('TELEGRAM_TOKEN:', process.env.TELEGRAM_TOKEN ? '✅ Set' : '❌ Missing');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
console.log('PORT:', process.env.PORT || 3000);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Initialize Telegram Bot
let bot;
try {
    if (process.env.TELEGRAM_TOKEN) {
        bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
        console.log('✅ Telegram Bot initialized successfully');
        
        // Basic bot commands
        bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, '🎮 به بازی کلمه خوش آمدید! از منوی زیر انتخاب کنید:', {
                reply_markup: {
                    keyboard: [
                        [{ text: '🎮 بازی دو نفره' }],
                        [{ text: '🏆 جدول رتبه‌بندی' }]
                    ],
                    resize_keyboard: true
                }
            });
        });

        bot.onText(/\/test/, (msg) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId, '✅ ربات در حال کار است!');
        });

        bot.on('message', (msg) => {
            if (msg.text === '🎮 بازی دو نفره') {
                const chatId = msg.chat.id;
                bot.sendMessage(chatId, 'برای ایجاد بازی، از وب اپ استفاده کنید:');
            }
        });

    } else {
        console.log('❌ TELEGRAM_TOKEN not found, bot will not work');
    }
} catch (error) {
    console.error('❌ Error initializing Telegram bot:', error);
}

// Import routes
try {
    const gameRoutes = require('./routes/game');
    const botRoutes = require('./routes/bot'); 
    const leaderboardRoutes = require('./routes/leaderboard');
    
    app.use('/api/game', gameRoutes);
    app.use('/api/bot', botRoutes);
    app.use('/api/leaderboard', leaderboardRoutes);
    
    console.log('✅ All routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading routes:', error);
}

// Health check with more info
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        bot_status: bot ? 'active' : 'inactive',
        database_url: process.env.DATABASE_URL ? 'configured' : 'missing'
    });
});

// Test database connection
app.get('/test-db', async (req, res) => {
    try {
        const { query } = require('./database/db');
        const result = await query('SELECT NOW() as current_time');
        res.json({ 
            success: true, 
            database: 'connected',
            current_time: result.rows[0].current_time
        });
    } catch (error) {
        res.json({ 
            success: false, 
            database: 'error',
            error: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: https://wordlybot.onrender.com/health`);
    console.log(`📍 Database test: https://wordlybot.onrender.com/test-db`);
});
