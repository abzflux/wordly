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

// Generate a random color for user avatars
const generateColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

// Validate game code format
const isValidGameCode = (code) => {
  return code && code.length === 6 && /^[A-Z0-9]+$/.test(code);
};

// Calculate game progress percentage
const calculateProgress = (word, correctLetters) => {
  if (!word) return 0;
  const uniqueLetters = [...new Set(word.split('').filter(char => char !== ' '))];
  const correctCount = correctLetters.filter(letter => uniqueLetters.includes(letter)).length;
  return Math.round((correctCount / uniqueLetters.length) * 100);
};

module.exports = {
  formatTime,
  sanitizeInput,
  isPersian,
  generateKeyboard,
  generateColor,
  isValidGameCode,
  calculateProgress
};
