const { query } = require('./db');

const resetDatabase = async () => {
    try {
        console.log('💣 Resetting database...');
        
        // حذف همه جداول
        await query('DROP TABLE IF EXISTS games CASCADE');
        await query('DROP TABLE IF EXISTS leaderboard CASCADE');
        await query('DROP TABLE IF EXISTS users CASCADE');
        await query('DROP TABLE IF EXISTS leagues CASCADE');
        
        console.log('✅ All tables dropped');
        
        // ایجاد جداول با ساختار جدید
        const { initDatabase } = require('./models');
        await initDatabase();
        
        console.log('✅ Database reset completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Error resetting database:', error);
        return false;
    }
};

// اگر مستقیماً اجرا شد
if (require.main === module) {
    resetDatabase().then(success => {
        if (success) {
            console.log('🎉 Database reset complete!');
            process.exit(0);
        } else {
            console.log('💥 Database reset failed!');
            process.exit(1);
        }
    });
}

module.exports = resetDatabase;
