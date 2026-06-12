'use strict';

/**
 * VENDOR: GOFOODIEONLINE (GoFood)
 * Sender domain: gofoodieonline.in
 * Content-Type: text/html; charset=us-ascii — pure HTML single part.
 * Transfer: quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order No GFO506349 (01-Jan-2024)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * ORDER SUMMARY TABLE — label | value pairs, one row per field:
 *   Order No              | GFO506349
 *   Customer Name:        | Anish Raut
 *   Train Information:    | Train No: 09004 / Coach No : S6 / Seat No : 25 / PNR :0000000000
 *   Contact No:           | 8850545314
 *   Date of Delivery & Time: | 01/01/2024 09:22
 *   Delivery At:          | Vadodara Junction-BRC
 *   ModeofPayment:        | Cash On Delivery
 *
 * ITEMS TABLE — 4 columns: Serial No. | Item Name | Quantity | Amount
 *   Header: ["Serial No.", "Item Name", "Quantity", "Amount"]
 *   e.g. ["1", "Special Thali", "1", "203.0"]
 *
 * FOOTER ROWS (same table, 4 cells, first=label last=value):
 *   Sub Total:                    |   |   | Rs 203
 *   Add: Services charge          |   |   | Rs. 10
 *   Total Amount:                 |   |   | Rs 213  ← totalAmount
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * PRICE: No unit price column — "Amount" column contains the total price per item.
 *        The backend uses Amount as price (since qty × price = total for each item).
 * DATE:  "Date of Delivery & Time:" format "DD/MM/YYYY HH:MM" (slash separated)
 *        → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM
 * TRAIN: "Train Information:" → extract train no. Coach/seat extracted in postProcess.
 * PAYMENT: "ModeofPayment:" → "Cash On Delivery"→"COD", "Prepaid"→"Prepaid"
 */

const domConfig = {
  fields: {
    orderNo: {
      labelText: 'Order No',
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText: 'Contact No:',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    customerName: {
      labelText: 'Customer Name:',
      transform: v => v.trim() || null,
    },

    _trainRaw: {
      labelText: 'Train Information:',
      transform: v => v.trim(),
    },

    _deliveryRaw: {
      labelText: 'Date of Delivery & Time:',
      transform: v => v.trim(),
    },

    paymentType: {
      labelText: 'ModeofPayment:',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u.includes('CASH') || u.includes('COD')) return 'COD';
        if (u.includes('PREPAID') || u.includes('ONLINE') || u.includes('PAID')) return 'Prepaid';
        return 'COD';
      },
    },
  },

  itemsTable: {
    columnMap: {
      'Serial No.': 'serial',   // index 0 — ignored
      'Item Name':  'rawItem',  // index 1 — item name
      'Quantity':   'qty',      // index 2 — quantity
      'Amount':     'price',    // index 3 — total price (no unit price column)
    },

    footerLabels: ['Sub Total', 'Services charge', 'Total Amount'],

    captureFooterTotal: 'Total Amount',

    enableQtyCrossCheck: false,
  },

  postProcess(order) {
    // ── Parse _deliveryRaw → deliveryDate + deliveryTime ───────────────
    const raw = order._deliveryRaw || '';
    const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}:\d{2})/);
    if (m) {
      order.deliveryDate = `${m[3]}-${m[1]}-${m[2]}`;  // YYYY-MM-DD
      const t = m[4];
      order.deliveryTime = t.length === 4 ? '0' + t : t;
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;

    // ── Parse _trainRaw → trainInfo + coach ────────────────────────────
    const train = order._trainRaw || '';
    const trainMatch = train.match(/Train No\s*:\s*(\d+)/i);
    if (trainMatch) {
      order.trainInfo = trainMatch[1];
    } else {
      order.trainInfo = train.trim() || null;
    }

    const coachMatch = train.match(/Coach No\s*:\s*(\S+)\s*\/\s*Seat No\s*:\s*(\d+)/i);
    if (coachMatch) {
      order.coach = `${coachMatch[1]}/${coachMatch[2]}`;
    }
    delete order._trainRaw;

    // ── totalAmount from footer ────────────────────────────────────────
    if (order._itemsTotal && order._itemsTotal > 0) {
      order.totalAmount = order._itemsTotal;
    }
    delete order._itemsTotal;

    return order;
  },
};

const matchers = [
  { match: 'gofoodieonline', name: 'GoFood', type: 'gofood' },
];

const type = 'gofood';

const rule = `VENDOR: GOFOODIEONLINE (GoFood)
SENDER: info@gofoodieonline.in | FORMAT: Pure HTML single-part.

ORDER NO: "Order No" label — e.g. "GFO506349".

ORDER SUMMARY:
- ORDER NO:   "Order No" → plain string e.g. "GFO506349".
- CUSTOMER:   "Customer Name:".
- CONTACT:    "Contact No:" → 10-digit number.
- TRAIN:      "Train Information:" → format "Train No: 09004 / Coach No : S6 / Seat No : 25 / PNR :..."
              Extract train number as trainInfo. Extract Coach No + Seat No → combine as "S6/25".
- DATE:       "Date of Delivery & Time:" format "DD/MM/YYYY HH:MM" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
- DELIVERY:   "Delivery At:" → station/platform.
- PAYMENT:    "ModeofPayment:" → "Cash On Delivery"→"COD", "Prepaid"→"Prepaid".

ITEMS TABLE — 4 columns: Serial No. | Item Name | Quantity | Amount
  Column 0 = Serial No. (ignore).
  Column 1 = Item name.
  Column 2 = Quantity (plain integer).
  Column 3 = Amount (total price for the item, no unit price column).
             Use as price (since qty is always 1, price = amount).

FOOTER ROWS (same table, first=label last=value):
  Sub Total:                    |   |   | Rs 203
  Add: Services charge          |   |   | Rs. 10
  Total Amount:                 |   |   | Rs 213  ← totalAmount (strip "Rs")

- totalAmount: "Total Amount:" value (strip "Rs" prefix).
- tax/delivery charge: "Sub Total:" → subtotal, "Services charge" → service fee.`;

module.exports = { matchers, type, rule, domConfig };
