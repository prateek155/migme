"use strict";

/**
 * VENDOR: RAILRECEIPT (RailRecipe)
 * Sender domain : railrecipe.com  (no-reply@railrecipe.com)
 * Transport     : Zoho ZeptoMail → Gmail
 * Content-Type  : text/html; charset=utf-8 — pure HTML single part, NO text/plain.
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order 2451216320 (31-May-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * CRITICAL: The email is a deeply nested table structure. Cheerio sees many
 * duplicate/wrapper rows due to nesting. The correct parsing strategy is:
 * scan ALL <td> pairs using label-matching (not table index), find the innermost
 * 2-cell rows where cell[0] = label text and cell[1] = value.
 *
 * ORDER DETAILS — innermost label+value <td> pairs (confirmed from live .eml):
 *   "Order No."            → "2451216320"
 *   "PNR No"               → ""  (empty in this order)
 *   "Mobile No."           → "8239946373"
 *   "Alt. mobile no"       → ""  (empty in this order)
 *   "Train No."            → "22653"
 *   "Coach/Seat"           → "M4/26"
 *   "Delivery Station"     → "BRC"
 *   "Delivery Time (ETA)"  → "May 31,2026 11:54"
 *   "Journey Date"         → "2026-05-31 09:10"
 *   "Order Date"           → "May 31, 2026"
 *   "Comment"              → ""
 *
 * PAYMENT STATUS — separate 2-cell row outside the order details table:
 *   "PAYMENT STATUS" | "PREPAID"
 *
 * ITEMS TABLE — 4 columns: Item Name | Price | Quantity | Amount
 *   Header row: ["Item Name", "Price", "Quantity", "Amount"]
 *   Item rows: 4 cells, all colspan=1. Confirmed:
 *     ["SAADA THALI MIX VEG +DAL FRY+3 PLAIN ROTI+PLAIN RICE+SALAD", "₹ 180", "x6", "₹1080"]
 *     ["TAWA ROTI 1Pcs", "₹ 12", "x2", "₹24"]
 *
 *   CRITICAL ITEM STRUCTURE: Item name cell (col 0) contains:
 *     - Item name in the main <p> tag: "SAADA THALI"
 *     - Description in a <small> tag: "MIX VEG +DAL FRY+3 PLAIN ROTI+PLAIN RICE+SALAD"
 *     - When Cheerio reads this cell as text, it concatenates both: "SAADA THALI MIX VEG..."
 *     - Numbers in the description (e.g. "3 PLAIN ROTI") are NEVER quantity.
 *     - For DOM parsing: read the <p> text separately from <small> text.
 *       name = p.text(), description = small.text()
 *     - For AI parsing: the full cell text is "SAADA THALI MIX VEG +DAL FRY+3 PLAIN ROTI..."
 *       Item name = text before the description (first line / before mix-veg detail).
 *
 *   Price (col 1): "₹ 180" format — strip "₹" and spaces → 180.
 *   Quantity (col 2): "x6" format — strip "x" → 6.
 *   Amount (col 3): "₹1080" format — strip "₹" → 1080.
 *   Cross-check: Price × Qty = Amount (always exact for RailRecipe).
 *
 * FOOTER ROWS — varied colspan structure, label in 3rd-to-last cell or last 2 cells:
 *   Subtotal:       colspan=2 label + 1 value → ["", "Subtotal", "₹ 1104"]
 *   Discount:       4 cells  → ["","","Discount","₹ 100"]
 *   Delivery Charge:4 cells  → ["","","Delivery Charge","₹ 0"]
 *   GST:            4 cells  → ["","","GST","₹ 55.20"]
 *   Grand Total:    colspan=2 label + 1 value → ["","Grand Total","₹ 1059.20"]  ← totalAmount
 *
 *   Detection: footer rows contain empty leading cells. Parse by matching label text
 *   against known footerLabels, take last cell as value.
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO: "Order No." label → plain integer string "2451216320".
 *
 * CONTACT: "Mobile No." label → 10-digit number.
 *   If "Mobile No." empty: use "Alt. mobile no" value.
 *
 * TRAIN: "Train No." label → just the number "22653" (no name in this field).
 *   trainInfo = this number only. No name available from header fields.
 *
 * COACH: "Coach/Seat" label → already combined "M4/26" — capture as-is.
 *
 * DATE: "Journey Date" label → "2026-05-31 09:10" → deliveryDate = "2026-05-31"
 *   (ignore time part after space — use date portion only).
 *
 * TIME: "Delivery Time (ETA)" label → "May 31,2026 11:54" → extract "11:54" only.
 *   Format: "Mon DD,YYYY HH:MM" → time = last "HH:MM" token.
 *
 * PAYMENT: "PAYMENT STATUS" label → "PREPAID"→"Prepaid", "COD"/"CASH_ON_DELIVERY"→"COD".
 *
 * PNR: "PNR No" label → may be empty — store in pnr field if non-empty.
 *
 * TOTAL: "Grand Total" label → strip "₹" → parseFloat → totalAmount.
 *   The "Grand Total" is AFTER discount: Subtotal(1104) - Discount(100) + GST(55.20) = 1059.20.
 *   ALWAYS use "Grand Total" not "Subtotal" as totalAmount.
 */

