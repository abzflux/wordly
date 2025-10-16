const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

// تنظیمات محیطی
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// راه‌اندازی دیتابیس
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        require: true,
        rejectUnauthorized: false
    }
});

// راه‌اندازی Express
const app = express();
const server = http.createServer(app);

// میدلورها
app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// راه‌اندازی Socket.io
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL,
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- توابع کمکی ---
function generateGameCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function calculateLevel(score) {
    return Math.floor(score / 100) + 1;
}

function calculateXP(score) {
    return score % 100;
}

// --- راه‌اندازی دیتابیس ---
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // حذف جداول قدیمی اگر وجود دارند
        await client.query(`
            DROP TABLE IF EXISTS user_achievements CASCADE;
            DROP TABLE IF EXISTS daily_challenges CASCADE;
            DROP TABLE IF EXISTS games CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
        `);

        // ایجاد جداول جدید
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                telegram_id BIGINT UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                score INT DEFAULT 0,
                level INT DEFAULT 1,
                xp INT DEFAULT 0,
                games_played INT DEFAULT 0,
                games_won INT DEFAULT 0,
                total_guesses INT DEFAULT 0,
                correct_guesses INT DEFAULT 0,
                streak_days INT DEFAULT 0,
                last_active DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE games (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                creator_id BIGINT NOT NULL REFERENCES users(telegram_id),
                guesser_id BIGINT REFERENCES users(telegram_id),
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                difficulty VARCHAR(20) DEFAULT 'normal',
                max_guesses INT NOT NULL,
                guesses_left INT NOT NULL,
                correct_guesses INT DEFAULT 0,
                incorrect_guesses INT DEFAULT 0,
                revealed_letters JSONB DEFAULT '{}',
                guessed_letters VARCHAR(1)[] DEFAULT '{}',
                game_type VARCHAR(20) DEFAULT 'classic',
                time_limit INT DEFAULT 300,
                start_time TIMESTAMP WITH TIME ZONE,
                end_time TIMESTAMP WITH TIME ZONE,
                status VARCHAR(20) DEFAULT 'waiting',
                winner_id BIGINT REFERENCES users(telegram_id),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE daily_challenges (
                id SERIAL PRIMARY KEY,
                date DATE UNIQUE NOT NULL,
                word VARCHAR(255) NOT NULL,
                category VARCHAR(100) NOT NULL,
                description TEXT,
                participants INT DEFAULT 0,
                completed_count INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE user_achievements (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES users(telegram_id),
                achievement_type VARCHAR(50) NOT NULL,
                achievement_name VARCHAR(100) NOT NULL,
                achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, achievement_type)
            );
        `);

        // ایجاد ایندکس‌ها
        await client.query(`
            CREATE INDEX idx_users_score ON users(score DESC);
            CREATE INDEX idx_users_level ON users(level DESC);
            CREATE INDEX idx_games_status ON games(status);
            CREATE INDEX idx_games_creator ON games(creator_id);
            CREATE INDEX idx_games_guesser ON games(guesser_id);
            CREATE INDEX idx_daily_challenges_date ON daily_challenges(date DESC);
        `);

        console.log('✅ جداول دیتابیس با موفقیت ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err);
        process.exit(1);
    }
}

// --- کلاس مدیریت کاربران ---
class UserManager {
    static async findOrCreateUser(telegramId, userData) {
        try {
            const result = await pool.query(
                `INSERT INTO users (telegram_id, name, username, last_active) 
                 VALUES ($1, $2, $3, CURRENT_DATE)
                 ON CONFLICT (telegram_id) 
                 DO UPDATE SET 
                    name = EXCLUDED.name,
                    username = EXCLUDED.username,
                    last_active = EXCLUDED.last_active,
                    updated_at = CURRENT_TIMESTAMP
                 RETURNING *`,
                [telegramId, userData.name, userData.username]
            );
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای ایجاد کاربر: ${error.message}`);
        }
    }

    static async updateUserStats(userId, stats) {
        try {
            const level = calculateLevel((stats.score || 0) + (stats.additionalScore || 0));
            const xp = calculateXP((stats.score || 0) + (stats.additionalScore || 0));
            
            const result = await pool.query(
                `UPDATE users SET 
                    score = score + $1,
                    games_played = games_played + $2,
                    games_won = games_won + $3,
                    total_guesses = total_guesses + $4,
                    correct_guesses = correct_guesses + $5,
                    level = $6,
                    xp = $7,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE telegram_id = $8
                 RETURNING *`,
                [
                    stats.additionalScore || 0,
                    stats.gamesPlayed || 0,
                    stats.gamesWon || 0,
                    stats.totalGuesses || 0,
                    stats.correctGuesses || 0,
                    level,
                    xp,
                    userId
                ]
            );
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای به‌روزرسانی کاربر: ${error.message}`);
        }
    }

    static async getLeaderboard(limit = 10) {
        try {
            const result = await pool.query(
                `SELECT name, username, score, level, games_played, games_won
                 FROM users 
                 ORDER BY score DESC, level DESC 
                 LIMIT $1`,
                [limit]
            );
            return result.rows;
        } catch (error) {
            throw new Error(`خطای دریافت جدول رتبه‌بندی: ${error.message}`);
        }
    }

    static async getUserProfile(userId) {
        try {
            const result = await pool.query(
                `SELECT * FROM users WHERE telegram_id = $1`,
                [userId]
            );
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای دریافت پروفایل کاربر: ${error.message}`);
        }
    }
}

