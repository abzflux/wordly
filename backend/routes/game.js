const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const GameLogic = require('../utils/gameLogic');
const { sanitizeInput, isPersian } = require('../utils/helpers');

// Get game state
router.get('/state/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        if (!code || code.length !== 6) {
            return res.status(400).json({ 
                success: false,
                error: 'کد بازی نامعتبر است' 
            });
        }

        const gameResult = await query(
            `SELECT 
                g.*, 
                u1.first_name as creator_name, 
                u1.username as creator_username,
                u2.first_name as opponent_name,
                u2.username as opponent_username
             FROM games g 
             LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
             LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
             WHERE g.code = $1`,
            [code.toUpperCase()]
        );

        if (gameResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'بازی یافت نشد' 
            });
        }

        const game = gameResult.rows[0];
        
        // Generate word display
        const wordDisplay = GameLogic.getWordDisplay(game.word, game.correct_letters || []);
        
        // Calculate game progress
        const progress = game.word ? 
            Math.round(((game.correct_letters?.length || 0) / new Set(game.word.split('')).size) * 100) : 0;

        res.json({
            success: true,
            data: {
                code: game.code,
                word: game.word,
                wordDisplay,
                category: game.category,
                maxAttempts: game.max_attempts,
                currentAttempt: game.current_attempt,
                guessedLetters: game.guessed_letters || [],
                correctLetters: game.correct_letters || [],
                status: game.status,
                creator: {
                    id: game.creator_id,
                    name: game.creator_name,
                    username: game.creator_username
                },
                opponent: game.opponent_id ? {
                    id: game.opponent_id,
                    name: game.opponent_name,
                    username: game.opponent_username
                } : null,
                startTime: game.start_time,
                endTime: game.end_time,
                progress,
                remainingAttempts: game.max_attempts - game.current_attempt
            }
        });

    } catch (error) {
        console.error('Error getting game state:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور در دریافت اطلاعات بازی' 
        });
    }
});

// Submit a word for creation
router.post('/create', async (req, res) => {
    try {
        const { code, word, category } = req.body;
        
        // Validation
        if (!code || !word || !category) {
            return res.status(400).json({ 
                success: false,
                error: 'اطلاعات ناقص است' 
            });
        }

        if (!GameLogic.validateWord(word)) {
            return res.status(400).json({ 
                success: false,
                error: `کلمه باید بین ${GameLogic.MIN_WORD_LENGTH} تا ${GameLogic.MAX_WORD_LENGTH} حرف باشد` 
            });
        }

        const validCategories = GameLogic.getCategories();
        if (!validCategories.includes(category)) {
            return res.status(400).json({ 
                success: false,
                error: 'دسته‌بندی نامعتبر است' 
            });
        }

        // Check if game exists and is in waiting state
        const gameCheck = await query(
            'SELECT * FROM games WHERE code = $1 AND status = $2',
            [code.toUpperCase(), 'waiting']
        );

        if (gameCheck.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'بازی یافت نشد یا قبلاً شروع شده است' 
            });
        }

        const sanitizedWord = sanitizeInput(word);
        const maxAttempts = Math.floor(sanitizedWord.length * 1.5);
        
        // Update game with word and category
        await query(
            `UPDATE games 
             SET word = $1, category = $2, max_attempts = $3, status = 'ready'
             WHERE code = $4`,
            [sanitizedWord, category, maxAttempts, code.toUpperCase()]
        );

        res.json({ 
            success: true, 
            message: 'کلمه با موفقیت ثبت شد',
            data: { 
                maxAttempts,
                wordLength: sanitizedWord.length
            }
        });

    } catch (error) {
        console.error('Error creating game word:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور در ثبت کلمه' 
        });
    }
});

