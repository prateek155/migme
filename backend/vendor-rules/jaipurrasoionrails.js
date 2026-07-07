'use strict';

/**
 * VENDOR: JAIPUR RASOI ON RAILS
 * Sender domain: jaipurrasoionrails.in
 * Content-Type: text/html — single part HTML.
 *
 * VERIFIED AGAINST: real .eml Order #45 (07-Jul-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * "Customer & Delivery Details:" BLOCK (label / value stacked, not a table):
 *   Customer Name:   Manish
 *   Mobile Number:   9865478549
 *   Train PNR No:    2154254782
 *   Train No:        12412
 *   Coach No:        2
 *   Note/Message:    Testing Mail
 *   Date & Time:     2026-07-07 14:13:15
 *
 * ITEMS TABLE — 4 columns: Product Name | Qty | Price | Total
 *   e.g. ["Paneer Mini Thali", "01", "₹160", "₹160"]
 *
 * FOOTER ROWS:
 *   "Sub Total"   | ₹160
 *   "Grand Total" | ₹160  ← totalAmount
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO: present in the body heading — "New Order Details (Order #45)".
 *        Extract the digits after "Order #" → orderNo = "45" (no "#").
 * TRAIN INFO: "Train No" only — no train name is present in this template.
 * COACH: use as-is, e.g. "2".
 * PAYMENT: always "COD" — this vendor does not send prepaid orders.
 * DATE: "Date & Time" is "YYYY-MM-DD HH:MM:SS" → split into
 *        deliveryDate + deliveryTime.
 * QUANTITY: "Qty" is zero-padded ("01") — parse as plain integer.
 * PRICE/TOTAL: prefixed with "₹" — strip before parsing as number.
 * CUSTOMER NAME: unlike IRCTC, this vendor's email IS addressed with the
 *        customer's own name present ("Customer Name: Manish") — no
 *        fallback needed.
 */

const domConfig = {
  fields: {
    orderNo: {
      // Heading text: "New Order Details (Order #45)" — no colon label,
      // so match on "Order #" and pull the trailing digits out.
      labelText: 'Order #',
      transform: v => (v.match(/\d+/) || [])[0] || null,
    },

    customerName: {
      labelText: 'Customer Name:',
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText: 'Mobile Number:',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    pnr: {
      labelText: 'Train PNR No:',
      transform: v => v.trim() || null,
    },

    trainInfo: {
      labelText: 'Train No:',
      transform: v => v.trim() || null,
    },

    coach: {
      labelText: 'Coach No:',
      transform: v => v.trim() || null,
    },

    remark: {
      labelText: 'Note/Message:',
      transform: v => (v || '').trim(),
    },

    _dateTimeRaw: {
      labelText: 'Date & Time:',
      transform: v => v.trim(),
    },
  },

  itemsTable: {
    columnMap: {
      'product name': 'rawItem',  // index 0 — item name
      'qty':          'qty',      // index 1 — zero-padded integer e.g. "01"
      'price':        'price',    // index 2 — "₹160"
      'total':        'amountCol', // index 3 — "₹160" (cross-check)
    },

    stripCurrencyPrefix: '₹',

    footerLabels: ['Sub Total', 'Grand Total'],

    captureFooterTotal: 'Grand Total',

    enableQtyCrossCheck: true,
  },

  postProcess(order) {
    // "2026-07-07 14:13:15" → deliveryDate + deliveryTime
    const m = (order._dateTimeRaw || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (m) {
      order.deliveryDate = m[1];
      order.deliveryTime = m[2];
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._dateTimeRaw;

    if (order._itemsTotal && order._itemsTotal > 0) {
      order.totalAmount = order._itemsTotal;
    }
    delete order._itemsTotal;

    // Fixed payment type — this vendor does not send prepaid orders.
    order.paymentType = 'COD';

    return order;
  },
};

const skipSubjects = ['delivery time passed', 'delivered'];

const matchers = [
  { match: 'jaipurrasoionrails.in', name: 'Jaipur Rasoi On Rails', type: 'jaipurrasoi' },
];

const type = 'jaipurrasoi';

const rule = `VENDOR: JAIPUR RASOI ON RAILS (EMAIL)
SENDER: info@jaipurrasoionrails.in | FORMAT: HTML, label/value block (not a table).

"Customer & Delivery Details:" BLOCK:
  Customer Name:   Manish
  Mobile Number:   9865478549
  Train PNR No:    2154254782
  Train No:        12412
  Coach No:        2
  Note/Message:    Testing Mail
  Date & Time:     2026-07-07 14:13:15

- ORDER NO:   In the body heading "New Order Details (Order #45)" — extract
              digits after "Order #" → orderNo = "45" (strip the "#").
- CONTACT:    "Mobile Number" → 10-digit number.
- TRAIN:      "Train No" → number string only, no train name present.
- COACH:      "Coach No" → use as-is, e.g. "2".
- PAYMENT:    *** ALWAYS "COD" *** — this vendor never sends prepaid orders.
- DATE:       "Date & Time" is "YYYY-MM-DD HH:MM:SS" → split into
              deliveryDate="YYYY-MM-DD" and deliveryTime="HH:MM".
- CUSTOMER NAME: "Customer Name" IS present in this template (unlike IRCTC) —
              extract directly, no fallback needed.

ITEMS TABLE — 4 columns: Product Name | Qty | Price | Total
  Column 0 = Item name.
  Column 1 = Quantity, zero-padded (e.g. "01" → 1).
  Column 2 = Price (format "₹160" — strip "₹" → 160).
  Column 3 = Total (format "₹160" — cross-check only so qty × price = total).

FOOTER ROWS:
  Sub Total   | ₹160
  Grand Total | ₹160  ← totalAmount (strip ₹)

- totalAmount: "Grand Total" value.`;

module.exports = { matchers, type, rule, domConfig, skipSubjects };
