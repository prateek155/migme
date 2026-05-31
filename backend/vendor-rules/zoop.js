"use strict";

/**
 * VENDOR: ZOOP INDIA
 * Sender: zoopindia.com
 * Email type: Pure HTML
 */

const matchers = [
  { match: "zoopindia", name: "Zoop India", type: "zoop" },
  { match: "zoop", name: "Zoop India", type: "zoop" },
];

const type = "zoop";

const rule = `VENDOR: ZOOP INDIA
ORDER NO: Field label is "ZOOP Txn. No." — value looks like "ZO29663100616818". Use this FULL string exactly as orderNo.

EMAIL FORMAT: Pure HTML. After HTML-to-text, each field row has 4 columns (2 label+value pairs side by side).
VALUES have a ": " prefix — strip it. e.g. ": ZO29663100616818" → "ZO29663100616818".

ORDER DETAILS TABLE:
  ZOOP Txn. No. | : ZO29663100616818 | Type          | : Prepaid
  Customer Name | : Shivani Gadge    | Phone         | : 9619770718
  Train         | : Mmct Duronto/ 22210 | Coach/ Seat | : M1/ 10
  ETA           | : 31-May-2026 10:33 | Delivery Date | : 31-May-2026 10:33

- ORDER NO: "ZOOP Txn. No." field — full ZO... string.
- CUSTOMER: "Customer Name" field.
- CONTACT: "Phone" field — 10-digit number.
- TRAIN: "Train" field — full string e.g. "Mmct Duronto/ 22210".
- COACH: "Coach/ Seat" field. Normalize spaces around slash: "M1/ 10" → "M1/10", "M2/ 74" → "M2/74".
- DATE & TIME: "Delivery Date" field contains BOTH date and time: "31-May-2026 10:33"
  Format: DD-Mon-YYYY HH:MM → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
- PAYMENT: "Type" field. "Prepaid"→"Prepaid", "COD"→"COD".

ITEMS TABLE columns: Item Name | Price | Quantity | Amount
  e.g. "Poha | 60 | 3 | 180"
- Quantity is the 3rd column — a plain integer. It CAN be large (5, 10, 20+).
- NEVER confuse Price with Quantity.

MANDATORY VERIFICATION — Amount is ALWAYS Price × Quantity for Zoop:
  Amount = Price × Quantity (always mathematically correct)
  e.g. Price=60, Amount=180 → Quantity must be 3 (180÷60=3)
  If your extracted Quantity does not satisfy this formula, recalculate: Quantity = Amount ÷ Price.
  This check is MANDATORY for every item.

TOTALS:
  Base Price Total       | ₹ 180
  (+) GST on food        | ₹ 9
  (+) Delivery Charge    | ₹ 25.42
  (+) Gateway Platform Fees | ₹ 20
  (-) Discount           | ₹ 0
  Order Total            | ₹ 239   ← use as totalAmount
  BALANCE TO PAY         | ₹ 0    ← for Prepaid this is 0; for COD equals Order Total

- TOTAL: use "Order Total" field as totalAmount (strip ₹ symbol).
- REMARK: copy the "Suggestions" field value if present.`;

module.exports = { matchers, type, rule };
