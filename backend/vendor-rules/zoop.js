"use strict";

/**
 * VENDOR: ZOOP INDIA
 * Sender domain : zoopindia.com  (noreply@zoopindia.com)
 * Transport     : Amazon SES
 * Content-Type  : text/html; charset=utf-8 — pure HTML single part, NO text/plain part.
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml ZO29663100616818 (31-May-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * IMPORTANT: Cheerio sees ONE giant nested table (the email wrapper).
 * Do NOT match tables by index — match by finding the first 4-col row
 * whose first cell text equals "ZOOP Txn. No." for order details, and
 * the first 4-col row whose cells are ["Item Name","Price","Quantity","Amount"]
 * for items.
 *
 * ORDER DETAILS TABLE — rows with exactly 4 cells, label+value pairs:
 *   Row 0: ["ZOOP Txn. No.", ": ZO29663100616818", "Type",          ": Prepaid"]
 *   Row 1: ["Customer Name", ": Shivani Gadge",    "Phone",         ": 9619770718"]
 *   Row 2: ["Train",         ": Mmct Duronto/ 22210","Coach/ Seat", ": M1/ 10"]
 *   Row 3: ["Restaurants Name",":(1466) Shri Krishna Food","ETA",   ": 31-May-2026 10:33"]
 *   Row 4: ["At",            ": Vadodara Jn/ BRC", "Delivery Date", ": 31-May-2026 10:33"]
 *
 *   Value cells start with ": " — strip that prefix to get the actual value.
 *   e.g. ": ZO29663100616818" → "ZO29663100616818"
 *
 * ITEMS TABLE — 4 columns: Item Name | Price | Quantity | Amount
 *   Header row cells: ["Item Name", "Price", "Quantity", "Amount"]
 *   Item rows: exactly 4 cells, NO colspan, plain numbers (no ₹ symbol).
 *   e.g. ["Poha", "60", "3", "180"] → name=Poha, price=60, qty=3, amount=180
 *
 *   Footer rows: colspan="3" on first cell + one value cell.
 *   Footer label → value:
 *     "Base Price Total"          → ₹ 180
 *     "(+) GST on food"           → ₹ 9
 *     "(+) Delivery Charge"       → ₹ 25.42
 *     "(+) GST on Delivery Charge"→ ₹ 4.58
 *     "(+) Gateway Platform Fees" → ₹ 20
 *     "(-) Discount"              → ₹ 0
 *     "Order Total"               → ₹ 239   ← use as totalAmount
 *     "(-) Paid Online"           → ₹ 239
 *     "BALANCE TO PAY"            → ₹ 0
 *
 * ITEM DESCRIPTION TABLE (IGNORE ENTIRELY):
 *   A separate 2-col table below items: ["Item Name", "Description"]
 *   e.g. ["Poha", "250g"] — serving size info, NOT part of order items.
 *   Detected by header row = ["Item Name","Description"] — skip this table completely.
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO: "ZOOP Txn. No." label → full ZO... string exactly as-is (no stripping).
 *
 * VALUE STRIPPING: All value cells start with ": " prefix — always strip it.
 *   e.g. ": ZO29663100616818" → "ZO29663100616818"
 *   e.g. ": M1/ 10" → "M1/ 10" → normalize to "M1/10"
 *
 * COACH: "Coach/ Seat" label → value ": M1/ 10" → strip prefix → "M1/ 10"
 *   Normalize spaces around "/": "M1/ 10" → "M1/10"
 *
 * DATE & TIME: "Delivery Date" label (Row 4, right column) — NOT "ETA".
 *   Both ETA and Delivery Date have same value: "31-May-2026 10:33"
 *   Format: DD-Mon-YYYY HH:MM
 *   Mon: Jan=01 Feb=02 Mar=03 Apr=04 May=05 Jun=06 Jul=07 Aug=08 Sep=09 Oct=10 Nov=11 Dec=12
 *   → deliveryDate=2026-05-31, deliveryTime=10:33
 *
 * PAYMENT: "Type" label → "Prepaid"→"Prepaid", "COD"→"COD"
 *   (value cell may bold the text — text content is what matters)
 *
 * ITEMS — QUANTITY: column index 2 ("Quantity") — plain integer.
 *   Price column index 1, Amount column index 3.
 *   NO ₹ symbol in item rows — values are plain numbers.
 *   MANDATORY cross-check: Price × Qty = Amount (always exact for Zoop).
 *   If mismatch: Qty = round(Amount ÷ Price).
 *
 * ITEMS — DO NOT CONFUSE:
 *   The "Item Description" table (2 cols: Item Name | Description) appears BELOW items.
 *   It contains serving sizes (e.g. "Poha | 250g"). NEVER extract items from it.
 *   Detection: skip any table whose header row has exactly 2 cells = ["Item Name","Description"].
 *
 * TOTAL: "Order Total" footer row → strip "₹ " prefix → parseFloat → totalAmount.
 * deliveryCharge: "(+) Delivery Charge" footer value.
 * tax: "(+) GST on food" footer value.
 */

