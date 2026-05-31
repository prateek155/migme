"use strict";

/**
 * VENDOR: RAJDHANI (Garg Rajdhani Online Food)
 * Sender: rajdhaniorder.com / rajdhani domains
 * Email type: Pure HTML
 */

const matchers = [
  { match: "rajdhaniorder", name: "Rajdhani", type: "rajdhani" },
  { match: "rajdhani", name: "Rajdhani", type: "rajdhani" },
];

const type = "rajdhani";

const rule = `VENDOR: RAJDHANI
ORDER NO: Field label is "IRCTC Order ID" — value is a plain integer like "2451272001". Use this as orderNo.
  There is also an "Order" field showing "#322241" — this is the vendor's own ref, do NOT use it as orderNo.

EMAIL FORMAT: Pure HTML. After HTML-to-text, each field row appears as 3 pipe-separated columns:
  Label | : | Value
  e.g. " IRCTC Order ID | : | 2451272001 |"
  The VALUE is always the 3rd column (after the colon column).

ORDER FIELDS:
  IRCTC Order ID  | : | 2451272001       ← orderNo
  Customer Name   | : | Jayesh           ← customerName
  Mobile No       | : | 9323009200       ← contactNo (use "Mobile No", not "Alt. Mobile No")
  Train No / Name | : | 22210/MMCT DURONTO ← trainInfo
  Delivery Date   | : | 31-05-2026       ← deliveryDate (DD-MM-YYYY → YYYY-MM-DD)
  ETA             | : | 10:33:00         ← deliveryTime (take first HH:MM, drop seconds)
  Coach / Bearth  | : | M1/49            ← coach (already combined, capture as-is)
  Payment Mode    | : | Cash on Delivery ← paymentType
  Remarks         | : | N/A              ← remark (ignore if "N/A")
  Balance Amount  | : | 500              ← totalAmount (this is what to collect after discount)

ITEMS TABLE — Quantity column is FIRST, then Item Name:
  Quantity | Item Name
  4        | Extra Pav
  4        | Pav Bhaji
  → qty=4, name="Extra Pav" and qty=4, name="Pav Bhaji"
  No price per item is given — set each item price=0.

- DATE: "Delivery Date" field is DD-MM-YYYY → YYYY-MM-DD.
- TIME: "ETA" field is HH:MM:SS → extract only HH:MM (drop seconds).
- COACH: "Coach / Bearth" (note: spelled "Bearth" not "Berth"). Value already combined e.g. "M1/49".
- PAYMENT: "Payment Mode" field. "Cash on Delivery"→"COD".
- TOTAL: "Balance Amount" field — this is after any discount, the actual amount to collect.
  Do NOT use "Total Amount" (that is pre-discount).
- REMARK: "Remarks" field — ignore if value is "N/A".`;

module.exports = { matchers, type, rule };
