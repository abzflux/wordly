const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

// تنظیمات محیطی
const BOT_TOKEN = '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ';
const DATABASE_URL = 'postgresql://abolfazl:VJKwG2yTJcEwIbjDT6TeNkWDPPTOSZGC@dpg-d3nbq8bipnbc73avlajg-a.frankfurt-postgres.render.com/wordlydb_toki';
const FRONTEND_URL = 'https://wordlybot.ct.ws';
const PORT = process.env.PORT || 3000;

// راه‌اندازی دیتابیس
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
});

// راه‌اندازی ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 ربات تلگرام فعال شد.');

// مدیریت خطاهای ربات
bot.on('error', (error) => {
    console.error('❌ خطای ربات تلگرام:', error);
});

// راه‌اندازی دیتابیس
async function initializeDatabase() {
    try {
        const client = await pool.connect();
        console.log('✅ اتصال به دیتابیس برقرار شد.');

        // حذف جداول قدیمی اگر وجود دارند
        await client.query(`
            DROP TABLE IF EXISTS team_games CASCADE;
            DROP TABLE IF EXISTS daily_challenges CASCADE;
            DROP TABLE IF EXISTS games CASCADE;
            DROP TABLE IF EXISTS users CASCADE;
        `);

        // ایجاد جداول جدید با ساختار بهینه
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

            CREATE INDEX idx_users_score ON users(score DESC);
            CREATE INDEX idx_users_level ON users(level DESC);
            CREATE INDEX idx_games_status ON games(status);
            CREATE INDEX idx_games_creator ON games(creator_id);
            CREATE INDEX idx_games_guesser ON games(guesser_id);
        `);

        console.log('✅ جداول دیتابیس با موفقیت ایجاد شدند.');
        client.release();
    } catch (err) {
        console.error('❌ خطای راه‌اندازی دیتابیس:', err);
        process.exit(1);
    }
}

// کلاس مدیریت کاربران
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
            const result = await pool.query(
                `UPDATE users SET 
                    score = score + $1,
                    games_played = games_played + $2,
                    games_won = games_won + $3,
                    total_guesses = total_guesses + $4,
                    correct_guesses = correct_guesses + $5,
                    xp = xp + $6,
                    level = $7,
                    updated_at = CURRENT_TIMESTAMP
                 WHERE telegram_id = $8
                 RETURNING *`,
                [
                    stats.score || 0,
                    stats.gamesPlayed || 0,
                    stats.gamesWon || 0,
                    stats.totalGuesses || 0,
                    stats.correctGuesses || 0,
                    stats.xp || 0,
                    stats.level || 1,
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
}

// کلاس مدیریت بازی‌ها
class GameManager {
    static generateGameCode() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    static async createGame(gameData) {
        try {
            const gameCode = this.generateGameCode();
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
                    gameData.maxGuesses || Math.ceil(gameData.word.length * 1.5),
                    gameData.maxGuesses || Math.ceil(gameData.word.length * 1.5),
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
            return result.rows[0];
        } catch (error) {
            throw new Error(`خطای پیوستن به بازی: ${error.message}`);
        }
    }

    static async submitGuess(gameCode, userId, letter) {
        try {
            const game = await this.getGame(gameCode);
            
            if (!game || game.status !== 'in_progress' || game.guesser_id !== userId) {
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

            return {
                game: updateResult.rows[0],
                isCorrect,
                indices,
                guessesLeft: newGuessesLeft
            };
        } catch (error) {
            throw new Error(`خطای ثبت حدس: ${error.message}`);
        }
    }

    static async getGame(gameCode) {
        try {
            const result = await pool.query(
                'SELECT * FROM games WHERE code = $1',
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
}

// کلاس مدیریت چالش‌ها
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
}

// راه‌اندازی سرور Express
const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// routes پایه
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/leaderboard', async (req, res) => {
    try {
        const leaderboard = await UserManager.getLeaderboard();
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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

// مدیریت اتصال‌های Socket
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
            
            console.log(`👤 کاربر وارد شد: ${userData.name} (${userData.userId})`);
        } catch (error) {
            socket.emit('login_error', { message: error.message });
        }
    });

    socket.on('create_game', async (gameData) => {
        try {
            const game = await GameManager.createGame({
                creatorId: gameData.userId,
                word: gameData.word,
                category: gameData.category,
                gameType: gameData.gameType,
                difficulty: gameData.difficulty
            });

            socket.join(game.code);
            socket.emit('game_created', game);
            io.emit('games_updated');
            
            console.log(`🎮 بازی جدید ایجاد شد: ${game.code}`);
        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    socket.on('join_game', async ({ userId, gameCode }) => {
        try {
            const game = await GameManager.joinGame(gameCode, userId);
            socket.join(game.code);
            socket.emit('game_joined', game);
            io.to(game.code).emit('game_updated', game);
            io.emit('games_updated');
            
            console.log(`🔗 کاربر ${userId} به بازی ${gameCode} پیوست`);
        } catch (error) {
            socket.emit('game_error', { message: error.message });
        }
    });

    socket.on('submit_guess', async ({ userId, gameCode, letter }) => {
        try {
            const result = await GameManager.submitGuess(gameCode, userId, letter);
            io.to(gameCode).emit('guess_result', result);
            
            if (result.guessesLeft <= 0 || Object.keys(result.game.revealed_letters).length === result.game.word.length) {
                // پایان بازی
                await pool.query(
                    'UPDATE games SET status = $1, end_time = CURRENT_TIMESTAMP WHERE code = $2',
                    ['finished', gameCode]
                );
                io.to(gameCode).emit('game_finished', result.game);
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

    socket.on('disconnect', () => {
        console.log(`🔴 کاربر قطع شد: ${socket.id}`);
    });
});

// راه‌اندازی سرور
initializeDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 سرور روی پورت ${PORT} در حال اجراست`);
        console.log(`🌐 آدرس: ${FRONTEND_URL}`);
    });
}).catch(error => {
    console.error('❌ خطای راه‌اندازی سرور:', error);
    process.exit(1);
});
