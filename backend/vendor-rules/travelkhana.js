'use strict';

/**
 * VENDOR: TRAVELKHANA
 * Sender domain: travelkhana.com
 */

const matchers = [
  { match: 'travelkhana', name: 'Travelkhana', type: 'travelkhana' },
];

const type = 'travelkhana';

const rule = `VENDOR: TRAVELKHANA
ORDER NO: Column label is "Order Id" — value is a plain integer like "2454484". Use this as orderNo. The PNR column is a separate field — do NOT use it as orderNo.
FORMAT: Table of orders. Each row = one order.
Columns: SR.NO | Order Id | Name | Mobile | Coach/Seat | PNR | Item List | Quantity
- Extract EACH row as a separate order if multiple rows are present.
- CUSTOMER: "Name" column.
- CONTACT: "Mobile" column.
- COACH: "Coach/Seat" column — value already combined (e.g. "S6/55") — capture as-is.
- TRAIN: from email header "Train Info" field — full string.
- DATE: "Generation Date" in header → YYYY-MM-DD. No individual ETA shown.
- ITEMS: "Item List" column lists item names; "Quantity" column has qty. No prices — set price=0.
- PAYMENT: COD assumed (stated "payment has to be collected from customer").
- TOTAL: Not shown — set totalAmount=0.`;

module.exports = { matchers, type, rule };
