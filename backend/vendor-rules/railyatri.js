"use strict";

/**
 * VENDOR: RAILYATRI
 * Sender domain : railyatri.in  (no-reply@railyatri.in)
 * Transport     : NetcoreCloud (FMTA)
 * Content-Type  : multipart/alternative (text/plain + text/html)
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order ID #4312294 (20-Jun-2026)
 *
 * DOM PARSING: PATH A — domConfig below.
 * AI fallback (PATH B) used only when parsed.html is missing or DOM returns null.
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * The email is several small separate <table> elements (NOT one big table).
 * Order-detail fields are plain 2-cell label/value rows split across 2 tables
 * (invoice-details, delivered-at) — standard label→next-sibling matching works.
 *
 * ORDER DETAIL FIELDS (each its own 2-cell <tr>, label | value):
 *   Order ID              | 4312294
 *   Date of Invoice       | 20-06-2026        ← NOT the delivery date, ignore
 *   Customer Name         | Kirodi lal meena
 *   Contact No.           | 8094983271
 *   Mode of Payment       | COD
 *   Invoice Status        | Unpaid
 *   Delivery at           | Vadodara Junction
 *   Delivery Date         | 20-06-2026        ← use this for deliveryDate
 *   Expected Time         | 23:19             ← use this for deliveryTime
 *   Train                 | 12940 - JP PUNE EXP
 *   Coach and Seat No.    | B4 , 24           ← normalize " , " → "/"
 *
 * ITEMS TABLE — 5 <th>/<td> cells per row (NOT 4 — two columns are blank spacers):
 *   Header row : ["Item", "Quantity", "", "", "Price"]
 *   Item row   : ["Hyderabadi Biryani", "1", "(1 * 209)", "Rs.", "209"]
 *
 *   Column indexes:
 *     0 = Item name
 *     1 = Quantity (plain integer — the ONLY real quantity source)
 *     2 = "(1 * 209)" — a DISPLAY calculation column, blank header, IGNORE for qty
 *     3 = "Rs." — currency label cell, blank header, IGNORE
 *     4 = Price (plain number, no currency symbol — e.g. "209")
 *
 *   ⚠ The calc column (col 2) looks like it might encode quantity via "(1 * 209)"
 *     but the engine must NEVER parse quantity from it — qty is ALWAYS col 1.
 *
 *   NOTE: This 5-column header (2 blank <th>) requires columnMap blank-marker
 *   keys "__empty1" / "__empty2" (consume-once positional header matching —
 *   see backend.js parseDomOrder FIX 5). A normal 4-key columnMap cannot
 *   represent two header cells that are both "" — JS object keys collapse
 *   duplicate "" entries, undercounting Object.keys(columnMap).length and
 *   making the header row impossible to detect with the old algorithm.
 *
 * FOOTER ROWS — same flat row stream, 5 cells, first=label (separate <table>s,
 * but parseDomOrder scans all $("table tr") in one flat document-order pass):
 *   Sub Total:             | : |  | Rs. | 209
 *   Tax:                   | : |  | Rs. | 0
 *   Delivery Charge:       | : |  | Rs. | 0
 *   Convenience Charge:    | : |  | Rs. | 0
 *   Discount:              | : |  | Rs. | 0
 *   Grand Total            | : |  | Rs. | 209  ← pre-collection total, NOT used for COD
 *   Amount to be collected | : |  | Rs. | 219  ← ACTUAL totalAmount for COD
 *
 *   captureFooterTotal (array mode — FIX 6) captures BOTH labels without
 *   stopping early, storing each in order._footerCaptures{label: value}.
 *   postProcess then applies the priority rule: prefer "Amount to be collected"
 *   if > 0, else fall back to "Grand Total".
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO: "Order ID" field → plain integer string e.g. "4312294".
 *
 * CONTACT: "Contact No." field → 10-digit number. Apply standard +91/91
 *   stripping defensively.
 *
 * COACH: "Coach and Seat No." field → "B4 , 24" → strip spaces around comma,
 *   replace with "/" → "B4/24".
 *
 * DATE: "Delivery Date" field format "DD-MM-YYYY" → deliveryDate=YYYY-MM-DD.
 *   Do NOT use "Date of Invoice" — that is the invoice generation date.
 *
 * TIME: "Expected Time" field → already "HH:MM" 24hr, use directly.
 *
 * TRAIN: "Train" field → full string e.g. "12940 - JP PUNE EXP".
 *
 * PAYMENT: "Mode of Payment" field → "COD"→"COD", "PREPAID"/"ONLINE"/"PAID"→"Prepaid".
 *
 * TOTAL: "Amount to be collected" is ground-truth for COD orders (includes
 *   convenience charge over Grand Total).
 *   ⚠ For Prepaid/ONLINE orders "Amount to be collected" = 0 (already paid).
 *   Rule: totalAmount = "Amount to be collected" if > 0, else "Grand Total".
 */

