require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express          = require('express');
const cors             = require('cors');
const fs               = require('fs');
const path             = require('path');
const crypto           = require('crypto');
const imaps            = require('imap-simple');
const { simpleParser } = require('mailparser');
const { initializeApp }  = require('firebase/app');
const {
  getFirestore, collection, doc,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc,
  query, where, onSnapshot,
} = require('firebase/firestore');
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

// ═══════════════════════════════════════════════════════════════════════════
// CRASH RECOVERY & LOGGING
// ═══════════════════════════════════════════════════════════════════════════
const LOG_FILE     = path.join(__dirname, 'server.log');
const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

// ── FIX 3a: mask PII before writing to log ──────────────────────────────
function maskPII(msg) {
  if (typeof msg !== 'string') msg = String(msg);
  // Mask 10-digit phone numbers: keep first 3 and last 4 digits
  msg = msg.replace(/\b(\d{3})\d{3}(\d{4})\b/g, '$1***$2');
  // Mask email local-parts longer than 3 chars: a***@domain.com
  msg = msg.replace(/\b([A-Za-z0-9._%+\-]{1,3})[A-Za-z0-9._%+\-]+(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g, '$1***$2');
  return msg;
}

// ── FIX 3b: rotate log file if it exceeds LOG_MAX_BYTES ─────────────────
function rotateLogIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size >= LOG_MAX_BYTES) {
      const rotated = `${LOG_FILE}.${Date.now()}.bak`;
      fs.renameSync(LOG_FILE, rotated);
      // Keep only the two most recent backups to avoid unbounded disk use
      const dir   = path.dirname(LOG_FILE);
      const base  = path.basename(LOG_FILE);
      const backs = fs.readdirSync(dir)
        .filter(f => f.startsWith(base + '.') && f.endsWith('.bak'))
        .map(f => ({ f, t: parseInt(f.split('.').slice(-2, -1)[0], 10) || 0 }))
        .sort((a, b) => b.t - a.t);
      backs.slice(2).forEach(({ f }) => { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
    }
  } catch (_) { /* file may not exist yet — that is fine */ }
}

function writeLog(level, msg) {
  const masked = maskPII(msg);
  const line   = `[${new Date().toISOString()}] [${level}] ${masked}\n`;
  process.stdout.write(line);
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(LOG_FILE, line);
  } catch(e) {}
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
// ═══════════════════════════════════════════════════════════════════════════
const globalStopFns = new Set();

function shutdown(signal) {
  log(`${signal} received — stopping ${globalStopFns.size} active poller(s)...`);
  for (const fn of globalStopFns) { try { fn(); } catch(_) {} }
  setTimeout(() => { log('Graceful exit complete.'); process.exit(0); }, 3000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE
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
// FIREBASE ADMIN SDK (for Auth user creation & backend auth)
// ═══════════════════════════════════════════════════════════════════════════
const { getAuth, signInWithEmailAndPassword: authSignIn } = require('firebase/auth');
const admin = require('firebase-admin');
const SA_PATH = process.env.FIREBASE_SA_PATH || path.join(__dirname, 'serviceAccountKey.json');
if (admin.apps.length === 0) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else if (require('fs').existsSync(SA_PATH)) {
    admin.initializeApp({ credential: admin.credential.cert(SA_PATH) });
  } else {
    admin.initializeApp({ projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID });
  }
}
const authAdmin = admin.auth();

// Authenticate the client SDK so Firestore writes respect security rules.
// Exported as a promise so watchClients can wait for it.
const BACKEND_AUTH_UID = '__backend__';
const backendAuthReady = (async function authBackend() {
  try {
    await authAdmin.getUser(BACKEND_AUTH_UID);
  } catch {
    await authAdmin.createUser({ uid: BACKEND_AUTH_UID, email: 'backend@migme.internal', password: crypto.randomBytes(24).toString('hex') });
  }
  const token = await authAdmin.createCustomToken(BACKEND_AUTH_UID);
  const authInstance = getAuth(firebaseApp);
  const { signInWithCustomToken } = require('firebase/auth');
  await signInWithCustomToken(authInstance, token);
  log('Backend Firestore client authenticated');
})().catch(e => { warn(`Backend auth failed: ${e.message}`); throw e; });

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION (AES-256-GCM)
// ═══════════════════════════════════════════════════════════════════════════
function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is required');
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
        } catch(_) {
          resolve(false);
        }
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: TIMING-SAFE ADMIN KEY COMPARISON
// maskKey() ensures the real key never appears in logs.
// ═══════════════════════════════════════════════════════════════════════════
function maskKey(key) {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '*'.repeat(key.length - 8) + key.slice(-4);
}

