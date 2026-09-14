// Helper script to sync variables from .env to env-config.js for client-side browser usage
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
const configPath = path.resolve('env-config.js');

if (!fs.existsSync(envPath)) {
  console.log('.env file not found.');
  process.exit(0);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    envVars[key] = val;
  }
}

// Preserve existing config if variable is missing in .env
let existingConfig = {};
if (fs.existsSync(configPath)) {
  try {
    const existingContent = fs.readFileSync(configPath, 'utf8');
    const match = existingContent.match(/window\.__APP_CONFIG__\s*=\s*(\{[\s\S]*?\});/);
    if (match) {
      existingConfig = new Function(`return ${match[1]}`)();
    }
  } catch (_) {}
}

const finalConfig = {
  FIREBASE_API_KEY: envVars.FIREBASE_API_KEY || existingConfig.FIREBASE_API_KEY || '',
  FIREBASE_AUTH_DOMAIN: envVars.FIREBASE_AUTH_DOMAIN || existingConfig.FIREBASE_AUTH_DOMAIN || '',
  FIREBASE_PROJECT_ID: envVars.FIREBASE_PROJECT_ID || existingConfig.FIREBASE_PROJECT_ID || '',
  FIREBASE_STORAGE_BUCKET: envVars.FIREBASE_STORAGE_BUCKET || existingConfig.FIREBASE_STORAGE_BUCKET || '',
  FIREBASE_MESSAGING_SENDER_ID: envVars.FIREBASE_MESSAGING_SENDER_ID || existingConfig.FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: envVars.FIREBASE_APP_ID || existingConfig.FIREBASE_APP_ID || '',
  FIREBASE_MEASUREMENT_ID: envVars.FIREBASE_MEASUREMENT_ID || existingConfig.FIREBASE_MEASUREMENT_ID || '',

  API_TRANSLATE: envVars.API_TRANSLATE || existingConfig.API_TRANSLATE || 'https://api.mymemory.translated.net/get',
  API_DICTIONARY: envVars.API_DICTIONARY || existingConfig.API_DICTIONARY || 'https://freedictionaryapi.com/api/v1/entries/en',
  GEMINI_API_KEY: envVars.GEMINI_API_KEY || existingConfig.GEMINI_API_KEY || ''
};

const jsContent = `window.__APP_CONFIG__ = {
  FIREBASE_API_KEY: ${JSON.stringify(finalConfig.FIREBASE_API_KEY)},
  FIREBASE_AUTH_DOMAIN: ${JSON.stringify(finalConfig.FIREBASE_AUTH_DOMAIN)},
  FIREBASE_PROJECT_ID: ${JSON.stringify(finalConfig.FIREBASE_PROJECT_ID)},
  FIREBASE_STORAGE_BUCKET: ${JSON.stringify(finalConfig.FIREBASE_STORAGE_BUCKET)},
  FIREBASE_MESSAGING_SENDER_ID: ${JSON.stringify(finalConfig.FIREBASE_MESSAGING_SENDER_ID)},
  FIREBASE_APP_ID: ${JSON.stringify(finalConfig.FIREBASE_APP_ID)},
  FIREBASE_MEASUREMENT_ID: ${JSON.stringify(finalConfig.FIREBASE_MEASUREMENT_ID)},

  API_TRANSLATE: ${JSON.stringify(finalConfig.API_TRANSLATE)},
  API_DICTIONARY: ${JSON.stringify(finalConfig.API_DICTIONARY)},
  GEMINI_API_KEY: ${JSON.stringify(finalConfig.GEMINI_API_KEY)},
};
console.log("EV Master Config initialized with GEMINI_API_KEY:", !!window.__APP_CONFIG__.GEMINI_API_KEY);
`;

fs.writeFileSync(configPath, jsContent, 'utf8');
console.log('Successfully synced .env -> env-config.js!');
