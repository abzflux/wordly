const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Game routes are working!'
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

module.exports = router;
