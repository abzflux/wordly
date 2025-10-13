const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// تنظیمات
const BOT_TOKEN = process.env.BOT_TOKEN || '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://wordly.ct.ws/';

// تنظیمات PostgreSQL
const DB_HOST = process.env.DB_HOST || 'dpg-d3lquoidbo4c73bbhgu0-a.frankfurt-postgres.render.com';
const DB_USER = process.env.DB_USER || 'abz';
const DB_PASSWORD = process.env.DB_PASSWORD || 'NkFFeaYzvXkUEbcp80jW7V0tfDQe6LsC';
const DB_NAME = process.env.DB_NAME || 'wordly_db';
const DB_PORT = process.env.DB_PORT || 5432;

// ایجاد ربات تلگرام
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

app.use(express.json());

class WordGameBot {
    constructor() {
        this.db = null;
        this.dbConnected = false;
        this.activeMultiplayerGames = new Map();
        this.waitingGames = new Map();
        this.userGameStates = new Map();
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

			// جدول جلسات بازی
			await this.db.query(`
				CREATE TABLE IF NOT EXISTS game_sessions (
					id SERIAL PRIMARY KEY,
					userid BIGINT NOT NULL,
					word VARCHAR(255) NOT NULL,
					difficulty VARCHAR(50) NOT NULL,
					score INTEGER DEFAULT 0,
					completed BOOLEAN DEFAULT false,
					createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					updatedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					FOREIGN KEY (userid) REFERENCES users(userid) ON DELETE CASCADE
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
					category VARCHAR(100) DEFAULT 'عمومی',
					hints INTEGER DEFAULT 2,
					hintsused INTEGER DEFAULT 0,
					maxattempts INTEGER DEFAULT 6,
					attempts INTEGER DEFAULT 0,
					guessedletters TEXT,
					currentwordstate VARCHAR(255),
					status VARCHAR(20) CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')) DEFAULT 'waiting',
					winnerid BIGINT,
					creatorscore INTEGER DEFAULT 0,
					opponentscore INTEGER DEFAULT 0,
					createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					updatedat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					FOREIGN KEY (creatorid) REFERENCES users(userid) ON DELETE CASCADE,
					FOREIGN KEY (opponentid) REFERENCES users(userid) ON DELETE CASCADE
				)
			`);

			// اضافه کردن ستون lastactivity اگر وجود نداره
			await this.db.query(`
				ALTER TABLE multiplayer_games
				ADD COLUMN IF NOT EXISTS lastactivity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			`);

			// جدول درخواست‌های راهنمایی
			await this.db.query(`
				CREATE TABLE IF NOT EXISTS hint_requests (
					id SERIAL PRIMARY KEY,
					gameid VARCHAR(10) NOT NULL,
					requesterid BIGINT NOT NULL,
					hintletter VARCHAR(5),
					status VARCHAR(20) CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
					createdat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
					FOREIGN KEY (gameid) REFERENCES multiplayer_games(gameid) ON DELETE CASCADE,
					FOREIGN KEY (requesterid) REFERENCES users(userid) ON DELETE CASCADE
				)
			`);

			// ایجاد ایندکس‌ها
			await this.db.query(`CREATE INDEX IF NOT EXISTS idx_users_bestscore_v1 ON users(bestscore DESC)`);
			await this.db.query(`CREATE INDEX IF NOT EXISTS idx_multiplayer_status_v1 ON multiplayer_games(status)`);
			await this.db.query(`CREATE INDEX IF NOT EXISTS idx_multiplayer_creator_v1 ON multiplayer_games(creatorid)`);
			await this.db.query(`CREATE INDEX IF NOT EXISTS idx_multiplayer_opponent_v1 ON multiplayer_games(opponentid)`);
			await this.db.query(`CREATE INDEX IF NOT EXISTS idx_hint_requests_game_v1 ON hint_requests(gameid)`);

			this.log('✅ جداول دیتابیس با موفقیت بررسی و ایجاد شدند');
		} catch (error) {
			this.log(`❌ خطا در ایجاد جداول: ${error.message}`);
			console.error('Full error:', error);
		}
	}



    async loadActiveGames() {
			try {
				const result = await this.db.query(
					"SELECT * FROM multiplayer_games WHERE status IN ('waiting', 'active')"
				);
				
				result.rows.forEach(game => {
					// اطمینان از وجود lastActivity در آبجکت بازی
					if (!game.lastactivity) {
						game.lastactivity = game.createdat || new Date();
					}
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

    generateGameId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    createMainMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🎮 شروع تک نفره',
                            web_app: { url: WEB_APP_URL }
                        }
                    ],
                    [
                        {
                            text: '👥 بازی دو نفره',
                            callback_data: 'multiplayer'
                        }
                    ],
                    [
                        {
                            text: '📊 آمار و امتیازات',
                            callback_data: 'stats'
                        },
                        {
                            text: '🏆 جدول رتبه‌بندی', 
                            callback_data: 'leaderboard'
                        }
                    ],
                    [
                        {
                            text: '📖 راهنمای بازی',
                            callback_data: 'help'
                        },
                        {
                            text: 'ℹ️ درباره بازی',
                            callback_data: 'about'
                        }
                    ]
                ]
            }
        };
    }

    createMultiplayerMenu() {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🆕 ایجاد بازی جدید',
                            callback_data: 'create_multiplayer'
                        }
                    ],
                    [
                        {
                            text: '🔍 پیدا کردن بازی',
                            callback_data: 'find_multiplayer'
                        }
                    ],
                    [
                        {
                            text: '📋 بازی‌های فعال من',
                            callback_data: 'my_games'
                        }
                    ],
                    [
                        {
                            text: '🔙 بازگشت به منوی اصلی',
                            callback_data: 'main_menu'
                        }
                    ]
                ]
            }
        };
    }

    createCategoryMenu() {
        const categories = Object.keys(this.wordCategories);
        const buttons = [];
        
        for (let i = 0; i < categories.length; i += 2) {
            const row = [];
            if (categories[i]) {
                row.push({
                    text: categories[i],
                    callback_data: `category_${categories[i]}`
                });
            }
            if (categories[i+1]) {
                row.push({
                    text: categories[i+1],
                    callback_data: `category_${categories[i+1]}`
                });
            }
            buttons.push(row);
        }
        
        buttons.push([
            {
                text: '🔙 بازگشت',
                callback_data: 'multiplayer'
            }
        ]);
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    createGameActionsMenu(gameId, isCreator = false, isActive = false) {
        const buttons = [];
        
        if (isActive) {
            if (!isCreator) {
                buttons.push([
                    {
                        text: '💡 درخواست راهنمایی',
                        callback_data: `request_hint_${gameId}`
                    }
                ]);
            }
            
            buttons.push([
                {
                    text: '📊 وضعیت بازی',
                    callback_data: `game_status_${gameId}`
                }
            ]);
        }
        
        if (isCreator) {
            buttons.push([
                {
                    text: '❌ لغو بازی',
                    callback_data: `cancel_game_${gameId}`
                }
            ]);
        }
        
        buttons.push([
            {
                text: '🔙 بازگشت',
                callback_data: 'multiplayer'
            }
        ]);
        
        return {
            reply_markup: {
                inline_keyboard: buttons
            }
        };
    }

    createHintMenu(gameId) {
        return {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '✅ تایید راهنمایی',
                            callback_data: `approve_hint_${gameId}`
                        },
                        {
                            text: '❌ رد راهنمایی',
                            callback_data: `reject_hint_${gameId}`
                        }
                    ],
                    [
                        {
                            text: '🔙 بازگشت',
                            callback_data: `game_status_${gameId}`
                        }
                    ]
                ]
            }
        };
    }

    async getUserStats(userId) {
        if (!this.dbConnected) return null;

        try {
            const result = await this.db.query(
                'SELECT * FROM users WHERE userId = $1',
                [userId]
            );
            
            if (result.rows.length === 0) {
                await this.db.query(
                    'INSERT INTO users (userId, firstName, totalScore, gamesPlayed, bestScore, hintsUsed) VALUES ($1, $2, $3, $4, $5, $6)',
                    [userId, 'کاربر', 0, 0, 0, 0]
                );
                return {
                    userid: userId,
                    firstname: 'کاربر',
                    totalscore: 0,
                    gamesplayed: 0,
                    bestscore: 0,
                    multiplayerwins: 0,
                    hintsused: 0
                };
            }
            
            return result.rows[0];
        } catch (error) {
            this.log(`❌ خطا در دریافت اطلاعات کاربر: ${error.message}`);
            return null;
        }
    }

    async updateUserStats(userId, score, firstName = 'کاربر', username = '') {
        if (!this.dbConnected) return;

        try {
            const user = await this.getUserStats(userId);
            
            if (user) {
                await this.db.query(
                    `UPDATE users SET 
                     totalScore = totalScore + $1, 
                     gamesPlayed = gamesPlayed + 1,
                     bestScore = GREATEST(bestScore, $2),
                     firstName = $3,
                     username = $4,
                     updatedAt = CURRENT_TIMESTAMP
                     WHERE userId = $5`,
                    [score, score, firstName, username, userId]
                );
            }
            
            this.log(`📊 آمار کاربر ${firstName} به روز شد: ${score} امتیاز`);
        } catch (error) {
            this.log(`❌ خطا در به‌روزرسانی کاربر: ${error.message}`);
        }
    }

    async getLeaderboard(limit = 10) {
        if (!this.dbConnected) return [];

        try {
            const result = await this.db.query(
                'SELECT * FROM users ORDER BY bestScore DESC LIMIT $1',
                [limit]
            );
            return result.rows;
        } catch (error) {
            this.log(`❌ خطا در دریافت لیست برترین‌ها: ${error.message}`);
            return [];
        }
    }

    async handleStart(chatId, userData) {
        const welcomeText = 
            `🌟 <b>سلام ${userData.firstName} عزیز!</b>\n\n` +
            "🎮 <b>به ربات بازی حدس کلمه خوش آمدید!</b>\n\n" +
            "✨ <b>ویژگی‌های جدید:</b>\n" +
            "• 🎯 سه سطح مختلف (آسان، متوسط، سخت)\n" +
            "• 👥 <b>حالت دو نفره آنلاین</b>\n" +
            "• 🏆 سیستم امتیازدهی پیشرفته\n" + 
            "• 📊 جدول رتبه‌بندی\n" +
            "• 💡 سیستم راهنمایی هوشمند\n" +
            "• 🗂️ دسته‌بندی کلمات\n\n" +
            "برای شروع بازی روی گزینه مورد نظر کلیک کنید:";

        try {
            await this.getUserStats(userData.userId);
            await bot.sendMessage(chatId, welcomeText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
            this.log(`✅ پیام خوش‌آمدگویی برای ${userData.firstName} ارسال شد`);
        } catch (error) {
            this.log(`❌ خطا در ارسال پیام: ${error.message}`);
        }
    }

    async handleMultiplayerMenu(chatId, userId) {
        const menuText = 
            "👥 <b>بازی دو نفره آنلاین</b>\n\n" +
            "در این حالت می‌توانید با دوستان خود بازی کنید!\n\n" +
            "🎯 <b>طریقه بازی:</b>\n" +
            "1. یک بازی جدید ایجاد کنید\n" +
            "2. دسته‌بندی و کلمه مخفی را وارد کنید\n" +
            "3. دوست شما کلمه را حدس می‌زند\n" +
            "4. هر کس زودتر حدس بزند برنده است!\n\n" +
            "💡 <b>ویژگی‌های جدید:</b>\n" +
            "• 🗂️ انتخاب دسته‌بندی کلمه\n" +
            "• 💡 سیستم راهنمایی (۲ بار)\n" +
            "• ⏱️ زمان‌بندی خودکار\n\n" +
            "گزینه مورد نظر را انتخاب کنید:";

        await bot.sendMessage(chatId, menuText, {
            parse_mode: 'HTML',
            ...this.createMultiplayerMenu()
        });
    }

    async createMultiplayerGame(chatId, userId, firstName) {
        try {
            const gameId = this.generateGameId();
            
            await this.db.query(
                'INSERT INTO multiplayer_games (gameId, creatorId, status) VALUES ($1, $2, $3)',
                [gameId, userId, 'waiting']
            );

            const game = {
                gameid: gameId,
                creatorid: userId,
                status: 'waiting',
                createdat: new Date()
            };

            this.activeMultiplayerGames.set(gameId, game);
            this.waitingGames.set(userId, gameId);

            const gameText = 
                `🎮 <b>بازی دو نفره ایجاد شد!</b>\n\n` +
                `🆔 <b>کد بازی:</b> <code>${gameId}</code>\n` +
                `👤 <b>سازنده:</b> ${firstName}\n` +
                `⏳ <b>وضعیت:</b> در انتظار بازیکن دوم\n\n` +
                `📝 <b>برای شروع بازی:</b>\n` +
                `1. کد بازی را برای دوست خود بفرستید\n` +
                `2. یا از گزینه "پیدا کردن بازی" استفاده کنید\n\n` +
                `⚡ بازی به طور خودکار در ۱۰ دقیقه لغو می‌شود`;

            await bot.sendMessage(chatId, gameText, {
                parse_mode: 'HTML',
                ...this.createGameActionsMenu(gameId, true, false)
            });

            setTimeout(async () => {
                const currentGame = this.activeMultiplayerGames.get(gameId);
                if (currentGame && currentGame.status === 'waiting') {
                    await this.cancelMultiplayerGame(gameId, '⏰ زمان بازی به پایان رسید');
                }
            }, 10 * 60 * 1000);

        } catch (error) {
            this.log(`❌ خطا در ایجاد بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در ایجاد بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    async findMultiplayerGame(chatId, userId, firstName) {
        try {
            const waitingGames = Array.from(this.waitingGames.entries())
                .filter(([creatorId, gameId]) => creatorId !== userId)
                .slice(0, 5);

            if (waitingGames.length === 0) {
                await bot.sendMessage(chatId,
                    "🔍 <b>هیچ بازی در انتظاری پیدا نشد</b>\n\n" +
                    "می‌توانید خودتان یک بازی جدید ایجاد کنید یا کمی بعد دوباره بررسی کنید.",
                    {
                        parse_mode: 'HTML',
                        ...this.createMultiplayerMenu()
                    }
                );
                return;
            }

            const buttons = waitingGames.map(([creatorId, gameId]) => {
                return [{
                    text: `🎮 بازی ${gameId}`,
                    callback_data: `join_game_${gameId}`
                }];
            });

            buttons.push([{
                text: '🔙 بازگشت',
                callback_data: 'multiplayer'
            }]);

            await bot.sendMessage(chatId,
                "🔍 <b>بازی‌های در انتظار:</b>\n\n" +
                "یکی از بازی‌های زیر را برای پیوستن انتخاب کنید:",
                {
                    parse_mode: 'HTML',
                    reply_markup: { inline_keyboard: buttons }
                }
            );

        } catch (error) {
            this.log(`❌ خطا در پیدا کردن بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در پیدا کردن بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    async joinMultiplayerGame(chatId, userId, firstName, gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game) {
                await bot.sendMessage(chatId, '❌ بازی مورد نظر یافت نشد.');
                return;
            }

            if (game.creatorid === userId) {
                await bot.sendMessage(chatId, '❌ نمی‌توانید به بازی خودتان بپیوندید.');
                return;
            }

            if (game.status !== 'waiting') {
                await bot.sendMessage(chatId, '❌ این بازی قبلاً شروع شده است.');
                return;
            }

            await this.db.query(
                'UPDATE multiplayer_games SET opponentId = $1, status = $2, attempts = 0, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $3',
                [userId, 'active', gameId]
            );

            // آپدیت کش با مقادیر اولیه صحیح
            game.opponentid = userId;
            game.status = 'active';
            game.attempts = 0;
            game.guessedletters = '[]';
            game.hints = 2;
            game.hintsused = 0;
            this.activeMultiplayerGames.set(gameId, game);
            this.waitingGames.delete(game.creatorid);

            const creatorMessage = 
                `🎉 <b>بازیکن دوم پیوست!</b>\n\n` +
                `👤 <b>بازیکن:</b> ${firstName}\n` +
                `🆔 <b>کد بازی:</b> <code>${gameId}</code>\n\n` +
                `📝 لطفاً دسته‌بندی کلمه را انتخاب کنید:`;

            await bot.sendMessage(game.creatorid, creatorMessage, {
                parse_mode: 'HTML',
                ...this.createCategoryMenu()
            });

            const opponentMessage = 
                `🎉 <b>شما به بازی پیوستید!</b>\n\n` +
                `🆔 <b>کد بازی:</b> <code>${gameId}</code>\n` +
                `👤 <b>سازنده:</b> در حال انتخاب دسته‌بندی...\n\n` +
                `⚡ به زودی بازی شروع می‌شود...`;

            await bot.sendMessage(chatId, opponentMessage, {
                parse_mode: 'HTML',
                ...this.createGameActionsMenu(gameId, false, false)
            });

        } catch (error) {
            this.log(`❌ خطا در پیوستن به بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در پیوستن به بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    async handleCategorySelection(chatId, userId, category, gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game || game.creatorid !== userId) {
                await bot.sendMessage(chatId, '❌ بازی یافت نشد یا شما سازنده این بازی نیستید.');
                return;
            }

            if (game.status !== 'active') {
                await bot.sendMessage(chatId, '❌ این بازی فعال نیست.');
                return;
            }

            await this.db.query(
                'UPDATE multiplayer_games SET category = $1, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $2',
                [category, gameId]
            );

            game.category = category;
            this.activeMultiplayerGames.set(gameId, game);

            const categoryWords = this.wordCategories[category] || [];
            const exampleWord = categoryWords.length > 0 ? 
                `\n💡 <b>مثال:</b> "${categoryWords[0]}"` : '';

            await bot.sendMessage(chatId,
                `✅ <b>دسته‌بندی انتخاب شد!</b>\n\n` +
                `🗂️ <b>دسته‌بندی:</b> ${category}\n` +
                `${exampleWord}\n\n` +
                `📝 لطفاً کلمه مخفی را وارد کنید:\n` +
                `⚠️ کلمه باید بین ۳ تا ۱۵ حرف باشد`,
                { parse_mode: 'HTML' }
            );

        } catch (error) {
            this.log(`❌ خطا در انتخاب دسته‌بندی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در انتخاب دسته‌بندی. لطفاً دوباره تلاش کنید.');
        }
    }

    async handleWordInput(chatId, userId, text, gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game || game.creatorid !== userId) {
                await bot.sendMessage(chatId, '❌ بازی یافت نشد یا شما سازنده این بازی نیستید.');
                return;
            }

            if (game.status !== 'active') {
                await bot.sendMessage(chatId, '❌ این بازی فعال نیست.');
                return;
            }

            const word = text.trim().toLowerCase();
            if (word.length < 3 || word.length > 15) {
                await bot.sendMessage(chatId, '❌ کلمه باید بین ۳ تا ۱۵ حرف باشد.');
                return;
            }

            if (!/^[آ-یa-z]+$/.test(word)) {
                await bot.sendMessage(chatId, '❌ کلمه باید فقط شامل حروف فارسی یا انگلیسی باشد.');
                return;
            }

            await this.db.query(
                'UPDATE multiplayer_games SET word = $1, wordLength = $2, currentWordState = $3, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $4',
                [word, word.length, '_'.repeat(word.length), gameId]
            );

            game.word = word;
            game.wordlength = word.length;
            game.currentwordstate = '_'.repeat(word.length);
            this.activeMultiplayerGames.set(gameId, game);

            await bot.sendMessage(chatId,
                `✅ <b>کلمه مخفی ثبت شد!</b>\n\n` +
                `📝 <b>کلمه:</b> ${'⬜'.repeat(word.length)}\n` +
                `🗂️ <b>دسته‌بندی:</b> ${game.category}\n` +
                `🔤 <b>تعداد حروف:</b> ${word.length}\n\n` +
                `⏳ منتظر حدس بازیکن مقابل باشید...`,
                { 
                    parse_mode: 'HTML',
                    ...this.createGameActionsMenu(gameId, true, true)
                }
            );

            const opponentMessage = 
                `🎯 <b>بازی شروع شد!</b>\n\n` +
                `📝 <b>کلمه:</b> ${'⬜'.repeat(word.length)}\n` +
                `🗂️ <b>دسته‌بندی:</b> ${game.category}\n` +
                `🔤 <b>تعداد حروف:</b> ${word.length}\n` +
                `🎮 <b>فرصت‌ها:</b> ۶\n` +
                `💡 <b>راهنمایی:</b> ۲ بار\n\n` +
                `💡 حروف را یکی یکی حدس بزنید...\n` +
                `📝 مثال: "الف" یا "a"`;

            await bot.sendMessage(game.opponentid, opponentMessage, {
                parse_mode: 'HTML',
                ...this.createGameActionsMenu(gameId, false, true)
            });

        } catch (error) {
            this.log(`❌ خطا در ثبت کلمه: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در ثبت کلمه. لطفاً دوباره تلاش کنید.');
        }
    }

    async handleGuess(chatId, userId, text, gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game || game.opponentid !== userId) {
                await bot.sendMessage(chatId, '❌ بازی یافت نشد یا شما بازیکن این بازی نیستید.');
                return;
            }

            if (game.status !== 'active') {
                await bot.sendMessage(chatId, '❌ این بازی فعال نیست.');
                return;
            }

            if (!game.word) {
                await bot.sendMessage(chatId, '❌ کلمه هنوز توسط سازنده تنظیم نشده است.');
                return;
            }

            const guess = text.trim().toLowerCase();
            
            if (guess.length !== 1 || !/^[آ-یa-z]$/.test(guess)) {
                await bot.sendMessage(chatId, '❌ لطفاً فقط یک حرف فارسی یا انگلیسی وارد کنید.');
                return;
            }

            let guessedLetters = [];
            try {
                guessedLetters = JSON.parse(game.guessedletters || '[]');
            } catch (e) {
                guessedLetters = [];
            }

            if (guessedLetters.includes(guess)) {
                await bot.sendMessage(chatId, '❌ این حرف قبلاً حدس زده شده است.');
                return;
            }

            guessedLetters.push(guess);
            const guessedLettersStr = JSON.stringify(guessedLetters);

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

            const currentAttempts = game.attempts || 0;
            const newAttempts = currentAttempts + (correctGuess ? 0 : 1);
            let newStatus = game.status;

            if (newWordState === word) {
                newStatus = 'completed';
                await this.db.query(
                    'UPDATE multiplayer_games SET winnerId = $1, opponentScore = 100, status = $2, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $3',
                    [userId, 'completed', gameId]
                );
                
                await this.updateUserStats(userId, 100);
                await this.db.query(
                    'UPDATE users SET multiplayerWins = multiplayerWins + 1 WHERE userId = $1',
                    [userId]
                );
            } else if (newAttempts >= 6) {
                newStatus = 'completed';
                await this.db.query(
                    'UPDATE multiplayer_games SET winnerId = $1, creatorScore = 50, status = $2, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $3',
                    [game.creatorid, 'completed', gameId]
                );
                
                await this.updateUserStats(game.creatorid, 50);
            }

            await this.db.query(
                `UPDATE multiplayer_games SET 
                 attempts = $1, 
                 guessedLetters = $2,
                 currentWordState = $3,
                 status = $4,
                 lastActivity = CURRENT_TIMESTAMP
                 WHERE gameId = $5`,
                [newAttempts, guessedLettersStr, newWordState, newStatus, gameId]
            );

            // آپدیت کش با مقادیر صحیح
            game.attempts = newAttempts;
            game.guessedletters = guessedLettersStr;
            game.currentwordstate = newWordState;
            game.status = newStatus;
            this.activeMultiplayerGames.set(gameId, game);

            let displayWord = '';
            for (let char of newWordState) {
                displayWord += char === '_' ? '⬜' : char;
            }

            let message = `🎯 <b>حدس شما:</b> ${guess}\n\n`;
            message += `📝 <b>کلمه:</b> ${displayWord}\n`;
            message += `🗂️ <b>دسته‌بندی:</b> ${game.category}\n`;
            message += `🔤 <b>حروف حدس زده:</b> ${guessedLetters.join(', ') || 'هیچ'}\n`;
            message += `🎮 <b>فرصت‌های باقی‌مانده:</b> ${6 - newAttempts}\n`;
            message += `💡 <b>راهنمایی باقی‌مانده:</b> ${2 - (game.hintsused || 0)}\n\n`;

            if (correctGuess) {
                message += `✅ <b>حرف صحیح بود!</b>\n`;
            } else {
                message += `❌ <b>حرف در کلمه وجود ندارد</b>\n`;
            }

            if (newStatus === 'completed') {
                if (newWordState === word) {
                    message += `\n🎉 <b>تبریک! شما برنده شدید!</b>\n🏆 ۱۰۰ امتیاز دریافت کردید`;
                    
                    await bot.sendMessage(game.creatorid,
                        `❌ <b>بازی پایان یافت</b>\n\n` +
                        `📝 <b>کلمه:</b> ${word}\n` +
                        `🗂️ <b>دسته‌بندی:</b> ${game.category}\n` +
                        `🏆 <b>برنده:</b> بازیکن دوم\n` +
                        `🎯 <b>امتیاز شما:</b> ۰\n\n` +
                        `💡 دفعه بعد سعی کنید کلمه سخت‌تری انتخاب کنید!`,
                        { parse_mode: 'HTML' }
                    );
                } else {
                    message += `\n❌ <b>شما باختید!</b>\n\n` +
                              `📝 <b>کلمه صحیح:</b> ${word}\n` +
                              `🗂️ <b>دسته‌بندی:</b> ${game.category}\n` +
                              `💡 دفعه بعد شانس بیشتری داشته باشید!`;
                              
                    await bot.sendMessage(game.creatorid,
                        `🎉 <b>شما برنده شدید!</b>\n\n` +
                        `📝 <b>کلمه:</b> ${word}\n` +
                        `🗂️ <b>دسته‌بندی:</b> ${game.category}\n` +
                        `🏆 <b>برنده:</b> شما\n` +
                        `🎯 <b>امتیاز شما:</b> ۵۰\n\n` +
                        `✅ کلمه خوبی انتخاب کرده بودید!`,
                        { parse_mode: 'HTML' }
                    );
                }
                
                this.activeMultiplayerGames.delete(gameId);
            }

            await bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                ...this.createGameActionsMenu(gameId, false, newStatus !== 'completed')
            });

        } catch (error) {
            this.log(`❌ خطا در پردازش حدس: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در پردازش حدس. لطفاً دوباره تلاش کنید.');
        }
    }

    async handleHintRequest(chatId, userId, gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game || game.opponentid !== userId) {
				await bot.sendMessage(chatId, '❌ بازی یافت نشد یا شما بازیکن این بازی نیستید.');
				return;
			}

			if (game.hintsUsed >= 2) {
				await bot.sendMessage(chatId, '❌ شما تمام راهنمایی‌های خود را استفاده کرده‌اید.');
				return;
			}

            // پیدا کردن حرفی که هنوز حدس زده نشده
            const word = game.word;
            let guessedLetters = [];
            try {
                guessedLetters = JSON.parse(game.guessedletters || '[]');
            } catch (e) {
                guessedLetters = [];
            }

            const availableLetters = [];
            for (let char of word) {
                if (!guessedLetters.includes(char) && !availableLetters.includes(char)) {
                    availableLetters.push(char);
                }
            }

            if (availableLetters.length === 0) {
                await bot.sendMessage(chatId, '❌ تمام حروف کلمه قبلاً حدس زده شده‌اند.');
                return;
            }

            // انتخاب تصادفی یک حرف
            const hintLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];

            // ذخیره درخواست راهنمایی
            await this.db.query(
                'INSERT INTO hint_requests (gameId, requesterId, hintLetter, status) VALUES ($1, $2, $3, $4)',
                [gameId, userId, hintLetter, 'pending']
            );

            await this.db.query(
                'UPDATE multiplayer_games SET hintsUsed = hintsUsed + 1, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $1',
                [gameId]
            );

            game.hintsused = (game.hintsused || 0) + 1;
            this.activeMultiplayerGames.set(gameId, game);

            await bot.sendMessage(chatId,
                `💡 <b>درخواست راهنمایی ارسال شد!</b>\n\n` +
                `⏳ در انتظار تایید سازنده بازی...\n` +
                `📊 <b>راهنمایی باقی‌مانده:</b> ${2 - game.hintsused}`,
                { parse_mode: 'HTML' }
            );

            const creatorMessage = 
                `💡 <b>درخواست راهنمایی</b>\n\n` +
                `👤 <b>بازیکن:</b> درخواست راهنمایی کرده است\n` +
                `🆔 <b>کد بازی:</b> <code>${gameId}</code>\n\n` +
                `📝 آیا می‌خواهید حرف "${hintLetter}" را به عنوان راهنمایی نشان دهید؟`;

            await bot.sendMessage(game.creatorid, creatorMessage, {
                parse_mode: 'HTML',
                ...this.createHintMenu(gameId)
            });

        } catch (error) {
            this.log(`❌ خطا در درخواست راهنمایی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در درخواست راهنمایی. لطفاً دوباره تلاش کنید.');
        }
    }

    async handleHintResponse(chatId, userId, gameId, approve) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game || game.creatorid !== userId) {
                await bot.sendMessage(chatId, '❌ بازی یافت نشد یا شما سازنده این بازی نیستید.');
                return;
            }

            const hintRequest = await this.db.query(
                'SELECT * FROM hint_requests WHERE gameId = $1 AND status = $2 ORDER BY createdAt DESC LIMIT 1',
                [gameId, 'pending']
            );

            if (hintRequest.rows.length === 0) {
                await bot.sendMessage(chatId, '❌ درخواست راهنمایی یافت نشد.');
                return;
            }

            const request = hintRequest.rows[0];
            const newStatus = approve ? 'approved' : 'rejected';

            await this.db.query(
                'UPDATE hint_requests SET status = $1 WHERE id = $2',
                [newStatus, request.id]
            );

            await this.db.query(
                'UPDATE multiplayer_games SET lastActivity = CURRENT_TIMESTAMP WHERE gameId = $1',
                [gameId]
            );

            if (approve) {
                await bot.sendMessage(game.opponentid,
                    `💡 <b>راهنمایی تایید شد!</b>\n\n` +
                    `🔤 <b>حرف راهنمایی:</b> ${request.hintletter}\n` +
                    `📊 <b>راهنمایی باقی‌مانده:</b> ${2 - game.hintsused}\n\n` +
                    `💪 ادامه دهید!`,
                    { parse_mode: 'HTML' }
                );

                await bot.sendMessage(chatId,
                    `✅ <b>راهنمایی تایید شد</b>\n\n` +
                    `حرف "${request.hintletter}" به بازیکن نشان داده شد.`,
                    { parse_mode: 'HTML' }
                );
            } else {
                await bot.sendMessage(game.opponentid,
                    `❌ <b>درخواست راهنمایی رد شد</b>\n\n` +
                    `سازنده بازی راهنمایی شما را رد کرد.\n` +
                    `📊 <b>راهنمایی باقی‌مانده:</b> ${2 - game.hintsused}`,
                    { parse_mode: 'HTML' }
                );

                await bot.sendMessage(chatId,
                    `❌ <b>راهنمایی رد شد</b>\n\n` +
                    `درخواست راهنمایی بازیکن را رد کردید.`,
                    { parse_mode: 'HTML' }
                );
            }

        } catch (error) {
            this.log(`❌ خطا در پاسخ به راهنمایی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در پردازش پاسخ. لطفاً دوباره تلاش کنید.');
        }
    }

    async showGameStatus(chatId, userId, gameId) {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            
            if (!game) {
                await bot.sendMessage(chatId, '❌ بازی مورد نظر یافت نشد.');
                return;
            }

            if (game.creatorid !== userId && game.opponentid !== userId) {
                await bot.sendMessage(chatId, '❌ شما در این بازی شرکت ندارید.');
                return;
            }

            let displayWord = '';
            if (game.currentwordstate) {
                for (let char of game.currentwordstate) {
                    displayWord += char === '_' ? '⬜' : char;
                }
            } else {
                displayWord = '⬜'.repeat(game.wordlength || 0);
            }

            let guessedLetters = [];
            try {
                guessedLetters = JSON.parse(game.guessedletters || '[]');
            } catch (e) {
                guessedLetters = [];
            }

            let message = `📊 <b>وضعیت بازی</b>\n\n`;
            message += `🆔 <b>کد بازی:</b> <code>${gameId}</code>\n`;
            message += `📝 <b>کلمه:</b> ${displayWord}\n`;
            
            if (game.category) {
                message += `🗂️ <b>دسته‌بندی:</b> ${game.category}\n`;
            }
            
            message += `🔤 <b>تعداد حروف:</b> ${game.wordlength || 'نامشخص'}\n`;
            message += `🎮 <b>فرصت‌های استفاده شده:</b> ${game.attempts || 0}/6\n`;
            message += `💡 <b>راهنمایی استفاده شده:</b> ${game.hintsused || 0}/2\n`;
            message += `🔤 <b>حروف حدس زده:</b> ${guessedLetters.join(', ') || 'هیچ'}\n\n`;

            if (game.status === 'waiting') {
                message += `⏳ <b>وضعیت:</b> در انتظار بازیکن دوم`;
            } else if (game.status === 'active') {
                message += `🎯 <b>وضعیت:</b> بازی در جریان`;
            } else {
                message += `✅ <b>وضعیت:</b> بازی پایان یافته`;
            }

            await bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                ...this.createGameActionsMenu(
                    gameId, 
                    game.creatorid === userId, 
                    game.status === 'active'
                )
            });

        } catch (error) {
            this.log(`❌ خطا در نمایش وضعیت بازی: ${error.message}`);
            await bot.sendMessage(chatId, '❌ خطا در دریافت وضعیت بازی. لطفاً دوباره تلاش کنید.');
        }
    }

    async cancelMultiplayerGame(gameId, reason = 'بازی لغو شد') {
        try {
            const game = this.activeMultiplayerGames.get(gameId);
            if (!game) return;

            await this.db.query(
                'UPDATE multiplayer_games SET status = $1, lastActivity = CURRENT_TIMESTAMP WHERE gameId = $2',
                ['cancelled', gameId]
            );

            if (game.creatorid) {
                await bot.sendMessage(game.creatorid, `❌ ${reason}`);
            }
            if (game.opponentid) {
                await bot.sendMessage(game.opponentid, `❌ ${reason}`);
            }

            this.activeMultiplayerGames.delete(gameId);
            this.waitingGames.delete(game.creatorid);

        } catch (error) {
            this.log(`❌ خطا در لغو بازی: ${error.message}`);
        }
    }

    async showMyGames(chatId, userId, firstName) {
		try {
			// استفاده از createdat به جای lastactivity
			const result = await this.db.query(
				'SELECT * FROM multiplayer_games WHERE (creatorId = $1 OR opponentId = $1) AND status IN ($2, $3) ORDER BY createdAt DESC',
				[userId, 'waiting', 'active']
			);

			if (result.rows.length === 0) {
				await bot.sendMessage(chatId,
					"📋 <b>بازی‌های فعال شما</b>\n\n" +
					"⏳ هیچ بازی فعالی ندارید.\n\n" +
					"می‌توانید یک بازی جدید ایجاد کنید یا به بازی‌های دیگر بپیوندید.",
					{
						parse_mode: 'HTML',
						...this.createMultiplayerMenu()
					}
				);
				return;
			}

			let message = "📋 <b>بازی‌های فعال شما</b>\n\n";
			
			result.rows.forEach((game, index) => {
				const role = game.creatorid === userId ? 'سازنده' : 'بازیکن';
				const status = game.status === 'waiting' ? '⏳ در انتظار' : '🎯 فعال';
				message += `${index + 1}. 🆔 <code>${game.gameid}</code> - ${role} - ${status}\n`;
			});

			message += `\n💡 برای مشاهده وضعیت هر بازی، از منوی بازی استفاده کنید.`;

			const buttons = result.rows.map((game, index) => {
				return [{
					text: `📊 وضعیت بازی ${game.gameid}`,
					callback_data: `game_status_${game.gameid}`
				}];
			});

			buttons.push([{
				text: '🔙 بازگشت',
				callback_data: 'multiplayer'
			}]);

			await bot.sendMessage(chatId, message, {
				parse_mode: 'HTML',
				reply_markup: { inline_keyboard: buttons }
			});

		} catch (error) {
			this.log(`❌ خطا در نمایش بازی‌های کاربر: ${error.message}`);
			await bot.sendMessage(chatId, '❌ خطا در دریافت بازی‌ها. لطفاً دوباره تلاش کنید.');
		}
	}

    async handleStats(chatId, userId, firstName) {
        try {
            const userStats = await this.getUserStats(userId);
            
            let statsText;
            if (userStats) {
                statsText =
                    `📊 <b>آمار و امتیازات</b>\n\n` +
                    `👤 <b>کاربر:</b> ${firstName}\n` +
                    `🏆 <b>امتیاز کلی:</b> ${userStats.totalscore}\n` +
                    `🎯 <b>تعداد بازی‌ها:</b> ${userStats.gamesplayed}\n` +
                    `⭐ <b>بهترین امتیاز:</b> ${userStats.bestscore}\n` +
                    `👥 <b>بردهای دو نفره:</b> ${userStats.multiplayerwins}\n` +
                    `💡 <b>راهنمایی استفاده شده:</b> ${userStats.hintsused}\n\n` +
                    `📈 <i>برای بهبود آمار، بازی کنید!</i>`;
            } else {
                statsText =
                    `📊 <b>آمار و امتیازات</b>\n\n` +
                    `👤 <b>کاربر:</b> ${firstName}\n` +
                    `🏆 <b>امتیاز کلی:</b> 0\n` +
                    `🎯 <b>تعداد بازی‌ها:</b> 0\n` +
                    `⭐ <b>بهترین امتیاز:</b> 0\n` +
                    `👥 <b>بردهای دو نفره:</b> 0\n` +
                    `💡 <b>راهنمایی استفاده شده:</b> 0\n\n` +
                    `📈 <i>هنوز بازی نکرده‌اید!</i>`;
            }

            await bot.sendMessage(chatId, statsText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
        } catch (error) {
            this.log(`❌ خطا در نمایش آمار: ${error.message}`);
        }
    }

    async handleLeaderboard(chatId) {
        try {
            const topUsers = await this.getLeaderboard(5);
            
            let leaderboardText = "🏆 <b>جدول رتبه‌بندی</b>\n\n";
            
            if (topUsers.length > 0) {
                topUsers.forEach((user, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔸';
                    leaderboardText += `${medal} <b>${user.firstname}:</b> ${user.bestscore} امتیاز\n`;
                });
            } else {
                leaderboardText += "📝 هنوز کسی بازی نکرده است!\n";
            }
            
            leaderboardText += "\n📊 <i>برای قرارگیری در جدول، بازی کنید!</i>";

            await bot.sendMessage(chatId, leaderboardText, {
                parse_mode: 'HTML',
                ...this.createMainMenu()
            });
        } catch (error) {
            this.log(`❌ خطا در نمایش جدول: ${error.message}`);
        }
    }

    async handleHelp(chatId) {
        const helpText =
            "📖 <b>راهنمای بازی حدس کلمه</b>\n\n" +
            "🎯 <b>هدف بازی:</b>\n" +
            "حدس زدن کلمه مخفی قبل از اتمام فرصت‌ها\n\n" +
            "🔤 <b>طریقه بازی:</b>\n" +
            "1. روی «شروع بازی» کلیک کنید\n" +
            "2. سطح مورد نظر را انتخاب کنید\n" + 
            "3. حروف را در کادر وارد کنید\n" +
            "4. کلمه را قبل از اتمام ۶ فرصت حدس بزنید\n\n" +
            "👥 <b>بازی دو نفره:</b>\n" +
            "• یک بازی جدید ایجاد کنید\n" +
            "• دسته‌بندی و کلمه مخفی را وارد کنید\n" +
            "• دوست شما کلمه را حدس می‌زند\n" +
            "• برنده امتیاز دریافت می‌کند\n\n" +
            "💡 <b>سیستم راهنمایی:</b>\n" +
            "• هر بازیکن ۲ بار می‌تواند راهنمایی بگیرد\n" +
            "• سازنده بازی باید راهنمایی را تایید کند\n" +
            "• راهنمایی یک حرف تصادفی نشان می‌دهد\n\n" +
            "🗂️ <b>دسته‌بندی‌ها:</b>\n" +
            "• میوه‌ها، حیوانات، شهرها، کشورها، غذاها، اشیا\n\n" +
            "💡 <b>نکات مهم:</b>\n" +
            "• هر حرف اشتباه = از دست دادن یک فرصت\n" +
            "• امتیاز بیشتر برای سطح‌های سخت‌تر\n" +
            "• در بازی دو نفره، برنده ۱۰۰ امتیاز می‌گیرد";

        await bot.sendMessage(chatId, helpText, {
            parse_mode: 'HTML',
            ...this.createMainMenu()
        });
    }

    async handleAbout(chatId) {
        const aboutText =
            "ℹ️ <b>درباره بازی</b>\n\n" +
            "🎮 <b>بازی حدس کلمه</b>\n" +
            "یک بازی آموزشی و سرگرم کننده برای تقویت دایره لغات فارسی\n\n" +
            "✨ <b>ویژگی‌ها:</b>\n" +
            "• طراحی اختصاصی برای تلگرام\n" +
            "• رابط کاربری زیبا و مدرن\n" +
            "• سیستم امتیازدهی هوشمند\n" +
            "• 👥 بازی دو نفره آنلاین\n" +
            "• 💡 سیستم راهنمایی\n" +
            "• 🗂️ دسته‌بندی کلمات\n" +
            "• پشتیبانی از تمام دستگاه‌ها\n\n" +
            "🔗 <b>آدرس بازی:</b>\n" +
            `<code>${WEB_APP_URL}</code>`;

        await bot.sendMessage(chatId, aboutText, {
            parse_mode: 'HTML',
            ...this.createMainMenu()
        });
    }

    async handleGame(chatId) {
        const gameText =
            "🎯 <b>شروع بازی</b>\n\n" +
            "برای تجربه‌ی بهترین بازی، روی دکمه زیر کلیک کنید:\n\n" +
            "🖥️ بازی در مرورگر باز می‌شود\n" +
            "📱 سازگار با موبایل و دسکتاپ\n" +
            "⚡ عملکرد سریع و روان";

        await bot.sendMessage(chatId, gameText, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🚀 بازی در مرورگر',
                            web_app: { url: WEB_APP_URL }
                        }
                    ]
                ]
            }
        });
    }

    async handleMessage(msg) {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const firstName = msg.from.first_name || 'کاربر';
        const username = msg.from.username || '';
        const text = msg.text || '';

        this.log(`📩 پیام از ${firstName}: ${text}`);

        const userData = {
            userId,
            firstName,
            username
        };

        try {
            const activeGame = Array.from(this.activeMultiplayerGames.values())
                .find(game => 
                    (game.creatorid === userId || game.opponentid === userId) && 
                    game.status === 'active'
                );

            if (activeGame) {
                if (activeGame.creatorid === userId && !activeGame.word && activeGame.category) {
                    await this.handleWordInput(chatId, userId, text, activeGame.gameid);
                    return;
                } else if (activeGame.opponentid === userId && activeGame.word) {
                    await this.handleGuess(chatId, userId, text, activeGame.gameid);
                    return;
                }
            }

            switch (text) {
                case '/start':
                    await this.handleStart(chatId, userData);
                    break;
                    
                case '/game':
                    await this.handleGame(chatId);
                    break;

                case '/multiplayer':
                    await this.handleMultiplayerMenu(chatId, userId);
                    break;
                    
                case '/stats':
                    await this.handleStats(chatId, userId, firstName);
                    break;
                    
                default:
                    await bot.sendMessage(chatId, 
                        "🎮 <b>منوی اصلی بازی حدس کلمه</b>\n\n" +
                        "از گزینه‌های زیر استفاده کنید:",
                        {
                            parse_mode: 'HTML',
                            ...this.createMainMenu()
                        }
                    );
                    break;
            }
        } catch (error) {
            this.log(`❌ خطا در پردازش پیام: ${error.message}`);
        }
    }

    async handleCallbackQuery(callbackQuery) {
        const chatId = callbackQuery.message.chat.id;
        const userId = callbackQuery.from.id;
        const firstName = callbackQuery.from.first_name || 'کاربر';
        const data = callbackQuery.data;

        this.log(`🔘 کلیک از ${firstName}: ${data}`);

        try {
            if (data.startsWith('join_game_')) {
                const gameId = data.replace('join_game_', '');
                await this.joinMultiplayerGame(chatId, userId, firstName, gameId);
            }
            else if (data.startsWith('cancel_game_')) {
                const gameId = data.replace('cancel_game_', '');
                await this.cancelMultiplayerGame(gameId, 'بازی توسط سازنده لغو شد');
                await bot.sendMessage(chatId, '✅ بازی لغو شد.', this.createMultiplayerMenu());
            }
            else if (data.startsWith('category_')) {
                const category = data.replace('category_', '');
                const activeGame = Array.from(this.activeMultiplayerGames.values())
                    .find(game => game.creatorid === userId && game.status === 'active' && !game.word);
                
                if (activeGame) {
                    await this.handleCategorySelection(chatId, userId, category, activeGame.gameid);
                } else {
                    await bot.sendMessage(chatId, '❌ بازی فعالی برای انتخاب دسته‌بندی پیدا نشد.');
                }
            }
            else if (data.startsWith('request_hint_')) {
                const gameId = data.replace('request_hint_', '');
                await this.handleHintRequest(chatId, userId, gameId);
            }
            else if (data.startsWith('approve_hint_')) {
                const gameId = data.replace('approve_hint_', '');
                await this.handleHintResponse(chatId, userId, gameId, true);
            }
            else if (data.startsWith('reject_hint_')) {
                const gameId = data.replace('reject_hint_', '');
                await this.handleHintResponse(chatId, userId, gameId, false);
            }
            else if (data.startsWith('game_status_')) {
                const gameId = data.replace('game_status_', '');
                await this.showGameStatus(chatId, userId, gameId);
            }
            else {
                switch (data) {
                    case 'multiplayer':
                        await this.handleMultiplayerMenu(chatId, userId);
                        break;

                    case 'create_multiplayer':
                        await this.createMultiplayerGame(chatId, userId, firstName);
                        break;

                    case 'find_multiplayer':
                        await this.findMultiplayerGame(chatId, userId, firstName);
                        break;

                    case 'my_games':
                        await this.showMyGames(chatId, userId, firstName);
                        break;

                    case 'main_menu':
                        await this.handleStart(chatId, { userId, firstName });
                        break;
                        
                    case 'stats':
                        await this.handleStats(chatId, userId, firstName);
                        break;
                        
                    case 'leaderboard':
                        await this.handleLeaderboard(chatId);
                        break;
                        
                    case 'help':
                        await this.handleHelp(chatId);
                        break;
                        
                    case 'about':
                        await this.handleAbout(chatId);
                        break;
                }
            }
        } catch (error) {
            this.log(`❌ خطا در پردازش callback: ${error.message}`);
        }
    }

    async setupWebhook() {
        try {
            const webhookUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'your-app-name.onrender.com'}/webhook`;
            
            this.log(`🔄 در حال تنظیم وب‌هوک: ${webhookUrl}`);
            
            const response = await bot.setWebHook(webhookUrl);
            
            if (response) {
                this.log('✅ وب‌هوک با موفقیت تنظیم شد');
            } else {
                this.log('❌ خطا در تنظیم وب‌هوک');
            }
        } catch (error) {
            this.log(`❌ خطا در تنظیم وب‌هوک: ${error.message}`);
        }
    }

    async start() {
        await this.connectDB();

        app.post('/webhook', async (req, res) => {
            try {
                const update = req.body;
                
                if (update.message) {
                    await this.handleMessage(update.message);
                }
                
                if (update.callback_query) {
                    await this.handleCallbackQuery(update.callback_query);
                }
                
                res.sendStatus(200);
            } catch (error) {
                this.log(`❌ خطا در پردازش وب‌هوک: ${error.message}`);
                res.sendStatus(200);
            }
        });

        app.post('/api/save-score', async (req, res) => {
            try {
                const { userId, score, firstName, username } = req.body;
                
                if (userId && score !== undefined) {
                    await this.updateUserStats(userId, score, firstName, username);
                    res.json({ success: true, message: 'امتیاز ذخیره شد' });
                } else {
                    res.status(400).json({ success: false, message: 'داده‌ها ناقص است' });
                }
            } catch (error) {
                this.log(`❌ خطا در ذخیره امتیاز: ${error.message}`);
                res.status(500).json({ success: false, message: 'خطای سرور' });
            }
        });

        app.get('/', (req, res) => {
            const dbStatus = this.dbConnected ? '✅ متصل' : '❌ قطع';
            const activeGames = this.activeMultiplayerGames.size;
            const waitingGames = this.waitingGames.size;
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>ربات بازی حدس کلمه</title>
                    <meta charset="utf-8">
                    <style>
                        body { 
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                            text-align: center; 
                            padding: 50px; 
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                            color: white; 
                            margin: 0;
                        }
                        .container { 
                            max-width: 600px; 
                            margin: 0 auto; 
                            background: rgba(255,255,255,0.1); 
                            padding: 30px; 
                            border-radius: 15px; 
                            backdrop-filter: blur(10px); 
                        }
                        h1 { font-size: 2.5em; margin-bottom: 20px; }
                        .status { 
                            background: rgba(255,255,255,0.2); 
                            padding: 15px; 
                            border-radius: 10px; 
                            margin: 20px 0; 
                        }
                        .info { 
                            text-align: left; 
                            background: rgba(0,0,0,0.2); 
                            padding: 15px; 
                            border-radius: 10px; 
                            margin: 10px 0; 
                        }
                        .stats {
                            display: flex;
                            justify-content: space-around;
                            margin: 20px 0;
                        }
                        .stat-item {
                            background: rgba(255,255,255,0.2);
                            padding: 10px;
                            border-radius: 8px;
                            flex: 1;
                            margin: 0 5px;
                        }
                        code {
                            background: rgba(0,0,0,0.3);
                            padding: 2px 6px;
                            border-radius: 4px;
                            direction: ltr;
                            display: inline-block;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>🤖 ربات تلگرام</h1>
                        <div class="status">
                            <h2>🎮 بازی حدس کلمه</h2>
                            <p>ربات فعال و در حال اجرا روی Render.com</p>
                            <p>وضعیت دیتابیس: ${dbStatus} (PostgreSQL)</p>
                        </div>
                        <div class="stats">
                            <div class="stat-item">
                                <strong>🎯 بازی‌های فعال</strong><br>
                                ${activeGames}
                            </div>
                            <div class="stat-item">
                                <strong>⏳ در انتظار</strong><br>
                                ${waitingGames}
                            </div>
                        </div>
                        <div class="info">
                            <strong>🔗 آدرس وب اپ:</strong><br>
                            <code>${WEB_APP_URL}</code>
                        </div>
                        <div class="info">
                            <strong>✨ ویژگی‌های جدید:</strong><br>
                            • بازی تک نفره در مرورگر<br>
                            • 👥 بازی دو نفره آنلاین<br>
                            • 💡 سیستم راهنمایی هوشمند<br>
                            • 🗂️ دسته‌بندی کلمات<br>
                            • 🏆 سیستم امتیازدهی پیشرفته<br>
                            • 📊 جدول رتبه‌بندی
                        </div>
                        <div class="info">
                            <strong>🚀 برای شروع:</strong><br>
                            در تلگرام به ربات پیام <code>/start</code> بفرستید
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        app.use((req, res) => {
            res.status(404).send('صفحه مورد نظر یافت نشد');
        });

        app.listen(PORT, async () => {
            this.log(`🚀 سرور Node.js اجرا شد روی پورت: ${PORT}`);
            await this.setupWebhook();
            this.log(`🤖 ربات آماده دریافت پیام...`);
        });
    }
}

const gameBot = new WordGameBot();
gameBot.start();

cron.schedule('*/10 * * * *', async () => {
    try {
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const response = await fetch(baseUrl);
        console.log('🔄 Keeping alive...');
    } catch (error) {
        console.log('❌ Keep-alive failed:', error.message);
    }
});

// پاکسازی بازی‌های قدیمی هر 30 دقیقه
cron.schedule('*/30 * * * *', async () => {
    try {
        const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 ساعت قبل
        const result = await gameBot.db.query(
            'UPDATE multiplayer_games SET status = $1 WHERE status IN ($2, $3) AND lastActivity < $4',
            ['cancelled', 'waiting', 'active', cutoffTime]
        );
        
        if (result.rowCount > 0) {
            gameBot.log(`🧹 ${result.rowCount} بازی قدیمی پاکسازی شد`);
        }
    } catch (error) {
        gameBot.log(`❌ خطا در پاکسازی بازی‌های قدیمی: ${error.message}`);
    }
});

process.on('unhandledRejection', (error) => {
    console.error('❌ خطای unhandledRejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ خطای uncaughtException:', error);
});
