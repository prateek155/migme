'use strict';

/**
 * VENDOR: YatriBhojan
 * Sender:  vendors@yatribhojan.com
 * Content-Type: text/html; charset=utf-8 — pure HTML single part, NO text/plain.
 * Transfer: quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order No 57562925 (20-Jun-2026)
 *
 * ── EMAIL FORMAT ───────────────────────────────────────────────────────────
 *
 * ⚠ NO AI CALL NEEDED — entire email is a single <div> tag.
 * All content is plain text separated by <br/> tags.
 * Parse by splitting innerHTML on <br/> → array of trimmed lines.
 *
 * ── RAW EMAIL BODY (decoded) ───────────────────────────────────────────────
 *
 * NEW ORDER !!
 * -----
 * ORDER NO: 57562925
 * PAYMODE: ONLINE
 * -----
 * DELIVERY: 20-06-2026, ETA: 22:12
 * STATION: VADODARA (BRC)
 * TRAIN: 12959, BDTS BHUJ EXP
 * COACH: S6, SEAT: 71
 * -----
 * ITEM DETAILS
 * ************
 * Veg Biriyani X 1
 * ************
 * DELIVERY CHARGE: Rs 0
 * NET TOTAL: Rs 205
 * -----
 * CUSTOMER DETAILS
 * -----
 * NAME: Muskan Kumari
 * MOB: 6352120742
 * -----
 * THANKYOU :) TEAM YATRIBHOJAN
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * FORMAT:   Single <div> tag — split on <br/> → array of lines.
 *           Each line is "KEY: value" or a section separator ("-----", "***").
 *           Parse each line by splitting on first ": " only.
 *
 * ORDER NO: "ORDER NO: 57562925" → strip "ORDER NO: " → "57562925"
 *           Also available in subject "Order 57562925 Received" → strip non-digits.
 *
 * PAYMODE:  "PAYMODE: ONLINE"
 *           "ONLINE" / "PAID" / "PREPAID" → "Prepaid"
 *           "COD" / "CASH" / "CASH_ON_DELIVERY" → "COD"
 *
 * DELIVERY: "DELIVERY: 20-06-2026, ETA: 22:12"
 *           → split on ", ETA: "
 *           → deliveryDate: "20-06-2026" DD-MM-YYYY → reorder → "2026-06-20"
 *           → deliveryTime: "22:12"
 *
 * STATION:  "STATION: VADODARA (BRC)"
 *           → full string "VADODARA (BRC)" or strip parenthetical → "VADODARA"
 *
 * TRAIN:    "TRAIN: 12959, BDTS BHUJ EXP"
 *           → split on first ", "
 *           → trainInfo: "12959"
 *           → trainName: "BDTS BHUJ EXP"
 *
 * COACH:    "COACH: S6, SEAT: 71"
 *           → coach: "S6" (value after "COACH: " before ", SEAT")
 *           → seat:  "71" (value after "SEAT: ")
 *           → combined: "S6/71"
 *
 * ITEMS:    Lines between "************" markers
 *           Format: "Veg Biriyani X 1"
 *           → regex /^(.+?)\s+X\s+(\d+)$/i
 *           → name: "Veg Biriyani", qty: 1
 *           ⚠ No individual item price — only NET TOTAL available.
 *
 * CHARGES:  "DELIVERY CHARGE: Rs 0" → deliveryCharge: 0
 *           "NET TOTAL: Rs 205"     → totalAmount: 205
 *           Strip "Rs " → parseFloat
 *
 * CUSTOMER: "NAME: Muskan Kumari"   → customerName: "Muskan Kumari"
 *           "MOB: 6352120742"       → contactNo: "6352120742" (10-digit)
 */

const domConfig = {
  // Single <div> — split innerHTML on <br/> → parse lines
  singleDivBrLines: true,

  // Each line parsed as "KEY: value" — key is everything before first ": "
  lineFields: {
    orderNo: {
      linePrefix: 'ORDER NO:',
      transform: v => v.trim() || null,
    },

    paymentType: {
      linePrefix: 'PAYMODE:',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'COD' || u === 'CASH' || u === 'CASH_ON_DELIVERY') return 'COD';
        return 'Prepaid'; // ONLINE / PAID / PREPAID
      },
    },

    _deliveryRaw: {
      linePrefix: 'DELIVERY:',
      transform: v => v.trim(),
    },

    deliveryStation: {
      linePrefix: 'STATION:',
      transform: v => v.trim() || null,
      // e.g. "VADODARA (BRC)" — keep full string including parenthetical
    },

    _trainRaw: {
      linePrefix: 'TRAIN:',
      transform: v => v.trim(),
    },

    _coachRaw: {
      linePrefix: 'COACH:',
      transform: v => v.trim(),
    },

    deliveryCharge: {
      linePrefix: 'DELIVERY CHARGE:',
      transform: v => {
        const clean = v.replace(/Rs\.?\s*/i, '').trim();
        return parseFloat(clean) || 0;
      },
    },

    totalAmount: {
      linePrefix: 'NET TOTAL:',
      transform: v => {
        const clean = v.replace(/Rs\.?\s*/i, '').trim();
        return parseFloat(clean) || null;
      },
    },

    customerName: {
      linePrefix: 'NAME:',
      transform: v => v.trim() || null,
      // ✅ Customer name IS present in YatriBhojan emails
    },

    contactNo: {
      linePrefix: 'MOB:',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },
  },

  // Items are lines between "************" markers
  // Format: "Veg Biriyani X 1"  → name="Veg Biriyani", qty=1
  itemsSection: {
    markerLine: '************',    // lines between two of these = item lines
    itemRegex: /^(.+?)\s+X\s+(\d+)$/i, // group 1=name, group 2=qty
    // ⚠ No individual item price — only NET TOTAL is available
  },
};

