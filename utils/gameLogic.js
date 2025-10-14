class GameLogic {
  static calculateScore(word, timeSpent, hintsUsed, isWinner) {
    if (!isWinner) return 0;
    
    const baseScore = word.length * 100;
    const timeBonus = Math.max(0, 300 - timeSpent); // 5 minutes max
    const hintPenalty = hintsUsed * 15;
    
    return Math.max(0, baseScore + timeBonus - hintPenalty);
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
    // Basic validation - can be extended
    return word && word.length >= 2 && word.length <= 20;
  }

  static getWordDisplay(word, guessedLetters) {
    if (!word) return '';
    
    return word.split('').map(letter => {
      if (letter === ' ') return '   '; // Three spaces for word separator
      return guessedLetters.includes(letter) ? letter : '_';
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

  static getLeagueWords(round) {
    // Sample words for league - can be expanded
    const wordSets = {
      1: ['ایران', 'سیب', 'سگ', 'تهران', 'میز'],
      2: ['فرانسه', 'پرتقال', 'گربه', 'مشهد', 'صندلی'],
      3: ['آلمان', 'موز', 'فیل', 'اصفهان', 'میز'],
      4: ['ژاپن', 'انگور', 'پلنگ', 'شیراز', 'صندلی'],
      5: ['کانادا', 'هلو', 'خرس', 'تبریز', 'کامپیوتر']
    };
    return wordSets[round] || wordSets[1];
  }

  static isGameFinished(game) {
    if (!game.word) return false;
    
    const wordSet = new Set(game.word.split('').filter(char => char !== ' '));
    const correctSet = new Set(game.correct_letters || []);
    const isWinner = [...wordSet].every(char => correctSet.has(char));
    const isLoser = (game.current_attempt || 0) >= game.max_attempts;
    
    return isWinner || isLoser;
  }
}

module.exports = GameLogic;
