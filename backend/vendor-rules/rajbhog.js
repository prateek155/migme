"use strict";

/**
 * VENDOR: RAJBHOG (RajBhog Khana)
 * Sender: orders@rajbhogkhana.com (via Outlook)
 * Email type: Pure HTML (Bootstrap-based invoice — same template as Homebytes)
 */

const matchers = [
  { match: "rajbhog", name: "Rajbhog", type: "rajbhog" },
  { match: "rajbhaog", name: "Rajbhog", type: "rajbhog" },
];

const type = "rajbhog";

const rule = `VENDOR: RAJBHOG
ORDER NO: The invoice number appears as "RBK001712264 / 2451236265".
  Use the part AFTER the slash — "2451236265" — as orderNo (this is the IRCTC order ID).
  The part BEFORE the slash (e.g. "RBK001712264") is Rajbhog's own reference — do NOT use it as orderNo.

EMAIL FORMAT: Pure HTML Bootstrap invoice. After HTML-to-text, header fields are in a 3-column table row (not labeled rows).

HEADER SECTION (3 table columns side by side):
  Column 1: Booking Date: 30 May 2026, 19:46 \n Delivery Date: 30 May 2026, 20:52 \n FSSAI NO.: ...
  Column 2: (logo) \n Customer Name : MHINDER BHAI \n Customer Contact : 9537597173
  Column 3: Invoice RBK001712264 / 2451236265 \n Payment: CASH_ON_DELIVERY \n Coach / Berth: B4 / 34 \n Train: 09037 / BDTS BHUJ SF SPL \n Delivery Station: BRC / Vadodara

- ORDER NO: "Invoice" value — take the part AFTER " / ".
- CUSTOMER: "Customer Name :" in Column 2 paragraph.
- CONTACT: "Customer Contact :" in Column 2 paragraph — 10-digit number.
- PAYMENT: "Payment:" in Column 3. "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".
- COACH: "Coach / Berth:" in Column 3. Normalize spaces: "B4 / 34" → "B4/34".
- TRAIN: "Train:" in Column 3 — full string e.g. "09037 / BDTS BHUJ SF SPL".
- DATE & TIME: "Delivery Date:" in Column 1 contains BOTH date and time: "30 May 2026, 20:52"
  Format: DD Mon YYYY, HH:MM → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  Use "Delivery Date" NOT "Booking Date".

ITEMS TABLE columns: SL# | Item | Description | Qty | Price | GST | Amount
  e.g. "1 | Dal Khichdi (Dal AND Rice Mix) | 400 gm | 5 | 180.00 | 45.00 | 900.00"
- Qty is its OWN 4th column — a plain integer (can be large: 5, 8, 10+).
- Description (e.g. "400 gm", "1 pcs") is a serving description — NEVER a quantity.
- Amount = Price × Qty (always correct — verify: 180 × 5 = 900 ✓).
- VERIFY: Price × Qty = Amount for every row. If mismatch, recalculate Qty = Amount ÷ Price.

TOTALS:
  Subtotal: | 1,131.00
  GST (5%)  | 56.55
  Discount  | 0.00
  Delivery: | 0
  Total:    | 1188.00  ← use as totalAmount

- TOTAL: "Total:" field — strip any commas from number (e.g. "1,131.00" → 1131).`;

module.exports = { matchers, type, rule };
