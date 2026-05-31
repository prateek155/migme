"use strict";

/**
 * VENDOR: RAILYATRI
 * Sender: railyatri.in
 * Email type: Pure HTML (invoice format)
 */

const matchers = [{ match: "railyatri", name: "RailYatri", type: "railyatri" }];

const type = "railyatri";

const rule = `VENDOR: RAILYATRI
ORDER NO: Field label is "Order ID" — value is a plain integer like "4299027". Use this as orderNo.

EMAIL FORMAT: Pure HTML invoice. After HTML-to-text, columns are pipe-separated.

ORDER FIELDS (each on its own row):
  Order ID              | 4299027
  Customer Name         | KHEMRAJ MEENA
  Contact No.           | 9680363785      ← contactNo
  Mode of Payment       | COD
  Delivery Date         | 31-05-2026      ← DD-MM-YYYY
  Expected Time         | 10:57           ← HH:MM
  Train                 | 20668 - JP YPR SF EXP   ← note: DASH separator not slash
  Coach and Seat No.    | B2 , 40         ← normalize "B2 , 40" → "B2/40"

ITEMS TABLE — pipe-separated with 5 columns:
  Item | Quantity | (calculation) | Rs. | Price
  e.g. "Deluxe Paneer Thali | 1 | (1 * 259) | Rs. | 259"

  Column positions:
  1st = Item name
  2nd = Quantity  ← THIS IS THE REAL QUANTITY (a plain integer like 1, 2, 3)
  3rd = (n * price) — a DISPLAY calculation column, IGNORE IT for quantity
  4th = "Rs." — currency label, ignore
  5th = Price per unit (numeric)

  ⚠️ The 3rd column "(1 * 259)" shows quantity × price for display only.
     The actual quantity is ALWAYS the standalone integer in the 2nd column.
     Do NOT parse quantity from the calculation column.

TOTALS (each row: Label | : | | Rs. | Amount):
  Sub Total            | Rs. | 259
  Tax                  | Rs. | 0
  Delivery Charge      | Rs. | 0
  Convenience Charge   | Rs. | 0
  Grand Total          | Rs. | 259
  Amount to be collected | Rs. | 272  ← USE THIS as totalAmount

- ORDER NO: "Order ID" field.
- CONTACT: "Contact No." field (note the period).
- DATE: "Delivery Date" field is DD-MM-YYYY → YYYY-MM-DD.
- TIME: "Expected Time" field is already HH:MM.
- TRAIN: "Train" field — full string e.g. "20668 - JP YPR SF EXP".
- COACH: "Coach and Seat No." field. Normalize: "B2 , 40" → "B2/40" (replace space-comma-space with /).
- PAYMENT: "Mode of Payment" field. "COD"→"COD", "PREPAID"→"Prepaid".
- TOTAL: "Amount to be collected" field — this includes convenience charge, is the ground truth.`;

module.exports = { matchers, type, rule };
