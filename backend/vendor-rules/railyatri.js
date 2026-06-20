'use strict';

/**
 * VENDOR: RailYatri
 * Sender:  no-reply@railyatri.in
 * Content-Type: multipart/alternative — has BOTH text/plain AND text/html parts.
 * Transfer: quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order No 4312161 (20-Jun-2026)
 *
 * ── EMAIL FORMAT ───────────────────────────────────────────────────────────
 *
 * ⚠ NO AI CALL NEEDED — fully DOM/text parseable.
 *   Part 1: text/plain → ALL order fields (label → next non-empty line = value)
 *   Part 2: text/html  → items table + footer totals ONLY
 *
 * ── TEXT/PLAIN LAYOUT ──────────────────────────────────────────────────────
 *
 *   Hotel Samrat                       ← vendor name (ignore)
 *   Service Details                    ← section header (ignore)
 *   Order ID                           ← label
 *   4312161                            ← value
 *   Date of Invoice                    ← label
 *   20-06-2026                         ← value (ignored — use Delivery Date)
 *   Customer Name                      ← label
 *   Manish kumar sai                   ← value
 *   Contact No.                        ← label
 *   9001834207                         ← value
 *   Mode of Payment                    ← label
 *   COD                                ← value
 *   Invoice Status Unpaid              ← single line (ignore)
 *   Delivery at Vadodara Junction      ← inline station — regex /Delivery at (.+)/i
 *   Delivery Date                      ← label
 *   20-06-2026                         ← value → deliveryDate
 *   Expected Time                      ← label
 *   20:59                              ← value → deliveryTime
 *   Train                              ← label
 *   12989 -  DDR AJMER SF EXP         ← value → trainInfo + trainName
 *   Coach and Seat No.                 ← label
 *   A1 , 8                             ← value → coach
 *
 * ── HTML ITEMS TABLE ───────────────────────────────────────────────────────
 *
 * <table id="order-details"> — 5 columns per item row:
 *
 *   Col 0: Item name    e.g. "Tawa Roti Plain"
 *   Col 1: Quantity     e.g. "9"               ← ALWAYS use this for qty
 *   Col 2: Formula      e.g. "(9 * 19)"        ← extract unit price after "*"
 *   Col 3: "Rs."        ← currency label (ignore)
 *   Col 4: Line total   e.g. "171"             ← cross-check: qty × unitPrice = lineTotal
 *
 *   Formula always uses "*" operator: "(qty * unitPrice)"
 *   Unit price regex: /\*\s*(\d+(?:\.\d+)?)/ → captures 19 from "(9 * 19)"
 *   Cross-check: parseInt(col1) × parseFloat(unitPrice) should equal parseFloat(col4)
 *
 * Sample rows from verified EML:
 *   ["Tawa Roti Plain",  "9", "(9 * 19)",   "Rs.", "171"]  → qty=9,  price=19,  total=171
 *   ["Veg Kolhapuri",    "1", "(1 * 239)",  "Rs.", "239"]  → qty=1,  price=239, total=239
 *
 * ── HTML FOOTER TOTALS ─────────────────────────────────────────────────────
 *
 * Three separate <table> elements below items table (all strip "Rs."):
 *
 *   Table 1 — totals breakdown:
 *     Sub Total              → subTotal          e.g. 410
 *     Tax                    → tax               e.g. 0   (style="display:none" — parse anyway)
 *     Delivery Charge        → deliveryCharge    e.g. 0   (style="display:none" — parse anyway)
 *     Convenience Charge     → convenienceCharge e.g. 0   (style="display:none" — parse anyway)
 *     Discount               → discount          e.g. 50
 *
 *   Table 2 — grand total (white background):
 *     Grand Total            → totalAmount       e.g. 360  ← USE THIS as totalAmount
 *
 *   Table 3 — COD collection (grey background #9E9E9E):
 *     Amount to be collected → codCollectionAmount e.g. 378  ← cash to collect from customer
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO:   Subject "New order request #4312161" → strip "#" → "4312161"
 *             Fallback: text/plain "Order ID" label → next non-empty line
 *
 * CUSTOMER:   text/plain "Customer Name" → next non-empty line → "Manish kumar sai"
 *             ✅ Customer name IS present in RailYatri emails.
 *
 * CONTACT:    text/plain "Contact No." → next non-empty line → 10-digit
 *
 * PAYMENT:    text/plain "Mode of Payment" → next non-empty line
 *             "COD" / "CASH_ON_DELIVERY" → "COD"
 *             "ONLINE" / "PAID" / "PREPAID" / anything else → "Prepaid"
 *
 * STATION:    text/plain inline line matching /Delivery at (.+)/i
 *             "Delivery at Vadodara Junction" → "Vadodara Junction"
 *
 * DATE:       text/plain "Delivery Date" → next non-empty line
 *             Format DD-MM-YYYY → reorder → deliveryDate = "2026-06-20"
 *
 * TIME:       text/plain "Expected Time" → next non-empty line → "20:59"
 *
 * TRAIN:      text/plain "Train" → next non-empty line
 *             "12989 -  DDR AJMER SF EXP"
 *             trainInfo → digits before first " -" → "12989"
 *             trainName → trimmed text after " - "  → "DDR AJMER SF EXP"
 *
 * COACH:      text/plain "Coach and Seat No." → next non-empty line
 *             "A1 , 8" → replace /\s*,\s*/ with "/" → "A1/8"
 *
 * ITEMS:      HTML <table id="order-details">
 *             Col 1 → qty (parseInt)
 *             Col 2 → unitPrice (parseFloat after /\*\s*(\d+(?:\.\d+)?)/)
 *             Col 4 → lineTotal (parseFloat, strip "Rs.")
 *             Cross-check: qty × unitPrice === lineTotal (warn if mismatch)
 *
 * TOTAL:      HTML Table 2 "Grand Total" last <td> → strip "Rs." → totalAmount
 * COD AMT:    HTML Table 3 "Amount to be collected" last <td> → codCollectionAmount
 * DISCOUNT:   HTML Table 1 "Discount" last <td> → discount
 */

