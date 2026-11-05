// Admin sessions (signed cookies) + API keys.
import crypto from 'node:crypto';
import { get, run, getSettings, setSettings } from './db.js';

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let s = getSettings()._session_secret;
  if (!s) { s = crypto.randomBytes(32).toString('hex'); setSettings({ _session_secret: s }); }
  return s;
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(pw, salt, 64), want = Buffer.from(hash, 'hex');
  return want.length === h.length && crypto.timingSafeEqual(h, want);
}

const COOKIE = 'sb_session';
const TTL = 1000 * 60 * 60 * 24 * 14; // 14 days

// The signature also covers the user's current password hash, so changing a password (or deleting the
// user) instantly signs out every existing session for that login.
const sign = (uid, exp, pwHash) => crypto.createHmac('sha256', secret()).update(`${uid}.${exp}.${pwHash || ''}`).digest('base64url');
const isSecure = req => process.env.COOKIE_SECURE === 'true' || (process.env.COOKIE_SECURE !== 'false' && !!req?.secure);
export function issueSession(res, userId, req) {
  const exp = Date.now() + TTL;
  const u = get('SELECT password_hash FROM users WHERE id = ?', Number(userId));
  const payload = `${userId}.${exp}`;
  const secure = isSecure(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${sign(userId, exp, u?.password_hash)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${TTL / 1000}${secure}`);
}
export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}
function readSession(req) {
  const raw = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [uid, exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!uid || !exp || !sig || Number(exp) < Date.now()) return null;
  if (!/^\d+$/.test(uid) || !/^\d+$/.test(exp)) return null;
  const u = get("SELECT id, email, name, COALESCE(role, 'admin') AS role, dealer_id, password_hash FROM users WHERE id = ?", Number(uid));
  if (!u) return null;
  const expect = sign(uid, exp, u.password_hash);
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  delete u.password_hash;
  return u;
}

// ---- API keys ----------------------------------------------------------------
export function createApiKey(name) {
  const key = 'sb_live_' + crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const r = run('INSERT INTO api_keys (name, prefix, key_hash) VALUES (?, ?, ?)', name || 'API key', key.slice(0, 12), hash);
  return { id: Number(r.lastInsertRowid), key, prefix: key.slice(0, 12) };
}
function readApiKey(req) {
  let key = req.headers['x-api-key'];
  const auth = req.headers.authorization || '';
  if (!key && auth.startsWith('Bearer ')) key = auth.slice(7).trim();
  if (!key || String(key).length > 200) return null;
  const hash = crypto.createHash('sha256').update(String(key)).digest('hex');
  const row = get('SELECT * FROM api_keys WHERE key_hash = ?', hash);
  if (row) run("UPDATE api_keys SET last_used = datetime('now') WHERE id = ?", row.id);
  return row || null;
}

/** Roles: admin (everything), sales (quotes: view + update status/notes, drawings),
 *  production (quotes: view + drawings only). sales/production can be limited to one dealer lot. */
export const ROLES = ['admin', 'sales', 'production'];
const QUOTE_READ = /^\/quotes(\/\d+(\/floorplan\.svg)?)?$/;
function roleAllows(user, method, path) {
  if (user.role === 'admin') return true;
  if (method === 'GET' && QUOTE_READ.test(path)) return true;
  if (user.role === 'sales' && method === 'PATCH' && /^\/quotes\/\d+$/.test(path)) return true;
  return false;
}

/** Admin UI session OR a valid API key. */
export function requireAuth(req, res, next) {
  const user = readSession(req);
  if (user) {
    req.user = user;
    if (!roleAllows(user, req.method, req.path)) return res.status(403).json({ error: 'Your account does not have access to this.' });
    return next();
  }
  const key = readApiKey(req);
  if (key) { req.apiKey = key; return next(); }
  res.status(401).json({ error: 'Unauthorized. Log in or send an API key in the X-API-Key header.' });
}
export function requireSession(req, res, next) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  req.user = user; next();
}
export { readSession, readApiKey };
