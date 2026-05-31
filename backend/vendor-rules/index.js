'use strict';

/**
 * Vendor Rules Registry
 * ---------------------
 * Each vendor file exports:
 *   matchers  — array of { match, name, type } used to identify the vendor from the sender email
 *   type      — string key used in VENDOR_RULES
 *   rule      — the AI prompt text specific to this vendor
 *
 * To add a new vendor:
 *   1. Create migme/backend/vendor-rules/myvendor.js following the same structure
 *   2. require() it below and add it to the `vendors` array
 *   That's it — VENDOR_MAP and VENDOR_RULES update automatically.
 *
 * IMPORTANT: Order in the `vendors` array matters for VENDOR_MAP.
 * More specific / longer match strings must come BEFORE shorter ones
 * (e.g. "zoopindia" before "zoop", "rajdhaniorder" before "rajdhani").
 */

const railfood    = require('./railfood');
const zoop        = require('./zoop');
const yatriRestro = require('./yatri_restro');
const rajbhog     = require('./rajbhog');
const homebytes   = require('./homebytes');
const railyatri   = require('./railyatri');
const railreceipt = require('./railreceipt');
const rajdhani    = require('./rajdhani');
const yatribhojan = require('./yatribhojan');
const dibrail     = require('./dibrail');
const spicywagon  = require('./spicywagon');
const irctc       = require('./irctc');
const olf         = require('./olf');
const travelkhana = require('./travelkhana');
const generic     = require('./generic');

const vendors = [
  railfood,
  zoop,
  yatriRestro,
  rajbhog,
  homebytes,
  railyatri,
  railreceipt,
  rajdhani,
  yatribhojan,
  dibrail,
  spicywagon,
  irctc,
  olf,
  travelkhana,
  generic,
];

/**
 * VENDOR_MAP
 * Flat array of { match, name, type } entries.
 * Used by parseWithAWS() to identify the vendor from the sender email address.
 * First match wins — order is preserved from the vendors array above.
 */
const VENDOR_MAP = vendors.flatMap(v => v.matchers || []);

/**
 * VENDOR_RULES
 * Object keyed by vendor type string.
 * Used by parseWithAWS() to inject vendor-specific instructions into the AI prompt.
 */
const VENDOR_RULES = Object.fromEntries(
  vendors
    .filter(v => v.type && v.rule)
    .map(v => [v.type, v.rule])
);

module.exports = { VENDOR_MAP, VENDOR_RULES };
