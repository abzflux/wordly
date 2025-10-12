<?php
// ربات تلگرام برای Render.com
header('Content-Type: text/plain; charset=utf-8');

// تنظیمات از Environment Variables
$BOT_TOKEN = getenv('BOT_TOKEN') ?: '8408419647:AAFivpMKAKSGoIWI0Qq8PJ_zrdhQK9wlJFo';
$WEB_APP_URL = getenv('WEB_APP_URL') ?: 'https://wordly.ct.ws/';
$API_URL = 'https://api.telegram.org/bot' . $BOT_TOKEN . '/';
$PORT = getenv('PORT') ?: 3000;

class TelegramBot {
    private $last_update_id = 0;
    private $bot_token;
    private $web_app_url;
    private $api_url;
    
    public function __construct($bot_token, $web_app_url) {
        $this->bot_token = $bot_token;
        $this->web_app_url = $web_app_url;
        $this->api_url = 'https://api.telegram.org/bot' . $bot_token . '/';
        
        // ایجاد دایرکتوری برای لاگ‌ها
        if (!is_dir('logs')) {
            mkdir('logs', 0755, true);
        }
        $this->log('🤖 ربات تلگرام روی Render راه‌اندازی شد');
    }
    
    private function log($message) {
        $log_file = 'logs/bot_log_' . date('Y-m-d') . '.txt';
        $timestamp = date('Y-m-d H:i:s');
        file_put_contents($log_file, "[$timestamp] $message\n", FILE_APPEND | LOCK_EX);
        echo "$message\n";
        
        // همچنین در console هم نمایش داده شود
        error_log($message);
    }
    
    private function apiRequest($method, $data = []) {
        $url = $this->api_url . $method;
        
        $options = [
            'http' => [
                'header' => "Content-type: application/x-www-form-urlencoded\r\n",
                'method' => 'POST',
                'content' => http_build_query($data),
                'timeout' => 10
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false
            ]
        ];
        
        $context = stream_context_create($options);
        $result = @file_get_contents($url, false, $context);
        
        if ($result === FALSE) {
            $error = error_get_last();
            $this->log("❌ خطا در ارسال درخواست به: $method - " . $error['message']);
            return false;
        }
        
        return json_decode($result, true);
    }
    
    public function getUpdates() {
        $updates = $this->apiRequest('getUpdates', [
            'offset' => $this->last_update_id + 1,
            'timeout' => 30
        ]);
        
        if ($updates && $updates['ok']) {
            return $updates['result'];
        }
        
        return [];
    }
    
    public function sendMessage($chat_id, $text, $reply_markup = null) {
        $data = [
            'chat_id' => $chat_id,
            'text' => $text,
            'parse_mode' => 'HTML'
        ];
        
        if ($reply_markup) {
            $data['reply_markup'] = json_encode($reply_markup);
        }
        
        return $this->apiRequest('sendMessage', $data);
    }
    
    private function createMainMenu() {
        return [
            'inline_keyboard' => [
                [
                    [
                        'text' => '🎮 شروع بازی زیبا',
                        'web_app' => ['url' => $this->web_app_url]
                    ]
                ],
                [
                    [
                        'text' => '📊 آمار و امتیازات',
                        'callback_data' => 'stats'
                    ],
                    [
                        'text' => '🏆 جدول رتبه‌بندی', 
                        'callback_data' => 'leaderboard'
                    ]
                ],
                [
                    [
                        'text' => '📖 راهنمای بازی',
                        'callback_data' => 'help'
                    ],
                    [
                        'text' => 'ℹ️ درباره بازی',
                        'callback_data' => 'about'
                    ]
                ]
            ]
        ];
    }
    
    private function createGameMenu() {
        return [
            'inline_keyboard' => [
                [
                    [
                        'text' => '🚀 بازی در مرورگر',
                        'web_app' => ['url' => $this->web_app_url]
                    ]
                ]
            ]
        ];
    }
    
