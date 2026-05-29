// ═══════════════════════════════════════════════════════════════════════════
// MIGME BACKEND — server.js
// Fixed: rejectUnauthorized, CORS conflict, rate limits on auth routes,
//        firebase/auth imports, ADMIN_API_KEY mandatory startup check.
// ═══════════════════════════════════════════════════════════════════════════
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express          = require('express');
const cors             = require('cors');
const fs               = require('fs');
const path             = require('path');
const crypto           = require('crypto');
const imaps            = require('imap-simple');
const { simpleParser } = require('mailparser');

// ── Firebase client SDK ────────────────────────────────────────────────────
const { initializeApp }  = require('firebase/app');
const {
  getFirestore, collection, doc,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc,
  query, where, onSnapshot,
} = require('firebase/firestore');

// FIX 4: all firebase/auth imports together at top — signInWithEmailAndPassword
// removed (was imported but never used); signInWithCustomToken moved here from
// inside the IIFE where it caused confusion.
const { getAuth, signInWithCustomToken } = require('firebase/auth');

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

// ═══════════════════════════════════════════════════════════════════════════
// MANDATORY ENV-VAR STARTUP CHECK
// Fail fast with a clear message rather than mysterious runtime errors later.
// ═══════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = [
  'ENCRYPTION_KEY',
  'ADMIN_API_KEY',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  // Use process.stderr directly — logger not yet initialised at this point
  process.stderr.write(`[FATAL] Missing required env vars: ${missingEnv.join(', ')}\nExiting.\n`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// CRASH RECOVERY & LOGGING
// ═══════════════════════════════════════════════════════════════════════════
const LOG_FILE      = path.join(__dirname, 'server.log');
const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// Mask phone numbers and email local-parts before writing to log file
function maskPII(msg) {
  if (typeof msg !== 'string') msg = String(msg);
  msg = msg.replace(/\b(\d{3})\d{3}(\d{4})\b/g, '$1***$2');
  msg = msg.replace(
    /\b([A-Za-z0-9._%+\-]{1,3})[A-Za-z0-9._%+\-]+(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g,
    '$1***$2'
  );
  return msg;
}

// Rotate log file when it exceeds LOG_MAX_BYTES; keep only the 2 newest backups
function rotateLogIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < LOG_MAX_BYTES) return;
    const rotated = `${LOG_FILE}.${Date.now()}.bak`;
    fs.renameSync(LOG_FILE, rotated);
    const dir   = path.dirname(LOG_FILE);
    const base  = path.basename(LOG_FILE);
    const backs = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '.') && f.endsWith('.bak'))
      .map(f => ({ f, t: parseInt(f.split('.').slice(-2, -1)[0], 10) || 0 }))
      .sort((a, b) => b.t - a.t);
    backs.slice(2).forEach(({ f }) => {
      try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
    });
  } catch (_) { /* file may not exist yet — fine */ }
}