const domConfig = {

  fields: {
    orderNo: {
      labelText:  'ZOOP Txn. No.',
      valuePrefix: ': ',
      transform: v => v.trim() || null,
    },

    paymentType: {
      labelText:  'Type',
      valuePrefix: ': ',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'COD' || u === 'CASH_ON_DELIVERY') return 'COD';
        if (['PREPAID','PRE_PAID','ONLINE','PAID'].includes(u)) return 'Prepaid';
        // value cell may just contain the word already (bold tag)
        if (v.trim().toLowerCase() === 'prepaid') return 'Prepaid';
        return v.trim() || 'COD';
      },
    },

    customerName: {
      labelText:  'Customer Name',
      valuePrefix: ': ',
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText:  'Phone',
      valuePrefix: ': ',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    trainInfo: {
      labelText:  'Train',
      valuePrefix: ': ',
      transform: v => v.trim() || null,
    },

    coach: {
      labelText:  'Coach/ Seat',
      valuePrefix: ': ',
      transform: v => v.trim().replace(/\s*\/\s*/g, '/') || null,
    },

    _deliveryRaw: {
      labelText:  'Delivery Date',
      valuePrefix: ': ',
      transform: v => v.trim(),
    },
    // totalAmount captured from "Order Total" footer via captureFooterTotal
  },

  itemsTable: {
    /**
     * CONFIRMED column indexes (0-based):
     *   0=Item Name  1=Price  2=Quantity  3=Amount
     *
     * Item rows: 4 cells, all colspan=1, plain numbers (no ₹).
     * Footer rows: 2 cells, first has colspan=3.
     * Detection: header row exactly ["Item Name","Price","Quantity","Amount"]
     * Skip table if header is ["Item Name","Description"] — that's serving-size table.
     */
    columnMap: {
      'item name': 'rawItem',   // index 0 — item name
      'price':     'price',     // index 1 — unit price (no ₹)
      'quantity':  'qty',       // index 2 — ordered quantity
      'amount':    'amountCol', // index 3 — row total (cross-check only)
    },

    // No description column in Zoop items table — item name is clean in its own cell.
    itemCellSplit: null,

    footerLabels: [
      'Base Price Total', '(+) GST on food', '(+) Delivery Charge',
      '(+) GST on Delivery Charge', '(+) Gateway Platform Fees',
      '(-) Discount', 'Order Total', '(-) Paid Online', 'BALANCE TO PAY',
    ],

    // Footer rows have colspan=3 on label cell + 1 value cell.
    // Detection: cells.length === 2 (after colspan collapse).
    captureFooterTotal: 'Order Total',  // → order._itemsTotal → totalAmount

    // Skip "Item Description" table (serving sizes) — detected by 2-col header.
    skipTableIfHeader: ['item name', 'description'],

    enableQtyCrossCheck: true,
    // Price (plain integer/float) × Qty = Amount (always exact for Zoop)
    // No ₹ symbol in item cells — parseFloat directly.
  },

  postProcess(order) {
    // ── Parse _deliveryRaw → deliveryDate + deliveryTime ───────────────────
    // Format: "31-May-2026 10:33"  (DD-Mon-YYYY HH:MM)
    const MONTHS = {
      jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
      jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    };
    const raw = order._deliveryRaw || '';
    const m = raw.match(/(\d{1,2})-(\w{3})-(\d{4})\s+(\d{1,2}:\d{2})/);
    if (m) {
      const mo = MONTHS[m[2].toLowerCase()];
      order.deliveryDate = mo ? `${m[3]}-${mo}-${m[1].padStart(2,'0')}` : null;
      order.deliveryTime = m[4].length === 4 ? '0' + m[4] : m[4];
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;

    // ── Qty cross-check ────────────────────────────────────────────────────
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        if (item._amount && item.price > 0) {
          const expected = item.price * item.quantity;
          if (Math.abs(expected - item._amount) > 1) {
            const corrected = Math.round(item._amount / item.price);
            if (corrected > 0) item.quantity = corrected;
          }
          delete item._amount;
        }
      }
    }

    // ── totalAmount from "Order Total" footer ──────────────────────────────
    if (order._itemsTotal && order._itemsTotal > 0) {
      order.totalAmount = order._itemsTotal;
    }
    delete order._itemsTotal;

    return order;
  },
};

