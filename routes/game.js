const express = require('express');
const router = express.Router();
const { query } = require('../database/db');
const GameLogic = require('../utils/gameLogic');
const { sanitizeInput } = require('../utils/helpers');

// Get game state
router.get('/state/:code', async (req, res) => {
  try {
    const { code } = req.params;
    
    const gameResult = await query(
      `SELECT g.*, u1.first_name as creator_name, u2.first_name as opponent_name
       FROM games g 
       LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
       LEFT JOIN users u2 ON g.opponent_id = u2.telegram_id
       WHERE g.code = $1`,
      [code]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameResult.rows[0];
    const wordDisplay = GameLogic.getWordDisplay(game.word, game.correct_letters);
    
    res.json({
      code: game.code,
      word: game.word,
      wordDisplay,
      category: game.category,
      maxAttempts: game.max_attempts,
      currentAttempt: game.current_attempt,
      guessedLetters: game.guessed_letters,
      correctLetters: game.correct_letters,
      status: game.status,
      creatorName: game.creator_name,
      opponentName: game.opponent_name,
      startTime: game.start_time
    });
  } catch (error) {
    console.error('Error getting game state:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit a word for creation
router.post('/create', async (req, res) => {
  try {
    const { code, word, category } = req.body;
    
    if (!GameLogic.validateWord(word)) {
      return res.status(400).json({ error: 'Invalid word' });
    }

    const validCategories = GameLogic.getCategories();
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const maxAttempts = Math.floor(word.length * 1.5);
    
    await query(
      'UPDATE games SET word = $1, category = $2, max_attempts = $3 WHERE code = $4',
      [sanitizeInput(word), category, maxAttempts, code]
    );

    res.json({ success: true, maxAttempts });
  } catch (error) {
    console.error('Error creating game word:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Make a guess
router.post('/guess', async (req, res) => {
  try {
    const { code, letter, playerId } = req.body;
    
    const gameResult = await query(
      'SELECT * FROM games WHERE code = $1',
      [code]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameResult.rows[0];
    
    // Check if game is active
    if (game.status !== 'active') {
      return res.status(400).json({ error: 'Game is not active' });
    }

    // Check if letter already guessed
    if (game.guessed_letters.includes(letter)) {
      return res.status(400).json({ error: 'Letter already guessed' });
    }

    // Update guessed letters
    const newGuessedLetters = [...game.guessed_letters, letter];
    let newCorrectLetters = [...game.correct_letters];
    let isCorrect = false;

    // Check if letter is in the word
    if (game.word.includes(letter)) {
      newCorrectLetters.push(letter);
      isCorrect = true;
    }

    // Update attempt count
    const newAttempt = game.current_attempt + 1;
    
    // Check win condition
    const wordSet = new Set(game.word.split(''));
    const correctSet = new Set(newCorrectLetters);
    const isWinner = [...wordSet].every(char => correctSet.has(char));
    
    // Check lose condition
    const isLoser = newAttempt >= game.max_attempts && !isWinner;
    
    let newStatus = game.status;
    let endTime = game.end_time;

    if (isWinner || isLoser) {
      newStatus = 'finished';
      endTime = new Date();
      
      // Calculate score if winner
      if (isWinner) {
        const timeSpent = Math.floor((endTime - new Date(game.start_time)) / 1000);
        const score = GameLogic.calculateScore(game.word, timeSpent, 0, true);
        
        // Update leaderboard
        await query(
          `INSERT INTO leaderboard (user_id, score, games_played, games_won, average_time) 
           VALUES ($1, $2, 1, 1, $3) 
           ON CONFLICT (user_id) DO UPDATE SET 
           score = leaderboard.score + $2,
           games_played = leaderboard.games_played + 1,
           games_won = leaderboard.games_won + 1,
           average_time = (leaderboard.average_time + $3) / 2,
           updated_at = CURRENT_TIMESTAMP`,
          [playerId, score, timeSpent]
        );
      }
    }

    await query(
      `UPDATE games SET 
       guessed_letters = $1, 
       correct_letters = $2, 
       current_attempt = $3,
       status = $4,
       end_time = $5
       WHERE code = $6`,
      [newGuessedLetters, newCorrectLetters, newAttempt, newStatus, endTime, code]
    );

    res.json({
      isCorrect,
      isWinner,
      isLoser,
      wordDisplay: GameLogic.getWordDisplay(game.word, newCorrectLetters),
      remainingAttempts: game.max_attempts - newAttempt,
      correctLetters: newCorrectLetters,
      guessedLetters: newGuessedLetters
    });

  } catch (error) {
    console.error('Error processing guess:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Use hint
router.post('/hint', async (req, res) => {
  try {
    const { code } = req.body;
    
    const gameResult = await query(
      'SELECT * FROM games WHERE code = $1',
      [code]
    );

    if (gameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameResult.rows[0];
    const wordLetters = game.word.split('');
    const unknownLetters = wordLetters.filter(letter => 
      !game.correct_letters.includes(letter)
    );

    if (unknownLetters.length === 0) {
      return res.status(400).json({ error: 'No hints available' });
    }

    const randomHint = unknownLetters[Math.floor(Math.random() * unknownLetters.length)];
    
    res.json({ hint: randomHint, penalty: 15 });
  } catch (error) {
    console.error('Error getting hint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