// --- کلاس مدیریت بازی‌ها ---
class GameManager {
    static async createGame(gameData) {
        try {
            const gameCode = generateGameCode();
            const maxGuesses = Math.ceil(gameData.word.length * 1.5);
            
            const result = await pool.query(
                `INSERT INTO games 
                 (code, creator_id, word, category, difficulty, max_guesses, guesses_left, game_type, time_limit) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [
                    gameCode,
                    gameData.creatorId,
                    gameData.word,
                    gameData.category,
                    gameData.difficulty || 'normal',
                    maxGuesses,
                    maxGuesses,
                    gameData.gameType || 'classic',
                    gameData.timeLimit || 300
                ]
            );
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای ایجاد بازی: ${error.message}`);
        }
    }

    static async joinGame(gameCode, userId) {
        try {
            const result = await pool.query(
                `UPDATE games 
                 SET guesser_id = $1, status = 'in_progress', start_time = CURRENT_TIMESTAMP
                 WHERE code = $2 AND status = 'waiting' AND creator_id != $1
                 RETURNING *`,
                [userId, gameCode]
            );
            
            if (result.rows.length === 0) {
                throw new Error('بازی پیدا نشد یا قبلاً شروع شده است.');
            }
            
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای پیوستن به بازی: ${error.message}`);
        }
    }

    static async submitGuess(gameCode, userId, letter) {
        try {
            const gameResult = await pool.query(
                'SELECT * FROM games WHERE code = $1 AND status = $2',
                [gameCode, 'in_progress']
            );
            
            const game = gameResult.rows[0];
            if (!game || game.guesser_id !== userId) {
                throw new Error('شما مجاز به حدس زدن در این بازی نیستید.');
            }

            if (game.guessed_letters.includes(letter)) {
                throw new Error('این حرف قبلاً حدس زده شده است.');
            }

            // منطق بررسی حدس
            const word = game.word;
            const indices = [];
            for (let i = 0; i < word.length; i++) {
                if (word[i] === letter) indices.push(i);
            }

            const isCorrect = indices.length > 0;
            const newRevealed = { ...game.revealed_letters };
            if (isCorrect) {
                newRevealed[letter] = indices;
            }

            const newGuessesLeft = game.guesses_left - (isCorrect ? 0 : 1);
            const newCorrectGuesses = game.correct_guesses + (isCorrect ? indices.length : 0);
            const newIncorrectGuesses = game.incorrect_guesses + (isCorrect ? 0 : 1);

            // به‌روزرسانی بازی
            const updateResult = await pool.query(
                `UPDATE games SET
                 guesses_left = $1,
                 correct_guesses = $2,
                 incorrect_guesses = $3,
                 revealed_letters = $4,
                 guessed_letters = array_append(guessed_letters, $5)
                 WHERE code = $6
                 RETURNING *`,
                [newGuessesLeft, newCorrectGuesses, newIncorrectGuesses, newRevealed, letter, gameCode]
            );

            const updatedGame = updateResult.rows[0];

            // بررسی پایان بازی
            let gameFinished = false;
            if (newGuessesLeft <= 0 || Object.keys(newRevealed).length === word.length) {
                await pool.query(
                    'UPDATE games SET status = $1, end_time = CURRENT_TIMESTAMP WHERE code = $2',
                    ['finished', gameCode]
                );
                gameFinished = true;
                
                // محاسبه امتیاز
                if (Object.keys(newRevealed).length === word.length) {
                    const points = Math.max(50, 500 - (newIncorrectGuesses * 10));
                    await UserManager.updateUserStats(userId, {
                        additionalScore: points,
                        gamesPlayed: 1,
                        gamesWon: 1,
                        totalGuesses: game.guessed_letters.length + 1,
                        correctGuesses: indices.length
                    });
                }
            }

            return {
                game: updatedGame,
                isCorrect,
                indices,
                guessesLeft: newGuessesLeft,
                gameFinished
            };
        } catch (error) {
            throw new Error(`خطای ثبت حدس: ${error.message}`);
        }
    }

    static async getGame(gameCode) {
        try {
            const result = await pool.query(
                `SELECT g.*, 
                        u1.name as creator_name,
                        u2.name as guesser_name
                 FROM games g
                 LEFT JOIN users u1 ON g.creator_id = u1.telegram_id
                 LEFT JOIN users u2 ON g.guesser_id = u2.telegram_id
                 WHERE g.code = $1`,
                [gameCode]
            );
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای دریافت بازی: ${error.message}`);
        }
    }

    static async getWaitingGames(excludeUserId) {
        try {
            const result = await pool.query(
                `SELECT g.*, u.name as creator_name 
                 FROM games g 
                 JOIN users u ON g.creator_id = u.telegram_id 
                 WHERE g.status = 'waiting' AND g.creator_id != $1
                 ORDER BY g.created_at DESC`,
                [excludeUserId]
            );
            return result.rows;
        } catch (error) {
            throw new Error(`خطای دریافت بازی‌های منتظر: ${error.message}`);
        }
    }

    static async getActiveGames(userId) {
        try {
            const result = await pool.query(
                `SELECT * FROM games 
                 WHERE (creator_id = $1 OR guesser_id = $1) 
                 AND status IN ('waiting', 'in_progress')`,
                [userId]
            );
            return result.rows;
        } catch (error) {
            throw new Error(`خطای دریافت بازی‌های فعال: ${error.message}`);
        }
    }
}