const matchers = [
  { match: 'zoopindia', name: 'Zoop India', type: 'zoop' },
  { match: 'zoop',      name: 'Zoop India', type: 'zoop' },
];

const type = 'zoop';

const rule = `VENDOR: ZOOP INDIA
SENDER: noreply@zoopindia.com | FORMAT: Pure HTML single-part (no text/plain). Amazon SES.

ORDER NO: "ZOOP Txn. No." label — use the full ZO... string exactly as-is.
  e.g. ": ZO29663100616818" → strip ": " prefix → orderNo = "ZO29663100616818"

ORDER DETAILS TABLE — 5 rows, 4 columns each (label | ": value" | label | ": value"):
  Row 0: ZOOP Txn. No.    | : ZO29663100616818         | Type          | : Prepaid
  Row 1: Customer Name    | : Shivani Gadge             | Phone         | : 9619770718
  Row 2: Train            | : Mmct Duronto/ 22210       | Coach/ Seat   | : M1/ 10
  Row 3: Restaurants Name | : (1466) Shri Krishna Food  | ETA           | : 31-May-2026 10:33
  Row 4: At               | : Vadodara Jn/ BRC          | Delivery Date | : 31-May-2026 10:33

ALL VALUE CELLS begin with ": " — always strip this prefix before using the value.

- ORDER NO:  "ZOOP Txn. No." → strip ": " → full ZO... string.
- PAYMENT:   "Type" → strip ": " → "Prepaid"→"Prepaid", "COD"→"COD".
- CUSTOMER:  "Customer Name" → strip ": ".
- CONTACT:   "Phone" → strip ": " → 10-digit number, strip +91/91 prefix.
- TRAIN:     "Train" → strip ": " → full string e.g. "Mmct Duronto/ 22210".
- COACH:     "Coach/ Seat" → strip ": " → normalize spaces around / → "M1/10".
- DATE/TIME: "Delivery Date" (Row 4 RIGHT) — NOT "ETA". Both have same value.
  Format: DD-Mon-YYYY HH:MM → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  e.g. "31-May-2026 10:33" → deliveryDate=2026-05-31, deliveryTime=10:33

ITEMS TABLE — 4 columns: Item Name | Price | Quantity | Amount
  Confirmed row: ["Poha", "60", "3", "180"]
  - Item Name = col 0. Price = col 1 (plain number, NO ₹). Quantity = col 2. Amount = col 3.
  - NO description column in items table. NO ₹ symbol in item cells.
  - Quantity is a plain integer in its own cell — never inside item name.
  MANDATORY cross-check: Price × Qty = Amount (always exact for Zoop).
  If mismatch: Qty = round(Amount ÷ Price).

  *** ITEM DESCRIPTION TABLE — IGNORE COMPLETELY ***
  A separate 2-col table below items has header ["Item Name", "Description"].
  It lists serving sizes: e.g. "Poha | 250g".
  This is NOT an items table. Never extract items or quantities from it.
  Detection: skip any table whose header row is exactly ["Item Name", "Description"].

FOOTER ROWS (colspan=3 on label, value in last cell — ₹ symbol present):
  Base Price Total          | ₹ 180
  (+) GST on food           | ₹ 9
  (+) Delivery Charge       | ₹ 25.42
  (+) GST on Delivery Charge| ₹ 4.58
  (+) Gateway Platform Fees | ₹ 20
  (-) Discount              | ₹ 0
  Order Total               | ₹ 239  ← USE as totalAmount (strip ₹)
  (-) Paid Online           | ₹ 239
  BALANCE TO PAY            | ₹ 0

- totalAmount: "Order Total" value (strip "₹ ").
- deliveryCharge: "(+) Delivery Charge" value.
- tax: "(+) GST on food" value.`;

module.exports = { matchers, type, rule, domConfig };
