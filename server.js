const express = require('express');
const cors = require('cors');
const { PORT, WEB_APP_URL, BACKEND_URL } = require('./config/config');
const { initDatabase } = require('./database/models');

// Import routes
const gameRoutes = require('./routes/game');
const botRoutes = require('./routes/bot');
const leaderboardRoutes = require('./routes/leaderboard'); // اضافه شد

const app = express();

// CORS configuration
app.use(cors({
    origin: [WEB_APP_URL, 'https://telegram.org'],
    credentials: true
}));

// Middleware
app.use(express.json());

// Routes
app.use('/api/game', gameRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/leaderboard', leaderboardRoutes); // اضافه شد

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Initialize database and start server
const startServer = async () => {
    try {
        await initDatabase();
        
        app.listen(PORT, () => {
            console.log(`🚀 Backend server running on port ${PORT}`);
            console.log(`🌐 Frontend: ${WEB_APP_URL}`);
            console.log(`🔗 Backend URL: ${BACKEND_URL}`);
            console.log(`📊 Leaderboard API: ${BACKEND_URL}/api/leaderboard`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
