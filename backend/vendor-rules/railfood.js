'use strict';

/**
 * VENDOR: RAIL FOOD / REL FOOD
 * Sender domain: relfood.com  (orders@relfood.com)
 */

const matchers = [
  { match: 'relfood',  name: 'Rail Food', type: 'railfood' },
  { match: 'railfood', name: 'Rail Food', type: 'railfood' },
];

const type = 'railfood';

const rule = `VENDOR: RAIL FOOD / REL FOOD
ORDER NO: Field label is "REL FOOD Ref.No" — value is a plain integer like "1049462".
Use this as orderNo. If missing, fall back to "IRCTC Order No".

EMAIL FORMAT: Pure HTML email (no PDF attachment). After HTML-to-text conversion,
table columns are separated by pipe "|" characters.

ITEMS TABLE STRUCTURE:
In the raw HTML each item row has a single <td> containing the item name and description
separated by a <br> tag. Depending on the HTML-to-text converter used, this renders in
one of two ways — handle BOTH:

  TWO-LINE format (br converted to newline):
    Line 1 = item name only          e.g. "Masala Dosa"
    Line 2 = Description | Price | Qty | Total   (pipe-separated)

  ONE-LINE format (br converted to space or dropped):
    Everything before the first "|" = item name + description combined
    Then: Price | Qty | Total   (pipe-separated, same column positions)

In BOTH formats, Quantity is always the number after the 2nd pipe "|".

STOP CONDITION — FOOTER ROWS:
The items table ends with summary rows: Sub Total, Delivery Fee, GST, Total.
These rows have an empty first cell. STOP processing item rows as soon as you
encounter a row where the item cell is empty (or blank) and the second cell
contains any of: "Sub Total", "Delivery Fee", "GST", "Total".
Do NOT parse these rows as order items.

The Description (everything before the first "|") is a serving description — NEVER a quantity.

⚠️ CRITICAL — ANY DESCRIPTION THAT STARTS WITH A NUMBER IS A SERVING SIZE, NEVER A QTY:
  The description field (before the 1st pipe) can start with a digit in TWO forms:
    Form A — short unit string:   "1 Pcs", "2 Pcs", "1 Roti", "3 Pieces" etc.
    Form B — combo description:   "1 Dosa + Sambhar + Chutney", "2 Idli + Sambar + Chutney" etc.
  In BOTH forms the leading digit is the SERVING SIZE (pieces per serving) — NEVER the order qty.
  This is the most common source of wrong extractions — always ignore the description digit.

⚠️ CRITICAL — THE "1 Pcs" TRAP (confirmed live bug):
  "Butter Tawa Roti" is sold in units of 1 piece, so its description is always "1 Pcs".
  A customer ordering 3 rotis produces this row:
    "Butter Tawa Roti" + "1 Pcs | 225 | 3 | 225"
  The description "1 Pcs" makes it tempting to read qty=1 — THIS IS WRONG. qty=3.
  The same trap exists for any item whose description is "1 Pcs", "1 Piece", "1 Roti", etc.
  RULE: if the description is "N <unit>" and the qty column says something different,
  the qty column is ALWAYS correct. The description digit is NEVER the ordered quantity.

⚠️ CRITICAL — DO NOT USE THE DESCRIPTION DIGIT AS QTY EVEN WHEN IT MATCHES:
  Example: "Idli Sambar" + "2 Idli + Sambar + Chutney | 120 | 2 | 120"
  Both the description ("2 Idli...") and the Quantity column both show "2" here.
  You must ALWAYS read qty from the Quantity column (after 2nd pipe), NEVER from
  the description — even if they happen to be the same number. A future order may
  have "2 Idli + Sambar + Chutney | 120 | 3 | 120" (3 orders of a 2-idli serving)
  and you must return qty=3, not qty=2.

COLUMN MAPPING (pipe-separated, same for both one-line and two-line format):
  [Description]  |  [Price]  |  [Quantity]  |  [Total]
  Everything before 1st "|" = Description   → append to item name, NEVER use as qty
  Number after 1st "|"       = Price        → use as price
  Number after 2nd "|"       = Quantity     → THIS IS THE ONLY SOURCE OF TRUTH FOR QTY
  Number after 3rd "|"       = Total        → IGNORE (always equals Price due to RailFood bug)

REAL EXAMPLES from actual emails:
  "Butter Tawa Roti" + "1 Pcs | 225 | 1 | 225"   ← description "1 Pcs", qty column = 1
    → name="Butter Tawa Roti 1 Pcs", price=225, qty=1   ✅ (qty from column, not description)
  "Butter Tawa Roti" + "1 Pcs | 225 | 3 | 225"   ← description "1 Pcs", qty column = 3
    → name="Butter Tawa Roti 1 Pcs", price=225, qty=3   ✅ NOT qty=1
  "Butter Tawa Roti" + "1 Pcs | 225 | 20 | 225"  ← description "1 Pcs", qty column = 20
    → name="Butter Tawa Roti 1 Pcs", price=225, qty=20  ✅ NOT qty=1
  "Masala Dosa"    + "1 Dosa + Sambhar + Chutney | 112 | 1 | 112"
    → name="Masala Dosa 1 Dosa + Sambhar + Chutney", price=112, qty=1
  "Idli Sambar"    + "2 Idli + Sambar + Chutney | 120 | 2 | 120"
    → name="Idli Sambar 2 Idli + Sambar + Chutney",  price=120, qty=2
      (description "2" = 2 idlis per serving; qty column "2" = 2 orders — always use qty column)
  "Idli Sambar"    + "2 Idli + Sambar + Chutney | 120 | 3 | 120"
    → name="Idli Sambar 2 Idli + Sambar + Chutney",  price=120, qty=3
      (description says "2" but qty column says "3" — always trust the qty column)
  "Poha"           + "250gm | 60 | 1 | 60"
    → name="Poha 250gm",                              price=60,  qty=1
  "Veg Fried Rice" + "500gm | 254 | 16 | 254"
    → name="Veg Fried Rice 500gm",                    price=254, qty=16
  "Roasted Papad"  + "1 Pcs | 20 | 3 | 20"
    → name="Roasted Papad 1 Pcs",                     price=20,  qty=3   ✅ NOT qty=1

DO NOT verify Price × Quantity = Total.
RailFood's Total column ALWAYS equals the unit Price regardless of Quantity ordered.
Their SubTotal is also computed from the Total column (unit prices), NOT Price × Qty.
This is a known billing bug in their system — accept the numbers as-is.

TOTAL: Use the "Payment to collect" value from the ORDER SUMMERY section as totalAmount.
  (Note: RailFood spells it "SUMMERY" — this is a known typo in their template, match it as-is.)
  This is the confirmed ground-truth amount the delivery person must collect from the customer.
- COACH: "Coach/Seat" field (e.g. "B2/49") — capture as-is.
- DATE: "Delivery Date & Time: 5/31/2026 & 10:15" → deliveryDate=YYYY-MM-DD (M/D/YYYY), deliveryTime=HH:MM.
- TRAIN: "Train No./Name" field (e.g. "09002 / BNW MMCT SF SPL") → trainInfo.
- CONTACT: "Contact Number" field — if multiple numbers are listed, strip any leading "+91" or "91"
  country code prefix first, then use the first resulting 10-digit number.
- PAYMENT: "Payment Mode" field. "COD"→"COD", "PAID"→"Prepaid", "PRE_PAID"/"Online"→"Prepaid".
- PNR: capture if present; leave blank/null if the field is empty — this field is often blank.`;

module.exports = { matchers, type, rule };