/**
 * Constant-time comparison of two strings using HMAC so both sides are the
 * same length regardless of the input (avoids the Buffer.from length-leak).
 */
function safeCompareKey(provided, secret) {
  if (!provided || !secret) return false;
  const hmacA = crypto.createHmac('sha256', 'migme-key-cmp').update(provided).digest();
  const hmacB = crypto.createHmac('sha256', 'migme-key-cmp').update(secret).digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: RATE LIMITER — single-process safe (no cross-worker bypass)
// PM2 must run with instances:1, exec_mode:"fork" to keep this effective.
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
// ═══════════════════════════════════════════════════════════════════════════
const dailyOrderCache = {};
const dailyEmailCache = {};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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

function scheduleMidnightReset() {
  const now    = new Date();
  const next   = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 1, 0, 0);
  const msUntil = next - now;
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
  }, msUntil);
}
scheduleMidnightReset();

async function warmOrderCache(clientId) {
  const date     = todayStr();
  const orderMap = getOrderMap(date, clientId);
  if (orderMap.size > 0) return;
  try {
    const q = query(
      collection(db, 'orders'),
      where('deliveryDate', '==', date),
      where('clientId', '==', clientId)
    );
    const snap = await getDocs(q);
    snap.forEach(d => orderMap.set(d.id, d.data()));
    log(`📦 Cache warmed for ${clientId}/${date}: ${orderMap.size} orders`);
  } catch(e) {
    warn(`Cache warm failed for ${clientId}: ${e.message}`);
  }
}

async function warmEmailCache(clientId) {
  const date     = todayStr();
  const emailSet = getEmailSet(date, clientId);
  if (emailSet.size > 0) return;
  try {
    const indexRef  = doc(db, 'processed_emails_index', emailIndexId(clientId, date));
    const indexSnap = await getDoc(indexRef);
    if (indexSnap.exists()) {
      const uids = indexSnap.data().uids || [];
      uids.forEach(u => emailSet.add(u));
      log(`📬 Email cache warmed for ${clientId}/${date}: ${emailSet.size} UIDs`);
    }
  } catch(e) {
    warn(`Email cache warm failed for ${clientId}: ${e.message}`);
  }
}

