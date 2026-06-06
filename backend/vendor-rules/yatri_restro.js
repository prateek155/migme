"use strict";

/**
 * VENDOR: YATRI RESTRO
 * Sender domain : yatrirestro.com  (support@yatrirestro.com)
 * Transport     : Amazon SES (ap-south-1)
 * Content-Type  : text/html; charset=utf-8 — pure HTML single part, NO text/plain part.
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order No 1000471164 (31-May-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * ORDER DETAILS TABLE — 4 rows, 4 columns (label | value | label | value):
 *   Row 0: ["ORDER No",       "1000471164",            "MOBILE NO",       "9558959839"]
 *   Row 1: ["CUSTOMER NAME",  "Rushikesh Prajapati",   "TRAIN No /NAME",  "22932 / JSM BDTS SF EXP"]
 *   Row 2: ["DELIVERY DATE",  "31-05-2026, 11:53",     "COACH/BERTH",     "S1 / 43  "]
 *   Row 3: ["PAYMENT STATUS", "CASH_ON_DELIVERY",      "Station Code/Name","BRC / VADODARA JN"]
 *
 *   Values are DIRECT (no ": " prefix unlike Zoop). Trim whitespace from all values.
 *   Detection: first row contains "ORDER No" label (exact case).
 *
 * ITEMS TABLE — 5 columns: Item | Description | Price | Quantity | Amount
 *   Header row: ["Item", "Description", "Price", "Quantity", "Amount"]
 *   Item rows: 5 cells, all colspan=1.
 *   e.g. ["Veg Pulao", "500g", "₹ 165", "1", "₹ 165"]
 *
 *   Column indexes:
 *     0 = Item name
 *     1 = Description (serving size e.g. "500g") — NEVER a quantity
 *     2 = Price (format "₹ 165" — strip "₹ " to get number)
 *     3 = Quantity (plain integer, may have leading space " 1" — trim)
 *     4 = Amount (format "₹ 165" — strip "₹ " — cross-check only)
 *
 *   Item name (col 0) + Description (col 1) should be combined for display:
 *   e.g. "Veg Pulao" + "500g" → name = "Veg Pulao 500g"
 *   (Description is serving info, NEVER treated as item name or qty on its own.)
 *
 * FOOTER ROWS — colspan=4 on label cell + 1 value cell:
 *   "Sub Total"                           | ₹ 165
 *   "GST"                                 | ₹ 8.25
 *   "DISCOUNT"                            | ₹ 0
 *   "Grand Total (Inclusive of all taxes)"| ₹ 173  ← use as totalAmount
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * PRICE / AMOUNT stripping: "₹ 165" → strip "₹" and spaces → parseFloat("165").
 *   Both Price and Amount cells use "₹ N" format.
 *
 * COACH: "COACH/BERTH" value "S1 / 43  " → trim → normalize "/" → "S1/43"
 *
 * DATE: "DELIVERY DATE" format "DD-MM-YYYY, HH:MM" (dash-separated date, comma before time)
 *   → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM
 *   e.g. "31-05-2026, 11:53" → deliveryDate=2026-05-31, deliveryTime=11:53
 *
 * PAYMENT: "PAYMENT STATUS" label.
 *   "CASH_ON_DELIVERY"→"COD", "PREPAID"/"PRE_PAID"/"ONLINE"/"PAID"→"Prepaid"
 *
 * QTY CROSS-CHECK: Price × Qty = Amount (always correct for Yatri Restro).
 *   If mismatch: Qty = round(Amount ÷ Price). Strip ₹ from both before compare.
 */

