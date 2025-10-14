const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Leaderboard routes are working!'
    });
});

// Get leaderboard
router.get('/', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                leaderboard: [],
                message: 'Leaderboard endpoint is working'
            }
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور' 
        });
    }
});

module.exports = router;
