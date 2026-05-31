"use strict";

/**
 * VENDOR: ZOOP INDIA
 * Sender: noreply@zoopindia.com (via Amazon SES)
 * Content-Type: text/html; charset=utf-8 — pure HTML single part, NO plain text part.
 * Transfer: quoted-printable
 *
 * DOM PARSING: VIABLE — clean 4-col order details table + 4-col items table.
 * AI PATH: Falls back to HTML-stripped plain text if DOM fails.
 *
 * VERIFIED AGAINST: real .eml dated 31-May-2026 (ZO29663100616818)
 */

const matchers = [
  { match: "zoopindia", name: "Zoop India", type: "zoop" },
  { match: "zoop",      name: "Zoop India", type: "zoop" },
];

const type = "zoop";

const rule = `VENDOR: ZOOP INDIA
ORDER NO: Field label is "ZOOP Txn. No." — value looks like "ZO29663100616818".
  Use this FULL string exactly as orderNo (no stripping).

EMAIL FORMAT: Pure HTML single part (no plain text part). Sent via Amazon SES.
  After HTML-to-text, each field row has 4 columns (2 label+value pairs side by side).
  Values have a ": " bold prefix — strip it. e.g. ": ZO29663100616818" → "ZO29663100616818".

ORDER DETAILS TABLE (verified row order — 5 rows total):
  Row 1: ZOOP Txn. No.    | : ZO29663100616818        | Type             | : Prepaid
  Row 2: Customer Name    | : Shivani Gadge            | Phone            | : 9619770718
  Row 3: Train            | : Mmct Duronto/ 22210      | Coach/ Seat      | : M1/ 10
  Row 4: Restaurants Name | : (1466) Shri Krishna Food | ETA              | : 31-May-2026 10:33
  Row 5: At               | : Vadodara Jn/ BRC         | Delivery Date    | : 31-May-2026 10:33

- ORDER NO: "ZOOP Txn. No." label — full ZO... string, no modification.
- CUSTOMER: "Customer Name" label.
- CONTACT: "Phone" label — 10-digit number.
- TRAIN: "Train" label — full string e.g. "Mmct Duronto/ 22210".
- COACH: "Coach/ Seat" label. Normalize spaces around slash: "M1/ 10" → "M1/10".
- PAYMENT: "Type" label. "Prepaid"→"Prepaid", "COD"→"COD".
- DATE & TIME: Use "Delivery Date" label (Row 5, right side) — NOT "ETA".
  Both ETA and Delivery Date contain the same value: "31-May-2026 10:33".
  Format: DD-Mon-YYYY HH:MM → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  e.g. "31-May-2026 10:33" → deliveryDate=2026-05-31, deliveryTime=10:33
- RESTAURANT: "Restaurants Name" label (Row 4) — ignore, not stored.
- STATION: "At" label (Row 5, left side) e.g. "Vadodara Jn/ BRC" — ignore or use for context.

ITEMS TABLE columns: Item Name | Price | Quantity | Amount   (4 columns only — NO Description column)
  e.g. Poha | 60 | 3 | 180
- There is NO serving description column in the items table.
- A SEPARATE "Item Description" section appears BELOW the items table with columns:
  Item Name | Description (e.g. Poha | 250g)
  This section is for reference only — IGNORE it entirely for items extraction.
- Price: plain number (no ₹ symbol in items table cells).
- Quantity: 3rd column — plain integer. CAN be large (5, 10, 20+).
- NEVER confuse Price with Quantity.

MANDATORY VERIFICATION — Amount is ALWAYS Price × Quantity for Zoop:
  Amount = Price × Quantity (always mathematically correct)
  e.g. Price=60, Quantity=3, Amount=180 → 60×3=180 ✓
  If extracted Quantity does not satisfy this formula, recalculate: Quantity = Amount ÷ Price.
  This check is MANDATORY for every item.

TOTALS (verified label order):
  Base Price Total          | ₹ 180
  (+) GST on food           | ₹ 9
  (+) Delivery Charge       | ₹ 25.42
  (+) GST on Delivery Charge| ₹ 4.58    ← always present, even if 0
  (+) Gateway Platform Fees | ₹ 20
  (-) Discount              | ₹ 0
  Order Total               | ₹ 239     ← use as totalAmount
  (-) Paid Online           | ₹ 239     ← present for Prepaid orders (amount paid)
  BALANCE TO PAY            | ₹ 0       ← 0 for Prepaid; equals Order Total for COD

- TOTAL: use "Order Total" label as totalAmount (strip ₹ symbol).
- deliveryCharge: use "(+) Delivery Charge" value.
- tax: use "(+) GST on food" value.
- REMARK: copy the "Suggestions" field value if present, otherwise leave empty.`;

module.exports = { matchers, type, rule };
