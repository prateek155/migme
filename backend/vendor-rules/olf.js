'use strict';

/**
 * VENDOR: OLF STORE
 * Sender domain: olfstores.com
 * Content-Type: multipart/alternative (text/plain + text/html) — HTML part used.
 * Transfer: quoted-printable
 *
 * VERIFIED AGAINST: real .eml ORDER ID:2464830579 (11-Jul-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * ORDER SUMMARY TABLE — label | value pairs, one row per field (2 <td> per row):
 *   IRCTC Order ID       | 2464830579
 *   Customer Name        | Shikha Panchal
 *   Contact No.          | 9820901025
 *   Mode of Payment      | CASH_ON_DELIVERY
 *   Delivery at          | VADODARA JN
 *   Delivery Date        | 07-11-2026 22:30 IST
 *   Expected Time        | 07-11-2026 22:30 IST
 *   Train                | 22928 - LOKSHAKTI EXP
 *   Coach and Seat No.   | M1 , 20
 *   Comments             | (usually empty)
 *
 * ITEMS TABLE — 5 <th>/<td> columns (2 are blank spacer cells used for the
 * "Rs." currency symbol / layout — NOT extra data columns):
 *   Header: ["Item", "Quantity", "", "", "Price"]
 *   Row:    ["Veg Delux Burger", "1", "", "Rs.", "161.7"]
 *   → column 0 = item name, column 1 = quantity, column 4 = price.
 *
 * FOOTER ROWS — SEPARATE <table> right after the items table, but still
 * plain sibling <tr> elements picked up by the same table-row scan
 * (5 cells: label <th> | ":" | "" | "Rs." | value):
 *   Sub Total: :   Rs.  162
 *   GST:       :   Rs.  7.7
 *   Discount:  :   Rs.  0
 *   Total      :   Rs.  162   ← totalAmount
 *
 * ── KEY PARSING RULES / GOTCHAS ────────────────────────────────────────────
 *
 * DATE:  "Delivery Date" format is "MM-DD-YYYY HH:MM IST" (US-style,
 *        month FIRST) — confirmed against the email's own send timestamp
 *        (order sent 11-Jul-2026, "Delivery Date" printed "07-11-2026" =
 *        July 11). Do NOT treat this as DD-MM-YYYY or the month/day will
 *        flip silently on any date where day <= 12.
 * COACH: "Coach and Seat No." is a single comma-separated cell
 *        (e.g. "M1 , 20") → normalise to "M1/20".
 * PRICE: Items table "Price" column — verified only against a qty=1 order
 *        so far. Treated as the row's line amount as printed (not divided
 *        by quantity). If a qty>1 OLF order is seen, cross-check against
 *        Sub Total to confirm whether Price is per-unit or line-total, and
 *        update this file if it turns out to be per-unit.
 * PAYMENT: "Mode of Payment" → "CASH_ON_DELIVERY" → "COD", else "Prepaid".
 */

