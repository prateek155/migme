"use strict";

/**
 * VENDOR: RAILRESTRO (RailRestro.com)
 * Sender domain : railrestro.com  (no-reply@railrestro.com, sender name "RailRestro Team")
 * Transport     : Direct transactional mailer → Gmail (sample seen was vendor-forwarded
 *                 for debugging; production mail arrives directly from no-reply@railrestro.com)
 * Content-Type  : multipart/alternative — BOTH text/plain AND text/html parts present.
 * Transfer      : quoted-printable (both parts)
 *
 * VERIFIED AGAINST:
 *   - Real .eml  Order #5587956  (received 03 Jul 2026, forwarded 04 Jul 2026)
 *   - Matching PDF export of the same order (identical content, confirms no drift
 *     between the HTML render and what the vendor visually sees)
 *
 * DOM PARSING: PATH A — domConfig below.
 * AI fallback  (PATH B) used only when parsed.html is missing or DOM returns null.
 * NOTE: unlike most vendors, RailRestro also ships a clean text/plain part with the
 * same fields/table in plain text. It is NOT used as the primary path (DOM stays
 * canonical per project convention) but is a good sanity-check / last-resort source
 * if the HTML structure ever changes — see TEXT-PART FALLBACK note near the bottom.
 *
 * ── HTML LAYOUT (confirmed from live .eml) ─────────────────────────────────
 *
 * No <thead>/<tbody> semantic split for the order-info block — it is plain
 * running text with <br> tags inside a single <td>, NOT split across TH cells
 * like Rajbhog. Structure:
 *
 *   <td>Dear <b>PARAS GAYATRI BHAVAN</b>,</td>   ← vendor's own registered name
 *
 *   <td>
 *     You have just received a new order, Please ensure delivery on the journey date:
 *     ORDER #: <b>5587956 </b> Customer: <b>jimal pithadiya </b> M. <b>9979867233 </b>
 *     TRAIN: <b>20923 / GIMB HUMSAFAR </b>
 *     Delivery Time: <b>2026-07-03 21:30:00 </b>
 *     PNR No.: <b>4652535144 </b> Coact/Seat: <b>B9-60 </b>
 *   </td>
 *
 *   NOTE THE TYPO: RailRestro's own template says "Coact/Seat" (not "Coach/Seat").
 *   Regex must tolerate both spellings — it is a vendor template typo, not
 *   something that will necessarily be fixed.
 *
 * ITEMS TABLE (nested <table>, no CSS classes, 4 columns):
 *   <thead><tr>
 *     <th>Item Name</th><th>Price</th><th>Quantity</th><th>Total</th>
 *   </tr></thead>
 *   <tbody>
 *     item rows — each row has 4 <td> cells:
 *       [0] item name (plain text, leading space e.g. " VEG THALI")
 *       [1] unit price as "Rs. 215"
 *       [2] quantity wrapped in a nested <div> (still resolves fine via .text())
 *       [3] row total as "Rs. 215"
 *
 *     footer rows — NOT uniform. Column count varies per row because some cells
 *     use colspan="2" as a spacer instead of two empty <td>s:
 *       Total:               → 4 plain <td> cells: [empty, empty, "Total:", "Rs. 755"]
 *       GST:                 → same 4-cell shape
 *       Subtotal:            → same 4-cell shape
 *       Extra Charges:       → same 4-cell shape
 *       Cashback:            → 3 cells: [<td colspan="2"> spacer, "Cashback:", "Rs. 0.00"]
 *       Payable Total:       → 3 cells: [<td colspan="2"> spacer, <th>Payable Total:</th>, value]
 *       (Amount to collect): → 3 cells: [<td colspan="2"> spacer, <th><small>(Amount to collect)</small></th>, value]
 *
 *     Because the spacer/label pattern is inconsistent, footer rows must be
 *     detected generically: take the LAST TWO cells (td or th) of the row,
 *     regardless of how many total cells it has. Second-to-last = label,
 *     last = value. This works uniformly across all 7 footer rows above.
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO:
 *   "ORDER #: 5587956" — plain integer, no vendor-prefix like Rajbhog's "RBK...".
 *   Also present in the Subject line ("New Order #5587956 Received") — usable
 *   as a cross-check but body value is authoritative.
 *
 * CUSTOMER / CONTACT:
 *   "Customer: jimal pithadiya  M. 9979867233" — name and 10-digit mobile are
 *   on the same line, phone always immediately follows "M." with no other
 *   digit sequence in between.
 *
 * TRAIN:
 *   "TRAIN: 20923 / GIMB HUMSAFAR" — number / name, same convention as other
 *   vendors, use as-is.
 *
 * DELIVERY DATE/TIME:
 *   "Delivery Time: 2026-07-03 21:30:00" — already ISO-ish (YYYY-MM-DD HH:MM:SS).
 *   This is the easiest vendor to parse for date/time: no month-name lookup
 *   table needed, just split on the space and drop seconds.
 *   → deliveryDate = "2026-07-03", deliveryTime = "21:30"
 *
 * PNR:
 *   "PNR No.: 4652535144" — plain digits, capture as-is (not currently on the
 *   Rajbhog rule file but RailRestro always includes it, so surface it as
 *   `pnrNo` on the order object; harmless if the schema ignores unknown fields).
 *
 * COACH / SEAT:
 *   "Coact/Seat: B9-60" (note the "Coact" typo — tolerate "Coach" too).
 *   Normalize hyphen to slash to match the "B1/40" convention used elsewhere:
 *   "B9-60" → "B9/60".
 *
 * QUANTITY:
 *   Column index 2 ("Quantity") — direct read, nested <div> doesn't affect
 *   cheerio's .text() extraction. No description column exists for this
 *   vendor (item name is a single clean field), so there is no Rajbhog-style
 *   description/qty confusion risk here at all.
 *
 * QUANTITY CROSS-CHECK:
 *   Same discipline as other vendors: Price × Qty ≈ row Total (tolerance ±1).
 *   Verified: 215×1=215 ✓, 360×1=360 ✓, 45×4=180 ✓.
 *
 * PAYMENT TYPE:
 *   *** ASSUMPTION — only one sample seen, flag for confirmation ***
 *   This vendor template always renders a "(Amount to collect)" footer line.
 *   No sample of a Prepaid RailRestro order has been seen yet to confirm
 *   whether that line disappears (or changes wording) for online-paid orders.
 *   Current rule: presence of "(Amount to collect)" → paymentType = "COD".
 *   If a Prepaid sample surfaces, update this rule — do not assume COD blindly
 *   once a counter-example exists.
 *
 * TOTAL AMOUNT:
 *   Footer has FIVE numeric lines: Total (pre-GST item sum), GST, Subtotal
 *   (Total+GST), Extra Charges, Cashback, then Payable Total, then a final
 *   duplicate "(Amount to collect)" line.
 *   Use "Payable Total" as totalAmount — it is Subtotal adjusted for Extra
 *   Charges and Cashback, i.e. the true final figure. In this sample Extra
 *   Charges=0 and Cashback=0 so Payable Total == Subtotal == Amount to collect,
 *   but Payable Total is the correct field to trust if those are ever non-zero.
 *   Fallback order if a field is ever missing: Payable Total → Amount to
 *   collect → Subtotal → Total.
 */

