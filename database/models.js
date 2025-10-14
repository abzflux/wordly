const { query } = require('./db');

const initDatabase = async () => {
  try {
    // ابتدا جداول قدیمی رو حذف کنیم (اگر تستی است)
    // await query('DROP TABLE IF EXISTS games CASCADE');
    // await query('DROP TABLE IF EXISTS leaderboard CASCADE');
    // await query('DROP TABLE IF EXISTS users CASCADE');

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

    // Games table - با ساختار درست
    await query(`
      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) UNIQUE NOT NULL,
        creator_id BIGINT NOT NULL,
        opponent_id BIGINT,
        target_word VARCHAR(255),  -- اینجا NULLABLE باشه
        category VARCHAR(100),
        max_attempts INTEGER DEFAULT 10,
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
        user_id BIGINT UNIQUE NOT NULL,
        score INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        games_won INTEGER DEFAULT 0,
        average_time FLOAT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

module.exports = {
  initDatabase
};
