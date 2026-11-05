import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export interface TokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

export class TokenSigner {
  constructor(private readonly secret: Buffer) {}

  sign(userId: string, now = Date.now()): string {
    const payload: TokenPayload = { sub: userId, iat: now, exp: now + TOKEN_TTL_MS };
    const body = b64url(Buffer.from(JSON.stringify(payload)));
    return `${body}.${this.mac(body)}`;
  }

  verify(token: unknown, now = Date.now()): TokenPayload | null {
    if (typeof token !== 'string' || token.length > 512) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
      if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number' || payload.exp < now) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private mac(body: string) {
    return b64url(createHmac('sha256', this.secret).update(body).digest());
  }
}

/** Uses MYTHOS_SESSION_SECRET if set, otherwise a random secret persisted in the data dir. */
export function loadSessionSecret(dataDir: string | null): Buffer {
  const env = process.env.MYTHOS_SESSION_SECRET;
  if (env && env.length >= 32) return Buffer.from(env);
  if (!dataDir) return randomBytes(32);
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'session.secret');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'hex');
  const secret = randomBytes(32);
  writeFileSync(file, secret.toString('hex'), { mode: 0o600 });
  return secret;
}
