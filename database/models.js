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

    // Create indexes for better performance
    await query(`
      CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);
      CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_user_id ON leaderboard(user_id);
      CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

// User model methods
const User = {
  async createOrUpdate(userData) {
    const { telegram_id, username, first_name, last_name } = userData;
    const result = await query(
      `INSERT INTO users (telegram_id, username, first_name, last_name) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (telegram_id) DO UPDATE SET 
       username = EXCLUDED.username, 
       first_name = EXCLUDED.first_name, 
       last_name = EXCLUDED.last_name
       RETURNING *`,
      [telegram_id, username, first_name, last_name]
    );
    return result.rows[0];
  },

  async findByTelegramId(telegramId) {
    const result = await query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );
    return result.rows[0];
  }
};

// Game model methods
const Game = {
  async create(gameData) {
    const { code, creator_id, max_attempts = 10 } = gameData;
    const result = await query(
      `INSERT INTO games (code, creator_id, max_attempts) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [code, creator_id, max_attempts]
    );
    return result.rows[0];
  },

  async findByCode(code) {
    const result = await query(
      `SELECT g.*, u1.first_name as creator_name, u2.first_name as opponent_name
       FROM games g 
       LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
       LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
       WHERE g.code = $1`,
      [code]
    );
    return result.rows[0];
  },

  async updateGame(code, updates) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = [code, ...Object.values(updates)];
    
    const result = await query(
      `UPDATE games SET ${setClause} WHERE code = $1 RETURNING *`,
      values
    );
    return result.rows[0];
  },

  async addOpponent(code, opponentId) {
    const result = await query(
      `UPDATE games SET opponent_id = $1, status = 'ready' WHERE code = $2 RETURNING *`,
      [opponentId, code]
    );
    return result.rows[0];
  },

  async startGame(code) {
    const result = await query(
      `UPDATE games SET status = 'active', start_time = $1 WHERE code = $2 RETURNING *`,
      [new Date(), code]
    );
    return result.rows[0];
  },

  async finishGame(code, endTime = new Date()) {
    const result = await query(
      `UPDATE games SET status = 'finished', end_time = $1 WHERE code = $2 RETURNING *`,
      [endTime, code]
    );
    return result.rows[0];
  },

  async getActiveGamesByUser(userId) {
    const result = await query(
      `SELECT g.*, u1.first_name as creator_name, u2.first_name as opponent_name
       FROM games g
       LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
       LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
       WHERE (g.creator_id = $1 OR g.opponent_id = $1)
       AND g.status IN ('waiting', 'ready', 'active')
       ORDER BY g.created_at DESC`,
      [userId]
    );
    return result.rows;
  },

  async deleteExpiredGames() {
    // Delete games that are older than 24 hours and not active
    const result = await query(
      `DELETE FROM games 
       WHERE created_at < NOW() - INTERVAL '24 hours' 
       AND status != 'active'`
    );
    return result.rowCount;
  }
};

// Leaderboard model methods
const Leaderboard = {
  async updateScore(userId, score, gameTime, isWinner) {
    const currentStats = await query(
      'SELECT * FROM leaderboard WHERE user_id = $1',
      [userId]
    );

    if (currentStats.rows.length === 0) {
      // Create new entry
      const result = await query(
        `INSERT INTO leaderboard (user_id, score, games_played, games_won, average_time)
         VALUES ($1, $2, 1, $3, $4)
         RETURNING *`,
        [userId, score, isWinner ? 1 : 0, gameTime]
      );
      return result.rows[0];
    } else {
      // Update existing entry
      const current = currentStats.rows[0];
      const newGamesPlayed = current.games_played + 1;
      const newGamesWon = current.games_won + (isWinner ? 1 : 0);
      const newScore = current.score + score;
      
      // Calculate new average time
      const newAverageTime = current.games_played > 0 
        ? (current.average_time * current.games_played + gameTime) / newGamesPlayed
        : gameTime;

      const result = await query(
        `UPDATE leaderboard 
         SET score = $1, 
             games_played = $2, 
             games_won = $3, 
             average_time = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $5
         RETURNING *`,
        [newScore, newGamesPlayed, newGamesWon, newAverageTime, userId]
      );
      return result.rows[0];
    }
  },

  async getTopPlayers(limit = 100) {
    const result = await query(
      `SELECT l.*, u.first_name, u.username
       FROM leaderboard l
       JOIN users u ON l.user_id = u.telegram_id
       WHERE l.score > 0
       ORDER BY l.score DESC, l.games_won DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },

  async getUserRank(userId) {
    const result = await query(
      `SELECT l.*, u.first_name, u.username,
              (SELECT COUNT(*) FROM leaderboard WHERE score > l.score) + 1 as rank,
              (SELECT COUNT(*) FROM leaderboard) as total_players
       FROM leaderboard l
       JOIN users u ON l.user_id = u.telegram_id
       WHERE l.user_id = $1`,
      [userId]
    );
    return result.rows[0];
  },

  async getWeeklyTopPlayers(limit = 50) {
    const result = await query(
      `SELECT l.*, u.first_name, u.username
       FROM leaderboard l
       JOIN users u ON l.user_id = u.telegram_id
       WHERE l.score > 0 
       AND l.updated_at >= NOW() - INTERVAL '7 days'
       ORDER BY l.score DESC, l.games_won DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
};

module.exports = {
  initDatabase,
  User,
  Game,
  Leaderboard
};
