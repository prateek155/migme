'use strict';

/**
 * VENDOR: OLF STORE
 * Sender domain: olfstore.com
 */

const matchers = [
  { match: 'olfstore', name: 'OLF Store', type: 'olf' },
];

const type = 'olf';

const rule = `VENDOR: OLF STORE
ORDER NO: Field label is "IRCTC Order ID" — value is a plain integer like "2331925101". Use this as orderNo.
TABLE: Item | Quantity | Price
- Quantity is the 2nd column.
- COACH: field label is "Coach and Seat No.". Capture FULL value and join with "/" (e.g. "D1 , 66" → "D1/66").
- DATE: "DD-MM-YYYY HH:MM IST" → deliveryDate=YYYY-MM-DD, deliveryTime=HH:MM (strip "IST").
- TRAIN: "Train" field, e.g. "12933 - KARNAVATI EXP" → trainInfo = full string.
- PAYMENT: "PRE_PAID"→"Prepaid", "COD"→"COD".
- TOTAL: "Total" field.`;

module.exports = { matchers, type, rule };
