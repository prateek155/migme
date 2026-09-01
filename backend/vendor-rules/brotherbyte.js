"use strict";

/**
 * VENDOR: BROTHERBYTE
 * Sender domain : brotherbyte.com  (orders@brotherbyte.com)
 * Transport     : Microsoft 365 / Outlook (outbound.protection.outlook.com)
 * Content-Type  : text/html only (no text/plain part)
 * Transfer      : quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order ID BB00100881/2481727550 (1-Sep-2026)
 *
 * ── EMAIL STRUCTURE ────────────────────────────────────────────────────────
 *
 * HTML-only email — single <table>, one <tr> per field, two <td> per row:
 * <td>Label</td><td>Value</td>. No text/plain part exists, so we parse the
 * HTML directly (parseDomOrder → lineBased mode, NOT parseWithAWS/AI).
 *
 * When tags are stripped (htmlToLines), label and value land on two
 * SEPARATE consecutive lines (the original template already has each
 * <tr>/<td> on its own physical source line, and those hard newlines
 * survive quoted-printable decoding):
 *
 *   Order ID
 *   BB00100881/2481727550
 *   Train
 *   12909/NZM GARIB RATH
 *   Station
 *   VADODARA JN (BRC)
 *   Delivery Date & ETA
 *   09-01-2026 22:19 IST
 *   Coach & Berth
 *   G16/48
 *   Customer
 *   Kartik Sharma (7669828991)
 *   Items
 *   2-🟢 Paneer Combo - 3 Butter Roti, Paneer Sabji, # 3-🟢 Butter Roti - 1 Pcs
 *   Payment Method
 *   Cash On Delivery
 *   Order Total
 *   ₹365.76
 *   GST/Tax
 *   ₹15.76
 *   Discount
 *   ₹0
 *   Outlet Discount
 *   ₹35
 *   Amount to Collect
 *   ₹331
 *   Customer Notes
 *   Provide Good food
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * Since label and value are on two DIFFERENT lines (not "Label :- Value" on
 * one line like Dibrail), each field is matched directly against its VALUE
 * line using a pattern unique enough not to collide with any other row.
 *
 * ORDER NO: "Order ID" value looks like "BB00100881/2481727550".
 *   Use ONLY the part AFTER "/" → "2481727550". Part before "/" is discarded.
 *   (Regex requires 2+ leading letters so it never matches "Coach & Berth"
 *   values like "G16/48".)
 *
 * TRAIN: "Train" value e.g. "12909/NZM GARIB RATH" — kept as-is.
 *
 * COACH: "Coach & Berth" value e.g. "G16/48" — kept as-is.
 *
 * CUSTOMER: "Customer" value is "Name (10-digit-phone)" combined —
 *   e.g. "Kartik Sharma (7669828991)" → customerName="Kartik Sharma",
 *   contactNo="7669828991".
 *
 * DATE/TIME: "Delivery Date & ETA" value format is "MM-DD-YYYY HH:MM IST"
 *   (NOTE: month-first, NOT day-first — e.g. "09-01-2026" = 1-Sep-2026).
 *   System/DB requires deliveryDate strictly as YYYY-MM-DD (ISO) —
 *   validateOrderData(), cache keys, and Firestore deliveryDate queries all
 *   depend on this exact format. So MM-DD-YYYY is converted to YYYY-MM-DD,
 *   NOT to DD-MM-YYYY.
 *   e.g. "09-01-2026 22:19 IST" → deliveryDate=2026-09-01, deliveryTime=22:19
 *
 * PAYMENT: "Payment Method" value: "Cash On Delivery" → COD; anything
 *   else → Prepaid.
 *
 * ITEMS FORMAT: "Items" value is ONE line containing ALL items, separated
 *   by "#". Each item chunk looks like "<qty>-<emoji> <name>,".
 *   qty = integer BEFORE the first "-". Name = everything after, with the
 *   leading emoji/symbol and trailing comma stripped.
 *   e.g. "2-🟢 Paneer Combo - 3 Butter Roti, Paneer Sabji, # 3-🟢 Butter Roti - 1 Pcs"
 *        → [{name:"Paneer Combo - 3 Butter Roti, Paneer Sabji", quantity:2},
 *            {name:"Butter Roti - 1 Pcs", quantity:3}]
 *   *** The digits before "-" are ALWAYS quantity — never part of the name. ***
 *
 * ITEM PRICE: BrotherByte does NOT include individual item prices in the
 *   email. Set price=0 for all items. Order-level totals come from the
 *   footer fields below.
 *
 * TOTALS (all on their own value line, ₹-prefixed):
 *   "Order Total"       → gross total (before outlet discount)
 *   "GST/Tax"            → tax amount
 *   "Discount"           → platform discount
 *   "Outlet Discount"    → outlet-funded discount
 *   "Amount to Collect"  → FINAL amount to collect from customer → use as totalAmount
 *
 * NOTES: "Customer Notes" value is free-text typed by the customer — not
 *   captured via a fixed regex (too unpredictable to pattern-match safely).
 *   remark is instead built from the discount breakdown above.
 *
 * DOM PARSING: Fully DOM-parseable — parseWithAWS/AI is never needed for
 * this vendor as long as the template stays as shown above.
 */

