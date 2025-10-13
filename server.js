const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
const WebSocket = require('ws');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';

// تنظیمات PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

// ایجاد سرور WebSocket
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static('public'));

class WordGameBot {
    constructor() {
        this.db = null;
        this.dbConnected = false;
        this.activeMultiplayerGames = new Map();
        this.waitingGames = new Map();
        this.websocketConnections = new Map();
        this.wordCategories = {
            'میوه': ['سیب', 'موز', 'پرتقال', 'انگور', 'هندوانه', 'خربزه', 'انار', 'انجیر', 'کیوی', 'لیمو'],
            'حیوانات': ['شیر', 'فیل', 'میمون', 'گربه', 'سگ', 'خرگوش', 'گاو', 'گوسفند', 'مرغ', 'خروس'],
            'شهرها': ['تهران', 'مشهد', 'اصفهان', 'شیراز', 'تبریز', 'اهواز', 'کرج', 'قم', 'کرمان', 'رشت'],
            'کشورها': ['ایران', 'ترکیه', 'آلمان', 'فرانسه', 'ایتالیا', 'ژاپن', 'چین', 'هند', 'روسیه', 'کانادا'],
            'غذاها': ['قورمه', 'کباب', 'پلو', 'آش', 'سوپ', 'پیتزا', 'همبرگر', 'سالاد', 'ماکارونی', 'لازانیا'],
            'اشیا': ['میز', 'صندلی', 'کتاب', 'قلم', 'دفتر', 'تلویزیون', 'تلفن', 'کامپیوتر', 'لامپ', 'پنجره']
        };
        this.log('🤖 ربات تلگرام راه‌اندازی شد');
    }

