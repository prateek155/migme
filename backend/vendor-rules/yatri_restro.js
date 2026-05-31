"use strict";

/**
 * VENDOR: YATRI RESTRO
 * Sender: support@yatrirestro.com (via Amazon SES)
 * Content-Type: text/html; charset=utf-8 — pure HTML single part, NO plain text part.
 * Transfer: quoted-printable
 *
 * DOM PARSING: VIABLE — clean 4-col order table + 5-col items table.
 * AI PATH: Falls back to HTML-stripped plain text if DOM fails.
 *
 * VERIFIED AGAINST: real .eml dated 31-May-2026 (Order No 1000471164)
 */

const matchers = [
  { match: "yatrirestro", name: "Yatri Restro", type: "yatri_restro" },
  { match: "yatristro",   name: "Yatri Restro", type: "yatri_restro" },
];

const type = "yatri_restro";

const rule = `VENDOR: YATRI RESTRO
ORDER NO: Field label is "ORDER No" — value is a plain integer like "1000471164". Use this as orderNo.

EMAIL FORMAT: Pure HTML single part (no plain text part). Sent via Amazon SES.
  After HTML-to-text, fields appear as pipe-separated rows.

ORDER DETAILS TABLE (4 columns per row — 2 label+value pairs side by side):
  ORDER No        | 1000471164          | MOBILE NO         | 9558959839
  CUSTOMER NAME   | Rushikesh Prajapati | TRAIN No /NAME    | 22932 / JSM BDTS SF EXP
  DELIVERY DATE   | 31-05-2026, 11:53   | COACH/BERTH       | S1 / 43
  PAYMENT STATUS  | CASH_ON_DELIVERY    | Station Code/Name | BRC / VADODARA JN

- ORDER NO: "ORDER No" label (1st column, 1st row).
- CONTACT: "MOBILE NO" label — 10-digit number.
- CUSTOMER: "CUSTOMER NAME" label.
- TRAIN: "TRAIN No /NAME" label — full string e.g. "22932 / JSM BDTS SF EXP".
- DELIVERY DATE & TIME: "DELIVERY DATE" label — format is "DD-MM-YYYY, HH:MM".
  → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM (strip the comma).
  e.g. "31-05-2026, 11:53" → deliveryDate=2026-05-31, deliveryTime=11:53
- COACH: "COACH/BERTH" label. Value may have trailing spaces (e.g. "S1 / 43  ").
  Trim and normalize spaces around slash: "S1 / 43" → "S1/43".
- PAYMENT: "PAYMENT STATUS" label. "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".
- STATION: "Station Code/Name" label — for reference only, include in trainInfo if useful.

ITEMS TABLE columns: Item | Description | Price | Quantity | Amount
  e.g. Veg Pulao | 500g | ₹ 165 | 1 | ₹ 165
- Description (e.g. "500g") is a serving size — NEVER a quantity.
- Price cell format: "₹ 165" — strip ₹ symbol and leading/trailing spaces → 165.
- Quantity cell may have a leading space (e.g. " 1") — trim and parse as integer.
- Quantity is its OWN 4th column — a plain integer.
- Amount = Price × Quantity (always correct for this vendor).
- VERIFY: Price × Quantity = Amount. If mismatch, recalculate Quantity = Amount ÷ Price.

TOTALS:
  Sub Total                              | ₹ 165
  GST                                    | ₹ 8.25
  DISCOUNT                               | ₹ 0
  Grand Total (Inclusive of all taxes)   | ₹ 173   ← use this as totalAmount

- TOTAL: "Grand Total (Inclusive of all taxes)" label — strip ₹ symbol.`;

module.exports = { matchers, type, rule };
