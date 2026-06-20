'use strict';

/**
 * VENDOR: OLF STORES (IRCTC eCatering Partner)
 * Sender:  marketing@olfstores.com
 * Content-Type: text/html; charset=utf-8 — pure HTML single part, NO text/plain.
 * Transfer: quoted-printable
 *
 * VERIFIED AGAINST: real .eml Order No 62782945 (20-Jun-2026)
 *
 * ── HTML LAYOUT ────────────────────────────────────────────────────────────
 *
 * HEADER SECTION:
 *   Green gradient banner with title "🍽️ New IRCTC Order Received!"
 *   Subtitle: "Order #62782945"
 *
 * ORDER DETAILS TABLE — 2 columns (label | value), 9 rows:
 *   Row 0: 👤 Customer      | Abhishek Pareek
 *   Row 1: 📱 Mobile        | 8796758876
 *   Row 2: 🚂 Train         | TVCN INDB SF EX (20931)
 *   Row 3: 🪑 Coach/Berth   | M2 / 60
 *   Row 4: 🏤 Station       | VADODARA JN
 *   Row 5: 📅 Delivery Date | 06-20-2026 19:41 IST
 *   Row 6: 🍕 Items         | 2x Kaju Paneer Masala, 1x Paneer Tikka Masala
 *   Row 7: 💰 Amount        | ₹853
 *   Row 8: 💳 Payment       | CASH_ON_DELIVERY
 *
 *   Detection: sender domain = "olfstores.com"
 *              OR subject contains "New IRCTC Order" + "Received"
 *
 * ── KEY PARSING RULES ──────────────────────────────────────────────────────
 *
 * ORDER NO:  From subject line — "Order #62782945" → strip "#" → "62782945"
 *            OR from header banner subtitle "Order #XXXXXXXX"
 *
 * CUSTOMER:  "👤 Customer" label → plain name string e.g. "Abhishek Pareek"
 *            ✅ Customer name IS present in OLF emails (unlike IRCTC direct emails)
 *
 * CONTACT:   "📱 Mobile" label → 10-digit number e.g. "8796758876"
 *
 * TRAIN:     "🚂 Train" label → full string e.g. "TVCN INDB SF EX (20931)"
 *            trainNo  → extract digits inside () → "20931"
 *            trainName → text before () → "TVCN INDB SF EX"
 *
 * COACH:     "🪑 Coach/Berth" label → trim → normalize " / " → "/" → "M2/60"
 *
 * STATION:   "🏤 Station" label → plain string e.g. "VADODARA JN"
 *
 * DATE:      "📅 Delivery Date" label → "06-20-2026 19:41 IST"
 *            Format: MM-DD-YYYY HH:MM IST
 *            → deliveryDate = "2026-06-20"  (reorder to YYYY-MM-DD)
 *            → deliveryTime = "19:41"        (strip " IST")
 *
 * ITEMS:     "🍕 Items" label → plain comma-separated string
 *            e.g. "2x Kaju Paneer Masala, 1x Paneer Tikka Masala"
 *            Parse each segment: /(\d+)x\s+(.+)/
 *            → [{ qty: 2, name: "Kaju Paneer Masala" }, { qty: 1, name: "Paneer Tikka Masala" }]
 *            ⚠ No individual item prices — only grand total is present.
 *
 * AMOUNT:    "💰 Amount" label → "₹853" → strip "₹" → parseFloat("853") → totalAmount
 *
 * PAYMENT:   "💳 Payment" label → "CASH_ON_DELIVERY" / "COD" → "COD"
 *                                  "PRE_PAID" / "PREPAID" / "ONLINE" / "PAID" → "Prepaid"
 */