function writeLog(level, msg) {
  const masked = maskPII(msg);
  const line   = `[${new Date().toISOString()}] [${level}] ${masked}\n`;
  process.stdout.write(line);
  try { rotateLogIfNeeded(); fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}
const log  = (msg) => writeLog('INFO',  msg);
const warn = (msg) => writeLog('WARN',  msg);
const err  = (msg) => writeLog('ERROR', msg);

process.on('uncaughtException', (e) => {
  err(`uncaughtException: ${e.stack || e.message}`);
  setTimeout(() => process.exit(1), 500);
});
process.on('unhandledRejection', (reason) => {
  err(`unhandledRejection: ${reason?.stack || reason}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// PM2 / Railway / Render all send SIGTERM before force-killing the process.
// This cleanly closes every active IMAP connection before exit.
// ═══════════════════════════════════════════════════════════════════════════
const globalStopFns = new Set();

function shutdown(signal) {
  log(`${signal} received — stopping ${globalStopFns.size} active poller(s)...`);
  for (const fn of globalStopFns) { try { fn(); } catch (_) {} }
  setTimeout(() => { log('Graceful exit complete.'); process.exit(0); }, 3000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE CLIENT SDK
// ═══════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig, 'migme-backend');
const db = getFirestore(firebaseApp);

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE ADMIN SDK
// Supports two auth methods:
//   A) FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY  (env vars — preferred for hosting)
//   B) FIREBASE_SA_PATH pointing to serviceAccountKey.json (local dev)
// ═══════════════════════════════════════════════════════════════════════════
const admin   = require('firebase-admin');
const SA_PATH = process.env.FIREBASE_SA_PATH || path.join(__dirname, 'serviceAccountKey.json');

if (admin.apps.length === 0) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else if (fs.existsSync(SA_PATH)) {
    admin.initializeApp({ credential: admin.credential.cert(SA_PATH) });
  } else {
    // Fallback — Auth operations will fail at runtime if SA not available
    admin.initializeApp({ projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID });
    warn('Firebase Admin: no service account credentials found — Auth operations may fail');
  }
}
const authAdmin = admin.auth();

// Authenticate the client SDK so Firestore writes respect security rules.
// Uses a dedicated backend service account UID — never a real client UID.
// Exported as a promise so watchClients() waits for it before listening.
const BACKEND_AUTH_UID = '__backend__';
const backendAuthReady = (async function authBackend() {
  try {
    await authAdmin.getUser(BACKEND_AUTH_UID);
  } catch {
    await authAdmin.createUser({
      uid:      BACKEND_AUTH_UID,
      email:    'backend@migme.internal',
      password: crypto.randomBytes(24).toString('hex'),
    });
  }
  const token        = await authAdmin.createCustomToken(BACKEND_AUTH_UID);
  const authInstance = getAuth(firebaseApp);
  // FIX 4: signInWithCustomToken now imported at top — no require() inside function
  await signInWithCustomToken(authInstance, token);
  log('Backend Firestore client authenticated');
})().catch(e => { warn(`Backend auth failed: ${e.message}`); throw e; });

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION  (AES-256-GCM — authenticated encryption)
// Random 16-byte IV per call; GCM auth tag detects any tampering.
// Stored format:  base64(iv):base64(tag):base64(ciphertext)
// ═══════════════════════════════════════════════════════════════════════════
function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required');
  // SHA-256 for backward-compat key derivation. For new deployments,
  // migrate to crypto.scryptSync with a stored salt.
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(plaintext) {
  const key    = getEncryptionKey();
  const iv     = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(ciphertext) {
  const key    = getEncryptionKey();
  const parts  = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');
  const iv       = Buffer.from(parts[0], 'base64');
  const tag      = Buffer.from(parts[1], 'base64');
  const enc      = Buffer.from(parts[2], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, 'utf8') + decipher.final('utf8');
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD HASHING  (Node built-in crypto.scrypt)
// Stored format:  hexSalt:hexHash
// Legacy fallback: plain-text comparison for old clients before migration.
// ═══════════════════════════════════════════════════════════════════════════
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (e, key) => {
      if (e) reject(e);
      else   resolve(`${salt}:${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password, stored) {
  // Legacy: stored without ':' means it was plain-text before migration
  if (!stored || !stored.includes(':')) {
    return Promise.resolve(password === stored);
  }
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(':');
    crypto.scrypt(password, salt, 64, (e, key) => {
      if (e) reject(e);
      else {
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), key));
        } catch (_) { resolve(false); }
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN KEY HELPERS
// safeCompareKey: HMAC-based constant-time comparison prevents timing attacks.
// maskKey: ensures the real key never appears in log output.
// ═══════════════════════════════════════════════════════════════════════════
function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4);
}

function safeCompareKey(provided, secret) {
  if (!provided || !secret) return false;
  const hmacA = crypto.createHmac('sha256', 'migme-key-cmp').update(provided).digest();
  const hmacB = crypto.createHmac('sha256', 'migme-key-cmp').update(secret).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER  (in-memory sliding window, no extra package)
// PM2 must use instances:1 / exec_mode:"fork" to keep this effective.
// Keys auto-pruned when Map exceeds 2000 entries.
// ═══════════════════════════════════════════════════════════════════════════
const _rateBuckets = new Map();

function rateLimit(maxPerMinute = 20) {
  return (req, res, next) => {
    const ip  = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
      .split(',')[0].trim();
    const key = `${ip}:${Math.floor(Date.now() / 60000)}`;
    const cnt = (_rateBuckets.get(key) || 0) + 1;
    _rateBuckets.set(key, cnt);

    if (_rateBuckets.size > 2000) {
      const cutoff = Math.floor(Date.now() / 60000) - 2;
      for (const k of _rateBuckets.keys()) {
        if (parseInt(k.split(':').pop(), 10) < cutoff) _rateBuckets.delete(k);
      }
    }
    if (cnt > maxPerMinute) {
      return res.status(429).json({ error: 'Too many requests — please slow down.' });
    }
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY IN-MEMORY CACHE
//   dailyOrderCache[dateStr][clientId] = Map<docId, orderData>
//   dailyEmailCache[dateStr][clientId] = Set<uidStr>
//
// Only today's date key is ever populated.
// Midnight timer automatically prunes yesterday's entries.
// Every Firestore operation goes through the cache first for speed.
// ═══════════════════════════════════════════════════════════════════════════
const dailyOrderCache = {};
const dailyEmailCache = {};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Document ID helpers — always composite to prevent cross-client collisions
const orderDocId   = (clientId, orderNo) => `${clientId}_${orderNo}`;
const emailDocId   = (clientId, uid)     => `${clientId}_${uid}`;
const emailIndexId = (clientId, date)    => `${clientId}_${date}`;

function getOrderMap(dateStr, clientId) {
  if (!dailyOrderCache[dateStr]) dailyOrderCache[dateStr] = {};
  if (!dailyOrderCache[dateStr][clientId]) dailyOrderCache[dateStr][clientId] = new Map();
  return dailyOrderCache[dateStr][clientId];
}

function getEmailSet(dateStr, clientId) {
  if (!dailyEmailCache[dateStr]) dailyEmailCache[dateStr] = {};
  if (!dailyEmailCache[dateStr][clientId]) dailyEmailCache[dateStr][clientId] = new Set();
  return dailyEmailCache[dateStr][clientId];
}

// Recursive setTimeout so the timer stays accurate across DST changes
function scheduleMidnightReset() {
  const now    = new Date();
  const next   = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 1, 0, 0);
  setTimeout(() => {
    const today = todayStr();
    for (const key of Object.keys(dailyOrderCache)) {
      if (key !== today) delete dailyOrderCache[key];
    }
    for (const key of Object.keys(dailyEmailCache)) {
      if (key !== today) delete dailyEmailCache[key];
    }
    log(`🕛 Midnight cache reset — keeping only ${today}`);
    scheduleMidnightReset();
  }, next - now);
}
scheduleMidnightReset();

// Warm the order cache from Firestore on client startup (today's orders only)
async function warmOrderCache(clientId) {
  const date     = todayStr();
  const orderMap = getOrderMap(date, clientId);
  if (orderMap.size > 0) return; // already warmed
  try {
    const q    = query(
      collection(db, 'orders'),
      where('deliveryDate', '==', date),
      where('clientId', '==', clientId)
    );
    const snap = await getDocs(q);
    snap.forEach(d => orderMap.set(d.id, d.data()));
    log(`📦 Cache warmed for ${clientId}/${date}: ${orderMap.size} orders`);
  } catch (e) {
    warn(`Cache warm failed for ${clientId}: ${e.message}`);
  }
}

// Warm the email UID set from the index document (avoids re-processing on restart)
async function warmEmailCache(clientId) {
  const date     = todayStr();
  const emailSet = getEmailSet(date, clientId);
  if (emailSet.size > 0) return; // already warmed
  try {
    const indexSnap = await getDoc(
      doc(db, 'processed_emails_index', emailIndexId(clientId, date))
    );
    if (indexSnap.exists()) {
      (indexSnap.data().uids || []).forEach(u => emailSet.add(u));
      log(`📬 Email cache warmed for ${clientId}/${date}: ${emailSet.size} UIDs`);
    }
  } catch (e) {
    warn(`Email cache warm failed for ${clientId}: ${e.message}`);
  }
}

// Record a processed email UID in both the in-memory set and Firestore
async function recordProcessedEmail(uidStr, orderNo, status, clientId) {
  const date     = todayStr();
  const emailSet = getEmailSet(date, clientId);
  emailSet.add(uidStr);
  try {
    await setDoc(doc(db, 'processed_emails', emailDocId(clientId, uidStr)), {
      status, orderNo: orderNo || '', clientId,
      processedAt: new Date().toISOString(),
    });
    // Keep the daily index document updated so warmEmailCache works after restart
    const indexRef  = doc(db, 'processed_emails_index', emailIndexId(clientId, date));
    const indexSnap = await getDoc(indexRef);
    const existing  = indexSnap.exists() ? (indexSnap.data().uids || []) : [];
    if (!existing.includes(uidStr)) {
      await setDoc(indexRef, { uids: [...existing, uidStr] }, { merge: true });
    }
  } catch (e) {
    warn(`recordProcessedEmail failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-ORDER PROCESSING LOCK
// Prevents two concurrent batch-jobs writing the same order simultaneously.
// The lock key always includes clientId so two clients never block each other.
// Released in a finally{} block — never leaked even on exception.
// ═══════════════════════════════════════════════════════════════════════════
const processingLocks = new Set();

function acquireLock(lockKey) {
  if (processingLocks.has(lockKey)) return false;
  processingLocks.add(lockKey);
  return true;
}
function releaseLock(lockKey) {
  processingLocks.delete(lockKey);
}

// ═══════════════════════════════════════════════════════════════════════════
// WEB SERVER
// ═══════════════════════════════════════════════════════════════════════════
const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// FIX 2: Single cors() middleware handles both normal requests AND preflight
// OPTIONS automatically. The manual app.options() wildcard handler has been
// removed — it conflicted with credentials:true (browsers reject wildcard
// origin when credentials are enabled).
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ||
  'http://localhost:8081,http://localhost:19006,https://migme.onrender.com'
).split(',').map(o => o.trim());

app.use(cors({
  origin:      ALLOWED_ORIGINS,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}));

// ── Health check / status endpoint ─────────────────────────────────────────
app.get('/', (_req, res) => {
  const today = todayStr();
  let orderCount = 0, emailCount = 0;
  if (dailyOrderCache[today]) {
    for (const map of Object.values(dailyOrderCache[today])) orderCount += map.size;
  }
  if (dailyEmailCache[today]) {
    for (const set of Object.values(dailyEmailCache[today])) emailCount += set.size;
  }
  res.send(
    `MIGME Backend ✅ | Date: ${today}` +
    ` | Orders in cache: ${orderCount}` +
    ` | Emails processed today: ${emailCount}` +
    ` | Active pollers: ${globalStopFns.size}`
  );
});

// ── Log viewer — protected by optional LOG_TOKEN query param ───────────────
app.get('/logs', rateLimit(30), (req, res) => {
  const token = process.env.LOG_TOKEN;
  if (token && req.query.token !== token) return res.status(403).send('Forbidden');
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-200).join('\n');
    res.type('text/plain').send(lines);
  } catch (_) { res.send('No log file yet.'); }
});

// ── Admin auth middleware ───────────────────────────────────────────────────
// ADMIN_API_KEY is now guaranteed to exist (startup check above).
function requireAdmin(req, res, next) {
  if (!safeCompareKey(req.headers['x-admin-key'], process.env.ADMIN_API_KEY)) {
    warn(`Admin route ${req.method} ${req.path}: rejected key ${maskKey(req.headers['x-admin-key'] || '')}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ── Create client (vendor restaurant) ─────────────────────────────────────
app.post('/api/clients', rateLimit(5), requireAdmin, async (req, res) => {
  try {
    const { businessName, email, appPassword, password } = req.body;
    if (!businessName || !email || !appPassword || !password) {
      return res.status(400).json({ error: 'Missing required fields: businessName, email, appPassword, password' });
    }
    const encryptedAppPassword = encrypt(appPassword);
    const passwordHash         = await hashPassword(password);
    const clientEmail          = email.trim().toLowerCase();

    const docRef = await addDoc(collection(db, 'clients'), {
      businessName: businessName.trim(),
      email:        clientEmail,
      appPassword:  encryptedAppPassword,
      passwordHash,                       // plain password never stored
      active:       true,
      createdAt:    new Date().toISOString(),
    });

    // Create Firebase Auth user so Firestore security rules (request.auth != null) work
    try {
      await authAdmin.createUser({ uid: docRef.id, email: clientEmail, password });
    } catch (authErr) {
      warn(`POST /api/clients: Auth user creation non-fatal: ${authErr.message}`);
    }

    log(`Client created: ${businessName} (${docRef.id})`);
    res.json({ id: docRef.id, businessName });
  } catch (e) {
    warn(`POST /api/clients error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── Create Firebase Auth user for an existing Firestore client (migration) ─
// FIX 3: Added rateLimit(5)
app.post('/api/auth/create-user', rateLimit(5), requireAdmin, async (req, res) => {
  try {
    const { uid, email, password } = req.body;
    if (!uid || !email || !password) {
      return res.status(400).json({ error: 'Missing uid, email, or password' });
    }
    await authAdmin.createUser({ uid, email, password });
    log(`Auth user created for ${email} (${uid})`);
    res.json({ success: true });
  } catch (e) {
    warn(`POST /api/auth/create-user error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── Verify password against stored hash (client-side auth fallback) ────────
// FIX 3: Added rateLimit(10) — prevents brute-force over the admin key
app.post('/api/auth/verify-password', rateLimit(10), requireAdmin, async (req, res) => {
  try {
    const { uid, password } = req.body;
    if (!uid || !password) {
      return res.status(400).json({ error: 'Missing uid or password' });
    }
    const snap = await getDoc(doc(db, 'clients', uid));
    if (!snap.exists()) return res.json({ valid: false });
    const data   = snap.data();
    const stored = data.passwordHash || data.password;
    const valid  = stored && stored.includes(':')
      ? await verifyPassword(password, stored)
      : password === stored; // legacy plain-text comparison
    res.json({ valid });
  } catch (e) {
    warn(`POST /api/auth/verify-password error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE: orders for a client within a date range ─────────────────────────
app.delete('/api/data/client/:clientId/range', requireAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const q    = query(
      collection(db, 'orders'),
      where('clientId', '==', clientId),
      where('createdAt', '>=', new Date(startDate).toISOString()),
      where('createdAt', '<=', new Date(endDate).toISOString())
    );
    const snap = await getDocs(q);
    let deleted = 0;
    for (const d of snap.docs) { await deleteDoc(doc(db, 'orders', d.id)); deleted++; }

    // Also clean processed_emails_index entries for that date range
    const start = new Date(startDate);
    const end   = new Date(endDate);
    let indexDeleted = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr  = d.toISOString().slice(0, 10);
      const indexRef = doc(db, 'processed_emails_index', `${clientId}_${dateStr}`);
      const s        = await getDoc(indexRef);
      if (s.exists()) { await deleteDoc(indexRef); indexDeleted++; }
    }

    log(`Admin deleted ${deleted} orders + ${indexDeleted} index entries for client ${clientId} [${startDate} → ${endDate}]`);
    res.json({ deletedOrders: deleted, deletedIndexEntries: indexDeleted });
  } catch (e) {
    warn(`DELETE /api/data/client/:clientId/range error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE: a single order ──────────────────────────────────────────────────
app.delete('/api/data/client/:clientId/order/:orderNo', requireAdmin, async (req, res) => {
  try {
    const { clientId, orderNo } = req.params;
    const docId = `${clientId}_${orderNo}`;
    const ref   = doc(db, 'orders', docId);
    const snap  = await getDoc(ref);
    if (!snap.exists()) return res.status(404).json({ error: 'Order not found' });
    await deleteDoc(ref);
    log(`Admin deleted order ${docId}`);
    res.json({ deleted: docId });
  } catch (e) {
    warn(`DELETE /api/data/client/:clientId/order/:orderNo error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE: ALL data for a client ───────────────────────────────────────────
app.delete('/api/data/client/:clientId/all', requireAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    let total = 0;

    const ordersSnap = await getDocs(query(collection(db, 'orders'), where('clientId', '==', clientId)));
    for (const d of ordersSnap.docs) { await deleteDoc(doc(db, 'orders', d.id)); total++; }

    const emailsSnap = await getDocs(query(collection(db, 'processed_emails'), where('clientId', '==', clientId)));
    for (const d of emailsSnap.docs) { await deleteDoc(doc(db, 'processed_emails', d.id)); total++; }

    // Processed emails index — prefix-matched because there's no clientId field
    const indexSnap = await getDocs(collection(db, 'processed_emails_index'));
    for (const d of indexSnap.docs) {
      if (d.id.startsWith(`${clientId}_`)) {
        await deleteDoc(doc(db, 'processed_emails_index', d.id)); total++;
      }
    }

    const menuSnap = await getDocs(query(collection(db, 'menuItems'), where('clientId', '==', clientId)));
    for (const d of menuSnap.docs) { await deleteDoc(doc(db, 'menuItems', d.id)); total++; }

    const catSnap = await getDocs(query(collection(db, 'categories'), where('clientId', '==', clientId)));
    for (const d of catSnap.docs) { await deleteDoc(doc(db, 'categories', d.id)); total++; }

    const execSnap = await getDocs(query(collection(db, 'executives'), where('clientId', '==', clientId)));
    for (const d of execSnap.docs) { await deleteDoc(doc(db, 'executives', d.id)); total++; }

    log(`Admin deleted ALL data (${total} docs) for client ${clientId}`);
    res.json({ deletedDocs: total });
  } catch (e) {
    warn(`DELETE /api/data/client/:clientId/all error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => log(`MIGME Backend running on port ${PORT}`));

// ═══════════════════════════════════════════════════════════════════════════
// PDF PARSE
// pdf-parse may export as default or named — handle both
// ═══════════════════════════════════════════════════════════════════════════
let pdfParseLib = require('pdf-parse');
let pdfParse    = pdfParseLib.default || pdfParseLib;
if (typeof pdfParse !== 'function') pdfParse = async () => ({ text: '' });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR MAP
// Used to identify which food-ordering platform sent the email, by matching
// the sender address. First match wins — order matters (longer strings first).
// ═══════════════════════════════════════════════════════════════════════════
const VENDOR_MAP = [
  { match: 'relfood',       name: 'Rail Food',    type: 'railfood'    },
  { match: 'railfood',      name: 'Rail Food',    type: 'railfood'    },
  { match: 'zoopindia',     name: 'Zoop India',   type: 'zoop'        },
  { match: 'zoop',          name: 'Zoop India',   type: 'zoop'        },
  { match: 'yatrirestro',   name: 'Yatri Restro', type: 'yatri_restro'},
  { match: 'yatristro',     name: 'Yatri Restro', type: 'yatri_restro'},
  { match: 'yatribhojan',   name: 'YatriBhojan',  type: 'yatribhojan' },
  { match: 'rajbhog',       name: 'Rajbhog',      type: 'rajbhog'     },
  { match: 'rajbhaog',      name: 'Rajbhog',      type: 'rajbhog'     },
  { match: 'homebytes',     name: 'Home Bytes',   type: 'homebytes'   },
  { match: 'railyatri',     name: 'RailYatri',    type: 'railyatri'   },
  { match: 'railreceipt',   name: 'Rail Receipt', type: 'railreceipt' },
  { match: 'rajdhaniorder', name: 'Rajdhani',     type: 'rajdhani'    },
  { match: 'rajdhani',      name: 'Rajdhani',     type: 'rajdhani'    },
  { match: 'dibrail',       name: 'Dibrail',      type: 'dibrail'     },
  { match: 'spicywagon',    name: 'Spicywagon',   type: 'spicywagon'  },
  { match: 'ecatering',     name: 'IRCTC',        type: 'irctc'       },
  { match: 'foodontrack',   name: 'IRCTC',        type: 'irctc'       },
  { match: 'olfstore',      name: 'OLF Store',    type: 'olf'         },
  { match: 'travelkhana',   name: 'Travelkhana',  type: 'travelkhana' },
];

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR RULES
// Each rule tells the AI the exact field label for ORDER NO and how to
// parse coach, date, quantity, and payment for that specific vendor's format.
// ═══════════════════════════════════════════════════════════════════════════
const VENDOR_RULES = {

  zoop: `VENDOR: ZOOP INDIA
ORDER NO: Field label is "ZOOP Txn. No." — value looks like "ZO31112971597153460". Use this FULL string exactly as orderNo.
TABLE: Item Name | Price | Quantity | Amount
- Quantity is the 3rd column. It CAN be large (10, 20, etc). Never confuse Price with Quantity.
- COACH: field label is "Coach/ Seat". Capture the FULL value normalising spaces/slash (e.g. "M2/ 74" → "M2/74"). Do NOT truncate at the slash.
- DATE: "DD-Mon-YYYY HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM 24hr. Use ETA field for deliveryTime.
- PAYMENT: "COD"→"COD", "Prepaid"→"Prepaid".
- REMARK: copy the "Suggestions" field value if present.`,

  yatri_restro: `VENDOR: YATRI RESTRO
ORDER NO: Field label is "ORDER No" — value is a plain integer like "1000433420". Use this as orderNo.
TABLE: Item | Description | Price | Quantity | Amount
- Description column contains item details. Numbers inside Description are NOT quantity.
- Quantity is its OWN 4th column.
- COACH: field label is "COACH/BERTH". Capture the FULL value (e.g. "B2 / 10" → "B2/10"). Never split it.
- DATE: "DD-MM-YYYY, HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
- TRAIN: e.g. "19038 / AVADH EXPRESS" → trainInfo = full string.
- PAYMENT: "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".
- TOTAL: use "Grand Total" field.`,

  rajbhog: `VENDOR: RAJBHOG
ORDER NO: Field label is "Invoice" showing two numbers separated by "/", e.g. "RBK001699782 / 2443864301". Use the part BEFORE the slash — "RBK001699782" — as orderNo. NEVER use the number after the slash (that is an IRCTC reference).
TABLE: SL# | Item | Description | Qty | Price | GST | Amount
- Qty is its OWN column. Numbers in Description (e.g. "100g", "(4)") are NOT quantity.
- COACH: field label is "Coach / Berth". Capture FULL value (e.g. "B6 / 8" → "B6/8"). Never split.
- DATE: "DD Mon YYYY, HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM. Use Delivery Date (not Booking Date).
- PAYMENT: "CASH_ON_DELIVERY"→"COD".
- TOTAL: use "Total" field.`,

  homebytes: `VENDOR: HOME BYTES
ORDER NO: Field label is "Invoice" showing two numbers separated by "/", e.g. "HB001221538 / 2443885531". Use the part BEFORE the slash — "HB001221538" — as orderNo. NEVER use the number after the slash (that is an IRCTC reference).
TABLE: SL# | Item | Description | Qty | Price | GST | Amount
- Qty is its OWN column. Numbers in Description are NOT quantity.
- COACH: field label is "Coach / Berth". Capture FULL value (e.g. "S2 / 20" → "S2/20"). Never split.
- DATE: "DD Mon YYYY, HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM. Use Delivery Date field.
- PAYMENT: "CASH_ON_DELIVERY"→"COD".
- TOTAL: use "Total" field.`,

  railyatri: `VENDOR: RAILYATRI
ORDER NO: Field label is "Order ID" — value is a plain integer like "4283240". Use this as orderNo.
TABLE: Item | Quantity | Price
- Quantity format: "1 (1 * 159)" → the first number before the parenthesis is quantity.
- Price format: "Rs. 159" → extract numeric value only.
- COACH: field label is "Coach and Seat No.". Capture FULL value (e.g. "A2 , 36" → "A2/36"). Never split.
- DATE: Delivery Date field is DD-MM-YYYY → YYYY-MM-DD. Expected Time is HH:MM → deliveryTime.
- TOTAL: use "Amount to be collected" field.`,

  railreceipt: `VENDOR: RAIL RECEIPT
ORDER NO: Field label is "Order No." — value is a plain integer like "1749169". Use this as orderNo. Also capture PNR separately in the pnr field.
TABLE: Item Name | Price | Quantity | Amount
- Quantity format: "x1", "x2" → extract the number after "x". Strings like "(4PCS)" in item names are NOT quantity.
- COACH: field label is "Coach/Seat". Value already combined (e.g. "B8/19") — capture as-is.
- DATE: Use "Journey Date" field (already YYYY-MM-DD). Delivery Time ETA format: "May 06,2026 22:45" → deliveryTime=22:45.
- PAYMENT: "CASH_ON_DELIVERY"→"COD".
- TOTAL: "Grand Total" field.`,

  rajdhani: `VENDOR: RAJDHANI
ORDER NO: Field label is "Order" and the value starts with "#", e.g. "#321597". Strip the leading "#" and use only the digits: "321597" as orderNo. The "IRCTC Order ID" field is a secondary reference — do NOT use it as orderNo.
FORMAT: Items table has Quantity column FIRST, then Item Name column.
- "1 | Veg Schezwan Rice" → qty=1, name="Veg Schezwan Rice".
- COACH: field label is "Coach / Bearth" (note spelling). Value already combined (e.g. "S7/56") — capture as-is.
- DATE: "Delivery Date: DD-MM-YYYY" → YYYY-MM-DD. ETA format "23:48:00" → deliveryTime=23:48 (first HH:MM only).
- PAYMENT: "Cash on Delivery"→"COD".
- TOTAL: "Balance Amount" field.
- REMARK: copy the "Remarks" field if present.`,

  railfood: `VENDOR: RAIL FOOD / REL FOOD
ORDER NO: Field label is "REL FOOD Ref.No" — value is a plain integer like "1029311". Use this as orderNo. If this field is missing, fall back to "IRCTC Order No".
TABLE: Item | Price | Quantity | Total
- Item name may include weight (e.g. "Veg Fried Rice 500gm") — keep the full name including weight.
- VERIFY: Price × Quantity = Total for each row.
- COACH: field label is "Coach/Seat". Value already combined (e.g. "S1/65") — capture as-is.
- DATE: "Delivery Date & Time: 5/6/2026 & 22:37" → deliveryDate=YYYY-MM-DD (M/D/YYYY format), deliveryTime=HH:MM.
- PAYMENT: "COD"→"COD", "PRE_PAID"/"Online"→"Prepaid".`,

  yatribhojan: `VENDOR: YATRIBHOJAN
ORDER NO: Field label is "ORDER NO" — value is a plain integer like "57517170". Use this as orderNo.
FORMAT: "Item Name X quantity" → qty is the number after X or x.
- COACH: TWO separate fields "COACH: HA1" and "SEAT: 18" → combine them as "HA1/18".
- DATE: "DELIVERY: DD-MM-YYYY, ETA: HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
- PRICE: No individual item prices are given. Set each item price=0. totalAmount = NET TOTAL value.
- PAYMENT: "ONLINE"→"Prepaid", "COD"→"COD".
- TOTAL: "NET TOTAL" field.`,

  dibrail: `VENDOR: DIBRAIL
ORDER NO: Field label is "Order No" — value may have a leading "#" (e.g. "#210415"). Strip the "#" and use only the digits: "210415" as orderNo.
FORMAT: "👉🏼 qty-Item Name ," → the number BEFORE the first "-" is quantity. Strip the emoji prefix.
- COACH: field label is "Coach & Seat". Value already combined with dash (e.g. "S1-1") — capture as-is.
- DATE: "Delivery Time: DD-MM-YYYY HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM (24hr).
- PAYMENT: "COD"→"COD".
- TOTAL: "Total Amount" field.`,

  spicywagon: `VENDOR: SPICYWAGON
ORDER NO: Field label is "ORDER NO" — value is a plain integer like "2385598323". Use this as orderNo.
FORMAT: "Item Name × qty" or "Item Name x qty" → qty is the number after × or x.
- COACH: TWO separate parts: "COACH: RAC/B4" and "SEAT 47" → combine as "RAC/B4/47" (COACH value + "/" + SEAT value).
- DATE: "DD-MM-YY HH:MM AM/PM" → deliveryDate=YYYY-MM-DD (2-digit year: 25→2025, 26→2026), deliveryTime=HH:MM in 24hr.
- PAYMENT: "PRE_PAID"→"Prepaid", "COD"→"COD".
- TOTAL: "NET TOTAL" field.`,

  irctc: `VENDOR: IRCTC eCATERING
ORDER NO: Field label is "Order ID" — value is a plain integer like "2445440770". Use this as orderNo. The "Invoice No" field (e.g. "IN26-27/00591376") is an internal document reference — do NOT use it as orderNo.
TABLE: S No | Item | Unit Price | Qty | Taxable Value | Tax Amount | Item Total
- Qty is its OWN 4th column.
- COACH: TWO separate fields "Coach No: B6" and "Seat No: 67" → combine as "B6/67".
- DATE: Invoice Date field is DD-MM-YYYY → deliveryDate=YYYY-MM-DD. No ETA — leave deliveryTime empty.
- TRAIN: "Train No" field → trainInfo.
- CUSTOMER: "Name" field in Bill To section.
- PAYMENT: "Cash"→"COD", "Online"/"Prepaid"→"Prepaid".
- TOTAL: "Total Invoice Value" field.`,

  olf: `VENDOR: OLF STORE
ORDER NO: Field label is "IRCTC Order ID" — value is a plain integer like "2331925101". Use this as orderNo.
TABLE: Item | Quantity | Price
- Quantity is the 2nd column.
- COACH: field label is "Coach and Seat No.". Capture FULL value and join with "/" (e.g. "D1 , 66" → "D1/66").
- DATE: "DD-MM-YYYY HH:MM IST" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM (strip "IST").
- TRAIN: "Train" field, e.g. "12933 - KARNAVATI EXP" → trainInfo = full string.
- PAYMENT: "PRE_PAID"→"Prepaid", "COD"→"COD".
- TOTAL: "Total" field.`,

  travelkhana: `VENDOR: TRAVELKHANA
ORDER NO: Column label is "Order Id" — value is a plain integer like "2454484". Use this as orderNo. The PNR column is a separate field — do NOT use it as orderNo.
FORMAT: Table of orders. Each row = one order.
Columns: SR.NO | Order Id | Name | Mobile | Coach/Seat | PNR | Item List | Quantity
- Extract EACH row as a separate order if multiple rows are present.
- CUSTOMER: "Name" column.
- CONTACT: "Mobile" column.
- COACH: "Coach/Seat" column — value already combined (e.g. "S6/55") — capture as-is.
- TRAIN: from email header "Train Info" field — full string.
- DATE: "Generation Date" in header → YYYY-MM-DD. No individual ETA shown.
- ITEMS: "Item List" column lists item names; "Quantity" column has qty. No prices — set price=0.
- PAYMENT: COD assumed (stated "payment has to be collected from customer").
- TOTAL: Not shown — set totalAmount=0.`,

  generic: `GENERAL RULES:
- Find items table. Extract Quantity from its own dedicated column ONLY.
- COACH: capture the FULL coach+seat value. If coach and seat are in separate fields, combine as "COACH/SEAT".
- VERIFY: Price × Quantity = Amount for each item.
- DATE: convert any date format to YYYY-MM-DD. Time to HH:MM 24hr.`,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// markEmailAsRead is intentionally a NO-OP — a second system reads the same
// inbox; marking emails read here would cause that system to skip them.
// eslint-disable-next-line no-unused-vars
async function markEmailAsRead(_connection, _uid) {}

// Returns a comma-separated string of required fields that are missing/empty.
// Returns null if all required fields are present (order is complete).
function getMissingFields(orderData) {
  const missing = [];
  const name = (orderData.customerName || '').trim();
  if (!name || name === 'N/A' || name === 'Unknown') missing.push('customerName');
  if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) missing.push('items');
  if (!(orderData.trainInfo || '').trim() || orderData.trainInfo === 'N/A') missing.push('trainInfo');
  const date = (orderData.deliveryDate || '').trim();
  if (!date || date === 'N/A' || date === 'YYYY-MM-DD') missing.push('deliveryDate');
  return missing.length > 0 ? missing.join(', ') : null;
}

// Strip non-numeric characters and parse as float safely
const cleanFloat = (val) => parseFloat((val || 0).toString().replace(/[^\d.]/g, '')) || 0;

// ── HTML to plain text converter ─────────────────────────────────────────────
// Yatri Restro, Zoop, and some other vendors send HTML-only emails with no
// plain-text part. Sending raw HTML tags to Bedrock causes it to return empty
// JSON (deliveryDate: undefined, items: []) because it cannot extract data
// from tag soup. This strips all tags and decodes entities so the AI receives
// clean, readable text before any parsing attempt.
function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,  '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi,  '\n')
    .replace(/<\/th>/gi,  ' | ')
    .replace(/<\/td>/gi,  ' | ')
    .replace(/<[^>]+>/g,  ' ')
    .replace(/&nbsp;/g,   ' ')
    .replace(/&amp;/g,    '&')
    .replace(/&lt;/g,     '<')
    .replace(/&gt;/g,     '>')
    .replace(/&quot;/g,   '"')
    .replace(/&#39;/g,    "'")
    .replace(/\r\n/g,   '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g,  '\n\n')
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — AWS BEDROCK BASE CALL
// Supports two auth modes:
//   Bearer token  — set AWS_BEARER_TOKEN_BEDROCK or use a BedrockAPIKey-prefixed key
//   IAM key pair  — standard AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
// ═══════════════════════════════════════════════════════════════════════════
async function callBedrockAI(prompt) {
  const keyId       = process.env.AWS_ACCESS_KEY_ID       || '';
  const secretKey   = process.env.AWS_SECRET_ACCESS_KEY   || '';
  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK || '';
  const endpointUrl = process.env.AWS_BEDROCK_ENDPOINT    || '';
  const useBearer   = bearerToken || keyId.startsWith('BedrockAPIKey');

  if (useBearer) {
    const token = bearerToken || (
      secretKey.startsWith('ABSK')
        ? Buffer.from(secretKey.substring(4), 'base64').toString('utf-8')
        : ''
    );
    if (!token) { err('Bearer token not resolved'); return null; }
    const url = endpointUrl || 'https://bedrock-runtime.ap-south-1.amazonaws.com';
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
          'x-api-key':     keyId,
        },
        body: JSON.stringify({
          modelId:  process.env.AWS_BEDROCK_MODEL || 'qwen.qwen3-vl-235b-a22b',
          system:   [{ text: 'You are a strict data extraction API. Return a SINGLE, VALID JSON object without markdown formatting.' }],
          messages: [{ role: 'user', content: [{ text: prompt }] }],
        }),
      });
      if (!res.ok) { err(`Bearer API ${res.status}: ${await res.text()}`); return null; }
      const json = await res.json();
      return json.output?.message?.content?.[0]?.text
          || json.content?.[0]?.text
          || JSON.stringify(json);
    } catch (e) { err(`Bearer API error: ${e.message}`); return null; }
  }

  if (!keyId || !secretKey) { err('No AWS credentials found.'); return null; }
  try {
    const client  = new BedrockRuntimeClient({
      region:      process.env.AWS_REGION || 'ap-south-1',
      credentials: { accessKeyId: keyId, secretAccessKey: secretKey },
    });
    const command = new ConverseCommand({
      modelId:  process.env.AWS_BEDROCK_MODEL || 'qwen.qwen3-vl-235b-a22b',
      system:   [{ text: 'You are a strict data extraction API. Return a SINGLE, VALID JSON object without markdown formatting.' }],
      messages: [{ role: 'user', content: [{ text: prompt }] }],
    });
    const result = await client.send(command);
    return result.output?.message?.content?.[0]?.text;
  } catch (e) { err(`Bedrock SDK error: ${e.name} - ${e.message}`); return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — RETRY WITH EXPONENTIAL BACKOFF
// 3 attempts: immediate → 4 s → 8 s → give up
// ═══════════════════════════════════════════════════════════════════════════
async function callBedrockWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callBedrockAI(prompt);
      if (result) return result;
      warn(`AI attempt ${attempt}/${maxRetries} returned null`);
    } catch (e) {
      warn(`AI attempt ${attempt}/${maxRetries} threw: ${e.message}`);
    }
    if (attempt < maxRetries) {
      const backoff = attempt * 4000;
      warn(`Backing off ${backoff / 1000}s before retry...`);
      await delay(backoff);
    }
  }
  err('All AI retry attempts exhausted');
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI OUTPUT VALIDATION
// Catches hallucinated values before they reach Firestore.
// Errors   → order is rejected (re-queued for retry)
// Warnings → order is saved but flag is logged
// ═══════════════════════════════════════════════════════════════════════════
function validateOrderData(data, vendorType) {
  const errors   = [];
  const warnings = [];

  // deliveryDate must be YYYY-MM-DD and within a sensible range
  if (!data.deliveryDate || !data.deliveryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push(`Invalid deliveryDate: "${data.deliveryDate}"`);
  } else {
    const daysDiff = (new Date(data.deliveryDate) - new Date()) / 86400000;
    if (daysDiff < -1 || daysDiff > 30) {
      warnings.push(`Suspicious deliveryDate: ${data.deliveryDate} (${daysDiff.toFixed(0)} days from today)`);
    }
  }

  // deliveryTime must be HH:MM — clear it if malformed rather than failing
  if (data.deliveryTime && !data.deliveryTime.match(/^\d{2}:\d{2}$/)) {
    warnings.push(`Invalid deliveryTime format: "${data.deliveryTime}"`);
    data.deliveryTime = '';
  }

  // Must have at least one item
  if (!data.items || data.items.length === 0) {
    errors.push('No items found');
  } else {
    for (const item of data.items) {
      if (item.quantity > 50) {
        warnings.push(`Suspiciously high quantity for "${item.name}": ${item.quantity}`);
        item.quantity = 1;
      }
      if (item.quantity <= 0) item.quantity = 1;
      if (item.price < 0)    { warnings.push(`Negative price for "${item.name}"`); item.price = 0; }
      if (item.price > 5000) { warnings.push(`Unusually high price for "${item.name}": ₹${item.price}`); }
    }
  }

  if (data.totalAmount <= 0 && vendorType !== 'travelkhana' && vendorType !== 'yatribhojan') {
    warnings.push('totalAmount is 0 or missing');
  }
  if (data.totalAmount > 10000) {
    warnings.push(`Unusually high totalAmount: ₹${data.totalAmount}`);
  }

  if (data.coach && data.coach.length > 20) {
    warnings.push(`Coach value suspiciously long: "${data.coach}"`);
  }

  // contactNo must be exactly 10 digits
  if (data.contactNo) {
    const digits = data.contactNo.replace(/\D/g, '');
    if (digits.length !== 10) {
      warnings.push(`Contact number not 10 digits: "${data.contactNo}"`);
      data.contactNo = '';
    } else {
      data.contactNo = digits;
    }
  }

  // paymentType must be one of two canonical values
  if (!['COD', 'Prepaid'].includes(data.paymentType)) {
    warnings.push(`Unknown paymentType "${data.paymentType}" — defaulting to COD`);
    data.paymentType = 'COD';
  }

  return { errors, warnings, data };
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — PARSE NEW ORDER EMAIL
// Detects vendor from sender address, selects the matching VENDOR_RULES,
// sends prompt to Bedrock, validates the response, returns structured data.
// ═══════════════════════════════════════════════════════════════════════════
async function parseWithAWS(rawText, subject, senderEmail) {
  const lowerFrom = senderEmail.toLowerCase();
  let vendorName = '', vendorType = 'generic';

  for (const v of VENDOR_MAP) {
    if (lowerFrom.includes(v.match)) { vendorName = v.name; vendorType = v.type; break; }
  }
  // Fallback vendor name from domain if not in VENDOR_MAP
  if (!vendorName) {
    try {
      const parts = lowerFrom.split('@')[1]?.split('.') || [];
      const root  = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      vendorName  = root.charAt(0).toUpperCase() + root.slice(1);
    } catch (_) {}
  }

  log(`   🏷️ Vendor: ${vendorName || 'Unknown'} (${vendorType})`);
  const vendorRule = VENDOR_RULES[vendorType] || VENDOR_RULES.generic;

  const prompt = `
You are a STRICT invoice/order parser.
VENDOR: ${vendorType} | VENDOR NAME: "${vendorName}"

${vendorRule}

STRICT GLOBAL RULES (apply to ALL vendors):
1. OUTPUT vendorName as "${vendorName}" exactly.
2. ORDER NUMBER: Follow the ORDER NO instruction in the vendor rule above EXACTLY.
   Strip any leading "#" symbol. Use only the field the rule specifies — do NOT substitute other IDs.
3. QUANTITY: from quantity column or explicit marker (X, ×, -prefix) ONLY.
   Numbers inside item descriptions are NEVER quantity.
   VERIFY: Price × Qty ≈ Row Total.
4. DATE: always output YYYY-MM-DD.
5. DELIVERY TIME: ETA only, HH:MM 24hr format.
6. PHONE: 10-digit mobile number only.
7. COACH: capture the FULL coach+seat value.
   - Single combined field (e.g. "Coach/Seat: M2/ 74"): normalise to "COACH/SEAT" (e.g. "M2/74").
   - Two separate fields (e.g. IRCTC "Coach No: B6" + "Seat No: 67"; YatriBhojan "COACH: HA1" + "SEAT: 18"; Spicywagon "COACH: RAC/B4" + "SEAT 47"): combine as "CoachValue/SeatValue".
   - NEVER truncate the seat number.
8. PAYMENT: "COD"/"Cash on Delivery"/"CASH_ON_DELIVERY"→"COD"; "PRE_PAID"/"PREPAID"/"Online"/"ONLINE"→"Prepaid".

JSON SCHEMA (return this exact structure, no markdown):
{"_thinking":"...","deliveryDate":"YYYY-MM-DD","deliveryTime":"HH:MM","items":[{"name":"","quantity":1,"price":0}],"subTotal":0,"tax":0,"deliveryCharge":0,"totalAmount":0,"orderNo":"","vendorName":"${vendorName}","customerName":"","contactNo":"","trainInfo":"","coach":"","paymentType":"COD","remark":""}

SENDER: "${senderEmail}" | SUBJECT: "${subject}"
BODY:
${rawText.substring(0, 15000)}`;

  try {
    const raw = await callBedrockWithRetry(prompt);
    if (!raw) { err('Empty response from Bedrock after retries'); return null; }

    const data = JSON.parse(raw.replace(/```json|```/g, '').trim());
    data.orderNo    = data.orderNo?.toString().trim() || '';
    data.pnr        = data.pnr?.toString().trim() || '';
    if (!data.orderNo && !data.pnr) data.orderNo = `AUTO_${Date.now()}`;
    data.vendorName = vendorName;

    if (Array.isArray(data.items)) {
      let sub = 0;
      for (const item of data.items) {
        item.quantity = parseInt(item.quantity, 10) || 1;
        item.price    = parseFloat(item.price) || 0;
        if (item.quantity <= 0) item.quantity = 1;
        sub += item.price * item.quantity;
        log(`      ${item.name}: ₹${item.price} × ${item.quantity} = ₹${item.price * item.quantity}`);
      }
      if (Math.abs((parseFloat(data.subTotal) || 0) - sub) > 5) {
        warn(`      SubTotal mismatch — correcting to ₹${sub}`);
        data.subTotal = sub;
      }
    }

    const { errors, warnings, data: validatedData } = validateOrderData(data, vendorType);
    if (warnings.length > 0) warn(`   ⚠️ Validation warnings: ${warnings.join(' | ')}`);
    if (errors.length   > 0) {
      err(`   ❌ Validation FAILED: ${errors.join(' | ')}`);
      return null;
    }
    return validatedData;
  } catch (e) { err(`Parse error: ${e.message}`); return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — PARSE UPDATE EMAIL
// Called only when the order already exists in Firestore.
// Strict rule: a field is updated ONLY if the email LITERALLY says so.
// All unchanged fields return null — never overwrite with context data.
// ═══════════════════════════════════════════════════════════════════════════
async function parseUpdateEmail(rawText, subject, existingOrder) {
  const prompt = `
You are an ORDER UPDATE extractor. This email is a CHANGE NOTIFICATION for an existing order.

Current DB values:
- Coach/Seat: ${existingOrder.coach || 'N/A'}
- Delivery Date: ${existingOrder.deliveryDate || 'N/A'}
- Delivery Time: ${existingOrder.deliveryTime || 'N/A'}
- Contact No: ${existingOrder.contactNo || 'N/A'}
- Train Info: ${existingOrder.trainInfo || 'N/A'}
- Payment: ${existingOrder.paymentType || 'N/A'}
- Total: ${existingOrder.totalAmount || 'N/A'}
- Items: ${JSON.stringify(existingOrder.items || [])}

STRICT RULES:
1. A field is changed ONLY if the email LITERALLY states it is being updated (e.g. "Update Seat No :- A2/21").
2. DO NOT extract a field that appears only for reference/context.
3. DO NOT guess or fill in fields not explicitly stated as changed.
4. Output null for every unchanged field — no exceptions.
5. "remark" = plain English description of what changed.

JSON (always include all keys, null if unchanged):
{"_thinking":"quote the exact text proving each change, or state not mentioned","coach":null,"deliveryDate":null,"deliveryTime":null,"contactNo":null,"trainInfo":null,"paymentType":null,"totalAmount":null,"items":null,"subTotal":null,"remark":""}

SUBJECT: "${subject}"
BODY: ${rawText.substring(0, 10000)}`;

  try {
    const raw = await callBedrockWithRetry(prompt);
    if (!raw) return null;
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) { err(`Update parse error: ${e.message}`); return null; }
}

// Build the Firestore update payload — only include fields that actually changed
function buildChangePayload(existingOrder, updateResult) {
  const FIELDS     = ['coach','deliveryDate','deliveryTime','contactNo','trainInfo','paymentType','totalAmount','items','subTotal'];
  const changes    = {};
  const changeLog  = [];

  for (const field of FIELDS) {
    const aiVal = updateResult[field];
    if (aiVal === null || aiVal === undefined) continue;

    if (field === 'items') {
      if (JSON.stringify(aiVal) === JSON.stringify(existingOrder.items || [])) continue;
      changes.items = aiVal;
      changeLog.push('items updated');
      continue;
    }

    const newVal = aiVal.toString().trim();
    const oldVal = (existingOrder[field] || '').toString().trim();
    if (!newVal || newVal === oldVal || newVal === 'N/A' || newVal === 'YYYY-MM-DD' || newVal === 'HH:MM') continue;
    changes[field] = aiVal;
    changeLog.push(`${field}: "${oldVal}" → "${newVal}"`);
  }
  return { changes, changeLog };
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH SINCE — fixed anchor + rolling 3-day window
//
// FETCH_SINCE_FIXED: the date we switched on this deployment.
//   - Emails before this date will never be processed (old data we don't want).
//   - After 3 days, the rolling window takes over naturally.
//
// To switch to UNSEEN-only mode for production, replace the IMAP search
// criteria from [['SINCE', FETCH_SINCE]] to [['UNSEEN']].
// UNSEEN mode is faster (fewer emails per cycle) but does not retry
// incomplete emails that were previously skipped.
// ═══════════════════════════════════════════════════════════════════════════
const FETCH_SINCE_FIXED = new Date('2026-05-28T19:30:00.000Z'); // 01:00 IST May 29

function getFetchSince() {
  const rollingWindow = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  return rollingWindow > FETCH_SINCE_FIXED ? rollingWindow : FETCH_SINCE_FIXED;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL PROCESSOR — processes one email from IMAP
//
// 5-LAYER DUPLICATE GUARD (in order of speed, cheapest first):
//   Guard 1: sessionUIDCache  — in-memory Set, O(1), resets on reconnect
//   Guard 2: emailSet         — daily in-memory Set, loaded from Firestore at startup
//   Guard 3: Firestore        — one getDoc per restart-survivor email (expensive but reliable)
//   Guard 4: date filter      — skip emails older than FETCH_SINCE
//   Guard 5: subject/sender   — skip non-order emails
//
// After all guards pass:
//   → Parse with AI
//   → Acquire per-order lock
//   → Check if order exists (new vs update path)
//   → Write to Firestore + update in-memory cache
//   → Record processed email UID
// ═══════════════════════════════════════════════════════════════════════════
async function processEmail(
  item, connection, clientId, orderMap, emailSet,
  tag, blockedSenders, sessionUIDCache
) {
  const uid    = item.attributes.uid;
  const uidStr = uid.toString();

  try {
    // Guard 1 — already handled this session (fastest possible skip)
    if (sessionUIDCache.has(uid)) return;

    // Guard 2 — in today's email cache (loaded from Firestore index at startup)
    if (emailSet.has(uidStr)) {
      sessionUIDCache.add(uid);
      return;
    }

    // Guard 3 — Firestore pre-check (catches emails from before this session started)
    // 'incomplete_data' is intentionally NOT skipped — those need a retry.
    try {
      const processedSnap = await getDoc(
        doc(db, 'processed_emails', emailDocId(clientId, uidStr))
      );
      if (processedSnap.exists()) {
        const prevStatus = processedSnap.data().status;
        if (prevStatus !== 'incomplete_data') {
          log(`${tag} UID ${uidStr} already in DB (${prevStatus}) — skipping AI`);
          emailSet.add(uidStr);     // warm cache so future cycles skip Firestore too
          sessionUIDCache.add(uid);
          return;
        }
        log(`${tag} UID ${uidStr} was incomplete — retrying parse`);
      }
    } catch (e) {
      // Non-fatal: fall through and process if Firestore check fails
      warn(`${tag} Firestore pre-check failed for UID ${uidStr}: ${e.message} — processing anyway`);
    }

    // Download the full email body (markSeen:false so we don't affect Gmail read state)
    const fullMsg = await connection.search([['UID', uid]], { bodies: [''], markSeen: false });
    if (!fullMsg || fullMsg.length === 0) return;
    const parsed = await simpleParser(fullMsg[0].parts.find(p => p.which === '').body);

    // Guard 4 — date filter: skip emails older than the fetch window
    const emailDate   = parsed.date ? new Date(parsed.date) : new Date();
    const FETCH_SINCE = getFetchSince();
    if (emailDate < FETCH_SINCE) {
      sessionUIDCache.add(uid);
      return;
    }

    const subject     = parsed.subject || 'No Subject';
    const fromAddress = parsed.from?.value?.[0]?.address || parsed.from?.text || 'Unknown';
    const lowerFrom   = fromAddress.toLowerCase();

    // Blocked senders check
    if (blockedSenders.some(bs => lowerFrom.includes(bs) || lowerFrom === bs)) {
      log(`${tag} Blocked sender: ${fromAddress}`);
      sessionUIDCache.add(uid);
      await recordProcessedEmail(uidStr, '', 'blocked_sender', clientId);
      return;
    }

    // Guard 5 — subject keyword filter (bypassed for known vendors)
    const vendorFromSender = VENDOR_MAP.find(v => lowerFrom.includes(v.match));
    const subjectMatches   = /Order|Booking|PNR|Reservation|Invoice|Bill|Catering|Check Order/i.test(subject);

    if (!subjectMatches && !vendorFromSender) {
      sessionUIDCache.add(uid);
      return;
    }
    if (!subjectMatches && vendorFromSender) {
      warn(`${tag} Known vendor ${vendorFromSender.name} with unusual subject: "${subject}" — processing anyway`);
    }

    // Build full text: email body + extracted PDF attachment text
    // Use plain text if available; fall back to HTML stripped of tags.
    // Raw HTML sent to Bedrock causes "undefined" fields — Yatri Restro and
    // Zoop send HTML-only emails that need stripping before AI parsing.
    let fullText = parsed.text || '';
    if (!fullText && parsed.html) {
      fullText = htmlToText(parsed.html);
      log(`${tag} HTML-only email — stripped to plain text (${fullText.length} chars)`);
    }
    for (const att of (parsed.attachments || [])) {
      if (att.contentType === 'application/pdf') {
        try {
          const pdf     = await pdfParse(att.content);
          const pdfText = (pdf.text || '').trim();
          if (pdfText.length < 50) {
            warn(`${tag} PDF extracted only ${pdfText.length} chars — may be image-based; AI will rely on email body`);
          }
          if (pdfText) fullText += '\n\n--- PDF ---\n' + pdfText;
        } catch (e) {
          warn(`${tag} PDF parse error: ${e.message}`);
        }
      }
    }

    log(`${tag} 🤖 Parsing: "${subject}" (From: ${fromAddress})`);

    // ── AI parse ─────────────────────────────────────────────────────────
    const orderData = await parseWithAWS(fullText, subject, fromAddress);
    if (!orderData) {
      log(`${tag}    ❌ AI returned null or validation failed — stays unread for retry`);
      return;
    }

    // Normalise order number: replace slashes (Firestore doc ID restriction)
    const finalOrderNo = (orderData.orderNo || orderData.pnr || '')
      .toString().replace(/\//g, '-').trim();

    if (!finalOrderNo || finalOrderNo.startsWith('AUTO_')) {
      log(`${tag}    ⚠️ No valid order number extracted — stays unread for retry`);
      return;
    }

    // ── Per-order lock ────────────────────────────────────────────────────
    const lockKey = orderDocId(clientId, finalOrderNo);
    if (!acquireLock(lockKey)) {
      log(`${tag} #${finalOrderNo} already being processed in parallel — skipping`);
      return;
    }

    try {
      const today             = todayStr();
      const orderDeliveryDate = (orderData.deliveryDate || '').trim();
      let existingOrder       = null;

      // Check in-memory cache first (fast), fall back to Firestore
      if (orderDeliveryDate === today) {
        existingOrder = orderMap.get(orderDocId(clientId, finalOrderNo)) || null;
      } else if (orderDeliveryDate) {
        // Order is for a different date — must hit Firestore (not in today's cache)
        log(`${tag}    📅 Order date ${orderDeliveryDate} ≠ today ${today} — Firestore read for #${finalOrderNo}`);
        try {
          const snap = await getDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)));
          if (snap.exists()) existingOrder = snap.data();
        } catch (e) { warn(`Firestore read failed: ${e.message}`); }
      } else {
        // Date unknown — check both cache and Firestore
        existingOrder = orderMap.get(orderDocId(clientId, finalOrderNo)) || null;
        if (!existingOrder) {
          try {
            const snap = await getDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)));
            if (snap.exists()) existingOrder = snap.data();
          } catch (e) { warn(`Firestore read failed: ${e.message}`); }
        }
      }

      // ── PATH A: ORDER EXISTS → check for explicit changes ──────────────
      if (existingOrder) {
        log(`${tag}    🔄 #${finalOrderNo} in DB — checking for explicit changes...`);
        const updateResult = await parseUpdateEmail(fullText, subject, existingOrder);
        if (!updateResult) {
          log(`${tag}    ❌ Update parse failed — stays unread`);
          return;
        }
        log(`${tag}    🧠 ${updateResult._thinking}`);

        const { changes, changeLog } = buildChangePayload(existingOrder, updateResult);

        if (Object.keys(changes).length === 0) {
          log(`${tag}    ℹ️ No explicit changes for #${finalOrderNo} — recording as duplicate`);
        } else {
          const updatePayload = {
            ...changes,
            lastUpdatedAt: new Date().toISOString(),
            updateHistory: [
              ...(existingOrder.updateHistory || []),
              {
                updatedAt: new Date().toISOString(),
                subject,
                changes,
                remark: updateResult.remark || `Updated: ${changeLog.join(', ')}`,
              },
            ],
          };
          await updateDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)), updatePayload);
          orderMap.set(orderDocId(clientId, finalOrderNo), { ...existingOrder, ...changes });
          log(`${tag}    ✅ UPDATED #${finalOrderNo}: ${changeLog.join(', ')}`);
        }

        sessionUIDCache.add(uid);
        await recordProcessedEmail(
          uidStr, finalOrderNo,
          Object.keys(changes).length > 0 ? 'update_applied' : 'duplicate',
          clientId
        );

      // ── PATH B: NEW ORDER → validate required fields, then save ────────
      } else {
        log(`${tag}    🆕 New order #${finalOrderNo} — validating fields...`);
        const missing = getMissingFields(orderData);
        if (missing) {
          log(`${tag}    ⚠️ INCOMPLETE — missing: [${missing}] — stays UNREAD for retry`);
          await recordProcessedEmail(uidStr, finalOrderNo, 'incomplete_data', clientId);
          return;
        }

        const newDoc = {
          ...orderData,
          subTotal:       cleanFloat(orderData.subTotal),
          tax:            cleanFloat(orderData.tax),
          deliveryCharge: cleanFloat(orderData.deliveryCharge),
          totalAmount:    cleanFloat(orderData.totalAmount),
          remark:         orderData.remark || '',
          orderNo:        finalOrderNo,
          clientId,
          createdAt:      new Date().toISOString(),
          status:         'Active',
          updateHistory:  [],
        };

        await setDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)), newDoc);
        orderMap.set(orderDocId(clientId, finalOrderNo), newDoc);
        log(`${tag}    ✅ SAVED #${finalOrderNo} | ₹${orderData.totalAmount}`);

        sessionUIDCache.add(uid);
        await recordProcessedEmail(uidStr, finalOrderNo, 'success', clientId);
      }
    } finally {
      releaseLock(lockKey); // always released — no lock leak possible
    }

  } catch (e) {
    err(`${tag} processEmail error for UID ${uid}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-TENANT IMAP POLLER
//
// One instance runs per active client.
// Returns a stop() function registered with globalStopFns for graceful shutdown.
//
// Cycle (every 30 seconds):
//   1. refreshClientSettings — re-read isPaused + blockedSenders from Firestore
//   2. IMAP SINCE search — get emails from last 3 days (or fixed anchor, whichever is later)
//   3. Filter out already-seen UIDs
//   4. Process in batches of 3 with 2s inter-batch delay (Bedrock rate limiting)
//
// On any IMAP error: reconnect and retry. On repeated failure: retry in 60s.
// ═══════════════════════════════════════════════════════════════════════════
async function pollClientInbox(clientId, emailAddr, appPassword, clientBusinessName) {
  const tag = `[${clientBusinessName}]`;
  log(`${tag} Starting IMAP polling for ${emailAddr}`);

  await warmEmailCache(clientId);

  let cancelled      = false;  // set by stop() — checked at every async boundary
  let activeConn     = null;   // reference to current IMAP connection for clean teardown
  let isPaused       = false;
  let blockedSenders = [];

  // Re-read client settings from Firestore each cycle so changes take effect
  // without restarting the server
  async function refreshClientSettings() {
    try {
      const snap = await getDoc(doc(db, 'clients', clientId));
      if (snap.exists()) {
        isPaused       = snap.data().emailPaused === true;
        blockedSenders = (snap.data().blockedSenders || [])
          .map(s => s.toLowerCase().trim())
          .filter(Boolean);
      }
    } catch (_) { /* silent — use last known values */ }
  }

  const IMAP_CONFIG = {
    imap: {
      user:        emailAddr,
      password:    appPassword.replace(/\s/g, ''),
      host:        'imap.gmail.com',
      port:        993,
      tls:         true,
      authTimeout: 5000,
      tlsOptions:  { rejectUnauthorized: false }, // Cloud hosting compatible — see note below
    },
  };

  let sessionUIDCache = new Set(); // cleared on each IMAP reconnect

  // NOTE on rejectUnauthorized:false — Railway/Render proxy outbound TLS through
  // their own network layer. Node.js sees this as a self-signed cert and refuses
  // to connect when true. The connection is still TLS-encrypted on port 993.
  // Change to true only when self-hosting on a VPS with direct network to Gmail.
  async function runPollingCycle(connection) {
    if (cancelled) return;
    try {
      await refreshClientSettings();
      if (isPaused) { log(`${tag} PAUSED — skipping cycle`); return; }

      const FETCH_SINCE = getFetchSince();

      // 15-second hang guard — imap-simple can stall if Gmail becomes unresponsive
      const messages = await Promise.race([
        connection.search(
          [['SINCE', FETCH_SINCE]],
          { bodies: ['HEADER.FIELDS (SUBJECT)'], markSeen: false }
        ),
        new Promise((_, rej) => setTimeout(() => rej(new Error('IMAP_HANG')), 15000)),
      ]);

      const today    = todayStr();
      const orderMap = getOrderMap(today, clientId);
      const emailSet = getEmailSet(today, clientId);

      // Filter at this level using the session cache (cheapest check)
      const newMessages = messages.filter(m => !sessionUIDCache.has(m.attributes.uid));
      if (newMessages.length > 0) log(`${tag} 📩 ${newMessages.length} email(s) to process`);

      // Process in batches of 3 — keeps concurrent Bedrock calls manageable
      const BATCH_SIZE = 3;
      for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = newMessages.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(item => processEmail(
            item, connection, clientId, orderMap, emailSet,
            tag, blockedSenders, sessionUIDCache
          ))
        );
        // Inter-batch delay so we don't hammer Bedrock
        if (i + BATCH_SIZE < newMessages.length) await delay(2000);
      }

    } catch (e) {
      err(`${tag} Cycle error: ${e.message}`);
      throw e; // bubble up to trigger reconnect logic
    }
  }

  async function startPolling() {
    if (cancelled) return;
    let connection;
    try {
      await refreshClientSettings();
      if (cancelled) return;
      if (isPaused) {
        log(`${tag} PAUSED — retry in 60s`);
        if (!cancelled) setTimeout(startPolling, 60000);
        return;
      }

      connection = await imaps.connect(IMAP_CONFIG);
      activeConn = connection;
      await connection.openBox('INBOX');
      sessionUIDCache = new Set(); // fresh on each connection
      log(`${tag} ✅ Connected to inbox`);

      async function cycle() {
        if (cancelled) {
          log(`${tag} Polling cancelled — closing IMAP connection`);
          try { connection.end(); } catch (_) {}
          activeConn = null;
          return;
        }
        try {
          await runPollingCycle(connection);
        } catch (e) {
          if (cancelled) return;
          err(`${tag} Reconnecting after error: ${e.message}`);
          try { connection.end(); } catch (_) {}
          // Attempt inline reconnect before falling back to full restart
          try {
            connection = await imaps.connect(IMAP_CONFIG);
            activeConn = connection;
            await connection.openBox('INBOX');
            sessionUIDCache = new Set();
            log(`${tag} ✅ Reconnected`);
          } catch (e2) {
            err(`${tag} Reconnect failed: ${e2.message} — retry in 60s`);
            if (!cancelled) setTimeout(startPolling, 60000);
            return;
          }
        }
        if (!cancelled) setTimeout(cycle, 30000);
      }

      cycle();

    } catch (error) {
      if (cancelled) return;
      err(`${tag} IMAP connect failed: ${error.message} — retry in 60s`);
      setTimeout(startPolling, 60000);
    }
  }

  startPolling();

  // Return the stop function — registered with globalStopFns for graceful shutdown
  return function stop() {
    cancelled = true;
    log(`${tag} Stop requested`);
    if (activeConn) {
      try { activeConn.end(); } catch (_) {}
      activeConn = null;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WATCH CLIENTS COLLECTION
//
// Listens to Firestore in real-time for changes to the clients collection.
// When a client is added (active:true)   → start their IMAP poller
// When a client is removed               → stop their poller
// When a client is deactivated           → stop their poller
//
// Each client's stop() function is stored in activePolls and globalStopFns.
// globalStopFns is iterated by shutdown() on SIGTERM/SIGINT.
// ═══════════════════════════════════════════════════════════════════════════
async function watchClients() {
  // Wait for Firestore backend auth before attaching listeners —
  // otherwise the first onSnapshot call may fail with permission errors
  await backendAuthReady;
  log('MIGME: Watching for active clients...');

  const activePolls = new Map(); // clientId → stop()

  // ── Active clients listener ─────────────────────────────────────────────
  onSnapshot(
    query(collection(db, 'clients'), where('active', '==', true)),
    (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const data      = change.doc.data();
        const clientKey = change.doc.id;

        if (change.type === 'added') {
          if (activePolls.has(clientKey)) return; // already running
          log(`Starting polling for ${data.businessName} (${data.email})`);

          // Warm the order cache before starting the poller
          await warmOrderCache(clientKey);
          if (activePolls.has(clientKey)) return; // race guard

          // Decrypt the stored app password (or use plain if not yet encrypted)
          const plainPassword = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(data.appPassword)
            ? decrypt(data.appPassword)
            : data.appPassword;

          const stopFn = await pollClientInbox(
            clientKey, data.email, plainPassword, data.businessName
          );
          activePolls.set(clientKey, stopFn);
          globalStopFns.add(stopFn);
        }

        if (change.type === 'removed') {
          const stopFn = activePolls.get(clientKey);
          if (stopFn) {
            log(`Stopping polling for ${data.businessName || clientKey}`);
            stopFn();
            globalStopFns.delete(stopFn);
            activePolls.delete(clientKey);
          }
        }
      });
    }
  );

  // ── Inactive clients listener (active:false) ────────────────────────────
  // Handles the case where a client is deactivated without being deleted
  onSnapshot(
    query(collection(db, 'clients'), where('active', '==', false)),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const clientKey = change.doc.id;
          const stopFn    = activePolls.get(clientKey);
          if (stopFn) {
            log(`Client ${clientKey} became inactive — stopping poller`);
            stopFn();
            globalStopFns.delete(stopFn);
            activePolls.delete(clientKey);
          }
        }
      });
    }
  );
}

// Start watching — exit the process if the initial setup fails (fatal)
watchClients().catch(e => {
  err(`watchClients fatal: ${e.message}`);
  process.exit(1);
});