const domConfig = {
  lineBased: true,

  lineBasedFields: {
    // "BB00100881/2481727550" -> "2481727550"
    orderNo: {
      match: /^[A-Za-z]{2,}\d+\/(\d+)$/,
      transform: (v) => v.trim(),
    },

    // "12909/NZM GARIB RATH" -> "12909/NZM GARIB RATH"
    trainInfo: {
      match: /^(\d+\/[A-Z0-9 ]+)$/,
      transform: (v) => v.trim(),
    },

    // "09-01-2026 22:19 IST" -> deliveryDate "2026-09-01"
    // Source is MM-DD-YYYY; system needs YYYY-MM-DD.
    deliveryDate: {
      match: /^(\d{2}-\d{2}-\d{4})\s+\d{2}:\d{2}\s+IST$/,
      transform: (v) => {
        const [mm, dd, yyyy] = v.split("-");
        return `${yyyy}-${mm}-${dd}`;
      },
    },

    // "09-01-2026 22:19 IST" -> deliveryTime "22:19"
    deliveryTime: {
      match: /^\d{2}-\d{2}-\d{4}\s+(\d{2}:\d{2})\s+IST$/,
      transform: (v) => v.trim(),
    },

    // "G16/48" -> "G16/48"
    coach: {
      match: /^([A-Z]\d+\/\d+)$/,
      transform: (v) => v.trim(),
    },

    // "Kartik Sharma (7669828991)" -> "Kartik Sharma"
    customerName: {
      match: /^(.+?)\s*\(\d{10}\)$/,
      transform: (v) => v.trim(),
    },

    // "Kartik Sharma (7669828991)" -> "7669828991"
    contactNo: {
      match: /\((\d{10})\)$/,
      transform: (v) => v.trim(),
    },

    // Full raw "Items" value line, kept as-is — postProcess() below splits
    // it into the real items[] array. Matches lines starting "<digits>-"
    // where the char right after "-" is NOT another digit (this is what
    // distinguishes it from the date line "09-01-2026 ...").
    itemsRaw: {
      match: /^\d+-(?!\d).+$/,
      transform: (v) => v.trim(),
    },
  },

  // Placeholder single-item extraction — its ONLY job is to make
  // items.length > 0 so the line-based parser doesn't bail out before
  // reaching postProcess(). postProcess() discards this and rebuilds the
  // real items[] array from itemsRaw (multiple items split on "#").
  lineBasedItems: {
    startMarker: "Items", // the "Items" LABEL line
    endMarker: /^Payment Method$/i,
    itemLineMatch: /^(\d+)-(.+)$/,
    qtyGroup: 1,
    nameGroup: 2,
  },

  // Numeric footer values — label on one line, ₹-value on the next line.
  // cleanFloat() (backend.js) strips the ₹ symbol automatically.
  lineBasedFooter: {
    orderTotal: { label: /^Order Total$/i },
    gstTax: { label: /^GST\/Tax$/i },
    discount: { label: /^Discount$/i },
    outletDiscount: { label: /^Outlet Discount$/i },
    amountToCollect: { label: /^Amount to Collect$/i },
  },

  postProcess: (order) => {
    // ── Rebuild items[] from the single "#"-separated raw line ──────────
    const raw = order.itemsRaw || "";
    const parsedItems = raw
      .split("#")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        chunk = chunk.replace(/,\s*$/, ""); // trailing comma from the split
        const m = chunk.match(/^(\d+)-\s*(.+)$/);
        if (!m) return null;
        const quantity = parseInt(m[1], 10) || 1;
        const name = m[2].trim().replace(/^[^\w]+/, "").trim(); // strip leading emoji
        if (!name) return null;
        return { name, quantity, price: 0 }; // no per-item price for this vendor
      })
      .filter(Boolean);

    if (parsedItems.length > 0) {
      order.items = parsedItems;
    }
    delete order.itemsRaw;

    // ── Totals from footer captures ──────────────────────────────────────
    const fc = order._footerCaptures || {};
    const orderTotal = fc.orderTotal || 0;
    const gstTax = fc.gstTax || 0;
    const discount = fc.discount || 0;
    const outletDiscount = fc.outletDiscount || 0;
    const amountToCollect = fc.amountToCollect || 0;

    order.subTotal = Math.round((orderTotal - gstTax) * 100) / 100;
    order.tax = gstTax;
    order.deliveryCharge = 0;
    order.totalAmount = amountToCollect || orderTotal;
    order.remark = `Discount: ₹${discount}, Outlet Discount: ₹${outletDiscount}, Order Total: ₹${orderTotal}`;

    return order;
  },
};

