import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const key = () => {
  const k = process.env.SECRETS_ENCRYPTION_KEY;
  if (!k || k.length < 16) throw new Error('SECRETS_ENCRYPTION_KEY is not set on the server (use a random string of 32+ characters).');
  return createHash('sha256').update(k).digest();
};

/** AES-256-GCM. Output: enc:v1:<iv>.<tag>.<ciphertext> (base64). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

/** Values stored before encryption existed have no prefix and are returned as they are. */
export function decrypt(stored: string): string {
  if (!stored.startsWith('enc:v1:')) return stored;
  const [iv, tag, ct] = stored.slice(7).split('.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