const domConfig = {

  fields: {
    orderNo: {
      labelText: 'Order No.',
      transform: v => v.trim() || null,
    },

    pnr: {
      labelText: 'PNR No',
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText: 'Mobile No.',
      fallback: 'Alt. mobile no',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    trainInfo: {
      labelText: 'Train No.',
      transform: v => v.trim() || null,
    },

    coach: {
      labelText: 'Coach/Seat',
      transform: v => v.trim().replace(/\s*\/\s*/g, '/') || null,
    },

    _journeyDate: {
      labelText: 'Journey Date',
      transform: v => v.trim(),  // "2026-05-31 09:10" — use date part only
    },

    _deliveryTimeRaw: {
      labelText: 'Delivery Time (ETA)',
      transform: v => v.trim(),  // "May 31,2026 11:54" — extract HH:MM
    },

    paymentType: {
      labelText: 'PAYMENT STATUS',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'PREPAID' || u === 'PRE_PAID' || u === 'ONLINE' || u === 'PAID') return 'Prepaid';
        if (u === 'COD' || u === 'CASH_ON_DELIVERY') return 'COD';
        return 'COD';
      },
    },

    // ACCEPTED email: customer name is in greeting "Dear <name>," not in a label-value pair
    _greetingRaw: {
      labelText:          'Dear',
      selfContained:      true,
      selfContainedExtract: /Dear\s+(.+?)\s*,/,
      transform:          v => v.trim(),
    },
  },

  itemsTable: {
    /**
     * CONFIRMED column indexes (0-based):
     *   0=Item Name  1=Price  2=Quantity  3=Amount
     *
     * Item rows: 4 cells, all colspan=1.
     * Item name cell (col 0): contains item name in <p> + description in <small>.
     *   Cheerio text() combines them. For item name, read only <p> text.
     *   For display: "SAADA THALI" (name) + "MIX VEG +DAL FRY+3 PLAIN ROTI..." (desc)
     *
     * Price (col 1): "₹ 180" → strip ₹ → 180
     * Quantity (col 2): "x6" → strip x → 6
     * Amount (col 3): "₹1080" → strip ₹ → 1080
     *
     * Footer detection: rows with empty leading cells + known label text.
     */
    columnMap: {
      'item name': 'rawItem',   // index 0 — item name (<p>) + desc (<small>)
      'price':     'price',     // index 1 — "₹ N" format
      'quantity':  'qty',       // index 2 — "xN" format
      'amount':    'amountCol', // index 3 — "₹N" format, cross-check only
    },

    // Item name cell has <p> (name) + <small> (description) — read <p> only for name.
    itemNameFromP: true,
    // Description from <small> — append to name: "SAADA THALI MIX VEG +DAL FRY..."
    appendSmallDesc: true,

    // Price and Amount: strip "₹" and spaces before parseFloat.
    // Quantity: strip "x" before parseInt.
    stripCurrencyPrefix: '₹',
    stripQtyPrefix: 'x',

    footerLabels: ['Subtotal', 'Discount', 'Delivery Charge', 'GST', 'Grand Total'],
    captureFooterTotal: 'Grand Total',  // → order._itemsTotal → totalAmount

    enableQtyCrossCheck: true,
    // Price × Qty = Amount (always exact).
    // Numbers in item description (e.g. "3 PLAIN ROTI") are NEVER quantity.
  },

  postProcess(order) {
    // ── customerName: prefer label-based, fallback to greeting "Dear <name>," ──
    if (!order.customerName && order._greetingRaw) {
      order.customerName = order._greetingRaw;
    }
    delete order._greetingRaw;

    // ── deliveryDate & deliveryTime from Delivery Time (ETA) ────────────────
    // Format: "May 31,2026 11:54" or "Jun 04,2026 11:12"
    const dtr = order._deliveryTimeRaw || '';
    const etaMatch = dtr.match(/^([A-Za-z]{3})\s+(\d{1,2}),(\d{4})\s+(\d{1,2}:\d{2})$/);
    if (etaMatch) {
      const monthMap = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
      };
      const month = etaMatch[1].toLowerCase().slice(0, 3);
      const day = etaMatch[2].padStart(2, '0');
      const year = etaMatch[3];
      order.deliveryDate = `${year}-${monthMap[month] || '01'}-${day}`;
      const t = etaMatch[4];
      order.deliveryTime = t.length === 4 ? '0' + t : t;
    } else {
      // Fallback: parse deliveryDate from Journey Date if ETA missing
      const jd = order._journeyDate || '';
      let m = jd.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        order.deliveryDate = `${m[1]}-${m[2]}-${m[3]}`;
      } else {
        m = jd.match(/^(\d{2})-(\d{2})-(\d{4})/);
        order.deliveryDate = m ? `${m[3]}-${m[2]}-${m[1]}` : null;
      }
      order.deliveryTime = null;
    }
    delete order._deliveryTimeRaw;
    delete order._journeyDate;

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

