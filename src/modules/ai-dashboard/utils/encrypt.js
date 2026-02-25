/**
 * Criptografia de senha Oracle (usar chave de ambiente).
 * Nunca logar senha.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  const key = process.env.AI_DASHBOARD_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key || key.length < 32) {
    throw new Error('Defina AI_DASHBOARD_ENCRYPTION_KEY (ou SESSION_SECRET) com pelo menos 32 caracteres para criptografar senhas Oracle.');
  }
  return crypto.scryptSync(key, 'ai-dashboard-salt', KEY_LENGTH);
}

/**
 * @param {string} plainPassword
 * @returns {string} encrypted (hex)
 */
function encryptPassword(plainPassword) {
  if (!plainPassword) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainPassword, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('hex');
}

/**
 * @param {string} encryptedHex
 * @returns {string} plain password
 */
function decryptPassword(encryptedHex) {
  if (!encryptedHex) return '';
  const key = getEncryptionKey();
  const buf = Buffer.from(encryptedHex, 'hex');
  if (buf.length < IV_LENGTH + TAG_LENGTH) return '';
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

module.exports = { encryptPassword, decryptPassword };
