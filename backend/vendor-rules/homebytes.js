"use strict";

/**
 * VENDOR: HOME BYTES
 * Sender domain : homebytes.co.in  (info@homebytes.co.in)
 * Transport     : Microsoft Outlook / Exchange
 * Content-Type  : text/html; charset=utf-8 — pure HTML single part, NO text/plain.
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml HB001228434 / 2451415153 (31-May-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * IDENTICAL TEMPLATE TO RAJBHOG — same Bootstrap invoice layout, same 3-TH header,
 * same 7-column SL#|Item|Description|Qty|Price|GST|Amount items table,
 * same colspan=6 footer rows.
 *
 * HEADER TABLE — <thead><tr> with 3 <th> cells (identical structure to Rajbhog):
 *
 *   TH[0] — left (35%):
 *     "Booking Date: 31 May 2026,  13:06"
 *     "Delivery Date: 31 May 2026,  15:00"
 *     "FSSAI NO.: 10717032001326"
 *
 *   TH[1] — centre (30%):
 *     <img> logo
 *     "Customer Name : Vishnu Sharma"  (CSS uppercase applied)
 *     "Customer Contact : 8929434540"
 *     "Customer Email :"
 *
 *   TH[2] — right (35%):
 *     "Invoice HB001228434 / 2451415153"
 *     "Payment: CASH_ON_DELIVERY"
 *     "Coach / Berth: S4 / 51"
 *     "Train: 01492 / NZM PUNE SPL"
 *     "Delivery Station: BRC / VADODARA JN"
 *
 * ITEMS TABLE — 7 columns: SL# | Item | Description | Qty | Price | GST | Amount
 *   Header: ["SL#","Item","Description","Qty","Price","GST","Amount"]
 *   Item rows: 7 cells, all colspan=1.
 *   Confirmed rows:
 *     ["1","Extra butter ROTI","1PC",  "5","15.00","3.75","75.00"]
 *     ["2","Sev tomato",       "300ml","1","165.00","8.25","165.00"]
 *
 *   Column indexes:
 *     0=SL# (skip)  1=Item  2=Description  3=Qty  4=Price  5=GST(skip)  6=Amount
 *
 *   Description (col 2) is serving size ONLY ("1PC","300ml") — NEVER a quantity.
 *   Qty (col 3) is a standalone integer — the ONLY source of quantity.
 *   Cross-check: Price × Qty = Amount (always exact for HomeBytes).
 *
 * FOOTER ROWS — colspan=6 on <th> label + 1 <td> value:
 *   "Subtotal:"  | "240.00"
 *   "GST (5%)"   | "12.00"
 *   "Discount"   | "0.00"
 *   "Delivery:"  | "0"
 *   "Total:"     | "252.00"  ← use as totalAmount
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO: TH[2] → "Invoice HB001228434 / 2451415153"
 *   Use part BEFORE " / " → "HB001228434"  (HomeBytes' own invoice ID)
 *   NEVER use the number after the slash (that is the IRCTC reference).
 *
 * DATE/TIME: TH[0] → "Delivery Date: 31 May 2026,  15:00"
 *   Same month-name format as Rajbhog: DD Mon YYYY, HH:MM
 *   → deliveryDate=2026-05-31, deliveryTime=15:00
 *   Use "Delivery Date" NOT "Booking Date".
 *
 * COACH: TH[2] → "Coach / Berth: S4 / 51" → normalize spaces → "S4/51"
 * TRAIN: TH[2] → "Train: 01492 / NZM PUNE SPL" → full string
 * PAYMENT: TH[2] → "Payment: CASH_ON_DELIVERY" → "COD"
 */

