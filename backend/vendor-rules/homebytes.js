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
ORDER NO: The invoice number appears as "HB001228434 / 2451415153".
  Use the part BEFORE the slash — "HB001228434" — as orderNo.
  The number AFTER the slash is the IRCTC reference — do NOT use it as orderNo.

EMAIL FORMAT: Pure HTML Bootstrap invoice. After HTML-to-text, header fields are in a 3-column table row (not labeled rows).

HEADER SECTION (3 table columns side by side):
  Column 1: Booking Date: 31 May 2026, 13:06 \n Delivery Date: 31 May 2026, 15:00 \n FSSAI NO.: 10717032001326
  Column 2: (logo) \n Customer Name : VISHNU SHARMA \n Customer Contact : 8929434540
  Column 3: Invoice HB001228434 / 2451415153 \n Payment: CASH_ON_DELIVERY \n Coach / Berth: S4 / 51 \n Train: 01492 / NZM PUNE SPL \n Delivery Station: BRC / VADODARA JN

- ORDER NO: "Invoice" value — take the part BEFORE " / ".
- CUSTOMER: "Customer Name :" in Column 2 paragraph. Name may wrap to two lines (e.g. "VISHNU\nSHARMA") — join them with a space → "VISHNU SHARMA".
- CONTACT: "Customer Contact :" in Column 2 paragraph — 10-digit number.
- PAYMENT: "Payment:" in Column 3. "CASH_ON_DELIVERY"→"COD", "PREPAID"→"Prepaid".
- COACH: "Coach / Berth:" in Column 3. Normalize spaces: "S4 / 51" → "S4/51".
- TRAIN: "Train:" in Column 3 — full string e.g. "01492 / NZM PUNE SPL".
- DATE & TIME: "Delivery Date:" in Column 1 contains BOTH date and time: "31 May 2026, 15:00"
  Format: DD Mon YYYY, HH:MM → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
  Use "Delivery Date" NOT "Booking Date".

ITEMS TABLE columns (in order): SL# | Item | Description | Qty | Price | GST | Amount
  There are exactly 7 columns. Do not merge or skip any column.

  REAL EXAMPLES from actual invoices:
    "1 | Extra butter ROTI | 1PC  | 5 | 15.00 | 3.75 | 75.00"
    "2 | Sev tomato        | 300ml| 1 | 165.00| 8.25 | 165.00"

  COLUMN RULES:
  - Col 1 (SL#):         Row index integer. Ignore.
  - Col 2 (Item):        Product name string. Use as itemName.
  - Col 3 (Description): Serving size label e.g. "1PC", "300ml", "400 gm", "2pcs".
                         This column MAY contain a number — IGNORE that number entirely.
                         NEVER use the number inside Description as Qty.
  - Col 4 (Qty):         The ONLY source of quantity. Always a standalone integer.
                         e.g. row 1 above → Qty = 5 (NOT 1 from "1PC")
                         e.g. row 2 above → Qty = 1 (NOT 300 from "300ml")
  - Col 5 (Price):       Unit price as decimal e.g. "15.00". This is per-unit price.
  - Col 6 (GST):         GST amount as decimal. Ignore or store separately.
  - Col 7 (Amount):      Total for this row = Price × Qty.

  SELF-CHECK (mandatory): After parsing each row, verify Price × Qty = Amount.
    15.00 × 5 = 75.00 ✓
    165.00 × 1 = 165.00 ✓
    If Price × Qty ≠ Amount, you have parsed Qty from the wrong column. Re-parse.

TOTALS:
  Subtotal: | 240.00
  GST (5%)  | 12.00
  Discount  | 0.00
  Delivery: | 0
  Total:    | 252.00  ← use as totalAmount

- TOTAL: "Total:" field only. Do not use Subtotal or any other field as totalAmount.`;

module.exports = { matchers, type, rule };
