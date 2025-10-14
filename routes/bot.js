const express = require('express');
const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Bot routes are working!'
    });
});

module.exports = router;
