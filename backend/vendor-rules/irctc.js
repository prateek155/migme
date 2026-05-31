'use strict';

/**
 * VENDOR: IRCTC eCATERING
 * Sender domains: ecatering.irctc.co.in, foodontrack.com
 */

const matchers = [
  { match: 'ecatering',  name: 'IRCTC', type: 'irctc' },
  { match: 'foodontrack', name: 'IRCTC', type: 'irctc' },
];

const type = 'irctc';

const rule = `VENDOR: IRCTC eCATERING
ORDER NO: Field label is "Order ID" — value is a plain integer like "2445440770". Use this as orderNo. The "Invoice No" field (e.g. "IN26-27/00591376") is an internal document reference — do NOT use it as orderNo.
TABLE: S No | Item | Unit Price | Qty | Taxable Value | Tax Amount | Item Total
- Qty is its OWN 4th column.
- COACH: TWO separate fields "Coach No: B6" and "Seat No: 67" → combine as "B6/67".
- DATE: Invoice Date field is DD-MM-YYYY → deliveryDate=YYYY-MM-DD. No ETA — leave deliveryTime empty.
- TRAIN: "Train No" field → trainInfo.
- CUSTOMER: "Name" field in Bill To section.
- PAYMENT: "Cash"→"COD", "Online"/"Prepaid"→"Prepaid".
- TOTAL: "Total Invoice Value" field.`;

module.exports = { matchers, type, rule };

