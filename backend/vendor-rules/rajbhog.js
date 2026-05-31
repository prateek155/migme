"use strict";

/**
 * VENDOR: RAJBHOG (RajBhog Khana)
 * Sender: orders@rajbhogkhana.com (via Microsoft Outlook / Exchange)
 * Content-Type: text/html; charset=utf-8 — pure HTML single part, NO plain text part.
 * Transfer: quoted-printable
 *
 * DOM PARSING: VIABLE — Bootstrap invoice with clean <thead> 3-col header
 *              and standard <tbody> items table.
 * AI PATH: Falls back to HTML-stripped plain text if DOM fails.
 *
 * VERIFIED AGAINST: real .eml dated 30-May-2026 (RBK001712264 / 2451236265)
 */

const matchers = [
  { match: "rajbhog",  name: "Rajbhog", type: "rajbhog" },
  { match: "rajbhaog", name: "Rajbhog", type: "rajbhog" },
];

const type = "rajbhog";

const rule = `VENDOR: RAJBHOG
ORDER NO: The invoice number appears as "RBK001712264 / 2451236265".
  Use the part AFTER the slash — "2451236265" — as orderNo (this is the IRCTC order ID).
  The part BEFORE the slash (e.g. "RBK001712264") is Rajbhog's own reference — do NOT use it.

EMAIL FORMAT: Pure HTML single part (no plain text part). Bootstrap invoice via Outlook/Exchange.
  After HTML-to-text, header fields are in a 3-column <thead><tr> (not labeled key-value rows).

HEADER SECTION (3 table columns side by side in <thead>):
  Column 1: Booking Date: 30 May 2026,  19:46
            Delivery Date: 30 May 2026,  20:52
            FSSAI NO.: 10722032001215
  Column 2: (logo image)
            To
            Customer Name : MHINDER BHAI      ← inside <strong> + uppercase <span>
            Customer Contact : 9537597173
            Customer Email :
  Column 3: Invoice RBK001712264 / 2451236265  ← inside <b>
            Payment: CASH_ON_DELIVERY
            Coach / Berth: B4 / 34
            Train: 09037 / BDTS BHUJ SF SPL
            Delivery Station: BRC / Vadodara

- ORDER NO: "Invoice" value in Column 3 — take the part AFTER " / " (the IRCTC ID).
- CUSTOMER: "Customer Name :" in Column 2. Value is uppercase (CSS transform) — preserve as-is.
- CONTACT: "Customer Contact :" in Column 2 — 10-digit number.
- PAYMENT: "Payment:" in Column 3. "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".
- COACH: "Coach / Berth:" in Column 3. Normalize spaces: "B4 / 34" → "B4/34".
- TRAIN: "Train:" in Column 3 — full string e.g. "09037 / BDTS BHUJ SF SPL".
- DATE & TIME: "Delivery Date:" in Column 1 — format is "DD Mon YYYY,  HH:MM" (may have extra spaces).
  → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  e.g. "30 May 2026,  20:52" → deliveryDate=2026-05-30, deliveryTime=20:52
  Use "Delivery Date" NOT "Booking Date".

ITEMS TABLE columns: SL# | Item | Description | Qty | Price | GST | Amount
  e.g. 1 | Dal Khichdi (Dal AND Rice Mix) | 400 gm | 5 | 180.00 | 45.00 | 900.00
       2 | MIX VEG                        | 400 gm | 1 | 135.00 |  6.75 | 135.00
       3 | TAWA ROTI                      | 1 pcs  | 8 |  12.00 |  4.80 |  96.00

- SL# is column 1 (index 0) — skip it, not used.
- Item name is column 2 (index 1).
- Description (e.g. "400 gm", "1 pcs") is column 3 — serving size, NEVER a quantity.
- Qty is column 4 (index 3) — a plain integer. CAN be large (5, 8, 10+).
- Price is column 5 (index 4) — numeric, may have decimal (e.g. "180.00").
- GST is column 6 — ignore for items extraction.
- Amount is column 7 — verify Price × Qty = Amount.
- VERIFY: Price × Qty = Amount for every row. If mismatch, recalculate Qty = Amount ÷ Price.

TOTALS:
  Subtotal:  | 1,131.00
  GST (5%)   | 56.55
  Discount   | 0.00
  Delivery:  | 0
  Total:     | 1188.00   ← use as totalAmount

- TOTAL: "Total:" label — strip commas from number (e.g. "1,131.00" → 1131).
- subTotal: use "Subtotal:" value (strip commas).
- tax: use "GST (5%)" value.
- deliveryCharge: use "Delivery:" value.`;

module.exports = { matchers, type, rule };
