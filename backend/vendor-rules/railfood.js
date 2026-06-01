'use strict';

/**
 * VENDOR: RAIL FOOD / REL FOOD
 * Sender domain : relfood.com  (orders@relfood.com)
 * Content-Type  : text/html; charset=us-ascii (pure HTML, no PDF attachment)
 * Transfer      : quoted-printable
 *
 * DOM PARSING: PATH A — domConfig below.
 * AI fallback (PATH B) used only when parsed.html is missing or DOM returns null.
 *
 * ── VERIFIED BUGS FIXED (2026-06-01) ────────────────────────────────────────
 *
 * BUG 1 — orderNo always null (orders never saved):
 *   OLD assumption: label td "REL FOOD Ref.No" + separate sibling value td.
 *   ACTUAL HTML:    <span>REL FOOD Ref.No : <b>1050866</b></span> — ONE td.
 *   parseDomOrder finds the label td, reads NEXT sibling as value → wrong td.
 *   FIX: selfContained:true tells parseDomOrder to regex the value from the
 *        label td's OWN text instead of reading a sibling td.
 *
 *   Same applies to fallback "IRCTC Order No." — also one td:
 *   <td style="color:#995043">IRCTC Order No. <b>2451624177</b></td>
 *
 * BUG 2 — totalAmount = 0 for Prepaid orders:
 *   "Payment to collect" is correctly 0 for PAID orders (nothing to collect
 *   at the door). But we need to store the order's monetary value for display.
 *   FIX: postProcess falls back to the items table "Total" footer row value
 *        when paymentType=Prepaid and totalAmount=0.
 *        The "Total" footer row value (e.g. 357) is captured as _itemsTotal
 *        via a special selfContained field on the footer label.
 */

