import fernet from 'fernet';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

export function encryptValue(value) {
  if (!value) return value;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is not configured — refusing to save unencrypted sensitive data.');
  }
  const secret = new fernet.Secret(ENCRYPTION_KEY);
  const token = new fernet.Token({ secret });
  return token.encode(value);
}
