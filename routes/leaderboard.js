const express = require('express');
const router = express.Router();
const { query } = require('../database/db');

// Get global leaderboard
router.get('/', async (req, res) => {
    try {
        const leaderboard = await query(`
            SELECT 
                u.telegram_id,
                u.first_name,
                u.username,
                l.score,
                l.games_played,
                l.games_won,
                l.average_time,
                RANK() OVER (ORDER BY l.score DESC) as rank
            FROM leaderboard l
            JOIN users u ON l.user_id = u.telegram_id
            WHERE l.score > 0
            ORDER BY l.score DESC, l.games_won DESC, l.average_time ASC
            LIMIT 100
        `);

        res.json(leaderboard.rows);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'خطا در دریافت جدول رتبه‌بندی' });
    }
});

// Get user rank and stats
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const userStats = await query(`
            WITH user_rank AS (
                SELECT 
                    u.telegram_id,
                    u.first_name,
                    u.username,
                    l.score,
                    l.games_played,
                    l.games_won,
                    l.average_time,
                    RANK() OVER (ORDER BY l.score DESC) as rank,
                    COUNT(*) OVER() as total_players
                FROM leaderboard l
                JOIN users u ON l.user_id = u.telegram_id
                WHERE l.score > 0
            )
            SELECT * FROM user_rank WHERE telegram_id = $1
        `, [userId]);

        if (userStats.rows.length === 0) {
            return res.status(404).json({ error: 'کاربر یافت نشد' });
        }

        res.json(userStats.rows[0]);
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ error: 'خطا در دریافت اطلاعات کاربر' });
    }
});

// Get weekly leaderboard
router.get('/weekly', async (req, res) => {
    try {
        const weeklyLeaderboard = await query(`
            SELECT 
                u.telegram_id,
                u.first_name,
                u.username,
                l.score,
                l.games_played,
                l.games_won,
                l.average_time,
                RANK() OVER (ORDER BY l.score DESC) as rank
            FROM leaderboard l
            JOIN users u ON l.user_id = u.telegram_id
            WHERE l.score > 0 
            AND l.updated_at >= NOW() - INTERVAL '7 days'
            ORDER BY l.score DESC, l.games_won DESC
            LIMIT 50
        `);

        res.json(weeklyLeaderboard.rows);
    } catch (error) {
        console.error('Error fetching weekly leaderboard:', error);
        res.status(500).json({ error: 'خطا در دریافت جدول رتبه‌بندی هفتگی' });
    }
});

// Get monthly leaderboard
router.get('/monthly', async (req, res) => {
    try {
        const monthlyLeaderboard = await query(`
            SELECT 
                u.telegram_id,
                u.first_name,
                u.username,
                l.score,
                l.games_played,
                l.games_won,
                l.average_time,
                RANK() OVER (ORDER BY l.score DESC) as rank
            FROM leaderboard l
            JOIN users u ON l.user_id = u.telegram_id
            WHERE l.score > 0 
            AND l.updated_at >= NOW() - INTERVAL '30 days'
            ORDER BY l.score DESC, l.games_won DESC
            LIMIT 50
        `);

        res.json(monthlyLeaderboard.rows);
    } catch (error) {
        console.error('Error fetching monthly leaderboard:', error);
        res.status(500).json({ error: 'خطا در دریافت جدول رتبه‌بندی ماهانه' });
    }
});