const domConfig = {

  fields: {
    orderNo: {
      labelText: 'Order ID',
      transform: v => v.trim() || null,
    },

    customerName: {
      labelText: 'Customer Name',
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText: 'Contact No.',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    paymentType: {
      labelText: 'Mode of Payment',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'COD' || u === 'CASH_ON_DELIVERY') return 'COD';
        if (['PREPAID', 'PRE_PAID', 'ONLINE', 'PAID'].includes(u)) return 'Prepaid';
        return 'COD';
      },
    },

    trainInfo: {
      labelText: 'Train',
      transform: v => v.trim() || null,
    },

    coach: {
      labelText: 'Coach and Seat No.',
      transform: v => v.trim().replace(/\s*,\s*/g, '/') || null,
    },

    _deliveryDateRaw: {
      labelText: 'Delivery Date',
      transform: v => v.trim(),
    },

    _deliveryTimeRaw: {
      labelText: 'Expected Time',
      transform: v => v.trim(),
    },
    // totalAmount captured from footer via captureFooterTotal array below
  },

  itemsTable: {
    /**
     * CONFIRMED column indexes (0-based) from real .eml #4312294:
     *   0=Item  1=Quantity  2=(calc, blank header)  3=(currency, blank header)  4=Price
     *
     * Two blank <th> require __empty1 / __empty2 marker keys (FIX 5).
     */
    columnMap: {
      'item':      'rawItem',     // index 0 — item name
      'quantity':  'qty',         // index 1 — real quantity, standalone integer
      '__empty1':  'calcCol',     // index 2 — "(1 * 209)" display calc, ignored
      '__empty2':  'currencyCol', // index 3 — "Rs." label, ignored
      'price':     'price',       // index 4 — plain number, no currency symbol
    },

    itemCellSplit: null,

    footerLabels: [
      'Sub Total',
      'Tax',
      'Delivery Charge',
      'Convenience Charge',
      'Discount',
      'Grand Total',
      'Amount to be collected',
    ],

    // Array mode (FIX 6): captures both totals without stopping early.
    // postProcess applies priority: "Amount to be collected" > 0 → use it,
    // else fall back to "Grand Total" (needed for Prepaid orders).
    captureFooterTotal: ['Amount to be collected', 'Grand Total'],

    enableQtyCrossCheck: false,
    // No Amount column in items table — col 2 is display-only "(qty * price)" string.
  },

  postProcess(order) {
    // ── "Delivery Date" (DD-MM-YYYY) → YYYY-MM-DD ───────────────────────────
    const dateRaw = order._deliveryDateRaw || '';
    const dm = dateRaw.match(/(\d{2})-(\d{2})-(\d{4})/);
    order.deliveryDate = dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : null;
    delete order._deliveryDateRaw;

    // ── "Expected Time" already HH:MM — pad if needed ───────────────────────
    const timeRaw = (order._deliveryTimeRaw || '').trim();
    const tm = timeRaw.match(/(\d{1,2}:\d{2})/);
    order.deliveryTime = tm ? (tm[1].length === 4 ? '0' + tm[1] : tm[1]) : null;
    delete order._deliveryTimeRaw;

    // ── totalAmount: "Amount to be collected" if > 0, else "Grand Total" ────
    // Prepaid orders: "Amount to be collected" = 0 (nothing to collect at door).
    // Without fallback, totalAmount would be 0 for every Prepaid RailYatri order.
    const captures = order._footerCaptures || {};
    const amountToCollect = captures['Amount to be collected'];
    const grandTotal      = captures['Grand Total'];

    if (amountToCollect && amountToCollect > 0) {
      order.totalAmount = amountToCollect;
    } else if (grandTotal && grandTotal > 0) {
      order.totalAmount = grandTotal;
    } else {
      order.totalAmount = 0;
    }
    delete order._footerCaptures;
    delete order._itemsTotal;

    return order;
  },
};

