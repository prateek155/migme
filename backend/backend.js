// ═══════════════════════════════════════════════════════════════════════════
// MIGME BACKEND — backend.js
// ═══════════════════════════════════════════════════════════════════════════
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const imaps = require("imap-simple");
const { simpleParser } = require("mailparser");
// DOM parsing for text/html vendors — used by parseDomOrder()
const cheerio = require("cheerio");
// ✅ FIX 1: decode import kept for any future use but NOT called on parsed.html
// mailparser's simpleParser already decodes quoted-printable — calling decodeQP
// again on parsed.html corrupts = signs, ₹ symbol, CSS values and HTML attributes.
// parseDomOrder now uses htmlBody directly without re-decoding.
const { decode: decodeQP } = require("quoted-printable");

// ── Firebase client SDK ────────────────────────────────────────────────────
const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  onSnapshot,
} = require("firebase/firestore");

const { getAuth, signInWithCustomToken } = require("firebase/auth");

const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

// ═══════════════════════════════════════════════════════════════════════════
// MANDATORY ENV-VAR STARTUP CHECK
// ═══════════════════════════════════════════════════════════════════════════
const REQUIRED_ENV = [
  "ENCRYPTION_KEY",
  "ADMIN_API_KEY",
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  process.stderr.write(
    `[FATAL] Missing required env vars: ${missingEnv.join(", ")}\nExiting.\n`,
  );
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// CRASH RECOVERY & LOGGING
// ═══════════════════════════════════════════════════════════════════════════
const LOG_FILE = path.join(__dirname, "server.log");
const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function maskPII(msg) {
  if (typeof msg !== "string") msg = String(msg);
  msg = msg.replace(/\b(\d{3})\d{3}(\d{4})\b/g, "$1***$2");
  msg = msg.replace(
    /\b([A-Za-z0-9._%+\-]{1,3})[A-Za-z0-9._%+\-]+(@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g,
    "$1***$2",
  );
  return msg;
}

function rotateLogIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < LOG_MAX_BYTES) return;
    const rotated = `${LOG_FILE}.${Date.now()}.bak`;
    fs.renameSync(LOG_FILE, rotated);
    const dir = path.dirname(LOG_FILE);
    const base = path.basename(LOG_FILE);
    const backs = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith(base + ".") && f.endsWith(".bak"))
      .map((f) => ({ f, t: parseInt(f.split(".").slice(-2, -1)[0], 10) || 0 }))
      .sort((a, b) => b.t - a.t);
    backs.slice(2).forEach(({ f }) => {
      try {
        fs.unlinkSync(path.join(dir, f));
      } catch (_) {}
    });
  } catch (_) {}
}

function writeLog(level, msg) {
  const masked = maskPII(msg);
  const line = `[${new Date().toISOString()}] [${level}] ${masked}\n`;
  process.stdout.write(line);
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) {}
}
const log = (msg) => writeLog("INFO", msg);
const warn = (msg) => writeLog("WARN", msg);
const err = (msg) => writeLog("ERROR", msg);

