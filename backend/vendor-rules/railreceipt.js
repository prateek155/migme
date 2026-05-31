"use strict";

/**
 * VENDOR: RAIL RECEIPT (RailRecipe)
 * Sender: railreceipt.com domain
 * Email type: Pure HTML
 */

const matchers = [
  { match: "railreceipt", name: "Rail Receipt", type: "railreceipt" },
];

const type = "railreceipt";

const rule = `VENDOR: RAIL RECEIPT
ORDER NO: Field label is "Order No." — value is a plain integer like "2451216320". Use this as orderNo.
  Also capture PNR separately from "PNR No" field into the pnr field (may be empty).

EMAIL FORMAT: Pure HTML. After HTML-to-text, order detail fields appear as:
  Label | Value |

ORDER FIELDS:
  Order No.            | 2451216320
  PNR No               | (may be empty)
  Mobile No.           | 8239946373     ← contactNo
  Alt. mobile no       | (may be empty — use if Mobile No. is empty)
  Train No.            | 22653          ← just the train number (no name)
  Coach/Seat           | M4/26          ← already combined, capture as-is
  Delivery Station     | BRC
  Delivery Time (ETA)  | May 31,2026 11:54   ← date+time combined
  Journey Date         | 2026-05-31 09:10    ← YYYY-MM-DD format (ignore time part)

  PAYMENT STATUS       | PREPAID

ITEMS TABLE — each item spans TWO lines after HTML-to-text:
  Line 1 = Item name only            e.g. "SAADA THALI"
  Line 2 = Description | Price | Quantity | Amount  (pipe-separated)
  e.g. "MIX VEG +DAL FRY+3 PLAIN ROTI+PLAIN RICE+SALAD | ₹ 180 | x6 | ₹1080"
       "1Pcs | ₹ 12 | x2 | ₹24"

  ⚠️ Description may contain numbers (e.g. "3 PLAIN ROTI") — these are NEVER quantity.
  - Price: after 1st pipe, strip "₹" and spaces → numeric value.
  - Quantity: after 2nd pipe, format is "x6", "x2" → extract number after "x".
  - Amount: after 3rd pipe, strip "₹" → numeric (= Price × Qty, always correct).
  - VERIFY: Price × Qty = Amount. If mismatch, recalculate Qty = Amount ÷ Price.

TOTALS:
  Subtotal        | ₹ 1104
  Discount        | ₹ 100
  Delivery Charge | ₹ 0
  GST             | ₹ 55.20
  Grand Total     | ₹ 1059.20  ← use as totalAmount (after discount)

- ORDER NO: "Order No." field.
- CONTACT: "Mobile No." field. If empty, use "Alt. mobile no" field.
- DATE: "Journey Date" field is already YYYY-MM-DD (ignore the time part after the space).
- TIME: "Delivery Time (ETA)" field format is "Mon DD,YYYY HH:MM" → extract HH:MM only.
  e.g. "May 31,2026 11:54" → deliveryTime=11:54
- COACH: "Coach/Seat" field — already combined e.g. "M4/26", capture as-is.
- PAYMENT: "PAYMENT STATUS" field. "PREPAID"→"Prepaid", "COD"/"CASH_ON_DELIVERY"→"COD".
- TOTAL: "Grand Total" field — strip "₹" symbol and spaces.`;

module.exports = { matchers, type, rule };
