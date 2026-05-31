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
Table header: Item | Price | Quantity | Total
Each item spans EXACTLY TWO lines after HTML conversion:
  Line 1 = item name only                   e.g. "Masala Dosa"
  Line 2 = Description | Price | Qty | Total   (pipe-separated)

The Description (everything before the first "|") is a serving description — NEVER a quantity.

⚠️ CRITICAL — DESCRIPTIONS THAT START WITH A NUMBER:
  Descriptions like "2 Idli + Sambar + Chutney" or "1 Dosa + Sambhar + Chutney" START with a digit.
  That leading digit means the NUMBER OF PIECES IN THE SERVING — it is NEVER the ordered quantity.
  The REAL ordered Quantity is always the number in the 3rd column (after the 2nd pipe "|").

COLUMN MAPPING on Line 2 (pipe-separated):
  [Description]  |  [Price]  |  [Quantity]  |  [Total]
  Everything before 1st "|" = Description   → append to item name, never use as qty
  Number after 1st "|"       = Price        → use as price
  Number after 2nd "|"       = Quantity     → USE THIS AS qty (this is the customer's order count)
  Number after 3rd "|"       = Total        → IGNORE (always equals Price due to RailFood bug)

REAL EXAMPLES from actual emails:
  "Masala Dosa"    + "1 Dosa + Sambhar + Chutney | 112 | 1 | 112"
    → name="Masala Dosa 1 Dosa + Sambhar + Chutney", price=112, qty=1
  "Idli Sambar"    + "2 Idli + Sambar + Chutney | 120 | 2 | 120"
    → name="Idli Sambar 2 Idli + Sambar + Chutney",  price=120, qty=2
      (the "2" before "|" = 2 idlis per serving; the "2" AFTER 2nd "|" = 2 orders)
  "Poha"           + "250gm | 60 | 1 | 60"
    → name="Poha 250gm",                              price=60,  qty=1
  "Veg Fried Rice" + "500gm | 254 | 16 | 254"
    → name="Veg Fried Rice 500gm",                    price=254, qty=16
  "Butter Tawa Roti" + "1 Pcs | 225 | 23 | 225"
    → name="Butter Tawa Roti 1 Pcs",                  price=225, qty=23

DO NOT verify Price × Quantity = Total.
RailFood's Total column ALWAYS equals the unit Price regardless of Quantity ordered.
Their SubTotal is also computed from the Total column (unit prices), NOT Price × Qty.
This is a known billing bug in their system — accept the numbers as-is.

TOTAL: Use the "Payment to collect" value from the ORDER SUMMERY section as totalAmount.
  This is the confirmed ground-truth amount the delivery person must collect from the customer.
- COACH: "Coach/Seat" field (e.g. "B2/49") — capture as-is.
- DATE: "Delivery Date & Time: 5/31/2026 & 10:15" → deliveryDate=YYYY-MM-DD (M/D/YYYY), deliveryTime=HH:MM.
- TRAIN: "Train No./Name" field (e.g. "09002 / BNW MMCT SF SPL") → trainInfo.
- CONTACT: "Contact Number" field — use the first 10-digit number if multiple are listed.
- PAYMENT: "Payment Mode" field. "COD"→"COD", "PAID"→"Prepaid", "PRE_PAID"/"Online"→"Prepaid".`;

module.exports = { matchers, type, rule };
