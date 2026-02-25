/**
 * Validação de SQL - Apenas SELECT permitido.
 * Bloqueia DELETE, UPDATE, DROP, INSERT, TRUNCATE, ALTER.
 * @param {string} sql
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSQL(sql) {
  if (!sql || typeof sql !== 'string') {
    return { valid: false, error: 'SQL inválido ou vazio.' };
  }

  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'SQL vazio.' };
  }

  const upper = trimmed.toUpperCase();

  if (!upper.startsWith('SELECT')) {
    return { valid: false, error: 'A query deve começar com SELECT.' };
  }

  const forbidden = ['DELETE', 'UPDATE', 'DROP', 'INSERT', 'TRUNCATE', 'ALTER'];
  for (const word of forbidden) {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    if (regex.test(trimmed)) {
      return { valid: false, error: `Comando não permitido: ${word}.` };
    }
  }

  return { valid: true };
}

module.exports = { validateSQL };
