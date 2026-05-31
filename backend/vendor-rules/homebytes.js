"use strict";

/**
 * VENDOR: HOME BYTES
 * Sender: info@homebytes.co.in (via Outlook)
 * Email type: Pure HTML (Bootstrap-based invoice)
 */

const matchers = [
  { match: "homebytes", name: "Home Bytes", type: "homebytes" },
];

const type = "homebytes";

const rule = `VENDOR: HOME BYTES
ORDER NO: The invoice number appears as "HB001227772 / 2450608849".
  Use the part BEFORE the slash — "HB001227772" — as orderNo.
  The number AFTER the slash is the IRCTC reference — do NOT use it as orderNo.

EMAIL FORMAT: Pure HTML Bootstrap invoice. After HTML-to-text, header fields are in a 3-column table row (not labeled rows).

HEADER SECTION (3 table columns side by side):
  Column 1: Booking Date: 28 May 2026, 20:55 \n Delivery Date: 28 May 2026, 21:57 \n FSSAI NO.: ...
  Column 2: (logo) \n Customer Name : SHUBHAM \n Customer Contact : 8806544491
  Column 3: Invoice HB001227772 / 2450608849 \n Payment: CASH_ON_DELIVERY \n Coach / Berth: RAC/B4 / 63 \n Train: 22185 / ADI PUNE SF \n Delivery Station: BRC / VADODARA JN

- ORDER NO: "Invoice" value — take the part BEFORE " / ".
- CUSTOMER: "Customer Name :" in Column 2 paragraph.
- CONTACT: "Customer Contact :" in Column 2 paragraph — 10-digit number.
- PAYMENT: "Payment:" in Column 3. "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".
- COACH: "Coach / Berth:" in Column 3. Normalize spaces: "RAC/B4 / 63" → "RAC/B4/63".
- TRAIN: "Train:" in Column 3 — full string e.g. "22185 / ADI PUNE SF".
- DATE & TIME: "Delivery Date:" in Column 1 contains BOTH date and time: "28 May 2026, 21:57"
  Format: DD Mon YYYY, HH:MM → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  Use "Delivery Date" NOT "Booking Date".

ITEMS TABLE columns: SL# | Item | Description | Qty | Price | GST | Amount
  e.g. "1 | Onion aloo paratha | 1pcs | 1 | 120.00 | 6.00 | 120.00"
- Qty is its OWN 4th column — a plain integer.
- Description (e.g. "1pcs", "400 gm") is a serving description — NEVER a quantity.
- Price format: plain decimal like "120.00".
- Amount = Price × Qty (always correct — verify if needed).

TOTALS:
  Subtotal: | 120.00
  GST (5%)  | 6.00
  Discount  | 0.00
  Delivery: | 0
  Total:    | 126.00  ← use as totalAmount

- TOTAL: "Total:" field.`;

module.exports = { matchers, type, rule };