async function recordProcessedEmail(uidStr, orderNo, status, clientId) {
  const date     = todayStr();
  const emailSet = getEmailSet(date, clientId);
  emailSet.add(uidStr);
  try {
    await setDoc(doc(db, 'processed_emails', emailDocId(clientId, uidStr)), {
      status, orderNo: orderNo || '', clientId,
      processedAt: new Date().toISOString(),
    });
    const indexRef  = doc(db, 'processed_emails_index', emailIndexId(clientId, date));
    const indexSnap = await getDoc(indexRef);
    const existing  = indexSnap.exists() ? (indexSnap.data().uids || []) : [];
    if (!existing.includes(uidStr)) {
      await setDoc(indexRef, { uids: [...existing, uidStr] }, { merge: true });
    }
  } catch(e) {
    warn(`recordProcessedEmail failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRESTORE WRITE QUEUE — per-order locks
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

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:19006,https://migme.onrender.com').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

// Fallback OPTIONS handler for preflight requests from any origin
app.options('*', (_req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.sendStatus(204);
});

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
    `MIGME Backend ✅ | Date: ${today} | Orders in cache: ${orderCount} | Emails processed today: ${emailCount} | Active pollers: ${globalStopFns.size}`
  );
});

app.get('/logs', rateLimit(30), (req, res) => {
  const token = process.env.LOG_TOKEN;
  if (token && req.query.token !== token) return res.status(403).send('Forbidden');
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-200).join('\n');
    res.type('text/plain').send(lines);
  } catch(e) { res.send('No log file yet.'); }
});

// ── FIX 1 applied: use safeCompareKey() for POST /api/clients ─────────────
app.post('/api/clients', rateLimit(5), async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && !safeCompareKey(req.headers['x-admin-key'], adminKey)) {
      warn(`POST /api/clients: rejected request with key ${maskKey(req.headers['x-admin-key'] || '')}`);
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { businessName, email, appPassword, password } = req.body;
    if (!businessName || !email || !appPassword || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const encryptedAppPassword = encrypt(appPassword);
    const passwordHash         = await hashPassword(password);
    const clientEmail = email.trim().toLowerCase();
    const docRef = await addDoc(collection(db, 'clients'), {
      businessName:  businessName.trim(),
      email:         clientEmail,
      appPassword:   encryptedAppPassword,
      passwordHash,
      active:        true,
      createdAt:     new Date().toISOString(),
    });
    // Create Firebase Auth user so firestore.rules (request.auth != null) works
    try {
      await authAdmin.createUser({ uid: docRef.id, email: clientEmail, password });
    } catch (authErr) {
      warn(`POST /api/clients: Auth user creation failed (non-fatal): ${authErr.message}`);
    }
    log(`Client created: ${businessName} (${docRef.id})`);
    res.json({ id: docRef.id, businessName });
  } catch(e) {
    warn(`POST /api/clients error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── FIX 1 applied: requireAdmin uses safeCompareKey() ────────────────────
function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey && !safeCompareKey(req.headers['x-admin-key'], adminKey)) {
    warn(`Admin route ${req.method} ${req.path}: rejected key ${maskKey(req.headers['x-admin-key'] || '')}`);
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ── DELETE: orders for a client within a date range ─────────────────────────
app.delete('/api/data/client/:clientId/range', requireAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { startDate, endDate } = req.body;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const q = query(
      collection(db, 'orders'),
      where('clientId', '==', clientId),
      where('createdAt', '>=', new Date(startDate).toISOString()),
      where('createdAt', '<=', new Date(endDate).toISOString())
    );
    const snap = await getDocs(q);
    let deleted = 0;
    for (const d of snap.docs) {
      await deleteDoc(doc(db, 'orders', d.id));
      deleted++;
    }

    const start = new Date(startDate);
    const end   = new Date(endDate);
    let indexDeleted = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr  = d.toISOString().slice(0, 10);
      const indexRef = doc(db, 'processed_emails_index', `${clientId}_${dateStr}`);
      const snap2    = await getDoc(indexRef);
      if (snap2.exists()) { await deleteDoc(indexRef); indexDeleted++; }
    }

    log(`Admin deleted ${deleted} orders + ${indexDeleted} index entries for client ${clientId} [${startDate} → ${endDate}]`);
    res.json({ deletedOrders: deleted, deletedIndexEntries: indexDeleted });
  } catch(e) {
    warn(`DELETE /api/data/client/:clientId/range error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

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
  } catch(e) {
    warn(`DELETE /api/data/client/:clientId/order/:orderNo error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/data/client/:clientId/all', requireAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    let total = 0;

    const ordersSnap = await getDocs(query(collection(db, 'orders'), where('clientId', '==', clientId)));
    for (const d of ordersSnap.docs) { await deleteDoc(doc(db, 'orders', d.id)); total++; }

    const emailsSnap = await getDocs(query(collection(db, 'processed_emails'), where('clientId', '==', clientId)));
    for (const d of emailsSnap.docs) { await deleteDoc(doc(db, 'processed_emails', d.id)); total++; }

    const indexSnap = await getDocs(collection(db, 'processed_emails_index'));
    for (const d of indexSnap.docs) {
      if (d.id.startsWith(`${clientId}_`)) { await deleteDoc(doc(db, 'processed_emails_index', d.id)); total++; }
    }

    const menuSnap = await getDocs(query(collection(db, 'menuItems'), where('clientId', '==', clientId)));
    for (const d of menuSnap.docs) { await deleteDoc(doc(db, 'menuItems', d.id)); total++; }

    const catSnap = await getDocs(query(collection(db, 'categories'), where('clientId', '==', clientId)));
    for (const d of catSnap.docs) { await deleteDoc(doc(db, 'categories', d.id)); total++; }

    const execSnap = await getDocs(query(collection(db, 'executives'), where('clientId', '==', clientId)));
    for (const d of execSnap.docs) { await deleteDoc(doc(db, 'executives', d.id)); total++; }

    log(`Admin deleted ALL data (${total} docs) for client ${clientId}`);
    res.json({ deletedDocs: total });
  } catch(e) {
    warn(`DELETE /api/data/client/:clientId/all error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── Create Firebase Auth user for existing Firestore user (login migration) ──
app.post('/api/auth/create-user', async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && !safeCompareKey(req.headers['x-admin-key'], adminKey)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { uid, email, password } = req.body;
    if (!uid || !email || !password) return res.status(400).json({ error: 'Missing uid, email, or password' });
    await authAdmin.createUser({ uid, email, password });
    log(`Auth user created for ${email} (${uid})`);
    res.json({ success: true });
  } catch (e) {
    warn(`POST /api/auth/create-user error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

// ── Verify password against stored hash (for client-side fallback) ───────────
app.post('/api/auth/verify-password', async (req, res) => {
  try {
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && !safeCompareKey(req.headers['x-admin-key'], adminKey)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { uid, password } = req.body;
    if (!uid || !password) return res.status(400).json({ error: 'Missing uid or password' });
    const snap = await getDoc(doc(db, 'clients', uid));
    if (!snap.exists()) return res.json({ valid: false });
    const data = snap.data();
    const stored = data.passwordHash || data.password;
    const valid = stored && stored.includes(':')
      ? await verifyPassword(password, stored)
      : password === stored;
    res.json({ valid });
  } catch (e) {
    warn(`POST /api/auth/verify-password error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => log(`MIGME Backend running on port ${PORT}`));

// ═══════════════════════════════════════════════════════════════════════════
// PDF PARSE
// ═══════════════════════════════════════════════════════════════════════════
let pdfParseLib = require('pdf-parse');
let pdfParse    = pdfParseLib.default || pdfParseLib;
if (typeof pdfParse !== 'function') pdfParse = async () => ({ text: '' });

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR MAP
// ═══════════════════════════════════════════════════════════════════════════
const VENDOR_MAP = [
  { match: 'relfood',       name: 'Rail Food',    type: 'railfood' },
  { match: 'railfood',      name: 'Rail Food',    type: 'railfood' },
  { match: 'zoopindia',     name: 'Zoop India',   type: 'zoop' },
  { match: 'zoop',          name: 'Zoop India',   type: 'zoop' },
  { match: 'yatrirestro',   name: 'Yatri Restro', type: 'yatri_restro' },
  { match: 'yatristro',     name: 'Yatri Restro', type: 'yatri_restro' },
  { match: 'yatribhojan',   name: 'YatriBhojan',  type: 'yatribhojan' },
  { match: 'rajbhog',       name: 'Rajbhog',      type: 'rajbhog' },
  { match: 'rajbhaog',      name: 'Rajbhog',      type: 'rajbhog' },
  { match: 'homebytes',     name: 'Home Bytes',   type: 'homebytes' },
  { match: 'railyatri',     name: 'RailYatri',    type: 'railyatri' },
  { match: 'railreceipt',   name: 'Rail Receipt', type: 'railreceipt' },
  { match: 'rajdhaniorder', name: 'Rajdhani',     type: 'rajdhani' },
  { match: 'rajdhani',      name: 'Rajdhani',     type: 'rajdhani' },
  { match: 'dibrail',       name: 'Dibrail',      type: 'dibrail' },
  { match: 'spicywagon',    name: 'Spicywagon',   type: 'spicywagon' },
  { match: 'ecatering',     name: 'IRCTC',        type: 'irctc' },
  { match: 'foodontrack',   name: 'IRCTC',        type: 'irctc' },
  { match: 'olfstore',      name: 'OLF Store',    type: 'olf' },
  { match: 'travelkhana',   name: 'Travelkhana',  type: 'travelkhana' },
];

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR RULES
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
async function markEmailAsRead(_connection, _uid) {}

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

const cleanFloat = (val) => parseFloat((val || 0).toString().replace(/[^\d.]/g, '')) || 0;

// ═══════════════════════════════════════════════════════════════════════════
// AI — BEDROCK CALL (base)
// ═══════════════════════════════════════════════════════════════════════════
async function callBedrockAI(prompt) {
  const keyId       = process.env.AWS_ACCESS_KEY_ID || '';
  const secretKey   = process.env.AWS_SECRET_ACCESS_KEY || '';
  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK || '';
  const endpointUrl = process.env.AWS_BEDROCK_ENDPOINT || '';
  const useBearer   = bearerToken || keyId.startsWith('BedrockAPIKey');

  if (useBearer) {
    const token = bearerToken || (secretKey.startsWith('ABSK')
      ? Buffer.from(secretKey.substring(4), 'base64').toString('utf-8') : '');
    if (!token) { err('Bearer token not resolved'); return null; }
    const url = endpointUrl || 'https://bedrock-runtime.ap-south-1.amazonaws.com';
    try {
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'x-api-key': keyId },
        body:    JSON.stringify({
          modelId:  'qwen.qwen3-vl-235b-a22b',
          system:   [{ text: 'You are a strict data extraction API. Return a SINGLE, VALID JSON object without markdown formatting.' }],
          messages: [{ role: 'user', content: [{ text: prompt }] }],
        }),
      });
      if (!res.ok) { err(`Bearer API ${res.status}: ${await res.text()}`); return null; }
      const json = await res.json();
      return json.output?.message?.content?.[0]?.text || json.content?.[0]?.text || JSON.stringify(json);
    } catch(e) { err(`Bearer API error: ${e.message}`); return null; }
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
  } catch(e) { err(`Bedrock SDK error: ${e.name} - ${e.message}`); return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI RETRY WITH EXPONENTIAL BACKOFF
// ═══════════════════════════════════════════════════════════════════════════
async function callBedrockWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callBedrockAI(prompt);
      if (result) return result;
      warn(`AI attempt ${attempt}/${maxRetries} returned null`);
    } catch(e) {
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
// AI RESPONSE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
function validateOrderData(data, vendorType) {
  const errors   = [];
  const warnings = [];

  if (!data.deliveryDate || !data.deliveryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push(`Invalid deliveryDate: "${data.deliveryDate}"`);
  } else {
    const d        = new Date(data.deliveryDate);
    const now      = new Date();
    const daysDiff = (d - now) / (1000 * 60 * 60 * 24);
    if (daysDiff < -1 || daysDiff > 30) {
      warnings.push(`Suspicious deliveryDate: ${data.deliveryDate} (${daysDiff.toFixed(0)} days from today)`);
    }
  }

  if (data.deliveryTime && !data.deliveryTime.match(/^\d{2}:\d{2}$/)) {
    warnings.push(`Invalid deliveryTime format: "${data.deliveryTime}"`);
    data.deliveryTime = '';
  }

  if (!data.items || data.items.length === 0) {
    errors.push('No items found');
  } else {
    for (const item of data.items) {
      if (item.quantity > 50) {
        warnings.push(`Suspiciously high quantity for "${item.name}": ${item.quantity}`);
        item.quantity = 1;
      }
      if (item.quantity <= 0) item.quantity = 1;
      if (item.price < 0) {
        warnings.push(`Negative price for "${item.name}": ${item.price}`);
        item.price = 0;
      }
      if (item.price > 5000) {
        warnings.push(`Unusually high price for "${item.name}": ₹${item.price}`);
      }
    }
  }

  if (data.totalAmount <= 0 && vendorType !== 'travelkhana' && vendorType !== 'yatribhojan') {
    warnings.push(`totalAmount is 0 or missing`);
  }
  if (data.totalAmount > 10000) {
    warnings.push(`Unusually high totalAmount: ₹${data.totalAmount}`);
  }

  if (data.coach && data.coach.length > 20) {
    warnings.push(`Coach value suspiciously long: "${data.coach}"`);
  }

  if (data.contactNo) {
    const digits = data.contactNo.replace(/\D/g, '');
    if (digits.length !== 10) {
      warnings.push(`Contact number not 10 digits: "${data.contactNo}"`);
      data.contactNo = '';
    } else {
      data.contactNo = digits;
    }
  }

  if (!['COD', 'Prepaid'].includes(data.paymentType)) {
    warnings.push(`Unknown paymentType "${data.paymentType}" — defaulting to COD`);
    data.paymentType = 'COD';
  }

  return { errors, warnings, data };
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — PARSE NEW ORDER EMAIL
// ═══════════════════════════════════════════════════════════════════════════
async function parseWithAWS(rawText, subject, senderEmail) {
  const lowerFrom = senderEmail.toLowerCase();
  let vendorName = '', vendorType = 'generic';
  for (const v of VENDOR_MAP) {
    if (lowerFrom.includes(v.match)) { vendorName = v.name; vendorType = v.type; break; }
  }
  if (!vendorName) {
    try {
      const parts = lowerFrom.split('@')[1]?.split('.') || [];
      const root  = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      vendorName  = root.charAt(0).toUpperCase() + root.slice(1);
    } catch(e) {}
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

    const data = JSON.parse(raw.split('```json').join('').split('```').join('').trim());
    data.orderNo  = data.orderNo?.toString().trim() || '';
    data.pnr      = data.pnr?.toString().trim() || '';
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
    if (errors.length > 0) {
      err(`   ❌ Validation FAILED: ${errors.join(' | ')}`);
      return null;
    }

    return validatedData;
  } catch(e) { err(`Parse error: ${e.message}`); return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — PARSE UPDATE EMAIL
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
    return JSON.parse(raw.split('```json').join('').split('```').join('').trim());
  } catch(e) { err(`Update parse error: ${e.message}`); return null; }
}

function buildChangePayload(existingOrder, updateResult) {
  const FIELDS = ['coach','deliveryDate','deliveryTime','contactNo','trainInfo','paymentType','totalAmount','items','subTotal'];
  const changes = {}, changeLog = [];
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
// FETCH SINCE: fixed anchor at 2026-05-28 01:00 IST
// IST = UTC+5:30, so 01:00 IST = 2026-05-27 19:30 UTC
// ═══════════════════════════════════════════════════════════════════════════
const FETCH_SINCE_FIXED = new Date('2026-05-27T19:30:00.000Z');

function getFetchSince() {
  // Use the fixed anchor OR 3 days ago, whichever is more recent.
  // This means: on first run we start from May 28 01:00 IST; after ~3 days
  // the rolling window takes over naturally and the old anchor becomes moot.
  const rollingWindow = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  return rollingWindow > FETCH_SINCE_FIXED ? rollingWindow : FETCH_SINCE_FIXED;
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDALONE EMAIL PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════
async function processEmail(item, connection, clientId, orderMap, emailSet, tag, blockedSenders, sessionUIDCache) {
  const uid    = item.attributes.uid;
  const uidStr = uid.toString();

  try {
    if (sessionUIDCache.has(uid)) return;

    if (emailSet.has(uidStr)) {
      sessionUIDCache.add(uid);
      return;
    }

    try {
      const processedSnap = await getDoc(
        doc(db, 'processed_emails', emailDocId(clientId, uidStr))
      );
      if (processedSnap.exists()) {
        const prevStatus = processedSnap.data().status;
        if (prevStatus !== 'incomplete_data') {
          log(`${tag} UID ${uidStr} already in DB (${prevStatus}) — skipping AI`);
          emailSet.add(uidStr);
          sessionUIDCache.add(uid);
          return;
        }
        log(`${tag} UID ${uidStr} was incomplete — retrying parse`);
      }
    } catch(e) {
      warn(`${tag} Firestore pre-check failed for UID ${uidStr}: ${e.message} — processing anyway`);
    }

    const fullMsg = await connection.search([['UID', uid]], { bodies: [''], markSeen: false });
    if (!fullMsg || fullMsg.length === 0) return;
    const parsed = await simpleParser(fullMsg[0].parts.find(p => p.which === '').body);

    // Date guard against the fixed fetch anchor
    const emailDate    = parsed.date ? new Date(parsed.date) : new Date();
    const FETCH_SINCE  = getFetchSince();
    if (emailDate < FETCH_SINCE) {
      sessionUIDCache.add(uid);
      return;
    }

    const subject     = parsed.subject || 'No Subject';
    const fromAddress = parsed.from?.value?.[0]?.address || parsed.from?.text || 'Unknown';
    const lowerFrom   = fromAddress.toLowerCase();

    if (blockedSenders.some(bs => lowerFrom.includes(bs) || lowerFrom === bs)) {
      log(`${tag} Blocked sender: ${fromAddress}`);
      sessionUIDCache.add(uid);
      await recordProcessedEmail(uidStr, '', 'blocked_sender', clientId);
      return;
    }

    const vendorFromSender = VENDOR_MAP.find(v => lowerFrom.includes(v.match));
    const subjectMatches   = /Order|Booking|PNR|Reservation|Invoice|Bill|Catering|Check Order/i.test(subject);

    if (!subjectMatches && !vendorFromSender) {
      sessionUIDCache.add(uid);
      return;
    }
    if (!subjectMatches && vendorFromSender) {
      warn(`${tag} Known vendor ${vendorFromSender.name} with unusual subject: "${subject}" — processing anyway`);
    }

    let fullText = parsed.text || parsed.html || '';
    for (const att of (parsed.attachments || [])) {
      if (att.contentType === 'application/pdf') {
        try {
          const pdf     = await pdfParse(att.content);
          const pdfText = (pdf.text || '').trim();
          if (pdfText.length < 50) {
            warn(`${tag} PDF extracted only ${pdfText.length} chars — may be image-based; AI will rely on email body`);
          }
          if (pdfText) fullText += '\n\n--- PDF ---\n' + pdfText;
        } catch(e) {
          warn(`${tag} PDF parse error: ${e.message}`);
        }
      }
    }

    log(`${tag} 🤖 Parsing: "${subject}" (From: ${fromAddress})`);

    const orderData = await parseWithAWS(fullText, subject, fromAddress);
    if (!orderData) {
      log(`${tag}    ❌ AI returned null or validation failed — stays unread for retry`);
      return;
    }

    const finalOrderNo = (orderData.orderNo || orderData.pnr || '').toString().replace(/\//g, '-').trim();
    if (!finalOrderNo || finalOrderNo.startsWith('AUTO_')) {
      log(`${tag}    ⚠️ No valid order number — stays unread for retry`);
      return;
    }

    const lockKey = orderDocId(clientId, finalOrderNo);
    if (!acquireLock(lockKey)) {
      log(`${tag} #${finalOrderNo} already being processed in parallel — skipping`);
      return;
    }

    try {
      const today             = todayStr();
      const orderDeliveryDate = (orderData.deliveryDate || '').trim();
      let existingOrder       = null;

      if (orderDeliveryDate === today) {
        existingOrder = orderMap.get(orderDocId(clientId, finalOrderNo)) || null;
      } else if (orderDeliveryDate) {
        log(`${tag}    📅 Order date ${orderDeliveryDate} ≠ today ${today} — Firestore read for #${finalOrderNo}`);
        try {
          const snap = await getDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)));
          if (snap.exists()) existingOrder = snap.data();
        } catch(e) { warn(`Firestore read failed: ${e.message}`); }
      } else {
        existingOrder = orderMap.get(orderDocId(clientId, finalOrderNo)) || null;
        if (!existingOrder) {
          try {
            const snap = await getDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)));
            if (snap.exists()) existingOrder = snap.data();
          } catch(e) { warn(`Firestore read failed: ${e.message}`); }
        }
      }

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
          log(`${tag}    ℹ️ No explicit changes for #${finalOrderNo} — duplicate, recording`);
        } else {
          const updatedOrder  = { ...existingOrder, ...changes };
          const updatePayload = {
            ...changes,
            lastUpdatedAt: new Date().toISOString(),
            updateHistory: [
              ...(existingOrder.updateHistory || []),
              { updatedAt: new Date().toISOString(), subject, changes, remark: updateResult.remark || `Updated: ${changeLog.join(', ')}` }
            ],
          };
          await updateDoc(doc(db, 'orders', orderDocId(clientId, finalOrderNo)), updatePayload);
          orderMap.set(orderDocId(clientId, finalOrderNo), updatedOrder);
          log(`${tag}    ✅ UPDATED #${finalOrderNo}: ${changeLog.join(', ')}`);
        }

        sessionUIDCache.add(uid);
        await recordProcessedEmail(uidStr, finalOrderNo, Object.keys(changes).length > 0 ? 'update_applied' : 'duplicate', clientId);

      } else {
        log(`${tag}    🆕 New order #${finalOrderNo} — validating fields...`);
        const missing = getMissingFields(orderData);
        if (missing) {
          log(`${tag}    ⚠️ INCOMPLETE — missing: [${missing}] — stays UNREAD`);
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
      releaseLock(lockKey);
    }

  } catch(e) {
    err(`${tag} processEmail error for UID ${uid}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-TENANT IMAP POLLING
// ═══════════════════════════════════════════════════════════════════════════
async function pollClientInbox(clientId, emailAddr, appPassword, clientBusinessName) {
  const tag = `[${clientBusinessName}]`;
  log(`${tag} Starting IMAP polling for ${emailAddr}`);

  await warmEmailCache(clientId);

  let cancelled      = false;
  let activeConn     = null;
  let isPaused       = false;
  let blockedSenders = [];

  async function refreshClientSettings() {
    try {
      const snap = await getDoc(doc(db, 'clients', clientId));
      if (snap.exists()) {
        isPaused       = snap.data().emailPaused === true;
        blockedSenders = (snap.data().blockedSenders || []).map(s => s.toLowerCase().trim()).filter(Boolean);
      }
    } catch(e) { /* silent */ }
  }

  const IMAP_CONFIG = {
    imap: {
      user:        emailAddr,
      password:    appPassword.replace(/\s/g, ''),
      host:        'imap.gmail.com',
      port:        993,
      tls:         true,
      authTimeout: 5000,
      tlsOptions:  { rejectUnauthorized: false },
    },
  };

  let sessionUIDCache = new Set();

  async function runPollingCycle(connection) {
    if (cancelled) return;
    try {
      await refreshClientSettings();
      if (isPaused) { log(`${tag} PAUSED — skipping cycle`); return; }

      const FETCH_SINCE = getFetchSince();

      const messages = await Promise.race([
        connection.search([['SINCE', FETCH_SINCE]], { bodies: ['HEADER.FIELDS (SUBJECT)'], markSeen: false }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('IMAP_HANG')), 15000)),
      ]);

      const today    = todayStr();
      const orderMap = getOrderMap(today, clientId);
      const emailSet = getEmailSet(today, clientId);

      const newMessages = messages.filter(m => !sessionUIDCache.has(m.attributes.uid));
      if (newMessages.length > 0) log(`${tag} 📩 ${newMessages.length} unread email(s) to process`);

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
        if (i + BATCH_SIZE < newMessages.length) await delay(2000);
      }

    } catch(e) {
      err(`${tag} Cycle error: ${e.message}`);
      throw e;
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
      sessionUIDCache = new Set();
      log(`${tag} ✅ Connected to inbox`);

      async function cycle() {
        if (cancelled) {
          log(`${tag} Polling cancelled — closing IMAP connection`);
          try { connection.end(); } catch(_) {}
          activeConn = null;
          return;
        }
        try {
          await runPollingCycle(connection);
        } catch(e) {
          if (cancelled) return;
          err(`${tag} Reconnecting after error: ${e.message}`);
          try { connection.end(); } catch(_) {}
          try {
            connection = await imaps.connect(IMAP_CONFIG);
            activeConn = connection;
            await connection.openBox('INBOX');
            sessionUIDCache = new Set();
            log(`${tag} ✅ Reconnected`);
          } catch(e2) {
            err(`${tag} Reconnect failed: ${e2.message} — retry in 60s`);
            if (!cancelled) setTimeout(startPolling, 60000);
            return;
          }
        }
        if (!cancelled) setTimeout(cycle, 30000);
      }
      cycle();

    } catch(error) {
      if (cancelled) return;
      err(`${tag} IMAP connect failed: ${error.message} — retry in 60s`);
      setTimeout(startPolling, 60000);
    }
  }

  startPolling();

  return function stop() {
    cancelled = true;
    log(`${tag} Stop requested`);
    if (activeConn) {
      try { activeConn.end(); } catch(_) {}
      activeConn = null;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WATCH CLIENTS COLLECTION
// ═══════════════════════════════════════════════════════════════════════════
async function watchClients() {
  // Wait for Firestore auth to finish so onSnapshot listeners don't fail
  await backendAuthReady;
  log('MIGME: Watching for active clients...');

  const activePolls = new Map();

  onSnapshot(query(collection(db, 'clients'), where('active', '==', true)), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data      = change.doc.data();
      const clientKey = change.doc.id;

      if (change.type === 'added') {
        if (activePolls.has(clientKey)) return;
        log(`Starting polling for ${data.businessName} (${data.email})`);
        warmOrderCache(clientKey).then(async () => {
          if (activePolls.has(clientKey)) return;
          const plainPassword = /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(data.appPassword)
            ? decrypt(data.appPassword) : data.appPassword;
          const stopFn = await pollClientInbox(clientKey, data.email, plainPassword, data.businessName);
          activePolls.set(clientKey, stopFn);
          globalStopFns.add(stopFn);
        });
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
  });

  onSnapshot(query(collection(db, 'clients'), where('active', '==', false)), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const clientKey = change.doc.id;
        const stopFn    = activePolls.get(clientKey);
        if (stopFn) {
          log(`Client ${clientKey} became inactive — stopping`);
          stopFn();
          globalStopFns.delete(stopFn);
          activePolls.delete(clientKey);
        }
      }
    });
  });
}

watchClients().catch(e => { err(`watchClients fatal: ${e.message}`); process.exit(1); });