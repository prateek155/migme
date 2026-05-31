"use strict";

/**
 * VENDOR: DIBRAIL
 * Sender: dibrailcare@gmail.com
 * Email type: Multipart (plain text + HTML) — plain text part is used
 */

const matchers = [{ match: "dibrail", name: "Dibrail", type: "dibrail" }];

const type = "dibrail";

const rule = `VENDOR: DIBRAIL
ORDER NO: Field label is "Order ID" — value has a leading "#" e.g. "#210918".
  Strip the "#" and use only the digits: "210918" as orderNo.

EMAIL FORMAT: Multipart email — plain text part is used (simpler and cleaner).
Every field line starts with a ✅ emoji and uses ":-" as separator.
Items start with a 👉🏼 emoji.

EXACT EMAIL STRUCTURE:
  ✅ Order ID :- #210918
  ✅ Customer Name :- Jaswant
  ✅ Mobile :- 7339957184, 7357909913
  ✅ Station :- VADODARA (BRC)
  ✅ Train :- 20626 - BGKT MAS SF EXP
  ✅ Coach & Seat :- S6  - 8
  ✅ Delivery Time :- 29-05-2026 16:52
  ✅ Order Type : COD
  ✅ Total Amount :- 189.00
  ✅ Cash On Delivery :- 189.00
  ✅ Items:
  👉🏼 1-VEG MINI THALI,
  ✅ Notes :- .

- ORDER NO: "Order ID" field — strip "#" prefix.
- CUSTOMER: "Customer Name" field — value after ":-".
- CONTACT: "Mobile" field — use the FIRST 10-digit number if multiple given (e.g. "7339957184, 7357909913" → "7339957184").
- TRAIN: "Train" field — full string e.g. "20626 - BGKT MAS SF EXP" (dash separator).
- COACH: "Coach & Seat" field. Value is "S6  - 8" (spaces around dash).
  Normalize: remove spaces, replace dash with slash → "S6/8".
- DATE & TIME: "Delivery Time" field format is DD-MM-YYYY HH:MM (24hr)
  → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  e.g. "29-05-2026 16:52" → deliveryDate=2026-05-29, deliveryTime=16:52
- PAYMENT: "Order Type" field (uses single ":" not ":-"). "COD"→"COD", "ONLINE"→"Prepaid".
- TOTAL: "Total Amount" field — strip ":-" and spaces. e.g. "189.00" → 189.

ITEMS format: "👉🏼 qty-Item Name,"
  → qty is the number BEFORE the first "-". Strip the emoji prefix.
  e.g. "👉🏼 1-VEG MINI THALI," → qty=1, name="VEG MINI THALI"
  e.g. "👉🏼 2-DAL RICE," → qty=2, name="DAL RICE"
  No individual item prices — set each item price=0.`;

module.exports = { matchers, type, rule };