// Update user score (called from game completion)
router.post('/update', async (req, res) => {
    try {
        const { userId, score, gameTime, isWinner } = req.body;

        if (!userId || score === undefined) {
            return res.status(400).json({ error: 'اطلاعات ناقص است' });
        }

        // First, get current user stats
        const currentStats = await query(
            'SELECT * FROM leaderboard WHERE user_id = $1',
            [userId]
        );

        if (currentStats.rows.length === 0) {
            // Create new entry
            await query(`
                INSERT INTO leaderboard (user_id, score, games_played, games_won, average_time)
                VALUES ($1, $2, 1, $3, $4)
            `, [userId, score, isWinner ? 1 : 0, gameTime]);
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

            await query(`
                UPDATE leaderboard 
                SET score = $1, 
                    games_played = $2, 
                    games_won = $3, 
                    average_time = $4,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $5
            `, [newScore, newGamesPlayed, newGamesWon, newAverageTime, userId]);
        }

        res.json({ success: true, message: 'امتیاز با موفقیت به روز شد' });
    } catch (error) {
        console.error('Error updating leaderboard:', error);
        res.status(500).json({ error: 'خطا در به روزرسانی امتیاز' });
    }
});

// Get leaderboard with pagination
router.get('/page/:page', async (req, res) => {
    try {
        const { page } = req.params;
        const limit = 20;
        const offset = (page - 1) * limit;

        const leaderboard = await query(`
            SELECT 
                u.telegram_id,
                u.first_name,
                u.username,
                l.score,
                l.games_played,
                l.games_won,
                l.average_time,
                RANK() OVER (ORDER BY l.score DESC) as rank
            FROM leaderboard l
            JOIN users u ON l.user_id = u.telegram_id
            WHERE l.score > 0
            ORDER BY l.score DESC, l.games_won DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const totalCount = await query(`
            SELECT COUNT(*) as total FROM leaderboard WHERE score > 0
        `);

        res.json({
            players: leaderboard.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount.rows[0].total / limit),
                totalPlayers: parseInt(totalCount.rows[0].total),
                hasNext: offset + limit < totalCount.rows[0].total,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching paginated leaderboard:', error);
        res.status(500).json({ error: 'خطا در دریافت جدول رتبه‌بندی' });
    }
});

// Reset leaderboard (admin only - for testing)
router.delete('/reset', async (req, res) => {
    try {
        // In production, add admin authentication here
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({ error: 'دسترسی غیرمجاز' });
        }

        await query('DELETE FROM leaderboard');
        await query('ALTER SEQUENCE leaderboard_id_seq RESTART WITH 1');

        res.json({ success: true, message: 'جدول رتبه‌بندی بازنشانی شد' });
    } catch (error) {
        console.error('Error resetting leaderboard:', error);
        res.status(500).json({ error: 'خطا در بازنشانی جدول رتبه‌بندی' });
    }
});

// Get achievement stats
router.get('/achievements/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const achievements = await query(`
            SELECT 
                l.games_played,
                l.games_won,
                l.score,
                ROUND((l.games_won::DECIMAL / GREATEST(l.games_played, 1)) * 100, 1) as win_rate,
                (SELECT COUNT(*) FROM leaderboard WHERE score > l.score) + 1 as rank,
                (SELECT COUNT(*) FROM leaderboard) as total_players,
                CASE 
                    WHEN l.games_won >= 100 THEN 'قهرمان افسانه‌ای'
                    WHEN l.games_won >= 50 THEN 'استاد بازی'
                    WHEN l.games_won >= 25 THEN 'بازیکن حرفه‌ای'
                    WHEN l.games_won >= 10 THEN 'بازیکن فعال'
                    ELSE 'تازه کار'
                END as title,
                CASE 
                    WHEN l.score >= 10000 THEN 'طلایی'
                    WHEN l.score >= 5000 THEN 'نقره‌ای'
                    WHEN l.score >= 1000 THEN 'برنزی'
                    ELSE 'عادی'
                END as badge
            FROM leaderboard l
            WHERE l.user_id = $1
        `, [userId]);

        if (achievements.rows.length === 0) {
            return res.status(404).json({ error: 'کاربر یافت نشد' });
        }

        res.json(achievements.rows[0]);
    } catch (error) {
        console.error('Error fetching achievements:', error);
        res.status(500).json({ error: 'خطا در دریافت دستاوردها' });
    }
});

module.exports = router;
