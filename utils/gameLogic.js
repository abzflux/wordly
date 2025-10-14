class GameLogic {
    static MIN_WORD_LENGTH = 2;
    static MAX_WORD_LENGTH = 20;

    static calculateScore(word, timeSpent, hintsUsed, isWinner) {
        if (!isWinner) return 0;
        
        const baseScore = word.length * 100;
        const timeBonus = Math.max(0, 300 - timeSpent); // 5 minutes max
        const hintPenalty = hintsUsed * 15;
        
        // Calculate complexity bonus (longer words = more points)
        const complexityBonus = word.length * 10;
        
        // Calculate speed bonus (faster = more points)
        const speedBonus = Math.max(0, 200 - Math.floor(timeSpent / 3));
        
        return Math.max(0, baseScore + timeBonus + complexityBonus + speedBonus - hintPenalty);
    }

    static generateGameCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    static validateWord(word) {
        if (!word || typeof word !== 'string') return false;
        
        const trimmed = word.trim();
        return trimmed.length >= this.MIN_WORD_LENGTH && 
               trimmed.length <= this.MAX_WORD_LENGTH &&
               /^[\u0600-\u06FFa-zA-Z\s]+$/.test(trimmed); // Only Persian, English letters and spaces
    }

    static getWordDisplay(word, guessedLetters) {
        if (!word) return '';
        
        return word.split('').map(char => {
            if (char === ' ') return '   '; // Three spaces for word separator
            return guessedLetters.includes(char) ? char : '_';
        }).join(' ');
    }

    static getCategories() {
        return [
            'کشور',
            'میوه',
            'حیوان',
            'شهر',
            'اشیا',
            'غذا',
            'شغل',
            'ورزش',
            'فیلم',
            'کتاب',
            'گیاه',
            'وسیله نقلیه',
            'رنگ',
            'اسم',
            'شخصیت'
        ];
    }

    static getGameStatusText(status) {
        const statusMap = {
            'waiting': 'در انتظار کلمه',
            'ready': 'آماده شروع',
            'active': 'در حال بازی',
            'finished': 'پایان یافته'
        };
        return statusMap[status] || status;
    }
}

module.exports = GameLogic;