const matchers = [{ match: 'railyatri', name: 'RailYatri', type: 'railyatri' }];

const type = 'railyatri';

const rule = `VENDOR: RAILYATRI
ORDER NO: Field label is "Order ID" — value is a plain integer like "4312294". Use this as orderNo.

EMAIL FORMAT: HTML invoice with multiple separate tables. After HTML-to-text, columns are pipe-separated.

ORDER FIELDS (each on its own row):
  Order ID              | 4312294
  Customer Name         | Kirodi lal meena
  Contact No.           | 8094983271       ← contactNo (note the period in label)
  Mode of Payment       | COD
  Delivery Date         | 20-06-2026       ← DD-MM-YYYY → YYYY-MM-DD
  Expected Time         | 23:19            ← already HH:MM, use directly
  Train                 | 12940 - JP PUNE EXP
  Coach and Seat No.    | B4 , 24          ← normalize "B4 , 24" → "B4/24"

  Do NOT use "Date of Invoice" — that is the invoice generation date, not delivery date.

ITEMS TABLE — 5 columns (pipe-separated):
  Item | Quantity | (calculation) | Rs. | Price
  e.g. "Hyderabadi Biryani | 1 | (1 * 209) | Rs. | 209"

  Column positions:
  1st = Item name
  2nd = Quantity  ← REAL quantity (plain integer: 1, 2, 3 ...)
  3rd = (n * price) — DISPLAY ONLY, IGNORE for quantity
  4th = "Rs." — currency label, ignore
  5th = Price per unit (numeric, no currency symbol)

  ⚠ The 3rd column "(1 * 209)" is display-only. NEVER parse quantity from it.
    Quantity is ALWAYS the standalone integer in the 2nd column.

TOTALS (each row: Label | : | | Rs. | Amount):
  Sub Total             | Rs. | 209
  Tax                   | Rs. | 0
  Delivery Charge       | Rs. | 0
  Convenience Charge    | Rs. | 0
  Discount              | Rs. | 0
  Grand Total           | Rs. | 209
  Amount to be collected| Rs. | 219  ← USE THIS as totalAmount for COD

FIELD RULES:
- ORDER NO: "Order ID" field — plain integer.
- CONTACT: "Contact No." field (note the period). Strip +91/91 prefix if present.
- DATE: "Delivery Date" field is DD-MM-YYYY → output YYYY-MM-DD.
- TIME: "Expected Time" is already HH:MM 24hr — use directly.
- TRAIN: "Train" field — full string e.g. "12940 - JP PUNE EXP" (dash separator).
- COACH: "Coach and Seat No." field. Normalize: "B4 , 24" → "B4/24".
- PAYMENT: "Mode of Payment". "COD"→"COD", "PREPAID"/"ONLINE"→"Prepaid".
- TOTAL: "Amount to be collected" is the ground-truth amount for COD orders
  (includes convenience charge — may differ from Grand Total).
  ⚠ For Prepaid/ONLINE orders, "Amount to be collected" = 0 (already paid online).
  Rule: if "Amount to be collected" > 0 → use it. Otherwise use "Grand Total".

DO NOT VERIFY: Price × Qty cross-check not applicable — no Amount column in items table.`;

module.exports = { matchers, type, rule, domConfig };