const matchers = [
  { match: "brotherbyte.com", name: "BrotherByte", type: "brotherbyte" },
  { match: "1972vragrawal@gmail.com", name: "BrotherByte", type: "brotherbyte" },
];

const type = "brotherbyte";

const rule = `VENDOR: BROTHERBYTE
SENDER: orders@brotherbyte.com | FORMAT: HTML-only two-column table (Label / Value per row).

EXACT STRUCTURE (verified from real .eml, label and value are separate rows):
  Order ID              BB00100881/2481727550
  Train                 12909/NZM GARIB RATH
  Station                VADODARA JN (BRC)
  Delivery Date & ETA    09-01-2026 22:19 IST
  Coach & Berth          G16/48
  Customer               Kartik Sharma (7669828991)
  Items                  2-🟢 Paneer Combo - 3 Butter Roti, Paneer Sabji, # 3-🟢 Butter Roti - 1 Pcs
  Payment Method         Cash On Delivery
  Order Total            ₹365.76
  GST/Tax                ₹15.76
  Discount               ₹0
  Outlet Discount        ₹35
  Amount to Collect      ₹331
  Customer Notes         Provide Good food

FIELD RULES:
- ORDER NO:  "Order ID" value → use ONLY the part AFTER "/". e.g. "BB00100881/2481727550" → "2481727550".
             Do NOT use the part before the slash.
- CUSTOMER:  "Customer" value is "Name (10-digit-phone)" → split into customerName and contactNo.
             e.g. "Kartik Sharma (7669828991)" → customerName="Kartik Sharma", contactNo="7669828991".
- TRAIN:     "Train" value kept as-is, e.g. "12909/NZM GARIB RATH".
- COACH:     "Coach & Berth" value kept as-is, e.g. "G16/48".
- DATE/TIME: "Delivery Date & ETA" format is MM-DD-YYYY HH:MM IST (month-first, NOT day-first).
             → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM.
             e.g. "09-01-2026 22:19 IST" → deliveryDate=2026-09-01, deliveryTime=22:19.
- PAYMENT:   "Payment Method" value: "Cash On Delivery" → COD; anything else → Prepaid.
- TOTAL:     Use "Amount to Collect" as totalAmount (final payable amount, e.g. 331).
             "Order Total" is the gross total before outlet discount — do not use it as totalAmount.
- TAX:       "GST/Tax" value → tax.
- REMARK:    Summarize "Discount", "Outlet Discount" and "Order Total" into remark.

ITEMS FORMAT: The "Items" value is ONE line containing ALL items, separated by "#".
  Pattern per item: "N-<emoji> ITEM NAME,"
  N = qty (integer BEFORE the first "-"). Strip the leading emoji/symbol and trailing comma.
  e.g. "2-🟢 Paneer Combo - 3 Butter Roti, Paneer Sabji, # 3-🟢 Butter Roti - 1 Pcs"
       → [{name:"Paneer Combo - 3 Butter Roti, Paneer Sabji", quantity:2},
           {name:"Butter Roti - 1 Pcs", quantity:3}]
  *** The number before "-" is ALWAYS the quantity — never part of the item name. ***

ITEM PRICES: BrotherByte does NOT include individual item prices.
  Set price=0 for every item. Use "Amount to Collect" for the order total.

DO NOT VERIFY: Price × Qty formula is NOT applicable (all item prices are 0).`;

module.exports = { matchers, type, rule, domConfig };