    public function handleMessage($message) {
        $chat_id = $message['chat']['id'];
        $user_id = $message['from']['id'];
        $first_name = $message['from']['first_name'] ?? 'کاربر';
        $text = $message['text'] ?? '';
        
        $this->log("📩 پیام از $first_name: $text");
        
        switch ($text) {
            case '/start':
                $this->handleStart($chat_id, $first_name);
                break;
                
            case '/game':
                $this->handleGame($chat_id);
                break;
                
            case '/stats':
                $this->handleStats($chat_id, $user_id);
                break;
                
            default:
                $this->sendMessage($chat_id, 
                    "🎮 <b>منوی اصلی بازی حدس کلمه</b>\n\n" .
                    "از گزینه‌های زیر استفاده کنید:",
                    $this->createMainMenu()
                );
                break;
        }
    }
    
    private function handleStart($chat_id, $first_name) {
        $welcome_text = 
            "🌟 <b>سلام $first_name عزیز!</b>\n\n" .
            "🎮 <b>به ربات بازی حدس کلمه خوش آمدید!</b>\n\n" .
            "✨ <b>ویژگی‌های بازی:</b>\n" .
            "• 🎯 سه سطح مختلف (آسان، متوسط، سخت)\n" .
            "• 🏆 سیستم امتیازدهی پیشرفته\n" . 
            "• 📊 جدول رتبه‌بندی\n" .
            "• 🎨 طراحی زیبا و ریسپانسیو\n\n" .
            "برای شروع بازی روی دکمه زیر کلیک کنید:";
        
        $this->sendMessage($chat_id, $welcome_text, $this->createMainMenu());
    }
    
    private function handleGame($chat_id) {
        $game_text =
            "🎯 <b>شروع بازی</b>\n\n" .
            "برای تجربه‌ی بهترین بازی، روی دکمه زیر کلیک کنید:\n\n" .
            "🖥️ بازی در مرورگر باز می‌شود\n" .
            "📱 سازگار با موبایل و دسکتاپ\n" .
            "⚡ عملکرد سریع و روان";
        
        $this->sendMessage($chat_id, $game_text, $this->createGameMenu());
    }
    
    private function handleStats($chat_id, $user_id) {
        $stats_text =
            "📊 <b>آمار و امتیازات</b>\n\n" .
            "👤 <b>کاربر:</b> در حال بارگذاری...\n" .
            "🏆 <b>امتیاز کلی:</b> در حال بارگذاری...\n" .
            "🎯 <b>تعداد بازی‌ها:</b> در حال بارگذاری...\n" .
            "⭐ <b>بهترین امتیاز:</b> در حال بارگذاری...\n\n" .
            "📈 <i>برای مشاهده آمار کامل، وارد بازی شوید...</i>";
        
        $this->sendMessage($chat_id, $stats_text, $this->createMainMenu());
    }
    
    public function handleCallbackQuery($callback_query) {
        $chat_id = $callback_query['message']['chat']['id'];
        $data = $callback_query['data'];
        $first_name = $callback_query['from']['first_name'] ?? 'کاربر';
        
        $this->log("🔘 کلیک از $first_name: $data");
        
        switch ($data) {
            case 'stats':
                $this->handleStats($chat_id, $callback_query['from']['id']);
                break;
                
            case 'leaderboard':
                $this->handleLeaderboard($chat_id);
                break;
                
            case 'help':
                $this->handleHelp($chat_id);
                break;
                
            case 'about':
                $this->handleAbout($chat_id);
                break;
        }
    }
    
    private function handleLeaderboard($chat_id) {
        $leaderboard_text =
            "🏆 <b>جدول رتبه‌بندی</b>\n\n" .
            "🥇 <b>رتبه اول:</b> در حال بارگذاری...\n" .
            "🥈 <b>رتبه دوم:</b> در حال بارگذاری...\n" . 
            "🥉 <b>رتبه سوم:</b> در حال بارگذاری...\n\n" .
            "📊 <i>برای مشاهده جدول کامل، وارد بازی شوید...</i>";
        
        $this->sendMessage($chat_id, $leaderboard_text, $this->createMainMenu());
    }
    