const domConfig = {
  fields: {
    customerName: {
      labelText: 'Customer',         // emoji prefix stripped before match
      transform: v => v.trim() || null,
    },

    contactNo: {
      labelText: 'Mobile',
      transform: v => {
        const digits = v.replace(/\D/g, '');
        if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
        if (digits.length === 10) return digits;
        return digits.slice(-10) || null;
      },
    },

    _trainRaw: {
      labelText: 'Train',
      transform: v => v.trim(),
    },

    coach: {
      labelText: 'Coach/Berth',
      transform: v => v.trim().replace(/\s*\/\s*/g, '/') || null,
    },

    deliveryStation: {
      labelText: 'Station',
      transform: v => v.trim() || null,
    },

    _deliveryRaw: {
      labelText: 'Delivery Date',
      transform: v => v.trim(),
    },

    _itemsRaw: {
      labelText: 'Items',
      transform: v => v.trim(),
    },

    totalAmount: {
      labelText: 'Amount',
      transform: v => {
        const clean = v.replace(/[₹,\s]/g, '');
        return parseFloat(clean) || null;
      },
    },

    paymentType: {
      labelText: 'Payment',
      transform: v => {
        const u = v.trim().toUpperCase();
        if (u === 'PRE_PAID' || u === 'PREPAID' || u === 'ONLINE' || u === 'PAID') return 'Prepaid';
        return 'COD'; // CASH_ON_DELIVERY and anything else
      },
    },
  },

  postProcess(order) {
    // ── ORDER NO ───────────────────────────────────────────────────────────
    // Extracted from subject line or banner: "Order #62782945" → "62782945"
    // (handled by subject parser upstream — no DOM field needed)

    // ── TRAIN INFO ─────────────────────────────────────────────────────────
    // Raw: "TVCN INDB SF EX (20931)"
    // trainNo   → digits inside last () → "20931"
    // trainName → text before () → "TVCN INDB SF EX"
    const trainRaw = order._trainRaw || '';
    const trainMatch = trainRaw.match(/^(.*?)\s*\((\d+)\)\s*$/);
    if (trainMatch) {
      order.trainName = trainMatch[1].trim();
      order.trainInfo = trainMatch[2].trim();
    } else {
      order.trainName = trainRaw || null;
      order.trainInfo = null;
    }
    delete order._trainRaw;

    // ── DELIVERY DATE & TIME ───────────────────────────────────────────────
    // Raw: "06-20-2026 19:41 IST"  →  MM-DD-YYYY HH:MM IST
    const dr = order._deliveryRaw || '';
    const dm = dr.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2})/);
    if (dm) {
      order.deliveryDate = `${dm[3]}-${dm[1]}-${dm[2]}`; // YYYY-MM-DD
      order.deliveryTime = dm[4];                          // HH:MM
    } else {
      order.deliveryDate = null;
      order.deliveryTime = null;
    }
    delete order._deliveryRaw;

    // ── ITEMS ──────────────────────────────────────────────────────────────
    // Raw: "2x Kaju Paneer Masala, 1x Paneer Tikka Masala"
    // → [{ qty: 2, name: "Kaju Paneer Masala" }, { qty: 1, name: "Paneer Tikka Masala" }]
    // ⚠ No individual prices available — only totalAmount is present.
    const itemsRaw = order._itemsRaw || '';
    order.items = itemsRaw
      .split(',')
      .map(seg => {
        const m = seg.trim().match(/^(\d+)x\s+(.+)$/i);
        if (m) return { qty: parseInt(m[1], 10), name: m[2].trim(), price: null };
        return null;
      })
      .filter(Boolean);
    delete order._itemsRaw;

    return order;
  },
};

const skipSubjects = ['delivered'];

const matchers = [
  { match: 'olfstores', name: 'OLF Stores', type: 'olf' },
];

const type = 'olf';

const rule = `VENDOR: OLF STORES — IRCTC eCatering Partner (EMAIL)
SENDER: marketing@olfstores.com | FORMAT: Pure HTML single-part (no text/plain).

SUBJECT: "🍽️ New IRCTC Order #62782945 Received!"
  → orderNo: strip "#" from subject or banner subtitle → "62782945"

ORDER DETAILS TABLE — 2 columns (label | value), 9 rows:
  Row 0: 👤 Customer      | Abhishek Pareek
  Row 1: 📱 Mobile        | 8796758876
  Row 2: 🚂 Train         | TVCN INDB SF EX (20931)
  Row 3: 🪑 Coach/Berth   | M2 / 60
  Row 4: 🏤 Station       | VADODARA JN
  Row 5: 📅 Delivery Date | 06-20-2026 19:41 IST
  Row 6: 🍕 Items         | 2x Kaju Paneer Masala, 1x Paneer Tikka Masala
  Row 7: 💰 Amount        | ₹853
  Row 8: 💳 Payment       | CASH_ON_DELIVERY

  ⚠ Labels contain emoji prefixes — strip emoji before matching label text.

- ORDER NO:       From subject/banner "Order #XXXXXXXX" → strip "#" → plain integer string.
- CUSTOMER NAME:  "Customer" label → plain name string e.g. "Abhishek Pareek".
                  ✅ Customer name IS present in OLF emails.
- CONTACT:        "Mobile" label → 10-digit number.
- TRAIN:          "Train" label → "TVCN INDB SF EX (20931)"
                  trainInfo  → digits inside () → "20931"
                  trainName  → text before  () → "TVCN INDB SF EX"
- COACH:          "Coach/Berth" label → trim → normalize " / " → "/" → "M2/60"
- STATION:        "Station" label → plain string e.g. "VADODARA JN"
- DATE:           "Delivery Date" label → "06-20-2026 19:41 IST" (MM-DD-YYYY HH:MM IST)
                  deliveryDate → reorder to YYYY-MM-DD → "2026-06-20"
                  deliveryTime → strip IST → "19:41"
- ITEMS:          "Items" label → "2x Kaju Paneer Masala, 1x Paneer Tikka Masala"
                  Split by comma → parse each as /(\d+)x\s+(.+)/
                  → [{ qty: 2, name: "Kaju Paneer Masala", price: null }, ...]
                  ⚠ No individual item prices — only grand total (Amount) is available.
- AMOUNT:         "Amount" label → "₹853" → strip "₹" → 853 → totalAmount
- PAYMENT:        "Payment" label:
                    "PRE_PAID" / "PREPAID" / "ONLINE" / "PAID" → "Prepaid"
                    "CASH_ON_DELIVERY" / anything else          → "COD"`;

module.exports = { matchers, type, rule, domConfig, skipSubjects };