const domConfig = {

  fields: {
    orderNo: {
      labelText: 'ORDER No',
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText: 'MOBILE NO',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    customerName: {
      labelText: 'CUSTOMER NAME',
      transform: v => v.trim() || null,
    },

    trainInfo: {
      labelText: 'TRAIN No /NAME',
      transform: v => v.trim() || null,
    },

    _deliveryRaw: {
      labelText: 'DELIVERY DATE',
      transform: v => v.trim(),
    },

    coach: {
      labelText: 'COACH/BERTH',
      transform: v => v.trim().replace(/\s*\/\s*/g, '/') || null,
    },

    paymentType: {
      labelText: 'PAYMENT STATUS',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'CASH_ON_DELIVERY' || u === 'COD') return 'COD';
        if (['PREPAID','PRE_PAID','ONLINE','PAID'].includes(u)) return 'Prepaid';
        return 'COD';
      },
    },
    // totalAmount from "Grand Total" footer via captureFooterTotal
  },

  itemsTable: {
    /**
     * CONFIRMED column indexes (0-based):
     *   0=Item  1=Description  2=Price  3=Quantity  4=Amount
     *
     * Item rows: 5 cells, all colspan=1.
     * Footer rows: 2 cells, first has colspan=4.
     * Detection: header row = ["Item","Description","Price","Quantity","Amount"]
     */
    columnMap: {
      'item':        'rawItem',   // index 0 — item name
      'description': 'desc',      // index 1 — serving size, NOT qty
      'price':       'price',     // index 2 — "₹ 165" format
      'quantity':    'qty',       // index 3 — plain integer (may have leading space)
      'amount':      'amountCol', // index 4 — "₹ 165" format, cross-check only
    },

    // Item name = col 0 + col 1 (description) appended: "Veg Pulao 500g"
    appendDescToName: true,

    // Price and Amount cells have "₹ " prefix — strip before parseFloat.
    stripCurrencyPrefix: '₹',

    footerLabels: ['Sub Total', 'GST', 'DISCOUNT', 'Grand Total'],
    // Footer rows: colspan=4 on label + 1 value cell.
    captureFooterTotal: 'Grand Total',  // "Grand Total (Inclusive of all taxes)" → totalAmount

    enableQtyCrossCheck: true,
    // Price × Qty = Amount (always exact). Strip ₹ from both before compare.
  },

  postProcess(order) {
    // ── Parse _deliveryRaw → deliveryDate + deliveryTime ───────────────────
    // Supports two formats:
    //   1) "DD-MM-YYYY, HH:MM"  (e.g. "31-05-2026, 11:53")
    //   2) Full JS Date string  (e.g. "Sat Jun 06 2026 15:20:00 GMT+0000 ...")
    const raw = order._deliveryRaw || '';
    let m = raw.match(/(\d{2})-(\d{2})-(\d{4}),?\s*(\d{1,2}:\d{2})/);
    if (m) {
      order.deliveryDate = `${m[3]}-${m[2]}-${m[1]}`;  // YYYY-MM-DD
      order.deliveryTime = m[4].length === 4 ? '0' + m[4] : m[4];
    } else {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        order.deliveryDate = `${yyyy}-${mm}-${dd}`;
        order.deliveryTime = `${hh}:${min}`;
      } else {
        order.deliveryDate = null;
        order.deliveryTime = null;
      }
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

    // ── totalAmount from "Grand Total" footer ──────────────────────────────
    if (order._itemsTotal && order._itemsTotal > 0) {
      order.totalAmount = order._itemsTotal;
    }
    delete order._itemsTotal;

    return order;
  },
};

const matchers = [
  { match: 'yatrirestro', name: 'Yatri Restro', type: 'yatri_restro' },
  { match: 'yatristro',   name: 'Yatri Restro', type: 'yatri_restro' },
];

const type = 'yatri_restro';

const rule = `VENDOR: YATRI RESTRO
SENDER: support@yatrirestro.com | FORMAT: Pure HTML single-part (no text/plain). Amazon SES.

ORDER NO: "ORDER No" label — plain integer e.g. "1000471164".

ORDER DETAILS TABLE — 4 rows, 4 columns (label | value | label | value):
  No ": " prefix — values are direct.
  Row 0: ORDER No       | 1000471164            | MOBILE NO         | 9558959839
  Row 1: CUSTOMER NAME  | Rushikesh Prajapati   | TRAIN No /NAME    | 22932 / JSM BDTS SF EXP
  Row 2: DELIVERY DATE  | 31-05-2026, 11:53     | COACH/BERTH       | S1 / 43
  Row 3: PAYMENT STATUS | CASH_ON_DELIVERY      | Station Code/Name | BRC / VADODARA JN

- ORDER NO:   "ORDER No" → plain integer string.
- CONTACT:    "MOBILE NO" → 10-digit number.
- CUSTOMER:   "CUSTOMER NAME".
- TRAIN:      "TRAIN No /NAME" → full string e.g. "22932 / JSM BDTS SF EXP".
- DATE/TIME:  "DELIVERY DATE" format "DD-MM-YYYY, HH:MM"
  → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  e.g. "31-05-2026, 11:53" → deliveryDate=2026-05-31, deliveryTime=11:53
- COACH:      "COACH/BERTH" → trim trailing spaces → normalize "/" → "S1/43".
- PAYMENT:    "PAYMENT STATUS" → "CASH_ON_DELIVERY"/"COD"→"COD" | "PREPAID"→"Prepaid".

ITEMS TABLE — 5 columns: Item | Description | Price | Quantity | Amount
  Confirmed row: ["Veg Pulao", "500g", "₹ 165", "1", "₹ 165"]
  Column 0 = Item name.
  Column 1 = Description (serving size e.g. "500g") — NEVER a quantity.
             Append to item name: "Veg Pulao 500g".
  Column 2 = Price (format "₹ 165" — strip "₹" and spaces → 165).
  Column 3 = Quantity (plain integer, may have leading space " 1" — trim → 1).
  Column 4 = Amount (format "₹ 165" — cross-check only).

  *** Description column (col 1) is serving size ONLY — never a quantity ***
  *** Quantity is always col 3, a plain integer in its OWN separate cell ***

MANDATORY cross-check: Price × Qty = Amount (always exact for Yatri Restro).
  Strip ₹ from Price and Amount before comparing.
  If mismatch: Qty = round(Amount ÷ Price).

FOOTER ROWS (colspan=4 on label, value in last cell — ₹ present):
  Sub Total                              | ₹ 165
  GST                                    | ₹ 8.25
  DISCOUNT                               | ₹ 0
  Grand Total (Inclusive of all taxes)   | ₹ 173  ← use as totalAmount (strip ₹)

- totalAmount: "Grand Total (Inclusive of all taxes)" value.
- tax: "GST" value.`;

module.exports = { matchers, type, rule, domConfig };