    private function handleHelp($chat_id) {
        $help_text =
            "📖 <b>راهنمای بازی حدس کلمه</b>\n\n" .
            "🎯 <b>هدف بازی:</b>\n" .
            "حدس زدن کلمه مخفی قبل از اتمام فرصت‌ها\n\n" .
            "🔤 <b>طریقه بازی:</b>\n" .
            "1. روی «شروع بازی» کلیک کنید\n" .
            "2. سطح مورد نظر را انتخاب کنید\n" . 
            "3. حروف را در کادر وارد کنید\n" .
            "4. کلمه را قبل از اتمام ۶ فرصت حدس بزنید\n\n" .
            "💡 <b>نکات مهم:</b>\n" .
            "• هر حرف اشتباه = از دست دادن یک فرصت\n" .
            "• امتیاز بیشتر برای سطح‌های سخت‌تر\n" .
            "• سرعت پاسخ‌دهی در امتیاز تأثیر دارد";
        
        $this->sendMessage($chat_id, $help_text, $this->createMainMenu());
    }
    
    private function handleAbout($chat_id) {
        $about_text =
            "ℹ️ <b>درباره بازی</b>\n\n" .
            "🎮 <b>بازی حدس کلمه</b>\n" .
            "یک بازی آموزشی و سرگرم کننده برای تقویت دایره لغات فارسی\n\n" .
            "✨ <b>ویژگی‌ها:</b>\n" .
            "• طراحی اختصاصی برای تلگرام\n" .
            "• رابط کاربری زیبا و مدرن\n" .
            "• سیستم امتیازدهی هوشمند\n" .
            "• پشتیبانی از تمام دستگاه‌ها\n\n" .
            "🔗 <b>آدرس بازی:</b>\n" .
            "<code>" . $this->web_app_url . "</code>";
        
        $this->sendMessage($chat_id, $about_text, $this->createMainMenu());
    }
    
    public function startWebhook() {
        $this->log("🔄 شروع Webhook Mode...");
        
        // تست اتصال
        $test = $this->apiRequest('getMe');
        if ($test && $test['ok']) {
            $bot_name = $test['result']['first_name'];
            $this->log("✅ متصل به ربات: $bot_name");
            $this->log("🌐 آدرس وب اپ: " . $this->web_app_url);
        } else {
            $this->log("❌ مشکل در اتصال به تلگرام");
            return false;
        }
        
        return true;
    }
    
    public function handleWebhook($input) {
        $update = json_decode($input, true);
        
        if (isset($update['message'])) {
            $this->handleMessage($update['message']);
        }
        
        if (isset($update['callback_query'])) {
            $this->handleCallbackQuery($update['callback_query']);
        }
        
        return true;
    }
}

// اجرای ربات
if (php_sapi_name() === 'cli') {
    // حالت Polling (برای تست محلی)
    $bot = new TelegramBot($BOT_TOKEN, $WEB_APP_URL);
    $bot->startPolling();
} else {
    // حالت Webhook (برای Render)
    $bot = new TelegramBot($BOT_TOKEN, $WEB_APP_URL);
    
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // پردازش وب‌هوک تلگرام
        $input = file_get_contents('php://input');
        $bot->handleWebhook($input);
        http_response_code(200);
        echo 'OK';
    } else {
        // صفحه اصلی
        echo "<!DOCTYPE html>
        <html lang='fa'>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1.0'>
            <title>ربات بازی حدس کلمه</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                .container { max-width: 600px; margin: 0 auto; background: rgba(255,255,255,0.1); padding: 30px; border-radius: 15px; backdrop-filter: blur(10px); }
                h1 { font-size: 2.5em; margin-bottom: 20px; }
                .status { background: rgba(255,255,255,0.2); padding: 15px; border-radius: 10px; margin: 20px 0; }
                .info { text-align: left; background: rgba(0,0,0,0.2); padding: 15px; border-radius: 10px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <div class='container'>
                <h1>🤖 ربات تلگرام</h1>
                <div class='status'>
                    <h2>🎮 بازی حدس کلمه</h2>
                    <p>ربات فعال و در حال اجرا روی Render.com</p>
                </div>
                <div class='info'>
                    <strong>🔗 آدرس وب اپ:</strong><br>
                    <code>$WEB_APP_URL</code>
                </div>
                <div class='info'>
                    <strong>📊 وضعیت ربات:</strong><br>
                    ✅ فعال و آماده دریافت پیام
                </div>
                <div class='info'>
                    <strong>🚀 برای شروع:</strong><br>
                    در تلگرام به ربات پیام <code>/start</code> بفرستید
                </div>
            </div>
        </body>
        </html>";
    }
}
?>
