"use strict";

/**
 * VENDOR: YATRIBHOJAN
 * Sender: vendors@yatribhojan.com (via Zoho Mail)
 * Email type: Plain TEXT (no HTML)
 */

const matchers = [
  { match: "yatribhojan", name: "YatriBhojan", type: "yatribhojan" },
];

const type = "yatribhojan";

const rule = `VENDOR: YATRIBHOJAN
ORDER NO: Field label is "ORDER NO" — value is a plain integer like "57510466". Use this as orderNo.

EMAIL FORMAT: Plain text email (no HTML). Fields are on separate lines with "KEY: VALUE" format.

EXACT EMAIL STRUCTURE:
  ORDER NO: 57510466
  PAYMODE: CASH-ON-DELIVERY
  -----
  DELIVERY: 03-03-2026, ETA: 21:35
  STATION: VADODARA (BRC)
  TRAIN: 09562, OKHA BDTS SPL
  COACH: S2, SEAT: 1
  -----
  ITEM DETAILS
  ************
  Veg Hydrabadi Biriyani X 3
  ************
  DELIVERY CHARGE: Rs 0
  NET TOTAL: Rs 594
  -----
  CUSTOMER DETAILS
  NAME: SUMIT SANJAY CHAVAN
  MOB: 9321434178

- ORDER NO: "ORDER NO" field — strip any leading #.
- PAYMENT: "PAYMODE" field. "CASH-ON-DELIVERY"→"COD", "ONLINE"→"Prepaid".
  Note: uses DASH not underscore: "CASH-ON-DELIVERY".
- DATE: "DELIVERY" field format is "DD-MM-YYYY, ETA: HH:MM"
  → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM (after "ETA:").
- TRAIN: "TRAIN" field — full string e.g. "09562, OKHA BDTS SPL".
- COACH: "COACH" and "SEAT" appear on THE SAME LINE separated by comma:
  "COACH: S2, SEAT: 1" → combine as "S2/1".
  Extract value after "COACH:" as coach, value after "SEAT:" as seat, join with "/".
- ITEMS: Each item is on its own line as "Item Name X quantity"
  → qty is the number AFTER the "X" (or "x"). e.g. "Veg Biriyani X 3" → qty=3.
- PRICE: No individual item prices given. Set each item price=0.
- CUSTOMER: "NAME" field.
- CONTACT: "MOB" field — 10-digit number.
- TOTAL: "NET TOTAL" field — strip "Rs " prefix. e.g. "Rs 594" → 594.`;

module.exports = { matchers, type, rule };
