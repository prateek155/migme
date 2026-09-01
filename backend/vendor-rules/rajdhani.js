'use strict';

/**
 * VENDOR: RAJDHANI ONLINE FOOD (Garg Rajdhani Online Food)
 * Sender         : Rajdhani Online Food <rajdhaniorder@gmail.com>
 * Content-Type   : text/html (pure HTML, no PDF attachment — the "PDF" the
 *                  vendor sees is just a browser print of this same HTML)
 * Row structure  : standard 3-cell rows — <td>Label</td><td>:</td><td>Value</td>
 *                  (NOT self-contained like RailFood's "Label : <b>Value</b>"
 *                  one-td rows — do NOT set selfContained:true here.)
 *
 * ── CONFIRMED STRUCTURAL GOTCHAS (verified from live .eml source, 2026-08-15) ─
 *
 * GOTCHA 1 — Coach/Berth value cell is a <th>, not a <td>:
 *   <tr>
 *     <td class="border-top"><strong>Coach / Bearth</strong></td>
 *     <td class="border-top">:</td>
 *     <th class="border-top">S2/2</th>          <!-- <th>, not <td> !! -->
 *   </tr>
 *   If parseDomOrder's sibling-value lookup only queries `td`, this field
 *   WILL come back null. Selector must include `th` as well (e.g. 'td,th'),
 *   OR this needs a dedicated selfContained/custom lookup for this one row.
 *   VERIFY before relying on `coach` for this vendor.
 *
 * GOTCHA 2 — the ENTIRE items table uses <th> cells, not <td>:
 *   <tr><th colspan="2">1</th><th>Roasted Papad</th></tr>
 *   <tr><th colspan="2">1</th><th>Veg Fried Rice & Chilli Paneer Combo</th></tr>
 *   Header row above it ("Quantity" / "Item Name") IS normal <td>, only the
 *   data rows are <th>. If the items-table parser only walks `td` cells per
 *   row, it will return ZERO items for every Rajdhani order. Same fix as
 *   GOTCHA 1 — items-row cell selector must accept `th` too.
 *
 * GOTCHA 3 — ambiguous label matching risk ("contains" vs exact):
 *   Row order in the DOM is: "Order" (order no) ... "IRCTC Order ID" ...
 *   later ... "Total Amount" ... "Delivery Charges" ... "Discount / Pre-Payment"
 *   ... "Other Charges" ... "Amount" (final, post-adjustment) ... "Payment Mode".
 *   "IRCTC Order ID" CONTAINS the substring "Order", and "Total Amount"
 *   CONTAINS the substring "Amount". If parseDomOrder does a `.includes()`
 *   style label match instead of an exact trimmed-text match, a labelText of
 *   "Order" could resolve fine (its td happens to come first), but "Amount"
 *   is genuinely dangerous — "Total Amount" appears in the DOM BEFORE the
 *   final "Amount" row and would be matched instead, silently giving the
 *   PRE-adjustment figure instead of the final payable amount.
 *   FIX: this rule deliberately avoids using "Amount" as a labelText at all.
 *   Instead it reads the four unambiguous fields (Total Amount, Delivery
 *   Charges, Discount / Pre-Payment, Other Charges — none of these strings
 *   are substrings of each other) and computes totalAmount in postProcess.
 *   This produces the same final number without depending on ambiguous
 *   label matching. If you later confirm parseDomOrder does EXACT label
 *   matching (not "contains"), you can simplify by reading "Amount" directly.
 *
 * ── TESTING: extra sender whitelisted (TEMPORARY) ─────────────────────────
 * Per request: 1972vragrawal@gmail.com (the personal inbox this vendor's
 * emails were forwarded from/to) is added as an EXTRA matcher below so test
 * sends from that address get parsed with this same Rajdhani rule.
 * >>> REMOVE the matcher entry tagged "TEMP TEST SENDER" once testing is
 *     done — it is a single line, safe to delete on its own. <<<
 */

