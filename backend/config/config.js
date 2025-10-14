require('dotenv').config();

module.exports = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '8408419647:AAGuoIwzH-_S0jXWshGs-jz4CCTJgc_tfdQ',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://abolfazl:SlnZemyMHIZzEHKgC5IKiyJECwd8oB6h@dpg-d3n66fali9vc738qmm20-a.frankfurt-postgres.render.com/wordlydb_446t',
  PORT: process.env.PORT || 3000,
  WEB_APP_URL: process.env.WEB_APP_URL || 'https://wordlybot.ct.ws',
  NODE_ENV: process.env.NODE_ENV || 'production'
};