const domConfig = {
  fields: {
    orderNo: {
      labelText: 'IRCTC Order ID',
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
        if (u.includes('CASH') || u.includes('COD')) return 'COD';
        if (u.includes('PREPAID') || u.includes('ONLINE') || u.includes('PAID')) return 'Prepaid';
        return 'COD';
      },
    },

    _deliveryRaw: {
      labelText: 'Delivery Date',
      transform: v => v.trim(),
    },

    trainInfo: {
      labelText: 'Train',
      transform: v => v.trim() || null,
    },

    coach: {
      labelText: 'Coach and Seat No.',
      transform: v =>
        v
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
          .join('/') || null,
    },
  },

  itemsTable: {
    columnMap: {
      'Item':      'rawItem',   // index 0 — item name
      'Quantity':  'qty',       // index 1 — quantity
      '__empty1':  '__skip1',   // index 2 — blank spacer cell
      '__empty2':  '__skip2',   // index 3 — "Rs." currency symbol cell
      'Price':     'price',     // index 4 — line amount
    },

    footerLabels: ['Sub Total', 'GST', 'Discount', 'Total'],

    captureFooterTotal: ['Sub Total', 'GST', 'Discount', 'Total'],

    enableQtyCrossCheck: false,
  },

  postProcess(order) {
    // ── Parse _deliveryRaw → deliveryDate + deliveryTime ───────────────
    // Format: "MM-DD-YYYY HH:MM IST" (month first — see file header note).
    const raw = order._deliveryRaw || '';
    const m = raw.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2})/);
    if (m) {
      const [, mm, dd, yyyy, time] = m;
      order.deliveryDate = `${yyyy}-${mm}-${dd}`; // YYYY-MM-DD
      order.deliveryTime = time;
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;

    // ── Footer totals (Sub Total / GST / Discount / Total) ─────────────
    if (order._footerCaptures) {
      if (order._footerCaptures['Sub Total'] !== undefined) {
        order.subTotal = order._footerCaptures['Sub Total'];
      }
      if (order._footerCaptures['GST'] !== undefined) {
        order.tax = order._footerCaptures['GST'];
      }
      if (order._footerCaptures['Total'] !== undefined) {
        order.totalAmount = order._footerCaptures['Total'];
      }
      const discount = order._footerCaptures['Discount'] || 0;
      if (discount) {
        order.remark = order.remark
          ? `${order.remark}; Discount: ₹${discount}`
          : `Discount: ₹${discount}`;
      }
    }
    delete order._footerCaptures;
    delete order._itemsTotal;

    order.paymentType = order.paymentType || 'COD';
    order.deliveryCharge = order.deliveryCharge ?? 0;

    return order;
  },
};

const matchers = [
  { match: 'olfstores.com', name: 'OLF', type: 'olf' },
];

const type = 'olf';

const rule = `VENDOR: OLF STORE
SENDER: no-reply@olfstores.com | FORMAT: multipart/alternative (use HTML part).

ORDER NO: "IRCTC Order ID" label — e.g. "2464830579". Use as orderNo exactly, no PNR field.

ORDER SUMMARY:
- ORDER NO:  "IRCTC Order ID" → plain string.
- CUSTOMER:  "Customer Name".
- CONTACT:   "Contact No." → 10-digit number.
- TRAIN:     "Train" → e.g. "22928 - LOKSHAKTI EXP", use as-is for trainInfo.
- COACH:     "Coach and Seat No." → comma-separated "M1 , 20" → combine as "M1/20".
- DATE:      "Delivery Date" format is "MM-DD-YYYY HH:MM IST" — MONTH FIRST, not
             day-first. E.g. "07-11-2026 22:30 IST" = 11 July 2026, 22:30 — NOT
             7 November. Cross-check against the email's own send date if unsure.
             → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM (drop "IST").
- DELIVERY STATION: "Delivery at" → station name (optional, not in core schema).
- PAYMENT:   "Mode of Payment" → "CASH_ON_DELIVERY"→"COD", else "Prepaid".

ITEMS TABLE — 3 visible columns: Item | Quantity | Price (2 extra blank/currency
spacer columns in the raw HTML, ignore them).
  Column "Item"     = item name.
  Column "Quantity" = plain integer.
  Column "Price"    = line amount as printed next to "Rs." — verified only for
                       qty=1 orders so far; treat as the line's total amount,
                       do not assume a per-unit split without confirmation.

FOOTER ROWS (separate small table right after items, label : value):
  Sub Total: : Rs. 162
  GST:       : Rs. 7.7
  Discount:  : Rs. 0
  Total      : Rs. 162   ← totalAmount

- totalAmount: "Total" value (strip "Rs.").
- subTotal: "Sub Total" value.
- tax: "GST" value.
- DO NOT strictly verify Price × Quantity = Total — OLF's Price column
  reliability for quantity > 1 is unconfirmed; skip this check.`;

module.exports = { matchers, type, rule, domConfig };
