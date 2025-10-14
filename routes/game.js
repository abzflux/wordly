const express = require('express');
const router = express.Router(); // این خط رو اضافه کن
const { query } = require('../database/db');

// Health check for game routes
router.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Game routes are working' 
    });
});

// Get game state
router.get('/state/:code', async (req, res) => {
    try {
        const { code } = req.params;
        res.json({
            success: true,
            data: {
                code: code,
                status: 'waiting',
                message: 'Game endpoint is working'
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور' 
        });
    }
});

// Submit a word for creation
router.post('/create', async (req, res) => {
    try {
        console.log('📥 Received create request:', req.body);
        
        const { code, word, category } = req.body;
        
        if (!code || !word || !category) {
            return res.status(400).json({ error: 'اطلاعات ناقص است' });
        }

        // بررسی وجود بازی
        const gameResult = await query(
            'SELECT * FROM games WHERE code = $1',
            [code]
        );

        if (gameResult.rows.length === 0) {
            return res.status(404).json({ error: 'بازی یافت نشد' });
        }

        const maxAttempts = Math.floor(word.length * 1.5);
        
        await query(
            'UPDATE games SET word = $1, category = $2, max_attempts = $3 WHERE code = $4',
            [word, category, maxAttempts, code]
        );

        res.json({ 
            success: true, 
            maxAttempts 
        });

    } catch (error) {
        console.error('Error creating game:', error);
        res.status(500).json({ error: 'خطای سرور' });
    }
});

module.exports = router;