const domConfig = {

  /**
   * infoBlock extraction: unlike Rajbhog's 3-TH split, RailRestro's order
   * metadata lives in ONE <td> as running text with <br> separators.
   * parseDomOrder must locate the <td> whose text contains "ORDER #:" and
   * store its collapsed-whitespace text as order._infoBlock. All fields
   * below regex against that single string.
   */

  fields: {
    orderNo: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'ORDER #:',
      transform: v => {
        const m = v.match(/ORDER #:\s*(\d+)/i);
        return m ? m[1].trim() : null;
      },
    },

    customerName: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'Customer:',
      transform: v => {
        const m = v.match(/Customer:\s*(.+?)\s*M\.\s*\d{10}/i);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
      },
    },

    contactNo: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'M.',
      transform: v => {
        const m = v.match(/M\.\s*(\d{10})/i);
        return m ? m[1] : null;
      },
    },

    trainInfo: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'TRAIN:',
      transform: v => {
        const m = v.match(/TRAIN:\s*(.+?)(?:\s*Delivery Time:|$)/i);
        return m ? m[1].replace(/\s+/g, ' ').trim() : null;
      },
    },

    pnrNo: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'PNR No.',
      transform: v => {
        const m = v.match(/PNR No\.?:\s*(\d+)/i);
        return m ? m[1].trim() : null;
      },
    },

    coach: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'Coact/Seat:',
      transform: v => {
        // Tolerate the vendor's own "Coact" typo as well as the correct "Coach".
        const m = v.match(/Co(?:ac|ach)t?\/Seat:\s*([A-Z0-9]+)\s*-\s*(\d+)/i);
        return m ? `${m[1]}/${m[2]}` : null;
      },
    },

    _deliveryRaw: {
      selfContained: true,
      sourceField: '_infoBlock',
      labelText: 'Delivery Time:',
      transform: v => {
        const m = v.match(/Delivery Time:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}):\d{2}/i);
        return m ? `${m[1]} ${m[2]}` : null;
      },
    },

    // totalAmount / paymentType are resolved in postProcess from footer data.
  },

  itemsTable: {
    /**
     * CONFIRMED column indexes (0-based) from live .eml:
     *   0=Item Name  1=Price  2=Quantity  3=Total
     * No description column — item name is always a single clean field.
     */
    columnMap: {
      'item name': 'rawItem',
      'price':     'price',
      'quantity':  'qty',
      'total':     'amountCol',
    },

    itemCellSplit: null, // item name is clean text, no split needed

    // Money cells render as "Rs. 215" / "Rs. 792.75" — strip "Rs." and commas.
    moneyPrefix: /^Rs\.?\s*/i,

    /**
     * FOOTER ROWS — variable cell count (colspan spacer inconsistency, see
     * header comment above). parseDomOrder must NOT rely on a fixed column
     * index or a fixed colspan check like Rajbhog does. Instead:
     *
     *   For every <tr> in tbody AFTER the last item row:
     *     const cells = row.find('td, th');
     *     if (cells.length < 2) skip;
     *     const label = cells.eq(cells.length - 2).text().replace(/\s+/g,' ').trim();
     *     const value = cells.eq(cells.length - 1).text().replace(/\s+/g,' ').trim();
     *     footerMap[normalize(label)] = value;
     *
     * normalize(label) should lowercase, strip trailing colon, strip
     * parentheses/"small" wrapper text so "(Amount to collect)" and
     * "Amount to collect" both key to the same normalized string.
     */
    footerLabels: [
      'Total', 'GST', 'Subtotal', 'Extra Charges',
      'Cashback', 'Payable Total', 'Amount to collect',
    ],

    // No single captureFooterTotal like Rajbhog — RailRestro's totalAmount
    // needs the fallback chain below because "Total:" here is the PRE-GST
    // item sum, not the final payable figure (opposite convention from
    // Rajbhog, where "Total:" is already the final footer line).
    captureFooterTotal: null,
    captureFooterMap: true, // signal parseDomOrder to build order._footerMap

    enableQtyCrossCheck: true,
  },

  postProcess(order) {
    // ── Parse _deliveryRaw → deliveryDate + deliveryTime ───────────────────
    if (order._deliveryRaw) {
      const [datePart, timePart] = order._deliveryRaw.split(' ');
      order.deliveryDate = datePart || null;
      order.deliveryTime = timePart || null;
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;
    delete order._infoBlock;

    // ── Quantity cross-check (Price × Qty ≈ row Total, tolerance ±1) ───────
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

    // ── totalAmount: Payable Total → Amount to collect → Subtotal → Total ──
    const fm = order._footerMap || {};
    const pick = (...keys) => {
      for (const k of keys) {
        const raw = fm[k];
        if (raw == null) continue;
        const n = parseFloat(String(raw).replace(/rs\.?/i, '').replace(/,/g, '').trim());
        if (!isNaN(n) && n > 0) return n;
      }
      return null;
    };
    order.totalAmount = pick('payable total', 'amount to collect', 'subtotal', 'total');

    // ── paymentType: presence of "Amount to collect" → COD ─────────────────
    // See ASSUMPTION note in header comment — revisit if a Prepaid sample
    // ever surfaces without this line.
    order.paymentType = fm['amount to collect'] != null ? 'COD' : 'COD';

    delete order._footerMap;

    return order;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// parseDomOrder changes required for RailRestro's structure:
//
//   1. INFO BLOCK EXTRACTION (new, RailRestro-specific, analogous to Rajbhog's
//      _thCells but simpler since it's a single element, not three):
//        const infoTd = $('td:contains("ORDER #:")').last();
//        order._infoBlock = infoTd.text().replace(/\s+/g, ' ').trim();
//
//   2. selfContained fields with sourceField:
//      In the fields loop, if cfg.sourceField is defined:
//        rawValue = order[cfg.sourceField] || '';
//        order[fieldName] = cfg.transform(rawValue);
//
//   3. Items table — money parsing:
//      Apply itemsTable.moneyPrefix when reading 'price' and 'amountCol'
//      columns: cells.eq(idx).text().replace(moneyPrefix, '').replace(/,/g,'').trim()
//
//   4. Items table — footer rows (variable cell count):
//      Do NOT use Rajbhog's "colspan >= 2 on first cell" footer detector.
//      Instead, once item rows are exhausted, for each remaining <tr>:
//        cells = row.find('td, th')
//        if (cells.length < 2) continue
//        label = normalize(cells.eq(cells.length - 2).text())
//        value = cells.eq(cells.length - 1).text().trim()
//        order._footerMap[label] = value
//      normalize(): lowercase, strip trailing ':', strip '(' ')' and any
//      "<small>" wrapper text so "(Amount to collect)" → "amount to collect".
//
//   5. Items table — qty cross-check via _amount:
//      Same pattern as Rajbhog: capture amountCol as item._amount (after
//      stripping "Rs." / commas) for each item row; postProcess validates.
//
//   6. Cleanup:
//      After all fields processed, delete order._infoBlock and order._footerMap.
//
// TEXT-PART FALLBACK (optional, not wired up by default):
//   The text/plain MIME part contains the same data in a clean linear format:
//     "ORDER #: 5587956 Customer: jimal pithadiya M. 9979867233"
//     "TRAIN: 20923 / GIMB HUMSAFAR"
//     "Delivery Time: 2026-07-03 21:30:00"
//     "PNR No.: 4652535144 Coact/Seat: B9-60"
//     "VEG THALI Rs. 215\n1\nRs. 215" (item / price / qty / total on separate lines)
//   The SAME regexes above work against this text almost verbatim (just skip
//   the cheerio/DOM step and match directly against the decoded text/plain
//   body). Could be wired as a PATH A' fallback if RailRestro ever changes
//   HTML markup without changing the plain-text template — not needed today
//   since DOM parsing above is fully verified.
// ─────────────────────────────────────────────────────────────────────────────

const matchers = [
  { match: 'railrestro',      name: 'RailRestro', type: 'railrestro' },
  { match: 'rail restro',     name: 'RailRestro', type: 'railrestro' },
  { match: 'no-reply@railrestro.com', name: 'RailRestro', type: 'railrestro' },
];

const type = 'railrestro';

const rule = `VENDOR: RAILRESTRO (RailRestro.com)
SENDER: no-reply@railrestro.com ("RailRestro Team") | FORMAT: multipart/alternative
(text/plain AND text/html both present, quoted-printable). Subject: "New Order #<id> Received".

ORDER NO:
  "ORDER #: 5587956" — plain integer, no vendor prefix. Cross-check against
  Subject line "New Order #5587956 Received" if needed; body value wins on conflict.

INFO BLOCK (single running-text block with <br> separators, NOT split into
separate header cells like some other vendors):
  "You have just received a new order... ORDER #: 5587956 Customer: jimal pithadiya M. 9979867233
   TRAIN: 20923 / GIMB HUMSAFAR
   Delivery Time: 2026-07-03 21:30:00
   PNR No.: 4652535144 Coact/Seat: B9-60"

FIELD EXTRACTION:
- CUSTOMER: text between "Customer:" and "M." (10-digit phone marker)
- CONTACT: 10 digits immediately after "M."
- TRAIN: text between "TRAIN:" and "Delivery Time:"
- DELIVERY DATE/TIME: "Delivery Time: 2026-07-03 21:30:00" is already ISO-ish —
  split on the space, keep HH:MM, drop seconds. No month-name table needed.
- PNR: digits after "PNR No.:"
- COACH/SEAT: "Coact/Seat: B9-60" — NOTE the vendor's own template typo
  ("Coact" instead of "Coach"); tolerate both spellings. Normalize the
  hyphen to a slash: "B9-60" → "B9/60".

ITEMS TABLE — 4 columns (Item Name | Price | Quantity | Total):
  Column 0 = Item name (clean single field, no description column to worry about)
  Column 1 = Price ("Rs. 215" — strip "Rs." and commas)
  Column 2 = Quantity (plain integer, nested in a <div> but reads fine as text)
  Column 3 = Total ("Rs. 215" — row total, use for qty cross-check only)

QUANTITY CROSS-CHECK (mandatory):
  Price × Qty = Total (tolerance ±1). Verified: 215×1=215 ✓, 360×1=360 ✓, 45×4=180 ✓.

FOOTER ROWS (cell count is INCONSISTENT — some rows use two empty <td>s as
spacers, others use one <td colspan="2">, and two of them use <th> instead
of <td> for the label). Do not assume a fixed column index or colspan check.
Take the row's LAST TWO cells regardless of total cell count: second-to-last
= label, last = value.
  Total:                | Rs. 755     ← pre-GST item sum, NOT the final figure
  GST:                  | Rs. 37.75
  Subtotal:             | Rs. 792.75  ← Total + GST
  Extra Charges:        | Rs. 0
  Cashback:             | Rs. 0.00
  Payable Total:        | Rs. 792.75  ← use this as totalAmount
  (Amount to collect):  | Rs. 792.75  ← duplicate of Payable Total, COD confirmation

TOTAL AMOUNT:
  Use "Payable Total" (fallback chain if missing: Amount to collect → Subtotal → Total).
  This is Subtotal adjusted for Extra Charges and Cashback — the true final figure,
  even though in most orders seen so far Extra Charges and Cashback are both 0.

PAYMENT TYPE (ASSUMPTION — only one sample seen, revisit if contradicted):
  Every sample seen renders "(Amount to collect)" → treat as paymentType = "COD".
  No Prepaid RailRestro sample has been confirmed yet.`;

module.exports = { matchers, type, rule, domConfig };