const textConfig = {
  // text/plain part — label on one line, value on next non-empty trimmed line
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
        return 'Prepaid';
      },
    },

    _deliveryDateRaw: {
      labelText: 'Delivery Date',
      transform: v => v.trim(),
    },

    deliveryTime: {
      labelText: 'Expected Time',
      transform: v => v.trim() || null,
    },

    _trainRaw: {
      labelText: 'Train',
      transform: v => v.trim(),
    },

    _coachRaw: {
      labelText: 'Coach and Seat No.',
      transform: v => v.trim(),
    },
  },

  // Single inline line — not label+value, matched by regex against each line
  inlinePatterns: {
    deliveryStation: /^Delivery at (.+)$/i, // "Delivery at Vadodara Junction" → "Vadodara Junction"
  },
};

const domConfig = {
  // HTML part — items table + footer totals only
  itemsTable: {
    tableSelector: '#order-details', // <table id="order-details">

    columns: {
      0: 'name',    // item name string
      1: 'qty',     // quantity — parseInt directly
      2: 'formula', // "(qty * unitPrice)" — extract unitPrice via /\*\s*(\d+(?:\.\d+)?)/
      // col 3 = "Rs." currency label — skip
      4: 'lineTotal', // line total — parseFloat, strip "Rs."
    },

    // qty always from col 1 (direct integer)
    // unitPrice always from col 2 formula after "*"
    // lineTotal from col 4 — cross-check: qty × unitPrice should equal lineTotal
    unitPriceRegex: /\*\s*(\d+(?:\.\d+)?)/, // extracts 19 from "(9 * 19)"
    enableCrossCheck: true, // warn if qty × unitPrice !== lineTotal

    stripCurrency: 'Rs.',
  },

  footerTables: {
    // Three separate <table> elements after items table
    // Each row: <th>Label</th>...<td>value</td> — value always in last <td>

    table1: {
      // Totals breakdown table
      rows: {
        'Sub Total':           { field: 'subTotal' },
        'Tax':                 { field: 'tax' },
        'Delivery Charge':     { field: 'deliveryCharge' },
        'Convenience Charge':  { field: 'convenienceCharge' },
        'Discount':            { field: 'discount' },
      },
    },

    table2: {
      // Grand Total table (white background)
      rows: {
        'Grand Total': { field: 'totalAmount' }, // ← USE THIS as totalAmount
      },
    },

    table3: {
      // COD collection table (grey background #9E9E9E)
      rows: {
        'Amount to be collected': { field: 'codCollectionAmount' }, // cash to collect
      },
    },

    stripCurrency: 'Rs.',
  },
};