process.on("uncaughtException", (e) => {
  err(`uncaughtException: ${e.stack || e.message}`);
  setTimeout(() => process.exit(1), 500);
});
process.on("unhandledRejection", (reason) => {
  err(`unhandledRejection: ${reason?.stack || reason}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════
const globalStopFns = new Set();

function shutdown(signal) {
  log(
    `${signal} received — stopping ${globalStopFns.size} active poller(s)...`,
  );
  for (const fn of globalStopFns) {
    try {
      fn();
    } catch (_) {}
  }
  setTimeout(() => {
    log("Graceful exit complete.");
    process.exit(0);
  }, 3000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE CLIENT SDK
// ═══════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig, "migme-backend");
const db = getFirestore(firebaseApp);

// ═══════════════════════════════════════════════════════════════════════════
// FIREBASE ADMIN SDK
// ═══════════════════════════════════════════════════════════════════════════
const admin = require("firebase-admin");
const SA_PATH =
  process.env.FIREBASE_SA_PATH ||
  path.join(__dirname, "serviceAccountKey.json");

if (admin.apps.length === 0) {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });
  } else if (fs.existsSync(SA_PATH)) {
    admin.initializeApp({ credential: admin.credential.cert(SA_PATH) });
  } else {
    admin.initializeApp({
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
    warn(
      "Firebase Admin: no service account credentials found — Auth operations may fail",
    );
  }
}
const authAdmin = admin.auth();

const BACKEND_AUTH_UID = "__backend__";
const backendAuthReady = (async function authBackend() {
  try {
    await authAdmin.getUser(BACKEND_AUTH_UID);
  } catch {
    await authAdmin.createUser({
      uid: BACKEND_AUTH_UID,
      email: "backend@migme.internal",
      password: crypto.randomBytes(24).toString("hex"),
    });
  }
  const token = await authAdmin.createCustomToken(BACKEND_AUTH_UID, {
    email: "backend@migme.internal",
  });
  const authInstance = getAuth(firebaseApp);
  await signInWithCustomToken(authInstance, token);
  log("Backend Firestore client authenticated");
})().catch((e) => {
  warn(`Backend auth failed: ${e.message}`);
  throw e;
});

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION  (AES-256-GCM)
// ═══════════════════════════════════════════════════════════════════════════
function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY env var is required");
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decrypt(ciphertext) {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const enc = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc, "utf8") + decipher.final("utf8");
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD HASHING
// ═══════════════════════════════════════════════════════════════════════════
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (e, key) => {
      if (e) reject(e);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) {
    return Promise.resolve(password === stored);
  }
  return new Promise((resolve, reject) => {
    const [salt, hash] = stored.split(":");
    crypto.scrypt(password, salt, 64, (e, key) => {
      if (e) reject(e);
      else {
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(hash, "hex"), key));
        } catch (_) {
          resolve(false);
        }
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN KEY HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function maskKey(key) {
  if (!key || key.length < 8) return "***";
  return key.slice(0, 4) + "*".repeat(key.length - 8) + key.slice(-4);
}

function safeCompareKey(provided, secret) {
  if (!provided || !secret) return false;
  const hmacA = crypto
    .createHmac("sha256", "migme-key-cmp")
    .update(provided)
    .digest();
  const hmacB = crypto
    .createHmac("sha256", "migme-key-cmp")
    .update(secret)
    .digest();
  return crypto.timingSafeEqual(hmacA, hmacB);
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER
// ═══════════════════════════════════════════════════════════════════════════
const _rateBuckets = new Map();

function rateLimit(maxPerMinute = 20) {
  return (req, res, next) => {
    const ip = (
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "unknown"
    )
      .split(",")[0]
      .trim();
    const key = `${ip}:${Math.floor(Date.now() / 60000)}`;
    const cnt = (_rateBuckets.get(key) || 0) + 1;
    _rateBuckets.set(key, cnt);
    if (_rateBuckets.size > 2000) {
      const cutoff = Math.floor(Date.now() / 60000) - 2;
      for (const k of _rateBuckets.keys()) {
        if (parseInt(k.split(":").pop(), 10) < cutoff) _rateBuckets.delete(k);
      }
    }
    if (cnt > maxPerMinute) {
      return res
        .status(429)
        .json({ error: "Too many requests — please slow down." });
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

const orderDocId = (clientId, orderNo) => `${clientId}_${orderNo}`;
const emailDocId = (clientId, uid) => `${clientId}_${uid}`;
const emailIndexId = (clientId, date) => `${clientId}_${date}`;

function getOrderMap(dateStr, clientId) {
  if (!dailyOrderCache[dateStr]) dailyOrderCache[dateStr] = {};
  if (!dailyOrderCache[dateStr][clientId])
    dailyOrderCache[dateStr][clientId] = new Map();
  return dailyOrderCache[dateStr][clientId];
}

function getEmailSet(dateStr, clientId) {
  if (!dailyEmailCache[dateStr]) dailyEmailCache[dateStr] = {};
  if (!dailyEmailCache[dateStr][clientId])
    dailyEmailCache[dateStr][clientId] = new Set();
  return dailyEmailCache[dateStr][clientId];
}

function scheduleMidnightReset() {
  const now = new Date();
  const next = new Date(now);
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

async function warmOrderCache(clientId) {
  const date = todayStr();
  const orderMap = getOrderMap(date, clientId);
  if (orderMap.size > 0) return;
  try {
    const q = query(
      collection(db, "orders"),
      where("deliveryDate", "==", date),
      where("clientId", "==", clientId),
    );
    const snap = await getDocs(q);
    snap.forEach((d) => orderMap.set(d.id, d.data()));
    log(`📦 Cache warmed for ${clientId}/${date}: ${orderMap.size} orders`);
  } catch (e) {
    warn(`Cache warm failed for ${clientId}: ${e.message}`);
  }
}

async function warmEmailCache(clientId) {
  const date = todayStr();
  const emailSet = getEmailSet(date, clientId);
  if (emailSet.size > 0) return;
  try {
    const indexSnap = await getDoc(
      doc(db, "processed_emails_index", emailIndexId(clientId, date)),
    );
    if (indexSnap.exists()) {
      (indexSnap.data().uids || []).forEach((u) => emailSet.add(u));
      log(
        `📬 Email cache warmed for ${clientId}/${date}: ${emailSet.size} UIDs`,
      );
    }
  } catch (e) {
    warn(`Email cache warm failed for ${clientId}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ FIX 5: recordProcessedEmail — do NOT add incomplete_data UIDs to emailSet
//
// OLD BUG: emailSet.add(uidStr) was called unconditionally for ALL statuses,
// including 'incomplete_data'. This meant Guard 2 (emailSet.has) fired on the
// next cycle BEFORE Guard 3 could check for 'incomplete_data' and allow retry.
// Result: any order that failed field validation was permanently lost until
// server restart, even though the email remained unread in IMAP.
//
// FIX: Only add to emailSet for truly final statuses. 'incomplete_data' emails
// stay OUT of the in-memory set so Guard 3 gets a chance to retry them.
// ═══════════════════════════════════════════════════════════════════════════
async function recordProcessedEmail(uidStr, orderNo, status, clientId) {
  const date = todayStr();
  const emailSet = getEmailSet(date, clientId);

  // ✅ FIX 5: only cache in memory if status is truly final
  if (status !== "incomplete_data") {
    emailSet.add(uidStr);
  }

  try {
    await setDoc(doc(db, "processed_emails", emailDocId(clientId, uidStr)), {
      status,
      orderNo: orderNo || "",
      clientId,
      processedAt: new Date().toISOString(),
    });
    const indexRef = doc(
      db,
      "processed_emails_index",
      emailIndexId(clientId, date),
    );
    const indexSnap = await getDoc(indexRef);
    const existing = indexSnap.exists() ? indexSnap.data().uids || [] : [];
    if (!existing.includes(uidStr)) {
      await setDoc(indexRef, { uids: [...existing, uidStr] }, { merge: true });
    }
  } catch (e) {
    warn(`recordProcessedEmail failed: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-ORDER PROCESSING LOCK
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
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ||
  "http://localhost:8081,http://localhost:19006,https://migme.onrender.com"
)
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"],
  }),
);

app.get("/", (_req, res) => {
  const today = todayStr();
  let orderCount = 0,
    emailCount = 0;
  if (dailyOrderCache[today]) {
    for (const map of Object.values(dailyOrderCache[today]))
      orderCount += map.size;
  }
  if (dailyEmailCache[today]) {
    for (const set of Object.values(dailyEmailCache[today]))
      emailCount += set.size;
  }
  res.send(
    `MIGME Backend ✅ | Date: ${today}` +
      ` | Orders in cache: ${orderCount}` +
      ` | Emails processed today: ${emailCount}` +
      ` | Active pollers: ${globalStopFns.size}`,
  );
});

app.get("/logs", rateLimit(30), (req, res) => {
  const token = process.env.LOG_TOKEN;
  if (token && req.query.token !== token)
    return res.status(403).send("Forbidden");
  try {
    const lines = fs
      .readFileSync(LOG_FILE, "utf8")
      .split("\n")
      .slice(-200)
      .join("\n");
    res.type("text/plain").send(lines);
  } catch (_) {
    res.send("No log file yet.");
  }
});

function requireAdmin(req, res, next) {
  if (!safeCompareKey(req.headers["x-admin-key"], process.env.ADMIN_API_KEY)) {
    warn(
      `Admin route ${req.method} ${req.path}: rejected key ${maskKey(req.headers["x-admin-key"] || "")}`,
    );
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

app.post("/api/clients", rateLimit(5), requireAdmin, async (req, res) => {
  try {
    const { businessName, email, appPassword, password } = req.body;
    if (!businessName || !email || !appPassword || !password) {
      return res.status(400).json({
        error:
          "Missing required fields: businessName, email, appPassword, password",
      });
    }
    const encryptedAppPassword = encrypt(appPassword);
    const passwordHash = await hashPassword(password);
    const clientEmail = email.trim().toLowerCase();
    const docRef = await addDoc(collection(db, "clients"), {
      businessName: businessName.trim(),
      email: clientEmail,
      appPassword: encryptedAppPassword,
      passwordHash,
      active: true,
      createdAt: new Date().toISOString(),
    });
    try {
      await authAdmin.createUser({
        uid: docRef.id,
        email: clientEmail,
        password,
      });
    } catch (authErr) {
      warn(
        `POST /api/clients: Auth user creation non-fatal: ${authErr.message}`,
      );
    }
    log(`Client created: ${businessName} (${docRef.id})`);
    res.json({ id: docRef.id, businessName });
  } catch (e) {
    warn(`POST /api/clients error: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post(
  "/api/auth/create-user",
  rateLimit(5),
  requireAdmin,
  async (req, res) => {
    try {
      const { uid, email, password } = req.body;
      if (!uid || !email || !password) {
        return res
          .status(400)
          .json({ error: "Missing uid, email, or password" });
      }
      await authAdmin.createUser({ uid, email, password });
      log(`Auth user created for ${email} (${uid})`);
      res.json({ success: true });
    } catch (e) {
      warn(`POST /api/auth/create-user error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  },
);

app.post(
  "/api/auth/verify-password",
  rateLimit(10),
  requireAdmin,
  async (req, res) => {
    try {
      const { uid, password } = req.body;
      if (!uid || !password) {
        return res.status(400).json({ error: "Missing uid or password" });
      }
      const snap = await getDoc(doc(db, "clients", uid));
      if (!snap.exists()) return res.json({ valid: false });
      const data = snap.data();
      const stored = data.passwordHash || data.password;
      const valid =
        stored && stored.includes(":")
          ? await verifyPassword(password, stored)
          : password === stored;
      res.json({ valid });
    } catch (e) {
      warn(`POST /api/auth/verify-password error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete(
  "/api/data/client/:clientId/range",
  requireAdmin,
  async (req, res) => {
    try {
      const { clientId } = req.params;
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({ error: "startDate and endDate required" });
      }
      const q = query(
        collection(db, "orders"),
        where("clientId", "==", clientId),
        where("createdAt", ">=", new Date(startDate).toISOString()),
        where("createdAt", "<=", new Date(endDate).toISOString()),
      );
      const snap = await getDocs(q);
      let deleted = 0;
      for (const d of snap.docs) {
        await deleteDoc(doc(db, "orders", d.id));
        deleted++;
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      let indexDeleted = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().slice(0, 10);
        const indexRef = doc(
          db,
          "processed_emails_index",
          `${clientId}_${dateStr}`,
        );
        const s = await getDoc(indexRef);
        if (s.exists()) {
          await deleteDoc(indexRef);
          indexDeleted++;
        }
      }
      log(
        `Admin deleted ${deleted} orders + ${indexDeleted} index entries for client ${clientId} [${startDate} → ${endDate}]`,
      );
      res.json({ deletedOrders: deleted, deletedIndexEntries: indexDeleted });
    } catch (e) {
      warn(`DELETE /api/data/client/:clientId/range error: ${e.message}`);
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete(
  "/api/data/client/:clientId/order/:orderNo",
  requireAdmin,
  async (req, res) => {
    try {
      const { clientId, orderNo } = req.params;
      const docId = `${clientId}_${orderNo}`;
      const ref = doc(db, "orders", docId);
      const snap = await getDoc(ref);
      if (!snap.exists())
        return res.status(404).json({ error: "Order not found" });
      await deleteDoc(ref);
      log(`Admin deleted order ${docId}`);
      res.json({ deleted: docId });
    } catch (e) {
      warn(
        `DELETE /api/data/client/:clientId/order/:orderNo error: ${e.message}`,
      );
      res.status(500).json({ error: e.message });
    }
  },
);

app.delete("/api/data/client/:clientId/all", requireAdmin, async (req, res) => {
  try {
    const { clientId } = req.params;
    let total = 0;
    const ordersSnap = await getDocs(
      query(collection(db, "orders"), where("clientId", "==", clientId)),
    );
    for (const d of ordersSnap.docs) {
      await deleteDoc(doc(db, "orders", d.id));
      total++;
    }
    const emailsSnap = await getDocs(
      query(
        collection(db, "processed_emails"),
        where("clientId", "==", clientId),
      ),
    );
    for (const d of emailsSnap.docs) {
      await deleteDoc(doc(db, "processed_emails", d.id));
      total++;
    }
    const indexSnap = await getDocs(collection(db, "processed_emails_index"));
    for (const d of indexSnap.docs) {
      if (d.id.startsWith(`${clientId}_`)) {
        await deleteDoc(doc(db, "processed_emails_index", d.id));
        total++;
      }
    }
    const menuSnap = await getDocs(
      query(collection(db, "menuItems"), where("clientId", "==", clientId)),
    );
    for (const d of menuSnap.docs) {
      await deleteDoc(doc(db, "menuItems", d.id));
      total++;
    }
    const catSnap = await getDocs(
      query(collection(db, "categories"), where("clientId", "==", clientId)),
    );
    for (const d of catSnap.docs) {
      await deleteDoc(doc(db, "categories", d.id));
      total++;
    }
    const execSnap = await getDocs(
      query(collection(db, "executives"), where("clientId", "==", clientId)),
    );
    for (const d of execSnap.docs) {
      await deleteDoc(doc(db, "executives", d.id));
      total++;
    }
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
// ═══════════════════════════════════════════════════════════════════════════
let pdfParseLib = require("pdf-parse");
let pdfParse = pdfParseLib.default || pdfParseLib;
if (typeof pdfParse !== "function") pdfParse = async () => ({ text: "" });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR REGISTRY
// ═══════════════════════════════════════════════════════════════════════════
const {
  VENDOR_MAP,
  VENDOR_RULES,
  VENDOR_DOM_CONFIGS,
  VENDOR_SKIP_SUBJECTS,
} = require("./vendor-rules");

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
async function markEmailAsRead(connection, uid) {
  try {
    await connection.addFlags(uid, ["\\Seen"]);
    log(`   ✉️  UID ${uid} marked as read`);
  } catch (e) {
    warn(`   ⚠️  Could not mark UID ${uid} as read: ${e.message}`);
  }
}

function getMissingFields(orderData) {
  const missing = [];
  const name = (orderData.customerName || "").trim();
  if (!name || name === "N/A" || name === "Unknown")
    missing.push("customerName");
  if (
    !orderData.items ||
    !Array.isArray(orderData.items) ||
    orderData.items.length === 0
  )
    missing.push("items");
  if (!(orderData.trainInfo || "").trim() || orderData.trainInfo === "N/A")
    missing.push("trainInfo");
  const date = (orderData.deliveryDate || "").trim();
  if (!date || date === "N/A" || date === "YYYY-MM-DD")
    missing.push("deliveryDate");
  return missing.length > 0 ? missing.join(", ") : null;
}

const cleanFloat = (val) =>
  parseFloat((val || 0).toString().replace(/[^\d.]/g, "")) || 0;

// ── HTML to plain text — used for AI path (text/plain vendors) ──────────────
function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/th>/gi, " | ")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// DOM ORDER PARSER — text/html vendors only
//
// ✅ FIX 1: Removed decodeQP(htmlBody) call.
//    mailparser's simpleParser already decodes quoted-printable encoding.
//    Calling decodeQP again on already-decoded HTML corrupted:
//      - = signs in HTML attributes and CSS (e.g. color=#3d3d3d became color=3d3d3d)
//      - ₹ rupee symbol (multi-byte UTF-8, mangled by second QP decode)
//      - URL query strings with & and = characters
//    This caused Cheerio to find nothing, DOM parse returned null every time,
//    and all railfood/railreceipt orders fell through to AI with broken text.
//
// ✅ FIX 2: selfContained field support (railfood orderNo).
//    When cfg.selfContained is true, the value is in the SAME <td> as the label
//    (e.g. "REL FOOD Ref.No : 1050866" all in one cell). The engine now extracts
//    the last number from the label cell's own text instead of reading a sibling.
//    Already present in original code — confirmed correct, no change needed.
//
// ✅ FIX 3: stripQtyPrefix support (railreceipt "x6" → 6).
//    parseInt("x6") returns NaN → was defaulting every item to qty=1.
//    Now strips vendor-defined prefix before parseInt.
//
// ✅ FIX 4: stripCurrencyPrefix support (railreceipt "₹ 180" → 180).
//    parseFloat("₹ 180") returns NaN → was setting every item price to 0.
//    Now strips vendor-defined currency prefix before parseFloat.
// ═══════════════════════════════════════════════════════════════════════════
function parseDomOrder(htmlBody, vendorName, vendorType, domConfig, tag) {
  try {
    // ✅ FIX 1: Use htmlBody directly — mailparser already decoded quoted-printable.
    // REMOVED: const cleanHtml = decodeQP(htmlBody);
    // REMOVED: const $ = cheerio.load(cleanHtml);
    const $ = cheerio.load(htmlBody);
    const order = { vendorName };

    // ── 1a. Extract header <th> cells (Rajbhog/HomeBytes style) ────────────
    const _thCells = [];
    $("thead th").each((_, el) => {
      _thCells.push($(el).text().replace(/\s+/g, " ").trim());
    });

    // ── 1b. Extract flat key/value fields ────────────────────────────────
    for (const [fieldName, cfg] of Object.entries(domConfig.fields)) {
      let rawValue = null;

      // headerThIndex fields: value is pre-extracted from header <th>
      if (cfg.headerThIndex !== undefined && _thCells[cfg.headerThIndex]) {
        rawValue = _thCells[cfg.headerThIndex];
      } else {
        const labelsToTry = [cfg.labelText];
        if (cfg.fallback) labelsToTry.push(cfg.fallback);

        for (const labelText of labelsToTry) {
          $("td, th").each((_, el) => {
            // Skip wrapper cells that contain child td/th (e.g. RailRecipe's
            // nested outer td wrappers around inner label-value cells)
            if ($(el).find("td, th").length > 0) return;
            const cellText = $(el).text().replace(/\s+/g, " ").trim();
            if (cellText.includes(labelText)) {
              if (cfg.selfContained) {
                // Try all matches — last match (deepest in DOM) wins.
                // This avoids picking merged header cells that happen to contain
                // the label text but may have truncated/wrong values at the end.
                // 1) Vendor-defined custom regex extract (e.g. greeting "Dear <name>,")
                if (cfg.selfContainedExtract) {
                  const m = cellText.match(cfg.selfContainedExtract);
                  if (m) rawValue = m[1] || m[0];
                }
                // 2) Colon separator: "Label : Value"
                const colonMatch = cellText.match(/:\s*(.+?)\s*$/);
                if (colonMatch) {
                  rawValue = colonMatch[1];
                } else {
                  // 3) Trailing number: "Label 12345"
                  const numMatch = cellText.match(/(\d+)\s*$/);
                  if (numMatch) {
                    rawValue = numMatch[1];
                  }
                }
              } else {
                const sibling = $(el).next("td, th");
                if (sibling.length) {
                  rawValue = sibling.text().replace(/\s+/g, " ").trim();
                  return false;
                }
              }
            }
          });
          if (rawValue !== null) break;
        }
      }

      // Strip vendor-defined value prefix if present (e.g. Zoop ": " prefix)
      if (
        rawValue !== null &&
        cfg.valuePrefix &&
        rawValue.startsWith(cfg.valuePrefix)
      ) {
        rawValue = rawValue.slice(cfg.valuePrefix.length);
      }

      try {
        order[fieldName] = rawValue !== null ? cfg.transform(rawValue) : null;
      } catch (e) {
        warn(`${tag} DOM field "${fieldName}" transform error: ${e.message}`);
        order[fieldName] = null;
      }
    }

    // ── 2. Extract items table ─────────────────────────────────────────────
    const { columnMap, itemCellSplit, footerLabels } = domConfig.itemsTable;
    const colIndex = {};
    let headerFound = false;
    const items = [];

    $("table tr").each((_, tr) => {
      const cells = $(tr).find("td, th");
      if (!cells.length) return;

      // ── Detect header row ────────────────────────────────────────────────
      if (!headerFound) {
        // Skip rows that don't have exactly the right number of columns
        // (prevents nested wrapper rows with embedded header text from being detected)
        if (cells.length !== Object.keys(columnMap).length) return;

        let matchCount = 0;
        cells.each((i, td) => {
          const text = $(td).text().trim().toLowerCase();
          for (const [headerText, fieldName] of Object.entries(columnMap)) {
            if (text === headerText.toLowerCase()) {
              colIndex[fieldName] = i;
              matchCount++;
            }
          }
        });
        if (matchCount === Object.keys(columnMap).length) headerFound = true;
        return;
      }

      // ── Footer detection: RailFood pattern (first empty + second=label) OR Zoop pattern (first=label) ──
      const firstText = cells.eq(0).text().trim();
      const secondText = cells.eq(1).text().trim();
      const isFooter =
        (!firstText &&
          footerLabels.some((l) =>
            secondText.toLowerCase().includes(l.toLowerCase()),
          )) ||
        footerLabels.some((l) =>
          firstText.toLowerCase().includes(l.toLowerCase()),
        );
      if (isFooter) {
        // Capture footer total if configured and this row matches the capture label
        if (domConfig.itemsTable.captureFooterTotal) {
          const captureLabel =
            domConfig.itemsTable.captureFooterTotal.toLowerCase();
          // Use startsWith (normalized) so "Total" doesn't match "Subtotal"
          // but still matches "Grand Total (Inclusive of all taxes)" (Yatri Restro)
          const normalizeFooter = (s) =>
            s.toLowerCase().replace(/:+$/g, "").trim();
          if (
            normalizeFooter(firstText).startsWith(captureLabel) ||
            normalizeFooter(secondText).startsWith(captureLabel)
          ) {
            const lastCell = cells.last();
            order._itemsTotal =
              parseFloat(lastCell.text().replace(/[^\d.]/g, "")) || 0;
            log(`${tag} Captured _itemsTotal: ${order._itemsTotal}`);
            return false; // break after capturing Total
          }
          return; // keep scanning footer rows to reach Total
        }
        return false;
      }

      // ── Skip rows where the item-name cell still contains a header label ──
      // (handles wrapper/summary rows that appear after the header in some emails)
      const _rawItemText = cells
        .eq(colIndex["rawItem"])
        .text()
        .trim()
        .toLowerCase();
      if (Object.keys(columnMap).some((h) => _rawItemText === h.toLowerCase()))
        return;

      // ── Parse item row ───────────────────────────────────────────────────
      const rawItemCell = cells.eq(colIndex["rawItem"]);
      const priceText = cells.eq(colIndex["price"]).text().trim();
      const qtyText = cells.eq(colIndex["qty"]).text().trim();

      let itemName = "",
        itemDesc = "";
      if (itemCellSplit === "br") {
        const parts = (rawItemCell.html() || "")
          .split(/<br\s*\/?>/i)
          .map((p) => cheerio.load(p).text().trim())
          .filter(Boolean);
        itemName = parts[0] || "";
        itemDesc = parts[1] || "";
      } else if (domConfig.itemsTable.itemNameFromP) {
        // ── Railreceipt: <p> = name, <small> = description ───────────────
        itemName = rawItemCell.find("p").first().text().trim();
        itemDesc = rawItemCell.find("small").text().trim();
      } else {
        const parts = rawItemCell
          .text()
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        itemName = parts[0] || "";
        itemDesc = parts[1] || "";
      }

      if (!itemName || !qtyText || !priceText) return;

      // ✅ FIX 4: Strip vendor-defined currency prefix before parseFloat.
      // Handles railreceipt "₹ 180" format — parseFloat("₹ 180") returns NaN.
      // For all other vendors stripCurrencyPrefix is undefined → no change.
      const cleanPriceText = domConfig.itemsTable.stripCurrencyPrefix
        ? priceText.replace(domConfig.itemsTable.stripCurrencyPrefix, "").trim()
        : priceText;
      const price = parseFloat(cleanPriceText) || 0;

      // ✅ FIX 3: Strip vendor-defined quantity prefix before parseInt.
      // Handles railreceipt "x6" format — parseInt("x6") returns NaN → was 1.
      // For all other vendors stripQtyPrefix is undefined → no change.
      const cleanQtyText = domConfig.itemsTable.stripQtyPrefix
        ? qtyText
            .replace(
              new RegExp("^" + domConfig.itemsTable.stripQtyPrefix, "i"),
              "",
            )
            .trim()
        : qtyText;
      const quantity = parseInt(cleanQtyText, 10) || 1;

      const name = itemDesc ? `${itemName} ${itemDesc}` : itemName;

      // Capture amount column for cross-check if vendor defines it
      let itemAmount = null;
      if (
        domConfig.itemsTable.enableQtyCrossCheck &&
        colIndex["amountCol"] !== undefined
      ) {
        const amountText = cells.eq(colIndex["amountCol"]).text().trim();
        const cleanAmountText = domConfig.itemsTable.stripCurrencyPrefix
          ? amountText
              .replace(domConfig.itemsTable.stripCurrencyPrefix, "")
              .trim()
          : amountText;
        itemAmount = parseFloat(cleanAmountText) || null;
      }

      log(`${tag}      DOM item: "${name}" ₹${price} × ${quantity}`);
      const itemObj = { name, quantity, price };
      if (itemAmount !== null) itemObj._amount = itemAmount;
      items.push(itemObj);
    });

    if (!headerFound || items.length === 0) {
      warn(
        `${tag} DOM parser: items table not found or empty — falling back to AI`,
      );
      return null;
    }

    order.items = items;
    order.subTotal = items.reduce((s, it) => s + it.price * it.quantity, 0);

    const finalOrder = domConfig.postProcess
      ? domConfig.postProcess(order)
      : order;

    finalOrder.vendorName = vendorName;
    finalOrder.tax = finalOrder.tax ?? 0;
    finalOrder.deliveryCharge = finalOrder.deliveryCharge ?? 0;
    finalOrder.remark = finalOrder.remark ?? "";

    log(
      `${tag} ✅ DOM parse complete — ${items.length} item(s), ₹${finalOrder.totalAmount}`,
    );
    return finalOrder;
  } catch (e) {
    err(`${tag} parseDomOrder crashed: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — AWS BEDROCK BASE CALL
// ═══════════════════════════════════════════════════════════════════════════
async function callBedrockAI(prompt) {
  const keyId = process.env.AWS_ACCESS_KEY_ID || "";
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || "";
  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK || "";
  const endpointUrl = process.env.AWS_BEDROCK_ENDPOINT || "";
  const useBearer = bearerToken || keyId.startsWith("BedrockAPIKey");

  if (useBearer) {
    const token =
      bearerToken ||
      (secretKey.startsWith("ABSK")
        ? Buffer.from(secretKey.substring(4), "base64").toString("utf-8")
        : "");
    if (!token) {
      err("Bearer token not resolved");
      return null;
    }
    const url =
      endpointUrl || "https://bedrock-runtime.ap-south-1.amazonaws.com";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          "x-api-key": keyId,
        },
        body: JSON.stringify({
          modelId: process.env.AWS_BEDROCK_MODEL || "qwen.qwen3-vl-235b-a22b",
          system: [
            {
              text: "You are a strict data extraction API. Return a SINGLE, VALID JSON object without markdown formatting.",
            },
          ],
          messages: [{ role: "user", content: [{ text: prompt }] }],
        }),
      });
      if (!res.ok) {
        err(`Bearer API ${res.status}: ${await res.text()}`);
        return null;
      }
      const json = await res.json();
      return (
        json.output?.message?.content?.[0]?.text ||
        json.content?.[0]?.text ||
        JSON.stringify(json)
      );
    } catch (e) {
      err(`Bearer API error: ${e.message}`);
      return null;
    }
  }

  if (!keyId || !secretKey) {
    err("No AWS credentials found.");
    return null;
  }
  try {
    const client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || "ap-south-1",
      credentials: { accessKeyId: keyId, secretAccessKey: secretKey },
    });
    const command = new ConverseCommand({
      modelId: process.env.AWS_BEDROCK_MODEL || "qwen.qwen3-vl-235b-a22b",
      system: [
        {
          text: "You are a strict data extraction API. Return a SINGLE, VALID JSON object without markdown formatting.",
        },
      ],
      messages: [{ role: "user", content: [{ text: prompt }] }],
    });
    const result = await client.send(command);
    return result.output?.message?.content?.[0]?.text;
  } catch (e) {
    err(`Bedrock SDK error: ${e.name} - ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — RETRY WITH EXPONENTIAL BACKOFF
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
  err("All AI retry attempts exhausted");
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI OUTPUT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
function validateOrderData(data, vendorType) {
  const errors = [];
  const warnings = [];

  if (!data.deliveryDate || !data.deliveryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push(`Invalid deliveryDate: "${data.deliveryDate}"`);
  } else {
    const daysDiff = (new Date(data.deliveryDate) - new Date()) / 86400000;
    if (daysDiff < -1 || daysDiff > 30) {
      warnings.push(
        `Suspicious deliveryDate: ${data.deliveryDate} (${daysDiff.toFixed(0)} days from today)`,
      );
    }
  }

  if (data.deliveryTime && !data.deliveryTime.match(/^\d{2}:\d{2}$/)) {
    warnings.push(`Invalid deliveryTime format: "${data.deliveryTime}"`);
    data.deliveryTime = "";
  }

  if (!data.items || data.items.length === 0) {
    errors.push("No items found");
  } else {
    const qtyHardCap = vendorType === "railfood" ? 500 : 200;
    for (const item of data.items) {
      if (item.quantity > qtyHardCap) {
        warnings.push(
          `Suspiciously high quantity for "${item.name}": ${item.quantity} (capped at ${qtyHardCap})`,
        );
        item.quantity = qtyHardCap;
      }
      if (item.quantity <= 0) item.quantity = 1;
      if (item.price < 0) {
        warnings.push(`Negative price for "${item.name}"`);
        item.price = 0;
      }
      if (item.price > 5000) {
        warnings.push(
          `Unusually high price for "${item.name}": ₹${item.price}`,
        );
      }
    }
  }

  if (
    data.totalAmount <= 0 &&
    vendorType !== "travelkhana" &&
    vendorType !== "yatribhojan"
  ) {
    warnings.push("totalAmount is 0 or missing");
  }
  if (data.totalAmount > 10000) {
    warnings.push(`Unusually high totalAmount: ₹${data.totalAmount}`);
  }

  if (data.coach && data.coach.length > 20) {
    warnings.push(`Coach value suspiciously long: "${data.coach}"`);
  }

  if (data.contactNo) {
    const raw = data.contactNo.trim();
    const allDigits = raw.replace(/\D/g, "");
    if (allDigits.length === 10) {
      data.contactNo = allDigits;
    } else if (allDigits.length > 10) {
      const match = raw.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
      if (match) {
        data.contactNo = match[1];
      } else {
        const first10 = allDigits.slice(0, 10);
        if (/^[6-9]/.test(first10)) {
          data.contactNo = first10;
          warnings.push(
            `Multiple contact numbers — using first: "${first10}" from "${raw}"`,
          );
        } else {
          warnings.push(`Could not extract valid mobile from: "${raw}"`);
          data.contactNo = "";
        }
      }
    } else {
      warnings.push(`Contact number not 10 digits: "${raw}"`);
      data.contactNo = "";
    }
  }

  if (!["COD", "Prepaid"].includes(data.paymentType)) {
    warnings.push(
      `Unknown paymentType "${data.paymentType}" — defaulting to COD`,
    );
    data.paymentType = "COD";
  }

  return { errors, warnings, data };
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — FILL MISSING FIELDS FROM DOM PARSE
// ── When DOM parser gets most fields right but misses a few (e.g. deliveryDate
//    format changed), send a TARGETED AI prompt asking only for those missing
//    fields. Saves cost vs re-processing the entire email through AI.
// ═══════════════════════════════════════════════════════════════════════════
async function fillMissingFields(emailText, missingFieldsStr, tag) {
  const fieldDescriptions = {
    deliveryDate: "deliveryDate in YYYY-MM-DD format (e.g. 2026-06-06)",
    deliveryTime: "deliveryTime in HH:MM 24-hour format (e.g. 15:20)",
    customerName: "customerName (full name of the person who placed the order)",
    trainInfo:
      "trainInfo (train number and name, e.g. 22932 / JSM BDTS SF EXP)",
    coach: "coach (coach/berth number, e.g. B4/63)",
    contactNo: "contactNo (10-digit mobile number)",
    orderNo: "orderNo (order reference number)",
    paymentType: "paymentType (COD or Prepaid)",
    items: "items (array of {name, quantity, price})",
    totalAmount: "totalAmount (total order value as number)",
    tax: "tax (GST/tax amount as number)",
  };

  const fieldList = missingFieldsStr
    .split(", ")
    .map((f) => fieldDescriptions[f] || f)
    .join(", ");

  const prompt = `Extract ONLY the following fields from this train food delivery order email.
Return a SINGLE VALID JSON object containing ONLY these fields — no extra fields, no markdown formatting, no explanation.

Fields to extract: ${fieldList}

Rules:
- deliveryDate must be YYYY-MM-DD format
- deliveryTime must be HH:MM 24-hour format
- items must be an array of {name: string, quantity: number, price: number}
- totalAmount, tax must be plain numbers (not strings)
- If a field is not found in the email, set it to null

Email:
${emailText}`;

  const result = await callBedrockWithRetry(prompt);
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch (_) {}
  const m = result.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch (_) {}
  }
  const obj = result.match(/\{[\s\S]*\}/);
  if (obj) {
    try {
      return JSON.parse(obj[0]);
    } catch (_) {}
  }
  warn(`${tag} fillMissingFields: could not parse AI response as JSON`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — PARSE NEW ORDER EMAIL
// ═══════════════════════════════════════════════════════════════════════════
async function parseWithAWS(rawText, subject, senderEmail) {
  const lowerFrom = senderEmail.toLowerCase();
  let vendorName = "",
    vendorType = "generic";

  for (const v of VENDOR_MAP) {
    if (lowerFrom.includes(v.match)) {
      vendorName = v.name;
      vendorType = v.type;
      break;
    }
  }
  if (!vendorName) {
    try {
      const parts = lowerFrom.split("@")[1]?.split(".") || [];
      const root = parts.length > 2 ? parts[parts.length - 2] : parts[0];
      vendorName = root.charAt(0).toUpperCase() + root.slice(1);
    } catch (_) {}
  }

  log(`   🏷️ Vendor: ${vendorName || "Unknown"} (${vendorType})`);
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
   VERIFY: Price × Qty ≈ Row Total — BUT ONLY if the vendor rule above does NOT say "DO NOT verify".
   If the vendor rule explicitly says "DO NOT verify Price × Quantity = Total", skip this check entirely.
4. DATE: always output YYYY-MM-DD.
5. DELIVERY TIME: ETA only, HH:MM 24hr format.
6. PHONE: 10-digit mobile number only.
7. COACH: capture the FULL coach+seat value.
   - Single combined field (e.g. "Coach/Seat: M2/ 74"): normalise to "COACH/SEAT" (e.g. "M2/74").
   - Two separate fields (e.g. IRCTC "Coach No: B6" + "Seat No: 67"): combine as "CoachValue/SeatValue".
   - NEVER truncate the seat number.
8. PAYMENT: "COD"/"Cash on Delivery"/"CASH_ON_DELIVERY"→"COD"; "PRE_PAID"/"PREPAID"/"Online"/"ONLINE"→"Prepaid".

JSON SCHEMA (return this exact structure, no markdown):
{"_thinking":"...","deliveryDate":"YYYY-MM-DD","deliveryTime":"HH:MM","items":[{"name":"","quantity":1,"price":0}],"subTotal":0,"tax":0,"deliveryCharge":0,"totalAmount":0,"orderNo":"","vendorName":"${vendorName}","customerName":"","contactNo":"","trainInfo":"","coach":"","paymentType":"COD","remark":""}

SENDER: "${senderEmail}" | SUBJECT: "${subject}"
BODY:
${rawText.substring(0, 15000)}`;

  try {
    const raw = await callBedrockWithRetry(prompt);
    if (!raw) {
      err("Empty response from Bedrock after retries");
      return null;
    }

    const data = JSON.parse(raw.replace(/```json|```/g, "").trim());
    data.orderNo = data.orderNo?.toString().trim() || "";
    data.pnr = data.pnr?.toString().trim() || "";
    if (!data.orderNo && !data.pnr) data.orderNo = `AUTO_${Date.now()}`;
    data.vendorName = vendorName;

    if (Array.isArray(data.items)) {
      let sub = 0;
      for (const item of data.items) {
        item.quantity = parseInt(item.quantity, 10) || 1;
        item.price = parseFloat(item.price) || 0;
        if (item.quantity <= 0) item.quantity = 1;
        sub += item.price * item.quantity;
        log(
          `      ${item.name}: ₹${item.price} × ${item.quantity} = ₹${item.price * item.quantity}`,
        );
      }
      if (
        vendorType !== "railfood" &&
        Math.abs((parseFloat(data.subTotal) || 0) - sub) > 5
      ) {
        warn(`      SubTotal mismatch — correcting to ₹${sub}`);
        data.subTotal = sub;
      }
    }

    const {
      errors,
      warnings,
      data: validatedData,
    } = validateOrderData(data, vendorType);
    if (warnings.length > 0)
      warn(`   ⚠️ Validation warnings: ${warnings.join(" | ")}`);
    if (errors.length > 0) {
      err(`   ❌ Validation FAILED: ${errors.join(" | ")}`);
      return null;
    }
    return validatedData;
  } catch (e) {
    err(`Parse error: ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI — PARSE UPDATE EMAIL
// ═══════════════════════════════════════════════════════════════════════════
async function parseUpdateEmail(rawText, subject, existingOrder) {
  const prompt = `
You are an ORDER UPDATE extractor. This email is a CHANGE NOTIFICATION for an existing order.

Current DB values:
- Coach/Seat: ${existingOrder.coach || "N/A"}
- Delivery Date: ${existingOrder.deliveryDate || "N/A"}
- Delivery Time: ${existingOrder.deliveryTime || "N/A"}
- Contact No: ${existingOrder.contactNo || "N/A"}
- Train Info: ${existingOrder.trainInfo || "N/A"}
- Payment: ${existingOrder.paymentType || "N/A"}
- Total: ${existingOrder.totalAmount || "N/A"}
- Items: ${JSON.stringify(existingOrder.items || [])}

STRICT RULES:
1. A field is changed ONLY if the email LITERALLY states it is being updated.
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
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    err(`Update parse error: ${e.message}`);
    return null;
  }
}

function buildChangePayload(existingOrder, updateResult) {
  const FIELDS = [
    "coach",
    "deliveryDate",
    "deliveryTime",
    "contactNo",
    "trainInfo",
    "paymentType",
    "totalAmount",
    "items",
    "subTotal",
  ];
  const changes = {};
  const changeLog = [];

  for (const field of FIELDS) {
    const aiVal = updateResult[field];
    if (aiVal === null || aiVal === undefined) continue;
    if (field === "items") {
      if (JSON.stringify(aiVal) === JSON.stringify(existingOrder.items || []))
        continue;
      changes.items = aiVal;
      changeLog.push("items updated");
      continue;
    }
    const newVal = aiVal.toString().trim();
    const oldVal = (existingOrder[field] || "").toString().trim();
    if (
      !newVal ||
      newVal === oldVal ||
      newVal === "N/A" ||
      newVal === "YYYY-MM-DD" ||
      newVal === "HH:MM"
    )
      continue;
    changes[field] = aiVal;
    changeLog.push(`${field}: "${oldVal}" → "${newVal}"`);
  }
  return { changes, changeLog };
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH SINCE — TESTING MODE
// ─────────────────────────────────────────────────────────────────────────
// PRODUCTION CHANGE (when going live):
//   Replace the IMAP search in runPollingCycle from:
//     connection.search([['SINCE', FETCH_SINCE]], ...)
//   To:
//     connection.search(['UNSEEN'], ...)
//   Then delete FETCH_SINCE_FIXED, getFetchSince(), and the FETCH_SINCE
//   variable inside runPollingCycle — they become dead code.
//   Optionally fill in markEmailAsRead() to mark emails as read after saving.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════
async function processEmail(
  item,
  connection,
  clientId,
  orderMap,
  emailSet,
  tag,
  blockedSenders,
  sessionUIDCache,
  clientCreatedAt,
) {
  const uid = item.attributes.uid;
  const uidStr = uid.toString();

  try {
    // ── 5-layer duplicate guard ───────────────────────────────────────────
    if (sessionUIDCache.has(uid)) return; // Guard 1

    if (emailSet.has(uidStr)) {
      // Guard 2
      sessionUIDCache.add(uid);
      return;
    }

    try {
      // Guard 3
      const processedSnap = await getDoc(
        doc(db, "processed_emails", emailDocId(clientId, uidStr)),
      );
      if (processedSnap.exists()) {
        const prevStatus = processedSnap.data().status;
        if (prevStatus !== "incomplete_data") {
          log(`${tag} UID ${uidStr} already in DB (${prevStatus}) — skipping`);
          emailSet.add(uidStr);
          sessionUIDCache.add(uid);
          await markEmailAsRead(connection, uid);
          return;
        }
        log(`${tag} UID ${uidStr} was incomplete — retrying parse`);
      }
    } catch (e) {
      warn(
        `${tag} Firestore pre-check failed for UID ${uidStr}: ${e.message} — processing anyway`,
      );
    }

    const fullMsg = await connection.search([["UID", uid]], {
      bodies: [""],
      markSeen: false,
    });
    if (!fullMsg || fullMsg.length === 0) return;
    const parsed = await simpleParser(
      fullMsg[0].parts.find((p) => p.which === "").body,
    );

    // Guard 4 — date filter: skip emails older than when this client was added
    const emailDate = parsed.date ? new Date(parsed.date) : new Date();
    const FETCH_SINCE = new Date(clientCreatedAt || Date.now());
    if (emailDate < FETCH_SINCE) {
      // Guard 4 — old email, mark as read so it never appears again
      sessionUIDCache.add(uid);
      await markEmailAsRead(connection, uid);
      return;
    }

    const subject = parsed.subject || "No Subject";
    const fromAddress =
      parsed.from?.value?.[0]?.address || parsed.from?.text || "Unknown";
    const lowerFrom = fromAddress.toLowerCase();

    if (
      blockedSenders.some((bs) => lowerFrom.includes(bs) || lowerFrom === bs)
    ) {
      log(`${tag} Blocked sender: ${fromAddress}`);
      sessionUIDCache.add(uid);
      await recordProcessedEmail(uidStr, "", "blocked_sender", clientId);
      await markEmailAsRead(connection, uid);
      return;
    }

    // Guard 5 — subject keyword filter
    const vendorFromSender = VENDOR_MAP.find((v) =>
      lowerFrom.includes(v.match),
    );
    const subjectMatches =
      /Order|Booking|PNR|Reservation|Invoice|Bill|Catering|Check Order/i.test(
        subject,
      );

    if (!subjectMatches && !vendorFromSender) {
      // Guard 5
      sessionUIDCache.add(uid);
      await markEmailAsRead(connection, uid);
      return;
    }
    if (!subjectMatches && vendorFromSender) {
      warn(
        `${tag} Known vendor ${vendorFromSender.name} with unusual subject: "${subject}" — processing anyway`,
      );
    }

    // ── Detect vendor ─────────────────────────────────────────────────────
    let detectedType = "generic",
      detectedName = "";
    for (const v of VENDOR_MAP) {
      if (lowerFrom.includes(v.match)) {
        detectedType = v.type;
        detectedName = v.name;
        break;
      }
    }
    if (!detectedName) {
      try {
        const parts = lowerFrom.split("@")[1]?.split(".") || [];
        const root = parts.length > 2 ? parts[parts.length - 2] : parts[0];
        detectedName = root.charAt(0).toUpperCase() + root.slice(1);
      } catch (_) {}
    }

     // ✅ NEW — IRCTC structural guard: paste it HERE
    if (detectedType === "irctc") {
      const hasPdfAttachment = (parsed.attachments || []).some(
        (att) => att.contentType === "application/pdf",
      );
      if (hasPdfAttachment) {
        log(`${tag} Skipping IRCTC PDF-attachment email (not a real order): "${subject}"`);
        sessionUIDCache.add(uid);
        await recordProcessedEmail(uidStr, "", "skipped_fake", clientId);
        await markEmailAsRead(connection, uid);
        return;
      }
    }

    // ── Skip known-fake subjects per vendor ────────────────────────────────
    const skipPatterns = VENDOR_SKIP_SUBJECTS[detectedType];
    if (skipPatterns) {
      const lowerSubject = subject.toLowerCase();
      if (skipPatterns.some((p) => lowerSubject.includes(p))) {
        log(`${tag} Skipping fake email for ${detectedName}: "${subject}"`);
        sessionUIDCache.add(uid);
        await recordProcessedEmail(uidStr, "", "skipped_fake", clientId);
        await markEmailAsRead(connection, uid);
        return;
      }
    }

    // ── Build fullText for AI path ────────────────────────────────────────
    let fullText = parsed.text || "";
    if (!fullText && parsed.html) {
      fullText = htmlToText(parsed.html);
      log(
        `${tag} HTML-only email — stripped to plain text (${fullText.length} chars)`,
      );
    }
    for (const att of parsed.attachments || []) {
      if (att.contentType === "application/pdf") {
        try {
          const pdf = await pdfParse(att.content);
          const pdfText = (pdf.text || "").trim();
          if (pdfText.length < 50) {
            warn(
              `${tag} PDF extracted only ${pdfText.length} chars — may be image-based`,
            );
          }
          if (pdfText) fullText += "\n\n--- PDF ---\n" + pdfText;
        } catch (e) {
          warn(`${tag} PDF parse error: ${e.message}`);
        }
      }
    }

    log(`${tag} 🤖 Parsing: "${subject}" (From: ${fromAddress})`);

    // ── PATH A: DOM parsing ───────────────────────────────────────────────
    let orderData = null;
    const domCfg = VENDOR_DOM_CONFIGS[detectedType];

    if (domCfg && parsed.html) {
      log(`${tag}    🏗️  DOM parsing for ${detectedName}`);
      orderData = parseDomOrder(
        parsed.html,
        detectedName,
        detectedType,
        domCfg,
        tag,
      );
      if (orderData) {
        log(`${tag}    ✅ DOM parse succeeded — Bedrock not called`);
        // ── Check if DOM got most fields but some are missing ──────────
        const missingFields = getMissingFields(orderData);
        if (missingFields) {
          log(
            `${tag}    🔄 DOM partial — filling missing: [${missingFields}] via targeted AI`,
          );
          const fill = await fillMissingFields(fullText, missingFields, tag);
          if (fill) {
            let merged = 0;
            for (const [key, val] of Object.entries(fill)) {
              if (
                val !== null &&
                val !== undefined &&
                val !== "" &&
                val !== "N/A"
              ) {
                const current = orderData[key];
                if (
                  current === null ||
                  current === undefined ||
                  current === "" ||
                  current === "N/A" ||
                  current === "Unknown" ||
                  current === "YYYY-MM-DD"
                ) {
                  orderData[key] = val;
                  merged++;
                }
              }
            }
            log(
              `${tag}    ✅ AI filled ${merged}/${missingFields.split(", ").length} missing fields`,
            );
          } else {
            warn(
              `${tag}    ⚠️  AI fill failed — fields will remain missing, retry on next cycle`,
            );
          }
        }
      } else {
        warn(`${tag}    ⚠️  DOM parse failed — falling back to AI`);
      }
    }

    // ── PATH B: AI / Bedrock ──────────────────────────────────────────────
    if (!orderData) {
      orderData = await parseWithAWS(fullText, subject, fromAddress);
    }

    // ✅ FIX 6: Add to sessionUIDCache on parse failure.
    // OLD BUG: returning without caching meant the same email was re-downloaded
    // and re-attempted every 30 seconds within the same session, hammering
    // Bedrock with repeated calls for emails that were already failing.
    // FIX: Cache the UID so it's skipped for the rest of this session.
    // On server restart / reconnect, sessionUIDCache resets — giving a fresh retry.
    if (!orderData) {
      log(`${tag}    ❌ Parse failed — stays unread for retry`);
      sessionUIDCache.add(uid); // ✅ FIX 6
      return;
    }

    const finalOrderNo = (orderData.orderNo || orderData.pnr || "")
      .toString()
      .replace(/\//g, "-")
      .trim();

    if (!finalOrderNo || finalOrderNo.startsWith("AUTO_")) {
      log(
        `${tag}    ⚠️ No valid order number extracted — stays unread for retry`,
      );
      sessionUIDCache.add(uid);
      return;
    }

    // ── Per-order lock ────────────────────────────────────────────────────
    const lockKey = orderDocId(clientId, finalOrderNo);
    if (!acquireLock(lockKey)) {
      log(
        `${tag} #${finalOrderNo} already being processed in parallel — skipping`,
      );
      return;
    }

    try {
      const today = todayStr();
      const orderDeliveryDate = (orderData.deliveryDate || "").trim();
      let existingOrder = null;

      if (orderDeliveryDate === today) {
        existingOrder =
          orderMap.get(orderDocId(clientId, finalOrderNo)) || null;
      } else if (orderDeliveryDate) {
        log(
          `${tag}    📅 Order date ${orderDeliveryDate} ≠ today ${today} — Firestore read for #${finalOrderNo}`,
        );
        try {
          const snap = await getDoc(
            doc(db, "orders", orderDocId(clientId, finalOrderNo)),
          );
          if (snap.exists()) existingOrder = snap.data();
        } catch (e) {
          warn(`Firestore read failed: ${e.message}`);
        }
      } else {
        existingOrder =
          orderMap.get(orderDocId(clientId, finalOrderNo)) || null;
        if (!existingOrder) {
          try {
            const snap = await getDoc(
              doc(db, "orders", orderDocId(clientId, finalOrderNo)),
            );
            if (snap.exists()) existingOrder = snap.data();
          } catch (e) {
            warn(`Firestore read failed: ${e.message}`);
          }
        }
      }

      // ── ORDER EXISTS → check for explicit changes ──────────────────────
      if (existingOrder) {
        log(
          `${tag}    🔄 #${finalOrderNo} in DB — checking for explicit changes...`,
        );
        const updateResult = await parseUpdateEmail(
          fullText,
          subject,
          existingOrder,
        );
        if (!updateResult) {
          log(`${tag}    ❌ Update parse failed — stays unread`);
          return;
        }
        log(`${tag}    🧠 ${updateResult._thinking}`);

        const { changes, changeLog } = buildChangePayload(
          existingOrder,
          updateResult,
        );

        if (Object.keys(changes).length === 0) {
          log(
            `${tag}    ℹ️ No explicit changes for #${finalOrderNo} — recording as duplicate`,
          );
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
                remark:
                  updateResult.remark || `Updated: ${changeLog.join(", ")}`,
              },
            ],
          };
          await updateDoc(
            doc(db, "orders", orderDocId(clientId, finalOrderNo)),
            updatePayload,
          );
          orderMap.set(orderDocId(clientId, finalOrderNo), {
            ...existingOrder,
            ...changes,
          });
          log(`${tag}    ✅ UPDATED #${finalOrderNo}: ${changeLog.join(", ")}`);
        }

        sessionUIDCache.add(uid);
        await recordProcessedEmail(
          uidStr,
          finalOrderNo,
          Object.keys(changes).length > 0 ? "update_applied" : "duplicate",
          clientId,
        );
        await markEmailAsRead(connection, uid);

        // ── NEW ORDER → validate then save ────────────────────────────────
      } else {
        log(`${tag}    🆕 New order #${finalOrderNo} — validating fields...`);
        const missing = getMissingFields(orderData);
        if (missing) {
          log(
            `${tag}    ⚠️ INCOMPLETE — missing: [${missing}] — stays UNREAD for retry`,
          );
          await recordProcessedEmail(
            uidStr,
            finalOrderNo,
            "incomplete_data",
            clientId,
          );
          // ✅ FIX 5: sessionUIDCache NOT updated here — allow retry next cycle.
          // recordProcessedEmail also skips emailSet for 'incomplete_data'.
          return;
        }

        const newDoc = {
          ...orderData,
          subTotal: cleanFloat(orderData.subTotal),
          tax: cleanFloat(orderData.tax),
          deliveryCharge: cleanFloat(orderData.deliveryCharge),
          totalAmount: cleanFloat(orderData.totalAmount),
          remark: orderData.remark || "",
          orderNo: finalOrderNo,
          clientId,
          createdAt: new Date().toISOString(),
          status: "Active",
          updateHistory: [],
        };

        await setDoc(
          doc(db, "orders", orderDocId(clientId, finalOrderNo)),
          newDoc,
        );
        orderMap.set(orderDocId(clientId, finalOrderNo), newDoc);
        log(`${tag}    ✅ SAVED #${finalOrderNo} | ₹${orderData.totalAmount}`);

        sessionUIDCache.add(uid);
        await recordProcessedEmail(uidStr, finalOrderNo, "success", clientId);
        await markEmailAsRead(connection, uid);
      }
    } finally {
      releaseLock(lockKey);
    }
  } catch (e) {
    err(`${tag} processEmail error for UID ${uid}: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-TENANT IMAP POLLER
// ═══════════════════════════════════════════════════════════════════════════
async function pollClientInbox(
  clientId,
  emailAddr,
  appPassword,
  clientBusinessName,
  clientCreatedAt,
) {
  const tag = `[${clientBusinessName}]`;
  log(`${tag} Starting IMAP polling for ${emailAddr}`);

  await warmEmailCache(clientId);

  let cancelled = false;
  let activeConn = null;
  let isPaused = false;
  let blockedSenders = [];

  async function refreshClientSettings() {
    try {
      const snap = await getDoc(doc(db, "clients", clientId));
      if (snap.exists()) {
        isPaused = snap.data().emailPaused === true;
        blockedSenders = (snap.data().blockedSenders || [])
          .map((s) => s.toLowerCase().trim())
          .filter(Boolean);
      }
    } catch (_) {}
  }

  const IMAP_CONFIG = {
    imap: {
      user: emailAddr,
      password: appPassword.replace(/\s/g, ""),
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      authTimeout: 5000,
      tlsOptions: { rejectUnauthorized: false },
    },
  };

  let sessionUIDCache = new Set();

  async function runPollingCycle(connection) {
    if (cancelled) return;
    try {
      await refreshClientSettings();
      if (isPaused) {
        log(`${tag} PAUSED — skipping cycle`);
        return;
      }

      const messages = await Promise.race([
        connection.search(["UNSEEN"], {
          bodies: ["HEADER.FIELDS (SUBJECT)"],
          markSeen: false,
        }),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("IMAP_HANG")), 15000),
        ),
      ]);

      const today = todayStr();
      const orderMap = getOrderMap(today, clientId);
      const emailSet = getEmailSet(today, clientId);

      const newMessages = messages.filter(
        (m) => !sessionUIDCache.has(m.attributes.uid),
      );
      if (newMessages.length > 0)
        log(`${tag} 📩 ${newMessages.length} email(s) to process`);

      const BATCH_SIZE = 3;
      for (let i = 0; i < newMessages.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = newMessages.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map((item) =>
            processEmail(
              item,
              connection,
              clientId,
              orderMap,
              emailSet,
              tag,
              blockedSenders,
              sessionUIDCache,
              clientCreatedAt,
            ),
          ),
        );
        if (i + BATCH_SIZE < newMessages.length) await delay(2000);
      }
    } catch (e) {
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
      await connection.openBox("INBOX");
      sessionUIDCache = new Set();
      log(`${tag} ✅ Connected to inbox`);

      async function cycle() {
        if (cancelled) {
          log(`${tag} Polling cancelled — closing IMAP connection`);
          try {
            connection.end();
          } catch (_) {}
          activeConn = null;
          return;
        }
        try {
          await runPollingCycle(connection);
        } catch (e) {
          if (cancelled) return;
          err(`${tag} Reconnecting after error: ${e.message}`);
          try {
            connection.end();
          } catch (_) {}
          try {
            connection = await imaps.connect(IMAP_CONFIG);
            activeConn = connection;
            await connection.openBox("INBOX");
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

  return function stop() {
    cancelled = true;
    log(`${tag} Stop requested`);
    if (activeConn) {
      try {
        activeConn.end();
      } catch (_) {}
      activeConn = null;
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WATCH CLIENTS COLLECTION
// ═══════════════════════════════════════════════════════════════════════════
async function watchClients() {
  await backendAuthReady;
  log("MIGME: Watching for active clients...");

  const activePolls = new Map();

  onSnapshot(
    query(collection(db, "clients"), where("active", "==", true)),
    (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const data = change.doc.data();
        const clientKey = change.doc.id;

        if (change.type === "added") {
          if (activePolls.has(clientKey)) return;
          log(`Starting polling for ${data.businessName} (${data.email})`);
          await warmOrderCache(clientKey);
          if (activePolls.has(clientKey)) return;
          const plainPassword =
            /^[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*:[A-Za-z0-9+/]+=*$/.test(
              data.appPassword,
            )
              ? decrypt(data.appPassword)
              : data.appPassword;
          const stopFn = await pollClientInbox(
            clientKey,
            data.email,
            plainPassword,
            data.businessName,
            data.createdAt,
          );
          activePolls.set(clientKey, stopFn);
          globalStopFns.add(stopFn);
        }

        if (change.type === "removed") {
          const stopFn = activePolls.get(clientKey);
          if (stopFn) {
            log(`Stopping polling for ${data.businessName || clientKey}`);
            stopFn();
            globalStopFns.delete(stopFn);
            activePolls.delete(clientKey);
          }
        }
      });
    },
  );

  onSnapshot(
    query(collection(db, "clients"), where("active", "==", false)),
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const clientKey = change.doc.id;
          const stopFn = activePolls.get(clientKey);
          if (stopFn) {
            log(`Client ${clientKey} became inactive — stopping poller`);
            stopFn();
            globalStopFns.delete(stopFn);
            activePolls.delete(clientKey);
          }
        }
      });
    },
  );
}

watchClients().catch((e) => {
  err(`watchClients fatal: ${e.message}`);
  process.exit(1);
});