// Make a guess
router.post('/guess', async (req, res) => {
    try {
        const { code, letter, playerId } = req.body;
        
        // Validation
        if (!code || !letter || !playerId) {
            return res.status(400).json({ 
                success: false,
                error: 'اطلاعات ناقص است' 
            });
        }

        if (letter.length !== 1 || !letter.trim()) {
            return res.status(400).json({ 
                success: false,
                error: 'حرف وارد شده نامعتبر است' 
            });
        }

        const gameResult = await query(
            `SELECT g.*, 
                    u1.telegram_id as creator_id,
                    u2.telegram_id as opponent_id
             FROM games g 
             LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
             LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
             WHERE g.code = $1`,
            [code.toUpperCase()]
        );

        if (gameResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'بازی یافت نشد' 
            });
        }

        const game = gameResult.rows[0];
        
        // Check if game is active
        if (game.status !== 'active') {
            return res.status(400).json({ 
                success: false,
                error: 'بازی فعال نیست' 
            });
        }

        // Check if player is part of this game
        if (playerId != game.creator_id && playerId != game.opponent_id) {
            return res.status(403).json({ 
                success: false,
                error: 'شما در این بازی شرکت ندارید' 
            });
        }

        // Normalize letter based on language
        const normalizedLetter = isPersian(game.word) ? 
            letter.trim() : letter.trim().toUpperCase();

        // Check if letter already guessed
        const guessedLetters = game.guessed_letters || [];
        if (guessedLetters.includes(normalizedLetter)) {
            return res.status(400).json({ 
                success: false,
                error: 'این حرف قبلاً حدس زده شده است' 
            });
        }

        // Update guessed letters
        const newGuessedLetters = [...guessedLetters, normalizedLetter];
        let newCorrectLetters = game.correct_letters || [];
        let isCorrect = false;

        // Check if letter is in the word (case insensitive for Persian)
        if (isPersian(game.word)) {
            if (game.word.includes(normalizedLetter)) {
                newCorrectLetters.push(normalizedLetter);
                isCorrect = true;
            }
        } else {
            if (game.word.toUpperCase().includes(normalizedLetter)) {
                newCorrectLetters.push(normalizedLetter);
                isCorrect = true;
            }
        }

        // Update attempt count
        const newAttempt = (game.current_attempt || 0) + 1;
        
        // Check win condition
        const wordLetters = game.word.split('').filter(char => char !== ' ');
        const uniqueLetters = [...new Set(wordLetters)];
        const isWinner = uniqueLetters.every(char => 
            newCorrectLetters.includes(isPersian(game.word) ? char : char.toUpperCase())
        );
        
        // Check lose condition
        const isLoser = newAttempt >= game.max_attempts && !isWinner;
        
        let newStatus = game.status;
        let endTime = game.end_time;
        let score = 0;

        if (isWinner || isLoser) {
            newStatus = 'finished';
            endTime = new Date();
            
            // Calculate score if winner
            if (isWinner) {
                const startTime = new Date(game.start_time);
                const timeSpent = Math.floor((endTime - startTime) / 1000);
                const hintsUsed = 0; // TODO: Track hints used
                score = GameLogic.calculateScore(game.word, timeSpent, hintsUsed, true);
                
                // Update leaderboard for the winner
                try {
                    await query(
                        `INSERT INTO leaderboard (user_id, score, games_played, games_won, average_time) 
                         VALUES ($1, $2, 1, 1, $3) 
                         ON CONFLICT (user_id) DO UPDATE SET 
                         score = leaderboard.score + $2,
                         games_played = leaderboard.games_played + 1,
                         games_won = leaderboard.games_won + 1,
                         average_time = (leaderboard.average_time * leaderboard.games_played + $3) / (leaderboard.games_played + 1),
                         updated_at = CURRENT_TIMESTAMP`,
                        [playerId, score, timeSpent]
                    );
                } catch (leaderboardError) {
                    console.error('Error updating leaderboard:', leaderboardError);
                    // Continue even if leaderboard update fails
                }
            }
        }

        // Update game in database
        await query(
            `UPDATE games SET 
             guessed_letters = $1, 
             correct_letters = $2, 
             current_attempt = $3,
             status = $4,
             end_time = $5
             WHERE code = $6`,
            [newGuessedLetters, newCorrectLetters, newAttempt, newStatus, endTime, code.toUpperCase()]
        );

        // Get updated word display
        const updatedWordDisplay = GameLogic.getWordDisplay(game.word, newCorrectLetters);

        res.json({
            success: true,
            data: {
                isCorrect,
                isWinner,
                isLoser,
                wordDisplay: updatedWordDisplay,
                currentAttempt: newAttempt,
                remainingAttempts: game.max_attempts - newAttempt,
                correctLetters: newCorrectLetters,
                guessedLetters: newGuessedLetters,
                score: isWinner ? score : 0,
                word: isWinner || isLoser ? game.word : undefined
            }
        });

    } catch (error) {
        console.error('Error processing guess:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور در پردازش حدس' 
        });
    }
});

