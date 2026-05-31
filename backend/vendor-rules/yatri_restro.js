"use strict";

/**
 * VENDOR: YATRI RESTRO
 * Sender: support@yatrirestro.com (via Amazon SES)
 * Email type: Pure HTML
 */

const matchers = [
  { match: "yatrirestro", name: "Yatri Restro", type: "yatri_restro" },
  { match: "yatristro", name: "Yatri Restro", type: "yatri_restro" },
];

const type = "yatri_restro";

const rule = `VENDOR: YATRI RESTRO
ORDER NO: Field label is "ORDER No" — value is a plain integer like "1000471164". Use this as orderNo.

EMAIL FORMAT: Pure HTML. After HTML-to-text, fields appear as pipe-separated rows.

ORDER SUMMARY TABLE (4 columns per row — 2 label+value pairs side by side):
  ORDER No        | 1000471164         | MOBILE NO      | 9558959839
  CUSTOMER NAME   | Rushikesh Prajapati| TRAIN No /NAME | 22932 / JSM BDTS SF EXP
  DELIVERY DATE   | 31-05-2026, 11:53  | COACH/BERTH    | S1 / 43
  PAYMENT STATUS  | CASH_ON_DELIVERY   | Station Code/Name | BRC / VADODARA JN

- ORDER NO: "ORDER No" field (1st column of 1st row).
- CONTACT: "MOBILE NO" field — 10-digit number.
- CUSTOMER: "CUSTOMER NAME" field.
- TRAIN: "TRAIN No /NAME" field — use full string e.g. "22932 / JSM BDTS SF EXP".
- DATE & TIME: "DELIVERY DATE" field contains BOTH date and time combined: "31-05-2026, 11:53"
  → deliveryDate=2026-05-31, deliveryTime=11:53
- COACH: "COACH/BERTH" field. Normalize spaces around slash: "S1 / 43" → "S1/43".
- PAYMENT: "PAYMENT STATUS" field. "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".

ITEMS TABLE columns: Item | Description | Price | Quantity | Amount
- Description (e.g. "500g") is a serving description — NEVER a quantity.
- Price format: "₹ 165" — extract numeric value only (strip ₹ and spaces).
- Quantity is its OWN 4th column — a plain integer.
- Amount = Price × Quantity (always correct for this vendor).
- VERIFY: Price × Quantity = Amount. If mismatch, recalculate Quantity = Amount ÷ Price.

TOTALS:
  Sub Total | ₹ 165
  GST       | ₹ 8.25
  DISCOUNT  | ₹ 0
  Grand Total (Inclusive of all taxes) | ₹ 173  ← use this as totalAmount

- TOTAL: "Grand Total (Inclusive of all taxes)" field — strip ₹ symbol.`;

module.exports = { matchers, type, rule };
