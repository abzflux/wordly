const { Pool } = require('pg');

async function nukeDatabase() {
    console.log('💣 شروع نابودی کامل دیتابیس...');
    
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        // ۱. قطع کردن تمام connectionهای فعال
        console.log('🔪 قطع کردن connectionهای فعال...');
        await pool.query(`
            SELECT pg_terminate_backend(pg_stat_activity.pid)
            FROM pg_stat_activity
            WHERE pg_stat_activity.datname = current_database()
            AND pid <> pg_backend_pid();
        `);

        // ۲. حذف همه جداول
        console.log('🔥 حذف همه جداول...');
        await pool.query(`
            DROP TABLE IF EXISTS games CASCADE;
            DROP TABLE IF EXISTS leaderboard CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
            DROP TABLE IF EXISTS leagues CASCADE;
        `);

        // ۳. حذف همه sequences
        console.log('🗑️ حذف sequences...');
        await pool.query(`
            DROP SEQUENCE IF EXISTS games_id_seq CASCADE;
            DROP SEQUENCE IF EXISTS leaderboard_id_seq CASCADE;
            DROP SEQUENCE IF EXISTS users_id_seq CASCADE;
            DROP SEQUENCE IF EXISTS leagues_id_seq CASCADE;
        `);

        console.log('✅ دیتابیس کاملاً نابود شد!');
        return true;

    } catch (error) {
        console.error('❌ خطا در نابودی دیتابیس:', error);
        return false;
    } finally {
        await pool.end();
    }
}

// اجرای مستقیم
if (require.main === module) {
    nukeDatabase().then(success => {
        if (success) {
            console.log('🎉 دیتابیس کاملاً پاک شد! حالا سرور رو restart کن.');
            process.exit(0);
        } else {
            console.log('💥 خطا در پاک کردن دیتابیس!');
            process.exit(1);
        }
    });
}

module.exports = nukeDatabase;