// Use hint
router.post('/hint', async (req, res) => {
    try {
        const { code, playerId } = req.body;
        
        if (!code || !playerId) {
            return res.status(400).json({ 
                success: false,
                error: 'اطلاعات ناقص است' 
            });
        }

        const gameResult = await query(
            `SELECT g.*, 
                    u1.telegram_id as creator_id,
                    u2.telegram_id as opponent_id
             FROM games g 
             LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
             LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
             WHERE g.code = $1`,
            [code.toUpperCase()]
        );

        if (gameResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'بازی یافت نشد' 
            });
        }

        const game = gameResult.rows[0];
        
        // Check if game is active
        if (game.status !== 'active') {
            return res.status(400).json({ 
                success: false,
                error: 'بازی فعال نیست' 
            });
        }

        // Check if player is part of this game
        if (playerId != game.creator_id && playerId != game.opponent_id) {
            return res.status(403).json({ 
                success: false,
                error: 'شما در این بازی شرکت ندارید' 
            });
        }

        const wordLetters = game.word.split('').filter(char => char !== ' ');
        const unknownLetters = wordLetters.filter(letter => 
            !(game.correct_letters || []).includes(
                isPersian(game.word) ? letter : letter.toUpperCase()
            )
        );

        if (unknownLetters.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'هیچ راهنمایی موجود نیست' 
            });
        }

        // Get a random hint from unknown letters
        const randomHint = unknownLetters[Math.floor(Math.random() * unknownLetters.length)];
        const normalizedHint = isPersian(game.word) ? randomHint : randomHint.toUpperCase();
        
        // TODO: Track hint usage for score calculation
        // For now, we just return the hint with penalty info

        res.json({ 
            success: true,
            data: {
                hint: normalizedHint,
                penalty: 15,
                message: `راهنما: حرف "${normalizedHint}" - ۱۵ امتیاز کسر خواهد شد`
            }
        });

    } catch (error) {
        console.error('Error getting hint:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور در دریافت راهنما' 
        });
    }
});

// Start game (when opponent joins)
router.post('/start', async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ 
                success: false,
                error: 'کد بازی الزامی است' 
            });
        }

        const gameResult = await query(
            'SELECT * FROM games WHERE code = $1 AND status = $2',
            [code.toUpperCase(), 'ready']
        );

        if (gameResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'بازی یافت نشد یا آماده شروع نیست' 
            });
        }

        const game = gameResult.rows[0];

        // Update game status to active and set start time
        await query(
            'UPDATE games SET status = $1, start_time = $2 WHERE code = $3',
            ['active', new Date(), code.toUpperCase()]
        );

        res.json({
            success: true,
            message: 'بازی شروع شد!',
            data: {
                startTime: new Date(),
                wordLength: game.word.length,
                maxAttempts: game.max_attempts
            }
        });

    } catch (error) {
        console.error('Error starting game:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور در شروع بازی' 
        });
    }
});

// Get active games for a user
router.get('/user/:userId/active', async (req, res) => {
    try {
        const { userId } = req.params;

        const activeGames = await query(
            `SELECT g.*, 
                    u1.first_name as creator_name,
                    u2.first_name as opponent_name
             FROM games g
             LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
             LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
             WHERE (g.creator_id = $1 OR g.opponent_id = $1)
             AND g.status IN ('waiting', 'ready', 'active')
             ORDER BY g.created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            data: {
                games: activeGames.rows.map(game => ({
                    code: game.code,
                    status: game.status,
                    category: game.category,
                    creatorName: game.creator_name,
                    opponentName: game.opponent_name,
                    currentAttempt: game.current_attempt,
                    maxAttempts: game.max_attempts,
                    createdAt: game.created_at
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching active games:', error);
        res.status(500).json({ 
            success: false,
            error: 'خطای سرور در دریافت بازی‌های فعال' 
        });
    }
});

module.exports = router;