const postProcess = (order) => {
  // ── DELIVERY DATE & TIME ──────────────────────────────────────────────────
  // Raw: "20-06-2026, ETA: 22:12"
  // → deliveryDate: "2026-06-20", deliveryTime: "22:12"
  const dr = order._deliveryRaw || '';
  const dm = dr.match(/^(\d{2})-(\d{2})-(\d{4}),\s*ETA:\s*(\d{2}:\d{2})/i);
  if (dm) {
    order.deliveryDate = `${dm[3]}-${dm[2]}-${dm[1]}`; // YYYY-MM-DD
    order.deliveryTime = dm[4];                          // HH:MM
  } else {
    order.deliveryDate = null;
    order.deliveryTime = null;
  }
  delete order._deliveryRaw;

  // ── TRAIN INFO ────────────────────────────────────────────────────────────
  // Raw: "12959, BDTS BHUJ EXP"
  // → trainInfo: "12959", trainName: "BDTS BHUJ EXP"
  const trainRaw = order._trainRaw || '';
  const trainMatch = trainRaw.match(/^(\d+),\s*(.+)$/);
  if (trainMatch) {
    order.trainInfo = trainMatch[1].trim();
    order.trainName = trainMatch[2].trim();
  } else {
    order.trainInfo = trainRaw || null;
    order.trainName = null;
  }
  delete order._trainRaw;

  // ── COACH / SEAT ──────────────────────────────────────────────────────────
  // Raw: "S6, SEAT: 71"
  // → coach: "S6/71"
  const coachRaw = order._coachRaw || '';
  const coachMatch = coachRaw.match(/^(.+?),\s*SEAT:\s*(.+)$/i);
  if (coachMatch) {
    order.coach = `${coachMatch[1].trim()}/${coachMatch[2].trim()}`;
  } else {
    order.coach = coachRaw || null;
  }
  delete order._coachRaw;

  return order;
};

const matchers = [
  { match: 'yatribhojan', name: 'YatriBhojan', type: 'yatribhojan' },
];

const type = 'yatribhojan';

const rule = `VENDOR: YatriBhojan (EMAIL)
SENDER: vendors@yatribhojan.com | FORMAT: Pure HTML single part — single <div> tag.

⚠ NO AI CALL REQUIRED — fully DOM parseable.
  Split <div> innerHTML on <br/> tags → array of lines.
  Each line is "KEY: value" format — split on first ": " only.
  Separator lines ("-----", "***") are ignored.

SUBJECT: "Order 57562925 Received"
  → orderNo: extract digits → "57562925"
  → ALSO available in body as "ORDER NO: 57562925"

── LINE FIELDS (KEY: value format) ────────────────────────────────────────

  ORDER NO: 57562925       → orderNo      plain integer string
  PAYMODE: ONLINE          → paymentType  "ONLINE"/"PAID"/"PREPAID" → "Prepaid"
                                          "COD"/"CASH"/"CASH_ON_DELIVERY" → "COD"
  DELIVERY: 20-06-2026, ETA: 22:12
                           → deliveryDate "20-06-2026" DD-MM-YYYY → "2026-06-20"
                           → deliveryTime "22:12" (from ETA part after ", ETA: ")
  STATION: VADODARA (BRC)  → deliveryStation  full string "VADODARA (BRC)"
  TRAIN: 12959, BDTS BHUJ EXP
                           → trainInfo    digits before first ", " → "12959"
                           → trainName    text after first ", "    → "BDTS BHUJ EXP"
  COACH: S6, SEAT: 71      → coach        "S6" + "/" + "71"       → "S6/71"
  DELIVERY CHARGE: Rs 0    → deliveryCharge  strip "Rs " → 0
  NET TOTAL: Rs 205        → totalAmount     strip "Rs " → 205  ← USE THIS
  NAME: Muskan Kumari      → customerName    "Muskan Kumari"
                             ✅ Customer name IS present in YatriBhojan emails.
  MOB: 6352120742          → contactNo       10-digit number

── ITEMS SECTION ───────────────────────────────────────────────────────────
  Lines between "************" markers contain item entries.
  Format: "Veg Biriyani X 1"
  Regex: /^(.+?)\\s+X\\s+(\\d+)$/i
    group 1 → item name  "Veg Biriyani"
    group 2 → quantity   1
  ⚠ No individual item price available — only NET TOTAL is present.

── SEPARATOR LINES (ignore) ────────────────────────────────────────────────
  "-----"        → section separator — skip
  "************" → items section marker — skip (used only as boundary)
  "NEW ORDER !!" → email header — skip
  "ITEM DETAILS" → section header — skip
  "CUSTOMER DETAILS" → section header — skip
  "THANKYOU :) TEAM YATRIBHOJAN" → footer — skip`;

module.exports = { matchers, type, rule, domConfig, postProcess };
