const { Pool } = require('pg');
const { DATABASE_URL } = require('../config/config');

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Database connection error:', err);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool
};
