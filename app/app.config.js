const path = require('path')

// Load .env from project root (app folder) so EXPO_PUBLIC_* are available at config time.
// Try .env first, then .env.txt for repos that only commit .env.txt.
require('dotenv').config({ path: path.resolve(__dirname, '.env') })
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env.txt') })
} catch (_) {}

const appJson = require('./app.json')

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },
  },
}
