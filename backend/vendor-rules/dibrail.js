"use strict";

/**
 * VENDOR: DIBRAIL
 * Sender domain : gmail.com  (dibrailcare@gmail.com)
 * Transport     : Gmail (Google SMTP)
 * Content-Type  : multipart/alternative (text/plain + text/html)
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order ID #210918 (29-May-2026)
 *
 * ── EMAIL STRUCTURE ────────────────────────────────────────────────────────
 *
 * Multipart email — USE THE text/plain PART (simpler and cleaner).
 * HTML part is structurally identical but QP-encoded with &amp; entities.
 * Plain text part is the authoritative source for all field extraction.
 *
 * EXACT PLAIN TEXT STRUCTURE (after QP decode):
 *
 *   Dear Partner,
 *   A new order from DIBRAIL.
 *
 *   Customer & Delivery Detail
 *
 *   ✅ Order ID :- #210918
 *   ✅ Customer Name :- Jaswant
 *   ✅ Mobile :- 7339957184, 7357909913
 *   ✅ Station :- VADODARA (BRC)
 *   ✅ Train :- 20626 - BGKT MAS SF EXP
 *   ✅ Coach & Seat :- S6  - 8
 *   ✅ Delivery Time :- 29-05-2026 16:52
 *
 *   ✅ Order Type : COD            ← NOTE: single ":" not ":-" for this field
 *   ✅ Total Amount :- 189.00
 *   ✅ Cash On Delivery :- 189.00
 *
 *   ✅ Items:
 *   👉🏼 1-VEG MINI THALI,
 *   .
 *   ✅ Notes :- .
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * FIELD SEPARATOR: "✅ Label :- Value" for most fields (dash after colon).
 *   EXCEPTION: "Order Type" uses single ":" — "✅ Order Type : COD"
 *   Strip ":-" or ":" and trim to get value.
 *
 * ORDER NO: "Order ID" field → strip "#" prefix → digits only.
 *   e.g. "#210918" → "210918"
 *
 * CONTACT: "Mobile" field → MAY contain multiple comma-separated numbers.
 *   Always use the FIRST 10-digit Indian mobile number (starts with 6-9).
 *   e.g. "7339957184, 7357909913" → "7339957184"
 *
 * COACH: "Coach & Seat" field. Value may have extra spaces: "S6  - 8"
 *   Normalize: collapse spaces, replace " - " with "/" → "S6/8"
 *
 * DATE: "Delivery Time" field format "DD-MM-YYYY HH:MM" (24hr, no comma)
 *   → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM
 *   e.g. "29-05-2026 16:52" → deliveryDate=2026-05-29, deliveryTime=16:52
 *
 * PAYMENT: "Order Type" field (single ":" separator).
 *   "COD"→"COD", "ONLINE"→"Prepaid", "PREPAID"→"Prepaid"
 *
 * TOTAL: "Total Amount" field → strip ":-", trim, parseFloat.
 *   e.g. "189.00" → 189
 *
 * ITEMS FORMAT: Lines starting with "👉🏼" (two emoji bytes: 👉 + 🏼 skin tone modifier)
 *   Format: "👉🏼 qty-Item Name,"
 *   qty = integer BEFORE the first "-" character.
 *   Item name = everything AFTER the first "-", strip trailing comma.
 *   e.g. "👉🏼 1-VEG MINI THALI," → qty=1, name="VEG MINI THALI"
 *   e.g. "👉🏼 2-DAL RICE,"        → qty=2, name="DAL RICE"
 *   e.g. "👉🏼 3-PANEER TIKKA,"    → qty=3, name="PANEER TIKKA"
 *
 * ITEM PRICE: Dibrail does NOT include individual item prices in the email.
 *   Set price=0 for all items. totalAmount from "Total Amount" field covers the order.
 *
 * NOTES: "Notes" field value — use as remark if non-empty and not just ".".
 *
 * NO DOM PARSING: Plain text only — no domConfig needed.
 * parseDomOrder is not called for this vendor. AI path (parseWithAWS) is used exclusively.
 */

