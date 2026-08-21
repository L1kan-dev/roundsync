import fernet from 'fernet';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

export function encryptValue(value) {
  if (!value || !ENCRYPTION_KEY) return value; // no key set = save as-is, same as the Python version
  try {
    const secret = new fernet.Secret(ENCRYPTION_KEY);
    const token = new fernet.Token({ secret });
    return token.encode(value);
  } catch (err) {
    console.error('⚠️ Encryption error:', err);
    return value;
  }
}
