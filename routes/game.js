// Submit a word for creation
router.post('/create', async (req, res) => {
  try {
    console.log('📥 Received create request:', req.body);
    
    const { code, word, category } = req.body;
    
    if (!code || !word || !category) {
        console.log('❌ Missing fields');
        return res.status(400).json({ error: 'اطلاعات ناقص است' });
    }

    console.log('🔧 Processing:', { code, word, category });

    // بررسی وجود بازی
    const gameCheck = await query(
        'SELECT * FROM games WHERE code = $1',
        [code]
    );

    if (gameCheck.rows.length === 0) {
        console.log('❌ Game not found:', code);
        return res.status(404).json({ error: 'بازی یافت نشد' });
    }

    const maxAttempts = Math.floor(word.length * 1.5);
    
    console.log('💾 Updating game in database...');
    
    await query(
        'UPDATE games SET word = $1, category = $2, max_attempts = $3, status = $4 WHERE code = $5',
        [word, category, maxAttempts, 'ready', code]
    );

    console.log('✅ Game updated successfully');

    res.json({ 
        success: true, 
        maxAttempts,
        message: 'کلمه ثبت شد'
    });

  } catch (error) {
    console.error('❌ Error in create route:', error);
    res.status(500).json({ error: 'خطای سرور: ' + error.message });
  }
});
