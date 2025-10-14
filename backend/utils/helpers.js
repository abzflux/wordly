const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const sanitizeInput = (input) => {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
};

const isPersian = (text) => {
  const persianRegex = /[\u0600-\u06FF]/;
  return persianRegex.test(text);
};

const generateKeyboard = (isPersian) => {
  if (isPersian) {
    return [
      ['ا', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ'],
      ['د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض'],
      ['ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل'],
      ['م', 'ن', 'و', 'ه', 'ی', 'ء', 'آ', 'أ', 'ئ'],
      ['🔄 راهنما', '⏹ پایان بازی']
    ];
  } else {
    return [
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
      ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
      ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
      ['V', 'W', 'X', 'Y', 'Z'],
      ['🔄 Hint', '⏹ End Game']
    ];
  }
};

module.exports = {
  formatTime,
  sanitizeInput,
  isPersian,
  generateKeyboard
};
