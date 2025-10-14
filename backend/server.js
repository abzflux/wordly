const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, WEB_APP_URL } = require('./config/config');
const { initDatabase } = require('./database/models');

// Import routes
const botRoutes = require('./routes/bot');
const gameRoutes = require('./routes/game');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/game', gameRoutes);
app.use('/api/bot', botRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/game.html'));
});

app.get('/create', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/create.html'));
});

// Initialize database and start server
const startServer = async () => {
  try {
    await initDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Web app available at: ${WEB_APP_URL}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
