const { query } = require('./db');

const initDatabase = async () => {
    try {
        console.log('🔄 Initializing database...');
        
        // Create users table
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

        console.log('✅ Database initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Error initializing database:', error);
        return false;
    }
};

module.exports = {
    initDatabase
};