// ─────────────────────────────────────────────────────────────────────────────
// parseDomOrder changes required for RailRecipe's deeply nested structure:
//
// CHANGE 1 — Label matching strategy:
//   Do NOT match by table index. Instead scan ALL <td> pairs throughout
//   the document where cell[0].text().trim() === labelText and cell[1] exists.
//   Use the deepest/most-specific 2-cell inner table row.
//   This handles the nested table structure where each field is in its own
//   inner <table><tr><td>label</td><td>value</td></tr></table>.
//
// CHANGE 2 — Items table detection:
//   Find the table whose first header row has cells ["Item Name","Price","Quantity","Amount"].
//   This is the correct items table (not the outer wrapper tables).
//
// CHANGE 3 — Item name extraction:
//   For col 0 (rawItem): read $(td).find('p').first().text().trim() for item name.
//   Read $(td).find('small').text().trim() for description.
//   Combine: name = itemName + (desc ? ' ' + desc : '').
//
// CHANGE 4 — Quantity "xN" format:
//   qty cell text is "x6", "x2" — strip "x" before parseInt.
//   NOT a plain integer like other vendors.
//
// CHANGE 5 — Price/Amount "₹ N" / "₹N" format:
//   Strip "₹" and spaces before parseFloat.
//
// CHANGE 6 — Footer detection:
//   Footer rows have empty leading cells. Detect by checking if any cell
//   text matches a footerLabel. Take the last cell's text as value.
//   "Grand Total" row: cells = ["","Grand Total","₹ 1059.20"]
// ─────────────────────────────────────────────────────────────────────────────

