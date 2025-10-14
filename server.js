require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Debug: Check if routes are loading
console.log('🔄 Loading routes...');

// Import and use routes - با try/catch
try {
    const gameRoutes = require('./routes/game');
    const botRoutes = require('./routes/bot'); 
    const leaderboardRoutes = require('./routes/leaderboard');
    
    console.log('✅ Routes loaded successfully');
    
    app.use('/api/game', gameRoutes);
    app.use('/api/bot', botRoutes);
    app.use('/api/leaderboard', leaderboardRoutes);
    
    console.log('✅ Routes mounted successfully');
} catch (error) {
    console.error('❌ Error loading routes:', error);
    process.exit(1);
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'Wordly Bot Backend is running!'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: '🎮 Wordly Bot Backend API',
        version: '1.0.0',
        endpoints: {
            game: '/api/game',
            bot: '/api/bot', 
            leaderboard: '/api/leaderboard',
            health: '/health'
        }
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
});