const domConfig = {

  fields: {
    // ── TH[2] fields ──────────────────────────────────────────────────────

    orderNo: {
      headerThIndex: 2,
      selfContained: true,
      labelText: 'Invoice',
      transform: v => {
        // "Invoice HB001228434 / 2451415153" → take BEFORE " / "
        const m = v.match(/Invoice\s+(HB\w+)\s*\//i);
        return m ? m[1].trim() : null;
      },
    },

    paymentType: {
      headerThIndex: 2,
      selfContained: true,
      labelText: 'Payment:',
      transform: v => {
        const m = v.match(/Payment:\s*([A-Z_]+)/i);
        if (!m) return 'COD';
        const u = m[1].toUpperCase();
        if (u === 'CASH_ON_DELIVERY' || u === 'COD') return 'COD';
        if (['PREPAID','PRE_PAID','ONLINE','PAID'].includes(u)) return 'Prepaid';
        return u;
      },
    },

    coach: {
      headerThIndex: 2,
      selfContained: true,
      labelText: 'Coach / Berth:',
      transform: v => {
        // "Coach / Berth: S4 / 51" → "S4/51"
        const m = v.match(/Coach\s*\/\s*Berth:\s*([A-Z0-9]+)\s*\/\s*(\d+)/i);
        return m ? `${m[1]}/${m[2]}` : null;
      },
    },

    trainInfo: {
      headerThIndex: 2,
      selfContained: true,
      labelText: 'Train:',
      transform: v => {
        const m = v.match(/Train:\s*(.+?)(?:\s*Delivery Station:|$)/i);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
      },
    },

    // ── TH[1] fields ──────────────────────────────────────────────────────

    customerName: {
      headerThIndex: 1,
      selfContained: true,
      labelText: 'Customer Name',
      transform: v => {
        const m = v.match(/Customer Name\s*:\s*([^\n]+?)(?=\s*Customer Contact|$)/i);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
      },
    },

    contactNo: {
      headerThIndex: 1,
      selfContained: true,
      labelText: 'Customer Contact',
      transform: v => {
        const m = v.match(/Customer Contact\s*:\s*(\d[\d\s]*)/i);
        if (!m) return null;
        const digits = m[1].replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    // ── TH[0] fields ──────────────────────────────────────────────────────

    _deliveryRaw: {
      headerThIndex: 0,
      selfContained: true,
      labelText: 'Delivery Date',
      transform: v => {
        // "Delivery Date: 31 May 2026,  15:00"
        const m = v.match(/Delivery Date:\s*(\d{1,2})\s+(\w{3})\s+(\d{4}),\s*(\d{1,2}:\d{2})/i);
        return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : null;
      },
    },
  },

  itemsTable: {
    /**
     * CONFIRMED column indexes (0-based):
     *   0=SL#  1=Item  2=Description  3=Qty  4=Price  5=GST  6=Amount
     *
     * Item rows: 7 cells, all colspan=1.
     * Footer rows: colspan=6 on <th> label + 1 <td> value.
     * Detection: header row = ["SL#","Item","Description","Qty","Price","GST","Amount"]
     */
    columnMap: {
      'sl#':         'slNo',      // index 0 — skip
      'item':        'rawItem',   // index 1 — item name
      'description': 'desc',      // index 2 — serving size ONLY, never qty
      'qty':         'qty',       // index 3 — actual quantity (standalone integer)
      'price':       'price',     // index 4 — unit price (decimal)
      'gst':         'gstCol',    // index 5 — ignore
      'amount':      'amountCol', // index 6 — cross-check: Price × Qty
    },

    itemCellSplit: null,  // item name is clean in its own cell, no <br> split

    footerLabels: ['Subtotal', 'GST', 'Discount', 'Delivery', 'Total'],
    captureFooterTotal: 'Total',  // → order._itemsTotal → totalAmount

    enableQtyCrossCheck: true,
    // Price × Qty = Amount (always exact for HomeBytes).
    // Description column (col 2) may contain numbers ("1PC","300ml") — these
    // are NEVER quantity. qty always comes from col 3 only.
  },

  postProcess(order) {
    // ── Parse _deliveryRaw → deliveryDate + deliveryTime ───────────────────
    // Format: "31 May 2026 15:00" (assembled by _deliveryRaw.transform)
    const MONTHS = {
      jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
      jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    };
    const raw = order._deliveryRaw || '';
    const m = raw.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}:\d{2})/i);
    if (m) {
      const mo = MONTHS[m[2].toLowerCase()];
      if (mo) {
        order.deliveryDate = `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
        order.deliveryTime = m[4].length === 4 ? '0' + m[4] : m[4];
      } else {
        order.deliveryDate = null;
        order.deliveryTime = null;
      }
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

    // ── totalAmount from "Total:" footer ───────────────────────────────────
    if (order._itemsTotal && order._itemsTotal > 0) {
      order.totalAmount = order._itemsTotal;
    }
    delete order._itemsTotal;

    return order;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// parseDomOrder changes required (same as Rajbhog — identical header structure):
//
//   1. Extract 3 header <th> texts into order._thCells[0..2].
//   2. selfContained fields with headerThIndex: transform gets full TH text.
//   3. Items footer: colspan=6 on <th> label + 1 <td> value.
//   4. item._amount from amountCol for qty cross-check in postProcess.
//   5. Delete order._thCells after fields processing.
// ─────────────────────────────────────────────────────────────────────────────

const matchers = [
  { match: 'homebytes', name: 'Home Bytes', type: 'homebytes' },
];

const type = 'homebytes';

const rule = `VENDOR: HOME BYTES
SENDER: info@homebytes.co.in | FORMAT: Pure HTML Bootstrap invoice via Outlook. Identical template to Rajbhog.

ORDER NO: TH[2] contains "Invoice HB001228434 / 2451415153"
  Use the part BEFORE " / " → "HB001228434" (HomeBytes' own invoice ID).
  NEVER use the IRCTC number after the slash as orderNo.

HEADER LAYOUT — 3 <th> cells in Bootstrap <thead><tr>:
  TH[0] — left:
    "Booking Date: 31 May 2026,  13:06"
    "Delivery Date: 31 May 2026,  15:00"
    "FSSAI NO.: 10717032001326"
  TH[1] — centre:
    "Customer Name : Vishnu Sharma"  (CSS uppercase — preserve as-is)
    "Customer Contact : 8929434540"
  TH[2] — right:
    "Invoice HB001228434 / 2451415153"
    "Payment: CASH_ON_DELIVERY"
    "Coach / Berth: S4 / 51"
    "Train: 01492 / NZM PUNE SPL"
    "Delivery Station: BRC / VADODARA JN"

FIELD RULES:
- ORDER NO:   "Invoice" in TH[2] → take part BEFORE " / " → "HB001228434"
- CUSTOMER:   "Customer Name :" in TH[1].
- CONTACT:    "Customer Contact :" in TH[1] → 10-digit number.
- DATE/TIME:  "Delivery Date:" in TH[0] — format "DD Mon YYYY,  HH:MM"
              → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
              e.g. "31 May 2026,  15:00" → 2026-05-31, 15:00
              Use "Delivery Date" NOT "Booking Date".
- COACH:      "Coach / Berth:" in TH[2] → normalize spaces → "S4/51".
- TRAIN:      "Train:" in TH[2] → full string e.g. "01492 / NZM PUNE SPL".
- PAYMENT:    "Payment:" in TH[2] → "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".

ITEMS TABLE — 7 columns: SL# | Item | Description | Qty | Price | GST | Amount
  Confirmed rows:
    ["1", "Extra butter ROTI", "1PC",   "5", "15.00",  "3.75", "75.00"]
    ["2", "Sev tomato",        "300ml", "1", "165.00", "8.25", "165.00"]

  Col 0 = SL# (skip). Col 1 = Item name. Col 2 = Description (serving size).
  Col 3 = Qty (standalone integer — ONLY source of quantity).
  Col 4 = Price. Col 5 = GST (ignore). Col 6 = Amount.

  *** Description (col 2) contains serving size numbers ("1PC","300ml") ***
  *** These numbers are NEVER the quantity — qty is ALWAYS col 3 only ***
  MANDATORY cross-check: Price × Qty = Amount.
    15.00 × 5 = 75.00 ✓  |  165.00 × 1 = 165.00 ✓
  If mismatch: Qty = round(Amount ÷ Price).

FOOTER ROWS (colspan=6 on label <th>, value in <td>):
  Subtotal: | 240.00
  GST (5%)  | 12.00
  Discount  | 0.00
  Delivery: | 0
  Total:    | 252.00  ← use as totalAmount

- totalAmount: "Total:" footer row ONLY. Never use Subtotal.
- tax: "GST (5%)" value.`;

module.exports = { matchers, type, rule, domConfig };
