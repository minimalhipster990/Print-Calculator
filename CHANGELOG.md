# Changelog

## 1.2 - Daily-use pricing and queue reliability

This release turns the calculator into a more realistic daily-use quoting and production planning tool.

### Pricing and calculator

- Added configurable VAT / IVA, defaulting to 22%.
- Separated print price, VAT, packaging, shipping, and final price so quotes are easier to explain.
- Applied profit margin consistently to both print production and fulfillment components.
- Modelled failed-print risk as expected reprint cost instead of a simple markup.
- Fixed cost per cm3 to use resin volume directly, because 1 ml equals 1 cm3.
- Added configurable amortization hours per day for printer depreciation.
- Improved input clamping so invalid values do not produce impossible or non-finite prices.

### Queue and scheduling

- Required a configured printer fleet instead of silently using all built-in printers.
- Improved Full Plate handling with X/Y rotation checks and Z-height checks.
- Kept incomplete orders out of the active schedule and surfaced actionable warnings.
- Added real scheduled start, ETA, ready-for-next, late minutes, and wave/slot output.
- Added production start time, plate turnaround, and scheduler operating hours per day.
- Separated scheduler hours from amortization hours so costing and production windows are independent.
- Added configurable queue assumptions for support resin, labor per batch, consumables per batch, and packing margin.
- Improved mixed-fleet assignment so capable printer types are not left idle unnecessarily.

### CSV and local use

- Added a 5-order sample import file in `test-orders.csv`.
- Expanded queue CSV export into a shop-floor run sheet with timing, slot, wave, warnings, and cost columns.
- Neutralized spreadsheet formula injection in CSV exports.
- Renamed the local entry point to `Calculator.html`.
- Updated the service worker and manifest for the new local entry point.

### Data safety and UI

- Hardened backup/import normalization for dates, IDs, economic ranges, printer specs, and settings.
- Improved local file save failure handling and browser-only status visibility.
- Added `PRODUCT.md` design context for future UI work.
- Improved dark UI contrast, focus states, and queue card readability.

### Verification

- Added automated tests for calculator math, queue scheduling, CSV export, storage normalization, optimizer fit checks, and realistic pilot scenarios.
- Verified release state with 43 passing automated tests.
