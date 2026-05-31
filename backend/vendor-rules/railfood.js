'use strict';

/**
 * VENDOR: RAIL FOOD / REL FOOD
 * Sender domain : relfood.com  (orders@relfood.com)
 * Content-Type  : text/html   (pure HTML, no PDF attachment)
 *
 * This vendor uses DOM parsing (PATH 1).
 * The `domConfig` below tells parseDomOrder() in backend.js how to read the HTML.
 * The `rule` string below is kept as a fallback for when parsed.html is missing.
 *
 * IF RAILFOOD CHANGES THEIR TEMPLATE IN FUTURE:
 *   Only update domConfig here — backend.js and index.js need no changes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// domConfig — used by parseDomOrder() in backend.js
// ─────────────────────────────────────────────────────────────────────────────
const domConfig = {

  // ── Flat fields ────────────────────────────────────────────────────────────
  // labelText    : text inside the label <td> (partial match, whitespace-normalised)
  // fallback     : tried if primary label not found
  // transform(v) : converts raw string → final typed value
  fields: {
    orderNo: {
      labelText: 'REL FOOD Ref.No',
      fallback:  'IRCTC Order No.',
      transform: v => v.trim(),
    },
    customerName: {
      labelText: 'Customer Name',
      transform: v => v.trim(),
    },
    // "Contact Number" may have two numbers: "7017853303, 8433299274"
    // Strip +91/91 prefix, return the first valid 10-digit Indian mobile.
    contactNo: {
      labelText: 'Contact Number',
      transform: v => {
        const raw = v.trim();
        const match = raw.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/);
        if (match) return match[1];
        const digits = raw.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return raw;
      },
    },
    trainInfo: {
      labelText: 'Train No./Name',
      transform: v => v.trim(),
    },
    coach: {
      labelText: 'Coach/Seat',
      transform: v => v.trim(),
    },
    pnr: {
      labelText: 'PNR',
      transform: v => v.trim() || null,   // often blank in RailFood emails
    },
    // Raw delivery string "5/31/2026 & 10:15" — split into date+time in postProcess
    _deliveryRaw: {
      labelText: 'Delivery Date',         // partial match covers "Delivery Date & Time"
      transform: v => v.trim(),
    },
    // "Payment to collect" is the ground-truth cash amount the delivery person collects.
    // RailFood spells the section heading "ORDER SUMMERY" (known typo — match as-is).
    totalAmount: {
      labelText: 'Payment to collect',
      transform: v => parseFloat(v.replace(/[^\d.]/g, '')) || 0,
    },
    paymentType: {
      labelText: 'Payment Mode',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'COD') return 'COD';
        if (['PAID','PRE_PAID','ONLINE','PREPAID'].includes(u)) return 'Prepaid';
        return u;
      },
    },
  },

  // ── Items table ────────────────────────────────────────────────────────────
  itemsTable: {
    // Column header text → internal field name (case-insensitive match).
    // To handle a future extra column (e.g. Discount): just add it here.
    columnMap: {
      'item'    : 'rawItem',   // <td> has item name + <br> + serving description
      'price'   : 'price',
      'quantity': 'qty',       // ← THIS is always the customer's ordered quantity
      'total'   : 'totalCol',  // IGNORED — always equals unit price (RailFood billing bug)
    },

    // The item <td> uses <br> to separate item name from serving description.
    // "br" = split on <br> tag (correct for current RailFood HTML structure).
    itemCellSplit: 'br',

    // Footer rows: stop item parsing when first cell is empty AND second cell
    // contains one of these strings.
    footerLabels: ['Sub Total', 'Delivery Fee', 'GST', 'Total'],
  },

  // ── Post-processing ────────────────────────────────────────────────────────
  // Runs after all fields and items are extracted.
  // Splits _deliveryRaw "M/D/YYYY & HH:MM" → deliveryDate + deliveryTime.
  postProcess(order) {
    const raw = order._deliveryRaw || '';
    const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[&]\s*(\d{1,2}:\d{2})/);
    if (m) {
      const [, mo, dd, yyyy, time] = m;
      order.deliveryDate = `${yyyy}-${mo.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      order.deliveryTime = time.length === 4 ? '0' + time : time; // ensure HH:MM
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;
    return order;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// matchers / type / rule  — unchanged from original, rule is AI fallback only
// ─────────────────────────────────────────────────────────────────────────────
const matchers = [
  { match: 'relfood',  name: 'Rail Food', type: 'railfood' },
  { match: 'railfood', name: 'Rail Food', type: 'railfood' },
];

const type = 'railfood';

const rule = `VENDOR: RAIL FOOD / REL FOOD
ORDER NO: Field label is "REL FOOD Ref.No" — value is a plain integer like "1049462".
Use this as orderNo. If missing, fall back to "IRCTC Order No".

EMAIL FORMAT: Pure HTML email (no PDF attachment). After HTML-to-text conversion,
table columns are separated by pipe "|" characters.

ITEMS TABLE STRUCTURE:
In the raw HTML each item row has a single <td> containing the item name and description
separated by a <br> tag. Depending on the HTML-to-text converter used, this renders in
one of two ways — handle BOTH:

  TWO-LINE format (br converted to newline):
    Line 1 = item name only          e.g. "Masala Dosa"
    Line 2 = Description | Price | Qty | Total   (pipe-separated)

  ONE-LINE format (br converted to space or dropped):
    Everything before the first "|" = item name + description combined
    Then: Price | Qty | Total   (pipe-separated, same column positions)

In BOTH formats, Quantity is always the number after the 2nd pipe "|".

STOP CONDITION — FOOTER ROWS:
Stop processing item rows when the item cell is empty and the next cell contains
any of: "Sub Total", "Delivery Fee", "GST", "Total". Do NOT parse these as items.

⚠️ CRITICAL — ANY DESCRIPTION STARTING WITH A NUMBER IS SERVING SIZE, NEVER QTY:
  "1 Pcs", "2 Pcs", "1 Dosa + Sambhar", "2 Idli + Sambar" — the leading digit is
  pieces-per-serving. NEVER use it as quantity.
  The ONLY source of truth for quantity is the number after the 2nd pipe "|".

⚠️ THE "1 Pcs" TRAP:
  "Butter Tawa Roti" + "1 Pcs | 225 | 3 | 225" → qty=3 NOT qty=1
  "Roasted Papad"    + "1 Pcs | 20  | 3 | 20"  → qty=3 NOT qty=1

COLUMN MAPPING:
  [Description] | [Price] | [Quantity] | [Total]
  Before 1st "|" = Description → append to name, NEVER qty
  After  1st "|" = Price
  After  2nd "|" = Quantity    → ONLY SOURCE OF TRUTH
  After  3rd "|" = Total       → IGNORE (always equals Price, known billing bug)

DO NOT verify Price × Quantity = Total. RailFood Total always = unit Price.

TOTAL: Use "Payment to collect" value as totalAmount.
- COACH: "Coach/Seat" field e.g. "B2/49"
- DATE: "Delivery Date & Time: 5/31/2026 & 10:15" → YYYY-MM-DD, HH:MM
- TRAIN: "Train No./Name" field
- CONTACT: first 10-digit number after stripping +91/91 prefix
- PAYMENT: "COD"→"COD", "PAID"/"PRE_PAID"/"Online"→"Prepaid"
- PNR: capture if present, null if blank`;

module.exports = { matchers, type, rule, domConfig };