// --- کلاس مدیریت چالش‌ها ---
class ChallengeManager {
    static async getDailyChallenge() {
        try {
            const today = new Date().toISOString().split('T')[0];
            let result = await pool.query(
                'SELECT * FROM daily_challenges WHERE date = $1',
                [today]
            );

            if (result.rows.length === 0) {
                // ایجاد چالش جدید
                const dailyWords = [
                    { word: 'هواپیما', category: 'حمل و نقل', description: 'وسیله نقلیه هوایی' },
                    { word: 'کامپیوتر', category: 'تکنولوژی', description: 'دستگاه محاسباتی' },
                    { word: 'کتابخانه', category: 'مکان', description: 'محل نگهداری کتاب' },
                    { word: 'آفتابگردان', category: 'گیاه', description: 'گل رو به خورشید' },
                    { word: 'دلفین', category: 'حیوان', description: 'پستاندار دریایی باهوش' }
                ];
                
                const randomWord = dailyWords[Math.floor(Math.random() * dailyWords.length)];
                
                result = await pool.query(
                    `INSERT INTO daily_challenges (date, word, category, description) 
                     VALUES ($1, $2, $3, $4) 
                     RETURNING *`,
                    [today, randomWord.word, randomWord.category, randomWord.description]
                );
            }

            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای مدیریت چالش روزانه: ${error.message}`);
        }
    }

    static async joinDailyChallenge(userId, challengeId) {
        try {
            await pool.query(
                'UPDATE daily_challenges SET participants = participants + 1 WHERE id = $1',
                [challengeId]
            );
            return true;
        } catch (error) {
            throw new Error(`خطای ثبت نام در چالش: ${error.message}`);
        }
    }
}

// --- routes پایه ---
app.get('/', (req, res) => {
    res.json({
        message: 'Wordly Pro Server',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        database: 'connected',
        timestamp: new Date().toISOString() 
    });
});

app.get('/leaderboard', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = await UserManager.getLeaderboard(limit);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/user/:userId', async (req, res) => {
    try {
        const user = await UserManager.getUserProfile(req.params.userId);
        if (!user) {
            return res.status(404).json({ error: 'کاربر پیدا نشد' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- مدیریت اتصال‌های Socket ---
io.on('connection', (socket) => {
    console.log(`🔗 کاربر متصل شد: ${socket.id}`);

    let currentUser = null;

    // رویدادهای اصلی
    socket.on('user_login', async (userData) => {
        try {
            currentUser = await UserManager.findOrCreateUser(userData.userId, {
                name: userData.name,
                username: userData.username
            });

            socket.join(`user:${userData.userId}`);
            socket.emit('login_success', currentUser);
            
            // ارسال بازی‌های فعال کاربر
            const activeGames = await GameManager.getActiveGames(userData.userId);
            if (activeGames.length > 0) {
                activeGames.forEach(game => {
                    socket.join(game.code);
                });
                socket.emit('active_games', activeGames);
            }
            
            console.log(`👤 کاربر وارد شد: ${userData.name} (${userData.userId})`);
        } catch (error) {
            socket.emit('login_error', { message: error.message });
        }
    });

    socket.on('create_game', async (gameData) => {
        try {
            if (!gameData.word || !gameData.category) {
                throw new Error('کلمه و دسته‌بندی الزامی است.');
            }

            if (!/^[\u0600-\u06FF\s]+$/.test(gameData.word)) {
                throw new Error('کلمه باید فقط شامل حروف فارسی باشد.');
            }

            if (gameData.word.length < 3) {
                throw new Error('کلمه باید حداقل ۳ حرف باشد.');
            }

            const game = await GameManager.createGame({
                creatorId: gameData.userId,
                word: gameData.word.toLowerCase(),
                category: gameData.category,
                gameType: gameData.gameType,
                difficulty: gameData.difficulty
            });

            socket.join(game.code);
            socket.emit('game_created', { 
                code: game.code, 
                gameType: game.game_type 
            });
            
            // اطلاع به همه کاربران برای بروزرسانی لیست
            io.emit('games_updated');
            
            console.log(`🎮 بازی جدید ایجاد شد: ${game.code} توسط ${gameData.userId}`);
        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const game = await GameManager.joinGame(gameCode, userId);
            socket.join(game.code);
            socket.emit('game_joined', { code: game.code });
            
            // اطلاع به همه کاربران در بازی
            const gameWithDetails = await GameManager.getGame(gameCode);
            io.to(game.code).emit('game_updated', gameWithDetails);
            
            // بروزرسانی لیست بازی‌ها برای همه
            io.emit('games_updated');
            
            console.log(`🔗 کاربر ${userId} به بازی ${gameCode} پیوست`);
        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const result = await GameManager.submitGuess(gameCode, userId, letter);
            
            // ارسال نتیجه به همه کاربران در بازی
            io.to(gameCode).emit('guess_result', {
                userId,
                letter,
                isCorrect: result.isCorrect,
                indices: result.indices,
                guessesLeft: result.guessesLeft,
                game: result.game
            });

            if (result.gameFinished) {
                io.to(gameCode).emit('game_finished', {
                    game: result.game,
                    winner: result.game.guesser_id === userId ? 'guesser' : 'creator'
                });
                io.emit('games_updated');
            }
            
        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    socket.on('get_waiting_games', async (userId) => {
        try {
            const games = await GameManager.getWaitingGames(userId);
            socket.emit('waiting_games', games);
        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    socket.on('get_daily_challenge', async () => {
        try {
            const challenge = await ChallengeManager.getDailyChallenge();
            socket.emit('daily_challenge', challenge);
        } catch (error) {
            socket.emit('challenge_error', { message: error.message });
        }
    });

    socket.on('join_daily_challenge', async ({ userId, challengeId }) => {
        try {
            await ChallengeManager.joinDailyChallenge(userId, challengeId);
            socket.emit('challenge_joined', { challengeId });
        } catch (error) {
            socket.emit('challenge_error', { message: error.message });
        }
    });

    socket.on('get_user_profile', async (userId) => {
        try {
            const profile = await UserManager.getUserProfile(userId);
            socket.emit('user_profile', profile);
        } catch (error) {
            socket.emit('profile_error', { message: error.message });
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔴 کاربر قطع شد: ${socket.id}`);
    });
});

// --- راه‌اندازی سرور ---
async function startServer() {
    try {
        await initializeDatabase();
        
        server.listen(PORT, () => {
            console.log(`🚀 سرور روی پورت ${PORT} در حال اجراست`);
            console.log(`🌐 آدرس: http://localhost:${PORT}`);
            console.log(`📊 وضعیت: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('❌ خطای راه‌اندازی سرور:', error);
        process.exit(1);
    }
}

// شروع سرور
startServer();

// مدیریت خطاهای غیرمنتظره
process.on('unhandledRejection', (err) => {
    console.error('❌ خطای غیرمنتظره:', err);
});

process.on('uncaughtException', (err) => {
    console.error('❌ خطای捕获 نشده:', err);
    process.exit(1);
});