const domConfig = {
  lineBased: true,

  lineBasedFields: {
  orderNo: {
    match: /Order\s*(?:No|ID)[\s:\-\*]*#?(\d+)/i,
    transform: (v) => v.replace(/[^\d]/g, ""),
  },
  customerName: {
    match: /Customer\s*Name[\s:\-\*]*(.+)/i,
    transform: (v) => v.replace(/\*/g, "").trim(),
  },
  contactNo: {
    match: /Mobile[\s:\-\*]*(.+)/i,
    transform: (v) => {
      const m = v.match(/([6-9]\d{9})/);
      return m ? m[1] : v.replace(/[^\d]/g, "").slice(0, 10);
    },
  },
  trainInfo: {
    match: /Train[\s:\-\*]*(.+)/i,
    transform: (v) => v.replace(/\*/g, "").trim(),
  },
  coach: {
    match: /Coach\s*&?\s*Seat[\s:\-\*]*(.+)/i,
    transform: (v) =>
      v.replace(/\*/g, "").replace(/\s+/g, " ").trim().replace(/\s*-\s*/, "/"),
  },
  _deliveryRaw: {
    match: /Delivery\s*Time[\s:\-\*]*(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2})/i,
    transform: (v) => v.trim(),
  },
  orderTypeRaw: {
    match: /Order\s*Type[\s:\-\*]*(COD|ONLINE|PREPAID|PRE_PAID)/i,
    transform: (v) => v.trim().toUpperCase(),
  },
  totalAmount: {
    match: /Total\s*Amount[\s:\-\*]*([\d,]+\.?\d*)/i,
    transform: (v) => parseFloat(v.replace(/,/g, "")) || 0,
  },
  remark: {
    match: /Notes[\s:\-\*]*(.+)/i,
    transform: (v) => {
      const t = v.replace(/\*/g, "").trim();
      return t === "." || !t ? "" : t;
    },
  },
},

  lineBasedItems: {
    startMarker: "Items",
    endMarker: /Notes/i,
    skipPattern: /^\.$/,
    // NOT anchored with ^ — the 👉🏼 emoji prefix sits before the digit,
    // so we just search for "qty-name" anywhere in the line.
    itemLineMatch: /(\d+)\s*-\s*(.+?)\s*,?\s*$/,
    qtyGroup: 1,
    nameGroup: 2,
  },

  postProcess: (order) => {
    // "DD-MM-YYYY HH:MM" → deliveryDate / deliveryTime
    if (order._deliveryRaw) {
      const m = order._deliveryRaw.match(
        /(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2})/,
      );
      if (m) {
        order.deliveryDate = `${m[3]}-${m[2]}-${m[1]}`;
        order.deliveryTime = m[4];
      }
    }
    delete order._deliveryRaw;

    order.paymentType = order.orderTypeRaw === "COD" ? "COD" : "Prepaid";
    delete order.orderTypeRaw;

    order.totalAmount = order.totalAmount || 0;
    order.subTotal = order.totalAmount;

    // Dibrail never sends per-item prices — totalAmount covers the order.
    if (Array.isArray(order.items)) {
      order.items = order.items.map((it) => ({ ...it, price: 0 }));
    }

    return order;
  },
};

const matchers = [
  { match: 'dibrail',     name: 'Dibrail', type: 'dibrail' },
  { match: 'dibrailcare', name: 'Dibrail', type: 'dibrail' },
];

const type = 'dibrail';

const rule = `VENDOR: DIBRAIL
SENDER: dibrailcare@gmail.com | FORMAT: Multipart — use text/plain part.

EMAIL STRUCTURE: Each field line starts with ✅ emoji, uses ":-" as separator.
Items start with 👉🏼 emoji. "Order Type" uses single ":" (not ":-").

EXACT STRUCTURE (verified from real .eml):
  ✅ Order ID :- #210918
  ✅ Customer Name :- Jaswant
  ✅ Mobile :- 7339957184, 7357909913
  ✅ Station :- VADODARA (BRC)
  ✅ Train :- 20626 - BGKT MAS SF EXP
  ✅ Coach & Seat :- S6  - 8
  ✅ Delivery Time :- 29-05-2026 16:52

  ✅ Order Type : COD             ← single ":" — NOT ":-"
  ✅ Total Amount :- 189.00
  ✅ Cash On Delivery :- 189.00

  ✅ Items:
  👉🏼 1-VEG MINI THALI,
  .
  ✅ Notes :- .

FIELD RULES:
- ORDER NO:  "Order ID" field → strip "#" → digits only. e.g. "#210918" → "210918"
- CUSTOMER:  "Customer Name" → value after ":-".
- CONTACT:   "Mobile" → MAY be multiple comma-separated numbers.
             Always use the FIRST valid 10-digit number (starts 6-9).
             e.g. "7339957184, 7357909913" → "7339957184"
- TRAIN:     "Train" → full string with dash separator e.g. "20626 - BGKT MAS SF EXP".
- COACH:     "Coach & Seat" → value may have extra spaces e.g. "S6  - 8".
             Normalize: collapse spaces, replace " - " (space-dash-space) with "/" → "S6/8".
- DATE/TIME: "Delivery Time" format DD-MM-YYYY HH:MM (no comma, 24hr).
             → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
             e.g. "29-05-2026 16:52" → deliveryDate=2026-05-29, deliveryTime=16:52
- PAYMENT:   "Order Type" field (uses single ":"): "COD"→"COD", "ONLINE"/"PREPAID"→"Prepaid".
- TOTAL:     "Total Amount" field → strip ":-" and spaces → parseFloat. e.g. 189.00 → 189.
- REMARK:    "Notes" value — use if non-empty and not just ".".

ITEMS FORMAT: Lines starting with 👉🏼 (pointing hand emoji + skin tone modifier).
  Pattern: "👉🏼 N-ITEM NAME,"
  N = qty (integer BEFORE first "-"). Strip emoji prefix.
  Item name = everything AFTER first "-", strip trailing comma and whitespace.
  e.g. "👉🏼 1-VEG MINI THALI," → qty=1, name="VEG MINI THALI"
  e.g. "👉🏼 2-DAL RICE,"       → qty=2, name="DAL RICE"
  *** The number before "-" is ALWAYS the quantity — never part of the item name. ***

ITEM PRICES: Dibrail does NOT include individual item prices.
  Set price=0 for every item. Use "Total Amount" for the order total.

DO NOT VERIFY: Price × Qty formula is NOT applicable (all prices are 0).`;

module.exports = { matchers, type, rule, domConfig };