    log(message) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }

    async connectDB() {
        try {
            this.db = new Pool({
                host: DB_HOST,
                user: DB_USER,
                password: DB_PASSWORD,
                database: DB_NAME,
                port: DB_PORT,
                ssl: {
                    rejectUnauthorized: false
                },
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            
            // تست اتصال
            const client = await this.db.connect();
            await client.query('SELECT NOW()');
            client.release();
            
            this.dbConnected = true;
            this.log('✅ متصل به دیتابیس PostgreSQL');
            
            await this.createTables();
            await this.loadActiveGames();
            
        } catch (error) {
            this.log(`❌ خطا در اتصال به دیتابیس: ${error.message}`);
            this.dbConnected = false;
        }
    }

    async createTables() {
        try {
            // جدول کاربران
            await this.db.query(`
                CREATE TABLE IF NOT EXISTS users (
                    userid BIGINT PRIMARY KEY,
                    firstname VARCHAR(255) NOT NULL,
                    username VARCHAR(255),
                    totalscore INTEGER DEFAULT 0,
                    gamesplayed INTEGER DEFAULT 0,
                    bestscore INTEGER DEFAULT 0,
                    multiplayerwins INTEGER DEFAULT 0,
                    hintsused INTEGER DEFAULT 0,
                    createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updatedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // جدول بازی‌های دو نفره
            await this.db.query(`
                CREATE TABLE IF NOT EXISTS multiplayer_games (
                    gameid VARCHAR(10) PRIMARY KEY,
                    creatorid BIGINT NOT NULL,
                    opponentid BIGINT,
                    word VARCHAR(255),
                    wordlength INTEGER DEFAULT 0,
                    status VARCHAR(20) CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')) DEFAULT 'waiting',
                    winnerid BIGINT,
                    category VARCHAR(100) DEFAULT 'عمومی',
                    hints INTEGER DEFAULT 2,
                    hintsused INTEGER DEFAULT 0,
                    maxattempts INTEGER DEFAULT 6,
                    attempts INTEGER DEFAULT 0,
                    guessedletters TEXT,
                    currentwordstate VARCHAR(255),
                    creatorscore INTEGER DEFAULT 0,
                    opponentscore INTEGER DEFAULT 0,
                    lastactivity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updatedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (creatorid) REFERENCES users(userid) ON DELETE CASCADE,
                    FOREIGN KEY (opponentid) REFERENCES users(userid) ON DELETE CASCADE
                )
            `);

            this.log('✅ جداول دیتابیس با موفقیت ایجاد شدند');
        } catch (error) {
            this.log(`❌ خطا در ایجاد جداول: ${error.message}`);
        }
    }

    generateGameId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    // مدیریت اتصالات WebSocket
    setupWebSocket() {
        wss.on('connection', (ws, request) => {
            this.log('🔗 اتصال WebSocket جدید');
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(ws, message);
                } catch (error) {
                    this.log(`❌ خطا در پردازش پیام WebSocket: ${error.message}`);
                }
            });

            ws.on('close', () => {
                this.log('🔌 اتصال WebSocket بسته شد');
                // حذف از connections
                for (let [gameId, connections] of this.websocketConnections) {
                    this.websocketConnections.set(gameId, connections.filter(conn => conn.ws !== ws));
                }
            });
        });
    }

    async handleWebSocketMessage(ws, message) {
        const { type, gameId, userId, data } = message;

        switch (type) {
            case 'join_game':
                await this.handleJoinGame(ws, gameId, userId);
                break;
            case 'select_category':
                await this.handleSelectCategory(gameId, userId, data.category);
                break;
            case 'submit_word':
                await this.handleSubmitWord(gameId, userId, data.word);
                break;
            case 'submit_guess':
                await this.handleSubmitGuess(gameId, userId, data.guess);
                break;
            case 'request_hint':
                await this.handleRequestHint(gameId, userId);
                break;
            case 'get_game_state':
                await this.sendGameState(gameId, userId);
                break;
        }
    }

    async handleJoinGame(ws, gameId, userId) {
        try {
            // ذخیره اتصال WebSocket
            if (!this.websocketConnections.has(gameId)) {
                this.websocketConnections.set(gameId, []);
            }
            this.websocketConnections.get(gameId).push({ ws, userId });

            // ارسال وضعیت فعلی بازی
            await this.sendGameState(gameId, userId);
            
        } catch (error) {
            this.log(`❌ خطا در پیوستن به بازی: ${error.message}`);
        }
    }

    async sendGameState(gameId, userId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game) return;

            const connections = this.websocketConnections.get(gameId) || [];
            const userConnection = connections.find(conn => conn.userId === userId);
            
            if (userConnection) {
                const gameState = {
                    type: 'game_state',
                    gameData: {
                        gameId: game.gameid,
                        creator: { id: game.creatorid, name: 'سازنده' },
                        opponent: game.opponentid ? { id: game.opponentid, name: 'بازیکن' } : null,
                        category: game.category,
                        word: game.word,
                        wordLength: game.wordlength,
                        currentWordState: game.currentwordstate,
                        attempts: game.attempts,
                        maxAttempts: game.maxattempts,
                        hintsUsed: game.hintsused,
                        maxHints: game.hints,
                        guessedLetters: JSON.parse(game.guessedletters || '[]'),
                        status: game.status,
                        winner: game.winnerid
                    },
                    userRole: game.creatorid === userId ? 'creator' : 'opponent'
                };

                userConnection.ws.send(JSON.stringify(gameState));
            }
        } catch (error) {
            this.log(`❌ خطا در ارسال وضعیت بازی: ${error.message}`);
        }
    }

    async broadcastGameState(gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game) return;

            const connections = this.websocketConnections.get(gameId) || [];
            
            for (const connection of connections) {
                await this.sendGameState(gameId, connection.userId);
            }
        } catch (error) {
            this.log(`❌ خطا در broadcast وضعیت بازی: ${error.message}`);
        }
    }

    async handleSelectCategory(gameId, userId, category) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game || game.creatorid !== userId) return;

            await this.db.query(
                'UPDATE multiplayer_games SET category = $1, lastactivity = CURRENT_TIMESTAMP WHERE gameid = $2',
                [category, gameId]
            );

            game.category = category;
            this.activeMultiplayerGames.set(gameId, game);

            // ارسال پیام به همه بازیکنان
            this.broadcastToGame(gameId, {
                type: 'category_selected',
                category: category,
                message: `🗂️ دسته‌بندی "${category}" انتخاب شد`
            });

            await this.broadcastGameState(gameId);

        } catch (error) {
            this.log(`❌ خطا در انتخاب دسته‌بندی: ${error.message}`);
        }
    }

    async handleSubmitWord(gameId, userId, word) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game || game.creatorid !== userId) return;

            // اعتبارسنجی کلمه
            if (word.length < 3 || word.length > 15) {
                this.sendToUser(gameId, userId, {
                    type: 'error',
                    message: '❌ کلمه باید بین ۳ تا ۱۵ حرف باشد'
                });
                return;
            }

            if (!/^[آ-یa-z\s]+$/.test(word)) {
                this.sendToUser(gameId, userId, {
                    type: 'error',
                    message: '❌ کلمه باید شامل حروف فارسی، انگلیسی یا فاصله باشد'
                });
                return;
            }

            const currentWordState = word.split('').map(c => c === ' ' ? ' ' : '_').join('');

            await this.db.query(
                'UPDATE multiplayer_games SET word = $1, wordlength = $2, currentwordstate = $3, lastactivity = CURRENT_TIMESTAMP WHERE gameid = $4',
                [word, word.length, currentWordState, gameId]
            );

            game.word = word;
            game.wordlength = word.length;
            game.currentwordstate = currentWordState;
            this.activeMultiplayerGames.set(gameId, game);

            // اطلاع‌رسانی به همه
            this.broadcastToGame(gameId, {
                type: 'word_submitted',
                message: '🔐 کلمه مخفی ثبت شد! بازی شروع شد!',
                wordLength: word.length
            });

            await this.broadcastGameState(gameId);

        } catch (error) {
            this.log(`❌ خطا در ثبت کلمه: ${error.message}`);
        }
    }

    async handleSubmitGuess(gameId, userId, guess) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game || game.opponentid !== userId) return;

            // اعتبارسنجی حدس
            if (guess.length !== 1 || !/^[آ-یa-z]$/.test(guess)) {
                this.sendToUser(gameId, userId, {
                    type: 'error',
                    message: '❌ لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید'
                });
                return;
            }

            let guessedLetters = JSON.parse(game.guessedletters || '[]');
            if (guessedLetters.includes(guess)) {
                this.sendToUser(gameId, userId, {
                    type: 'error',
                    message: '❌ این حرف قبلاً حدس زده شده است'
                });
                return;
            }

            // پردازش حدس
            guessedLetters.push(guess);
            const word = game.word;
            let currentWordState = game.currentwordstate || '_'.repeat(word.length);
            let correctGuess = false;

            let newWordState = '';
            for (let i = 0; i < word.length; i++) {
                if (word[i] === guess || currentWordState[i] !== '_') {
                    newWordState += word[i];
                    if (word[i] === guess) correctGuess = true;
                } else {
                    newWordState += '_';
                }
            }

            const newAttempts = game.attempts + (correctGuess ? 0 : 1);
            let newStatus = game.status;

            // بررسی پایان بازی
            if (newWordState === word) {
                newStatus = 'completed';
                await this.db.query(
                    'UPDATE multiplayer_games SET winnerid = $1, opponentscore = 100, status = $2 WHERE gameid = $3',
                    [userId, 'completed', gameId]
                );
            } else if (newAttempts >= 6) {
                newStatus = 'completed';
                await this.db.query(
                    'UPDATE multiplayer_games SET winnerid = $1, creatorscore = 50, status = $2 WHERE gameid = $3',
                    [game.creatorid, 'completed', gameId]
                );
            }

            // ذخیره در دیتابیس
            await this.db.query(
                `UPDATE multiplayer_games SET 
                 attempts = $1, 
                 guessedletters = $2,
                 currentwordstate = $3,
                 status = $4,
                 lastactivity = CURRENT_TIMESTAMP
                 WHERE gameid = $5`,
                [newAttempts, JSON.stringify(guessedLetters), newWordState, newStatus, gameId]
            );

            // آپدیت حافظه محلی
            game.attempts = newAttempts;
            game.guessedletters = JSON.stringify(guessedLetters);
            game.currentwordstate = newWordState;
            game.status = newStatus;
            this.activeMultiplayerGames.set(gameId, game);

            // ارسال نتیجه به همه
            this.broadcastToGame(gameId, {
                type: 'guess_result',
                guess: guess,
                correct: correctGuess,
                playerId: userId,
                attemptsLeft: 6 - newAttempts
            });

            if (newStatus === 'completed') {
                this.broadcastToGame(gameId, {
                    type: 'game_ended',
                    winner: newWordState === word ? 'opponent' : 'creator',
                    word: word
                });
            }

            await this.broadcastGameState(gameId);

        } catch (error) {
            this.log(`❌ خطا در پردازش حدس: ${error.message}`);
        }
    }

    async handleRequestHint(gameId, userId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game || game.opponentid !== userId) return;

            if (game.hintsused >= 2) {
                this.sendToUser(gameId, userId, {
                    type: 'error',
                    message: '❌ شما تمام راهنمایی‌های خود را استفاده کرده‌اید'
                });
                return;
            }

            const word = game.word;
            const guessedLetters = JSON.parse(game.guessedletters || '[]');
            const availableLetters = [];

            for (let char of word) {
                if (!guessedLetters.includes(char) && !availableLetters.includes(char)) {
                    availableLetters.push(char);
                }
            }

            if (availableLetters.length === 0) {
                this.sendToUser(gameId, userId, {
                    type: 'error',
                    message: '❌ تمام حروف کلمه قبلاً حدس زده شده‌اند'
                });
                return;
            }

            const hintLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

            await this.db.query(
                'UPDATE multiplayer_games SET hintsused = hintsused + 1, lastactivity = CURRENT_TIMESTAMP WHERE gameid = $1',
                [gameId]
            );

            game.hintsused = (game.hintsused || 0) + 1;

            // ارسال راهنمایی به بازیکن
            this.sendToUser(gameId, userId, {
                type: 'hint_received',
                letter: hintLetter,
                hintsLeft: 2 - game.hintsused
            });

            await this.broadcastGameState(gameId);

        } catch (error) {
            this.log(`❌ خطا در درخواست راهنمایی: ${error.message}`);
        }
    }

    broadcastToGame(gameId, message) {
        const connections = this.websocketConnections.get(gameId) || [];
        connections.forEach(connection => {
            try {
                connection.ws.send(JSON.stringify(message));
            } catch (error) {
                this.log(`❌ خطا در ارسال پیام broadcast: ${error.message}`);
            }
        });
    }

    sendToUser(gameId, userId, message) {
        const connections = this.websocketConnections.get(gameId) || [];
        const userConnection = connections.find(conn => conn.userId === userId);
        if (userConnection) {
            try {
                userConnection.ws.send(JSON.stringify(message));
            } catch (error) {
                this.log(`❌ خطا در ارسال پیام به کاربر: ${error.message}`);
            }
        }
    }

    async loadActiveGames() {
        try {
            const result = await this.db.query(
                "SELECT * FROM multiplayer_games WHERE status IN ('waiting', 'active')"
            );
            
            result.rows.forEach(game => {
                this.activeMultiplayerGames.set(game.gameid, game);
                if (game.status === 'waiting') {
                    this.waitingGames.set(game.creatorid, game.gameid);
                }
            });
            
            this.log(`✅ ${result.rows.length} بازی فعال لود شد`);
        } catch (error) {
            this.log(`❌ خطا در لود بازی‌های فعال: ${error.message}`);
        }
    }

    async start() {
        await this.connectDB();
        this.setupWebSocket();

        // routes
        app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        app.get('/game', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'game.html'));
        });

        app.post('/api/create-game', async (req, res) => {
            try {
                const { userId, firstName } = req.body;
                const gameId = this.generateGameId();

                await this.db.query(`
                    INSERT INTO users (userid, firstname)
                    VALUES ($1, $2)
                    ON CONFLICT (userid) DO NOTHING
                `, [userId, firstName]);

                await this.db.query(`
                    INSERT INTO multiplayer_games (gameid, creatorid, status)
                    VALUES ($1, $2, 'waiting')
                `, [gameId, userId]);

                const game = {
                    gameid: gameId,
                    creatorid: userId,
                    status: 'waiting',
                    createdat: new Date()
                };
                this.activeMultiplayerGames.set(gameId, game);
                this.waitingGames.set(userId, gameId);

                res.json({ success: true, gameId: gameId });

            } catch (error) {
                this.log(`❌ خطا در ایجاد بازی: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        app.get('/api/game/:gameId', async (req, res) => {
            try {
                const { gameId } = req.params;
                const game = this.activeMultiplayerGames.get(gameId);
                
                if (!game) {
                    return res.status(404).json({ success: false, error: 'بازی یافت نشد' });
                }

                res.json({ success: true, game: game });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // راه‌اندازی سرور
        server.listen(PORT, () => {
            this.log(`🚀 سرور اجرا شد روی پورت: ${PORT}`);
            this.log(`🌐 آدرس بازی: http://localhost:${PORT}`);
        });
    }
}

const gameBot = new WordGameBot();
gameBot.start();
