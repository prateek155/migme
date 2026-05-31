"use strict";

/**
 * VENDOR: SPICYWAGON
 * Sender: noreply@spicywagon.in (via SendGrid)
 * Email type: HTML with <br/> tags — renders as plain text lines
 */

const matchers = [
  { match: "spicywagon", name: "Spicywagon", type: "spicywagon" },
];

const type = "spicywagon";

const rule = `VENDOR: SPICYWAGON
ORDER NO: Field label is "ORDER NO" — value is a plain integer like "2385697759". Use this as orderNo.

EMAIL FORMAT: HTML email using <br/> tags. After HTML-to-text, content appears as plain text lines.

EXACT EMAIL STRUCTURE:
  NEW ORDER !!
  -----
  ORDER NO: 2385697759
  PAYMODE: CASH_ON_DELIVERY
  -----
  DELIVERY: 26-12-25 05:27 PM
  STATION: VADODARA JN (BRC)
  TRAIN: 22414: NZM MAO RAJDANI
  COACH: B10, SEAT 4
  -----
  ITEM DETAILS
  *
  Butter Roti × 5
  Aloo Palak × 1
  *
  DELIVERY CHARGE: Rs 0.0
  NET TOTAL: Rs 272.0
  -----
  CUSTOMER DETAILS
  NAME: Muskan
  MOB: 9991768965

- ORDER NO: "ORDER NO" field.
- PAYMENT: "PAYMODE" field.
  "CASH_ON_DELIVERY"→"COD", "PRE_PAID"→"Prepaid", "ONLINE"→"Prepaid".
- DATE: "DELIVERY" field format is "DD-MM-YY HH:MM AM/PM" (2-digit year)
  → deliveryDate=YYYY-MM-DD (25→2025, 26→2026), deliveryTime=HH:MM in 24hr.
  e.g. "26-12-25 05:27 PM" → deliveryDate=2025-12-26, deliveryTime=17:27
- STATION: "STATION" field — delivery station name.
- TRAIN: "TRAIN" field — full string e.g. "22414: NZM MAO RAJDANI" (colon separator).
- COACH: "COACH" and "SEAT" appear on THE SAME LINE separated by comma:
  "COACH: B10, SEAT 4" → combine as "B10/4".
  Extract value after "COACH:" as coach part, value after "SEAT" as seat part, join with "/".
- ITEMS: Each item line format: "Item Name × qty" or "Item Name x qty"
  → qty is the number AFTER the × or x symbol.
  e.g. "Butter Roti × 5" → name="Butter Roti", qty=5
- PRICE: No individual item prices given — set each item price=0.
- CUSTOMER: "NAME" field.
- CONTACT: "MOB" field — 10-digit number.
- TOTAL: "NET TOTAL" field — strip "Rs " prefix. e.g. "Rs 272.0" → 272.`;

module.exports = { matchers, type, rule };