const domConfig = {

  fields: {
    // ── BUG 1 FIX: selfContained:true ──────────────────────────────────────
    // parseDomOrder must check domConfig.fields[name].selfContained
    // If true: regex the value from the LABEL td's own text (not next sibling).
    // Pattern: find td containing labelText, extract first \d+ from its own text.
    orderNo: {
      labelText:     'REL FOOD Ref.No',
      fallback:      'IRCTC Order No',   // also selfContained (same one-td structure)
      selfContained: true,               // ← NEW FLAG
      transform: v => v.trim(),
    },

    customerName: {
      labelText: 'Customer Name',
      transform: v => v.trim(),
    },

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
      transform: v => v.trim() || null,
    },

    _deliveryRaw: {
      labelText: 'Delivery Date',        // partial match covers "Delivery Date & Time"
      transform: v => v.trim(),
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

    // "Payment to collect" = cash the delivery person collects at door.
    // For COD: equals the order value. For PAID: always 0 (nothing to collect).
    // BUG 2 FIX: totalAmount is corrected in postProcess for Prepaid orders.
    totalAmount: {
      labelText: 'Payment to collect',
      transform: v => parseFloat(v.replace(/[^\d.]/g, '')) || 0,
    },

    // Capture items table "Total" footer value for Prepaid totalAmount fallback.
    // selfContained:true — the footer td "Total" + value are in separate cells
    // but we capture the value via footerTotalCapture flag in postProcess instead.
    // (No extra field needed — handled in postProcess via order._itemsTotal set
    //  by parseDomOrder when it encounters the 'Total' footerLabel row.)
  },

  itemsTable: {
    columnMap: {
      'item'    : 'rawItem',
      'price'   : 'price',
      'quantity': 'qty',
      'total'   : 'totalCol',   // IGNORED for items — equals unit price (billing bug)
                                 // BUT captured as _itemsTotal for BUG 2 FIX
    },

    itemCellSplit: 'br',

    footerLabels: ['Sub Total', 'Delivery Fee', 'GST', 'Total'],

    // ── BUG 2 FIX ───────────────────────────────────────────────────────────
    // When parseDomOrder hits the 'Total' footer row, capture its value as
    // order._itemsTotal so postProcess can use it for Prepaid totalAmount.
    captureFooterTotal: 'Total',   // ← NEW FLAG: footer label whose value to capture
  },

  postProcess(order) {
    // ── Split _deliveryRaw "6/1/2026 & 08:17" → deliveryDate + deliveryTime ──
    const raw = order._deliveryRaw || '';
    const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[&]\s*(\d{1,2}:\d{2})/);
    if (m) {
      const [, mo, dd, yyyy, time] = m;
      order.deliveryDate = `${yyyy}-${mo.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      order.deliveryTime = time.length === 4 ? '0' + time : time;
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;

    // ── BUG 2 FIX: use items Total for Prepaid orders ────────────────────────
    // For COD: totalAmount = 'Payment to collect' value (correct — what to charge).
    // For PAID: totalAmount = 0 (correct for collection) but wrong for display.
    //   → use the captured items table Total footer value instead.
    if (order.paymentType === 'Prepaid' && (!order.totalAmount || order.totalAmount === 0)) {
      if (order._itemsTotal && order._itemsTotal > 0) {
        order.totalAmount = order._itemsTotal;
      }
    }
    delete order._itemsTotal;

    return order;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// parseDomOrder backend.js changes required for these fixes:
//
// CHANGE 1 — selfContained field support:
//   In the fields loop, after finding the label <td>:
//   if (cfg.selfContained) {
//     // Extract value from label td's own text via regex (first number sequence)
//     const ownText = $(el).text().replace(/\s+/g,' ').trim();
//     const numMatch = ownText.match(/[\d]+$/);   // last number in the td text
//     rawValue = numMatch ? numMatch[0] : null;
//   } else {
//     // Original: read next sibling td
//     const sibling = $(el).next('td');
//     if (sibling.length) rawValue = sibling.text()...
//   }
//
// CHANGE 2 — captureFooterTotal support:
//   In the footer detection block, when a footerLabel is matched:
//   if (domConfig.itemsTable.captureFooterTotal) {
//     const footerLabel = domConfig.itemsTable.captureFooterTotal;
//     if (secondText.toLowerCase().includes(footerLabel.toLowerCase())) {
//       // Capture the value from the last td in this footer row
//       const lastCell = cells.last();
//       order._itemsTotal = parseFloat(lastCell.text().replace(/[^\d.]/g,'')) || 0;
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

const matchers = [
  { match: 'relfood',  name: 'Rail Food', type: 'railfood' },
  { match: 'railfood', name: 'Rail Food', type: 'railfood' },
];

const type = 'railfood';

const rule = `VENDOR: RAIL FOOD / REL FOOD
ORDER NO: "REL FOOD Ref.No" label and value are in ONE <td> cell:
  <span>REL FOOD Ref.No : <b>1050866</b></span>
  Extract the number from the SAME cell — it is NOT in a separate sibling td.
  e.g. "REL FOOD Ref.No : 1050866" → orderNo = "1050866"
  Fallback: "IRCTC Order No. 2451624177" (same one-cell structure) → "2451624177".

EMAIL FORMAT: Pure HTML (no PDF). After HTML-to-text, fields are pipe-separated.

ITEMS TABLE: Item | Price | Quantity | Total
  Each item td has name + description separated by <br>.
  Quantity = 3rd column (never the description).
  DO NOT verify Price × Qty = Total (RailFood billing bug: Total always = unit Price).

TOTAL:
  COD orders:     use "Payment to collect" as totalAmount.
  PAID/Prepaid:   "Payment to collect" = 0. Use items table "Total" footer row instead.
  e.g. Sub Total=340, GST=17, Total=357 → totalAmount=357 for Prepaid orders.

- COACH: "Coach/Seat" field e.g. "H1/C/8"
- DATE: "Delivery Date & Time: 6/1/2026 & 08:17" → deliveryDate=2026-06-01, deliveryTime=08:17
- TRAIN: "Train No./Name"
- CONTACT: first 10-digit number, strip +91/91 prefix
- PAYMENT: "COD"→"COD", "PAID"/"PRE_PAID"/"PAID"→"Prepaid"`;

module.exports = { matchers, type, rule, domConfig };
