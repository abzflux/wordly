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
    return word.split('').map(letter => 
      guessedLetters.includes(letter) ? letter : '_'
    ).join(' ');
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
      'کتاب'
    ];
  }

  static getLeagueWords(round) {
    // Sample words for league - can be expanded
    const wordSets = {
      1: ['ایران', 'سیب', 'سگ', 'تهران', 'میز'],
      2: ['فرانسه', 'پرتقال', 'گربه', 'مشهد', 'صندلی'],
      // ... add more rounds
    };
    return wordSets[round] || wordSets[1];
  }
}

module.exports = GameLogic;