const domConfig = {

  fields: {
    orderNo: {
      labelText: 'Order',
      skipColon: true,
      transform: v => v.trim().replace(/^#/, ''),
    },

    irctcOrderId: {
      labelText: 'IRCTC Order ID',
      skipColon: true,
      transform: v => v.trim(),
    },

    customerName: {
      labelText: 'Customer Name',
      skipColon: true,
      transform: v => v.trim(),
    },

    contactNo: {
      labelText: 'Mobile No',
      skipColon: true,
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
      labelText: 'Train No / Name',
      skipColon: true,
      transform: v => v.trim(),
    },

    _deliveryDateRaw: {
      labelText: 'Delivery Date',
      skipColon: true,
      transform: v => v.trim(),
    },

    _etaRaw: {
      labelText: 'ETA',
      skipColon: true,
      transform: v => v.trim(),
    },

    station: {
      labelText: 'Station',
      skipColon: true,
      transform: v => v.trim(),
    },

    // GOTCHA 1: value cell is a <th>, not a <td> — sibling selector already
    // covers 'td, th', skipColon now correctly steps PAST the ':' <td>
    // to land on that <th>.
    coach: {
      labelText: 'Coach / Bearth',
      skipColon: true,
      transform: v => v.trim(),
    },

    _totalAmountRaw: {
      labelText: 'Total Amount',
      skipColon: true,
      transform: v => parseFloat(v.replace(/[^\d.]/g, '')) || 0,
    },

    deliveryCharge: {
      labelText: 'Delivery Charges',
      skipColon: true,
      transform: v => parseFloat(v.replace(/[^\d.]/g, '')) || 0,
    },

    _discountRaw: {
      labelText: 'Discount / Pre-Payment',
      skipColon: true,
      transform: v => v.trim(),
    },

    otherCharges: {
      labelText: 'Other Charges',
      skipColon: true,
      transform: v => parseFloat(v.replace(/[^\d.]/g, '')) || 0,
    },

    paymentType: {
      labelText: 'Payment Mode',
      skipColon: true,
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'COD' || u === 'CASH' || u === 'CASH_ON_DELIVERY') return 'COD';
        if (['ONLINE', 'PAID', 'PRE_PAID', 'PREPAID'].includes(u)) return 'Prepaid';
        return u;
      },
    },

    remark: {
      labelText: 'Remarks',
      skipColon: true,
      transform: v => {
        const t = v.trim();
        return (!t || t.toUpperCase() === 'N/A') ? null : t;
      },
    },
  },

  itemsTable: {
    // unchanged — itemsTable header/data parsing doesn't go through
    // labelText sibling-lookup, so skipColon is irrelevant here
    columnMap: {
      'quantity':  'qty',
      'item name': 'rawItem',
    },
    itemCellSplit: null,
    footerLabels: [
      'Total Amount',
      'Delivery Charges',
      'Discount / Pre-Payment',
      'Other Charges',
      'Amount',
      'Payment Mode',
      'Remarks',
    ],
  },

  postProcess(order) {
    // unchanged — same as before
    const dateRaw = order._deliveryDateRaw || '';
    const dm = dateRaw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
    order.deliveryDate = dm
      ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
      : null;
    delete order._deliveryDateRaw;

    const etaRaw = order._etaRaw || '';
    const tm = etaRaw.match(/(\d{1,2}):(\d{2})/);
    order.deliveryTime = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
    delete order._etaRaw;

    const discRaw = order._discountRaw || '';
    const dparts = discRaw.split('/').map(s => parseFloat(s.trim().replace(/[^\d.]/g, '')) || 0);
    order.discount = dparts[0] || 0;
    order.prePayment = dparts[1] || 0;
    delete order._discountRaw;

    const base = order._totalAmountRaw || 0;
    order.totalAmount = base + (order.deliveryCharge || 0) + (order.otherCharges || 0) - (order.discount || 0);
    delete order._totalAmountRaw;

    return order;
  },
};

const matchers = [
  { match: 'rajdhaniorder@gmail.com', name: 'Rajdhani Online Food', type: 'rajdhani' },
  { match: 'rajdhani',                name: 'Rajdhani Online Food', type: 'rajdhani' },
];

const type = 'rajdhani';

const rule = `VENDOR: RAJDHANI ONLINE FOOD (Garg Rajdhani Online Food)
EMAIL FORMAT: Pure HTML, standard 3-cell rows: Label | ":" | Value.

ORDER NO: "Order : #324182" → strip leading "#" → orderNo = "324182".
  Do NOT confuse with the later "IRCTC Order ID" row — that is a separate field.

ITEMS TABLE: header row is "Quantity | Item Name" (no price column).
  Data rows render as <th> cells, not <td> — parser must accept both tags or
  it will return zero items for this vendor.
  e.g. "1 | Roasted Papad", "1 | Veg Fried Rice & Chilli Paneer Combo".

TOTAL AMOUNT: do NOT trust a bare "Amount" label — "Total Amount" (an earlier,
  PRE-adjustment row) also contains the substring "Amount" and can be matched
  by mistake. Instead compute:
    totalAmount = "Total Amount" + "Delivery Charges" + "Other Charges" - "Discount / Pre-Payment" (first number)
  e.g. Total Amount=217, Delivery Charges=0, Other Charges=0, Discount=0 → totalAmount=217.

- COACH/BERTH: "Coach / Bearth" field e.g. "S2/2" — value cell is a <th>, not <td>.
- DATE: "Delivery Date" is always DD-MM-YYYY (single format, unlike RailFood) e.g. "13-08-2026" → 2026-08-13.
- ETA: "ETA" is HH:mm:ss e.g. "23:28:00" → use as deliveryTime, trim to HH:mm.
- STATION: "Station" e.g. "VADODARA JN".
- TRAIN: "Train No / Name" e.g. "22955/KUTCH EXPRESS".
- CONTACT: "Mobile No" — first 10-digit number, strip +91/91 prefix.
- PAYMENT: "Payment Mode" — "Online"/"Paid"/"Pre_Paid"/"Prepaid" → "Prepaid"; "COD"/"Cash" → "COD".
- REMARKS: "Remarks" — "N/A" → null.
- SENDER: real vendor sends from rajdhaniorder@gmail.com. A temporary test
  sender (1972vragrawal@gmail.com) is also whitelisted for QA — remove once
  testing is complete.`;

module.exports = { matchers, type, rule, domConfig };