const postProcess = (order) => {
  // ── DELIVERY DATE ──────────────────────────────────────────────────────────
  // Raw: "20-06-2026" → DD-MM-YYYY → reorder → "2026-06-20"
  const dr = order._deliveryDateRaw || '';
  const dm = dr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dm) {
    order.deliveryDate = `${dm[3]}-${dm[2]}-${dm[1]}`;
  } else {
    order.deliveryDate = null;
  }
  delete order._deliveryDateRaw;

  // ── TRAIN INFO ─────────────────────────────────────────────────────────────
  // Raw: "12989 -  DDR AJMER SF EXP"
  // trainInfo → "12989"
  // trainName → "DDR AJMER SF EXP"
  const trainRaw = order._trainRaw || '';
  const trainMatch = trainRaw.match(/^(\d+)\s*-\s*(.+)$/);
  if (trainMatch) {
    order.trainInfo = trainMatch[1].trim();
    order.trainName = trainMatch[2].trim();
  } else {
    order.trainInfo = trainRaw || null;
    order.trainName = null;
  }
  delete order._trainRaw;

  // ── COACH / SEAT ───────────────────────────────────────────────────────────
  // Raw: "A1 , 8" → normalize " , " → "/" → "A1/8"
  const coachRaw = order._coachRaw || '';
  order.coach = coachRaw.replace(/\s*,\s*/g, '/').trim() || null;
  delete order._coachRaw;

  return order;
};

const matchers = [
  { match: 'railyatri', name: 'RailYatri', type: 'railyatri' },
];

const type = 'railyatri';

const rule = `VENDOR: RailYatri (EMAIL)
SENDER: no-reply@railyatri.in | FORMAT: multipart/alternative (text/plain + text/html).

⚠ NO AI CALL REQUIRED — fully DOM/text parseable.
  text/plain → all order fields.
  text/html  → items table + footer totals only.

SUBJECT: "New order request #4312161"
  → orderNo: strip "#" → "4312161"
  → Fallback: text/plain "Order ID" label → next non-empty line.

── TEXT/PLAIN FIELDS ──────────────────────────────────────────────────────
Each field: label on one line → value on next non-empty trimmed line.

  Order ID           → orderNo       e.g. "4312161"
  Customer Name      → customerName  e.g. "Manish kumar sai"
                       ✅ Customer name IS present in RailYatri emails.
  Contact No.        → contactNo     e.g. "9001834207" (10-digit)
  Mode of Payment    → paymentType   "COD"/"CASH_ON_DELIVERY"→"COD"
                                     "ONLINE"/"PAID"/"PREPAID"/else→"Prepaid"
  Delivery Date      → deliveryDate  "20-06-2026" DD-MM-YYYY → reorder → "2026-06-20"
  Expected Time      → deliveryTime  e.g. "20:59"
  Train              → trainInfo + trainName
                       Raw: "12989 -  DDR AJMER SF EXP"
                       trainInfo → digits before " -" → "12989"
                       trainName → text after  " - " → "DDR AJMER SF EXP"
  Coach and Seat No. → coach
                       Raw: "A1 , 8" → replace /\s*,\s*/ with "/" → "A1/8"

SPECIAL INLINE LINE (single line matched by regex — not label+value):
  "Delivery at Vadodara Junction" → /^Delivery at (.+)/i → "Vadodara Junction"

── HTML ITEMS TABLE ────────────────────────────────────────────────────────
Table: <table id="order-details"> — 5 columns per item row:

  Col 0 = Item name   e.g. "Tawa Roti Plain"
  Col 1 = Quantity    e.g. "9"              ← ALWAYS use col 1 for qty (parseInt)
  Col 2 = Formula     e.g. "(9 * 19)"      ← extract unitPrice after "*"
                           regex: /\*\s*(\d+(?:\.\d+)?)/ → 19
  Col 3 = "Rs."       ← currency label — SKIP
  Col 4 = Line total  e.g. "171"           ← parseFloat, strip "Rs."
                           cross-check: qty(col1) × unitPrice(col2) = lineTotal(col4)

  Verified sample rows:
    ["Tawa Roti Plain", "9", "(9 * 19)",  "Rs.", "171"] → qty=9,  price=19,  total=171
    ["Veg Kolhapuri",   "1", "(1 * 239)", "Rs.", "239"] → qty=1,  price=239, total=239

── HTML FOOTER TOTALS ──────────────────────────────────────────────────────
Three separate <table> elements after items table. Strip "Rs." from all values.
Value always in last <td> of each row.

  Table 1 — breakdown:
    Sub Total              → subTotal           e.g. 410
    Tax                    → tax                e.g. 0  (may be display:none — parse anyway)
    Delivery Charge        → deliveryCharge     e.g. 0  (may be display:none — parse anyway)
    Convenience Charge     → convenienceCharge  e.g. 0  (may be display:none — parse anyway)
    Discount               → discount           e.g. 50

  Table 2 — white background:
    Grand Total            → totalAmount        e.g. 360  ← USE THIS as totalAmount

  Table 3 — grey background (#9E9E9E):
    Amount to be collected → codCollectionAmount e.g. 378 ← actual COD cash to collect from customer

- totalAmount:         "Grand Total" value.
- codCollectionAmount: "Amount to be collected" (COD orders only).
- discount:            "Discount" value.`;

module.exports = { matchers, type, rule, textConfig, domConfig, postProcess };