const matchers = [
  { match: 'railrecipe',  name: 'Rail Recipe', type: 'railreceipt' },
  { match: 'railreceipt', name: 'Rail Recipe', type: 'railreceipt' },
];

const type = 'railreceipt';

const rule = `VENDOR: RAILRECEIPT (RailRecipe)
SENDER: no-reply@railrecipe.com | FORMAT: Pure HTML via Zoho ZeptoMail. Deeply nested tables.

ORDER NO: "Order No." label → plain integer e.g. "2451216320".
PNR: "PNR No" label → may be empty.

ORDER DETAILS — innermost label+value pairs (confirmed from live .eml):
  Order No.           | 2451216320
  PNR No              | (empty)
  Mobile No.          | 8239946373
  Alt. mobile no      | (empty — use if Mobile No. is empty)
  Train No.           | 22653       ← train number only, no name
  Coach/Seat          | M4/26       ← already combined "coach/seat"
  Delivery Station    | BRC
  Delivery Time (ETA) | May 31,2026 11:54
  Journey Date        | 2026-05-31 09:10
  Order Date          | May 31, 2026
  Comment             | (empty)

PAYMENT STATUS — separate row: "PAYMENT STATUS" | "PREPAID"

FIELD RULES:
- ORDER NO:   "Order No." label → plain integer string.
- CONTACT:    "Mobile No." label → 10-digit. If empty, use "Alt. mobile no".
- TRAIN:      "Train No." label → number string only e.g. "22653".
- COACH:      "Coach/Seat" label → already combined e.g. "M4/26" — capture as-is.
- DATE:       "Journey Date" label → "2026-05-31 09:10" → deliveryDate="2026-05-31"
              (drop time component, use date only).
- TIME:       "Delivery Time (ETA)" label → "May 31,2026 11:54" → deliveryTime="11:54"
              (extract only the HH:MM from the end of the string).
- PAYMENT:    "PAYMENT STATUS" → "PREPAID"→"Prepaid", "COD"/"CASH_ON_DELIVERY"→"COD".

ITEMS TABLE — 4 columns: Item Name | Price | Quantity | Amount
  Header: ["Item Name", "Price", "Quantity", "Amount"]
  Confirmed rows:
    ["SAADA THALI MIX VEG +DAL FRY+3 PLAIN ROTI+PLAIN RICE+SALAD", "₹ 180", "x6", "₹1080"]
    ["TAWA ROTI 1Pcs", "₹ 12", "x2", "₹24"]

  ITEM NAME STRUCTURE: Each item cell contains name + description concatenated.
    Name part: "SAADA THALI" (first part, before the description)
    Description part: "MIX VEG +DAL FRY+3 PLAIN ROTI+PLAIN RICE+SALAD" (in <small> tag)
    *** Numbers in description ("3 PLAIN ROTI") are NEVER quantity ***
    Use the full cell text as item name — it's fine to include the description.

  PRICE (col 1): "₹ 180" — strip "₹" and spaces → 180.
  QUANTITY (col 2): "x6" format — strip "x" prefix → 6. NEVER read from description.
  AMOUNT (col 3): "₹1080" — strip "₹" → 1080.
  MANDATORY cross-check: Price × Qty = Amount.
    180 × 6 = 1080 ✓  |  12 × 2 = 24 ✓
  If mismatch: Qty = round(Amount ÷ Price).

FOOTER ROWS (mixed colspan, last cell is always value):
  Subtotal        | ₹ 1104
  Discount        | ₹ 100
  Delivery Charge | ₹ 0
  GST             | ₹ 55.20
  Grand Total     | ₹ 1059.20  ← ALWAYS use as totalAmount (post-discount total)

- totalAmount: "Grand Total" footer value (strip ₹).
  Grand Total = Subtotal - Discount + Delivery + GST = 1104 - 100 + 0 + 55.20 = 1059.20.
  NEVER use Subtotal as totalAmount.
- tax: "GST" footer value.
- deliveryCharge: "Delivery Charge" footer value.`;

module.exports = { matchers, type, rule, domConfig };
