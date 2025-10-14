const { query } = require('./db');

// Initialize database tables
const initDatabase = async () => {
  try {
    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Games table
    await query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) UNIQUE NOT NULL,
        creator_id BIGINT NOT NULL,
        opponent_id BIGINT,
        word VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        max_attempts INTEGER NOT NULL,
        current_attempt INTEGER DEFAULT 0,
        guessed_letters TEXT[] DEFAULT '{}',
        correct_letters TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'waiting',
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Leaderboard table
    await query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        score INTEGER NOT NULL,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        average_time FLOAT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // League table
    await query(`
      CREATE TABLE IF NOT EXISTS leagues (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        round INTEGER DEFAULT 1,
        total_score INTEGER DEFAULT 0,
        current_word_index INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};

module.exports = {
  initDatabase
};
