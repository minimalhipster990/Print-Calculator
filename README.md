# Tiny Legions — Production Helper

**A free, offline production management tool for resin 3D printing operations.**

Current version: **1.2**

Built for small-scale MSLA print farms — manage orders, optimize build plates, schedule print queues, and calculate accurate production costs, all from a single HTML file with no installation required.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/minimalhipster990)

> Copyright (c) 2026 minimalhipster990. MIT License — free to use, modify, and share.

---

## What it does

Four integrated tools in one portable app:

| Tab | Purpose |
|-----|---------|
| **Cost Calculator** | Calculate exact production cost and recommended sale price per print |
| **Orders** | Track open orders with deadlines, dimensions, resin types, and quantities |
| **Print Queue** | Group orders into optimized print batches, assign printers, schedule by deadline |
| **Settings** | Configure your printers, resin prices, electricity rate, and cost defaults |

---

## How to use it

### Option 1 — Download and run locally (recommended)

1. Click the green **Code** button on this page and select **Download ZIP**
2. Extract the ZIP anywhere on your computer (or on a USB stick)
3. Open `Calculator.html` in a modern browser
4. No server, no installation, no internet connection required

This is the recommended approach. Your data file lives on your own machine and nothing is shared with anyone.

Chrome and Edge give the best day-to-day experience because they support direct file auto-save. Firefox and Safari can still run the app, but should be treated as browser-storage + manual backup/export mode.

### Option 2 — Fork the repository (for developers)

If you want to track future updates or host your own copy on GitHub Pages:

1. Click **Fork** at the top of this page to create your own copy of the repo
2. Enable GitHub Pages in your fork's Settings (source: `main` branch, root folder)
3. Your personal copy will be live at `https://yourusername.github.io/repo-name/projects/production-manager/`
4. Pull updates from this repo whenever a new version is released

### Saving your data

On first use in Chrome/Edge, click **New Data File** in the top bar. This creates a `.json` file on your computer where all orders and settings are saved. Next time, click **Open Data File** to reload it. Works across sessions and across different computers, just copy the `.json` file alongside the app.

If you skip this step, or if your browser does not support direct file access, data is saved to browser localStorage only. Use **Export Backup** regularly because localStorage can be lost if you clear the browser, switch computers, or reset site data. The top status bar shows whether file auto-save is connected or has failed.

---

## Tab 1 — Cost Calculator

### What it calculates

Enter your print parameters and the calculator updates live:

- **Material cost** — resin volume (model + supports) at your resin price per litre
- **Electricity cost** — print time × printer wattage × your electricity rate
- **Consumables cost** — IPA wash solution + FEP film amortised per print
- **Depreciation** — printer purchase price spread across its expected lifespan and your amortization hours per day
- **Labor cost** — post-processing time × your hourly rate
- **Expected production cost** — print production costs adjusted for failed-print risk, before fulfillment
- **Print price excl. VAT & packaging/shipping** — production cost, failed print risk, and profit margin before VAT/IVA
- **VAT / IVA** — shown as its own line and calculated on the taxable subtotal
- **Packaging & Shipping** — shown separately below VAT/IVA as the fulfillment price component; raw packaging and shipping costs remain visible in the Cost Breakdown
- **Final price** — print price + VAT/IVA + packaging/shipping
- **Cost per cm³** — useful for comparing models of different sizes

### Formulas

```
resin_cost = model_volume_ml × (1 + support_pct/100) / 1000 × resin_price_per_L

electricity_cost = ((print_time_h × printer_wattage_W) + (0.5 × 50W wash/cure)) / 1000 × electricity_rate_per_kWh

consumables_cost = (ipa_used_ml / 1000 × ipa_price_per_L) + (fep_cost / fep_lifespan_prints) + other_consumables

depreciation_cost = (printer_purchase_price / (lifespan_years × 365 × amortization_hours_per_day)) × print_time_h

labor_cost = (labor_time_min / 60) × labor_rate_per_h

packaging_cost = box_materials + labels_tape + branding + (packing_time_min / 60 × labor_rate_per_h)

production_base = resin + electricity + consumables + depreciation + labor

expected_production_cost = production_base / (1 - failed_print_risk/100)

print_price_excl_vat_and_fulfillment = expected_production_cost / (1 - profit_margin/100)

fulfillment_cost = packaging + shipping

fulfillment_price_excl_vat = fulfillment_cost / (1 - profit_margin/100)

total_cost_incl_fulfillment = expected_production_cost + fulfillment_cost

taxable_net = print_price_excl_vat_and_fulfillment + fulfillment_price_excl_vat

vat_amount = taxable_net × vat_rate/100

final_price = print_price_excl_vat_and_fulfillment + vat_amount + fulfillment_price_excl_vat

cost_per_cm3 = expected_production_cost / model_volume_ml
```

### Tips

- Select a printer at the top and wattage fills automatically
- All inputs persist when you switch tabs, the calculator remembers your last values
- Use this per model to build up your pricing sheet

---

## Tab 2 — Orders

Track every open order in a table. Each order has:

| Field | Notes |
|-------|-------|
| Order ID | your reference number |
| Customer | name or handle |
| Model name | what is being printed |
| Order type | **Single Model** or **Full Plate** (see below) |
| Footprint W × D (mm) | bounding box from your slicer (e.g. Lychee, ChituBox) |
| Height (mm) | Z height from your slicer |
| Qty | number of units (or number of plate runs for Full Plate orders) |
| Print time | hours + minutes from your slicer |
| Total time | computed: qty × print time per unit |
| Resin type | dropdown from your configured resin list |
| Deadline | date the order must be ready |
| Notes | free text |

### Order types

**Single Model** — you provide the footprint of one unit. The app packs as many units as possible onto each build plate automatically using the shelf-packing algorithm.

**Full Plate** — you have already laid out the plate in your slicer (e.g. Lychee). The footprint is the footprint of the entire plate. Each quantity unit = one complete plate run. The app checks X/Y/Z fit, assigns a printer, and schedules it without repacking.

### Importing orders

Click **Import CSV** and select a CSV file with these columns (in order):

```
OrderID, Customer, ModelName, FootprintW, FootprintD, Height, Quantity,
ResinType, Deadline (YYYY-MM-DD), Notes, OrderType (model/plate),
PrintTimeH, PrintTimeMin, ResinVolumeMl
```

A 5-order sample CSV is included in the repository as `test-orders.csv`.

---

## Tab 3 — Print Queue

Click **Generate Queue** to batch all open orders into an optimized print schedule.

### Before generating

Configure your **fleet** — which printers you have available and how many of each:

- Use the printer dropdown to add a printer model
- Set the count (how many units of that printer you own)
- Only printers in your fleet will be assigned batches

### How batching works

**Full Plate orders:**
1. The app checks which printers in your fleet can fit the plate dimensions and height (both X/Y orientations are tested. Portrait plates can be assigned to landscape printers)
2. During timeline scheduling, each plate is assigned to the earliest available fitting printer slot, with lower wattage used as a tie-breaker
3. Each qty unit becomes its own batch

**Single Model orders:**
1. Orders are grouped by resin type (you cannot mix resins on one plate)
2. Within each resin group, orders are sorted by earliest deadline first
3. The shelf-packing algorithm fits as many units as possible per plate, including Z-height checks and X/Y rotation when the rotated footprint is the only fit
4. The printer that needs the fewest plate runs is selected from your fleet; utilization and wattage are tie-breakers

### Shelf-packing algorithm (Next Fit Decreasing Height)

```
1. Reject items taller than the printer's Z build volume
2. Rotate an item's W/D footprint when rotation makes it fit
3. Sort all items by oriented footprint depth (D) descending
4. Place items left to right on the current shelf
5. When an item does not fit horizontally, start a new shelf below
6. When no shelf fits on the current plate, start a new plate
7. Repeat until all items are placed
8. A 2mm margin is added between items
```

This runs for each printer in your fleet. The optimizer prefers fewer plate runs first, then better utilization, then lower wattage.

### Plate utilization

```
utilization = sum(item_W × item_D) / (printer_plateW × printer_plateD)
```

Reported as a percentage per batch card in the queue.

### Print time per batch

- **Single Model batches:** `max(print_time of all items on the plate)` — resin printers expose all layers simultaneously, so the tallest/longest model determines total print time for the plate
- **Full Plate batches:** the print time entered on the order

### Resin volume per batch

- **Single Model batches:** `sum(resin_volume_ml of all items on the plate)`
- **Full Plate batches:** the resin volume entered on the order

### Batch cost estimate

Queue cards show a production-oriented batch estimate. It includes resin, queue support resin, electricity, queue consumables, depreciation, queue labor, failed-print risk, margin, and VAT using your settings, but it intentionally excludes final order packaging and shipping. Use the full Cost Calculator for customer-facing quotes.

### Wave scheduling

When you have multiple units of the same printer, batches are grouped into **waves** showing which plates can run in parallel. Each batch also gets an estimated start/end time:

- Wave 1 = first round of prints (all units printing simultaneously)
- Wave 2 = second round, and so on
- `slot` = which physical unit of that printer handles that batch
- `start` = when that printer slot should start the plate
- `ETA` = estimated end time based on the current generated queue
- `ready` = when that printer slot can start another plate after configured turnaround
- `late` = estimated lateness against the batch's earliest deadline

The scheduler can model daily operating windows. Configure **Production Start Time**, **Scheduler Hours / Day**, and **Plate Turnaround** in Settings. Starts are placed inside the operating window; prints may finish after the window, but the next plate waits until turnaround is complete and the next operating window opens.

### CSV run sheet

The queue export is meant to be usable as a shop-floor run sheet. It includes batch, printer, slot, wave, resin, model quantities, scheduled start/end, ready-for-next time, deadline, lateness, utilization, warning, production cost, and batch estimate.

### Urgency flags

Each batch is colour-coded by days until its earliest deadline:

| Colour | Meaning |
|--------|---------|
| Green | More than 7 days |
| Amber | 4-7 days |
| Red | 3 days or fewer |
| Dark red | Overdue |

### Single-printer smart alert

If one printer in your fleet could handle all orders before the earliest deadline on its own, the app shows an alert above the queue. It checks each configured printer type and calculates:

```
total_sequential_minutes = sum of all batch print times (single printer, sequential)
minutes_until_deadline = time from now to earliest deadline across all orders
```

If the generated single-printer timeline is still on time, the alert shows the cheaper option with estimated electricity savings vs running the full fleet in parallel.

You can switch between single-printer mode and parallel fleet mode with one click.

---

## Tab 4 — Settings

All defaults used by the calculator and cost estimates. Changes are saved automatically to your data file.

- **Electricity rate** (€/kWh) — used in all cost calculations
- **Resin list** — name, price per litre, density (g/ml) for each resin type you stock
- **IPA** — price per litre and estimated usage per print (ml)
- **FEP film** — cost per sheet and expected lifespan in print runs
- **Printer fleet & depreciation** — purchase price and expected lifespan (years) per printer
- **Labor** — default hourly rate
- **Amortization hours per day** — used to spread printer depreciation across realistic production usage
- **Scheduler hours per day** — used only by the queue timeline to decide when new plates can start
- **Production start time** — local daily start time used by the queue scheduler
- **Plate turnaround** — setup/plate removal/reload buffer before a printer can start the next batch
- **Queue support resin %** — support material assumption used for queue batch estimates
- **Queue labor / batch** — labor assumption used for queue batch estimates
- **Queue consumables / batch** — non-resin consumable cost used for queue batch estimates
- **Packing margin** — spacing between single-model parts when the queue packs plates automatically
- **Failed print risk %** — used as expected reprint cost in sale price calculation
- **Profit margin %** — applied to both print production and fulfillment components to reach the recommended net price
- **VAT / IVA %** — applied on top of the taxable subtotal; default is 22%
- **Currency** — display currency symbol (cosmetic only, all values are in the currency you enter)

---

## Supported printers (built-in)

The app ships with specs for 23 MSLA printers including:

Phrozen Sonic Mini 8K, Sonic Mini 4K, Sonic XL 4K, Sonic Mega 8K;
Concepts3D Athena II;
Uniformation GK3 Pro;
Elegoo Mars 2/3/4/5, Saturn 3/4, Jupiter SE;
Anycubic Photon Mono 4, Mono X 6Ks, M5s, M7, M7 Pro;
Creality Halot-Mage Pro, HALOT-ONE Plus;
Formlabs Form 3;
Voxelab Proxima 6.

Custom printers can be added in the Settings tab with any build plate dimensions and wattage.

---

## Data & Privacy

All data is stored locally: in your browser's localStorage or in a JSON file on your own computer. Nothing is sent to any server. Imported backups and orders are normalized before use so invalid dates, unsafe IDs, impossible economic ranges, and unusable printer dimensions are rejected or clamped.

---

## File structure

```
production-manager/
  Calculator.html     entry point, full app shell
  css/
    style.css         all styles (no external dependencies)
  js/
    printers.js       built-in printer specs
    calculator.js     cost calculation formulas
    optimizer.js      shelf-packing algorithm + printer recommendation
    scheduler.js      order batching + deadline scheduling
    storage.js        localStorage + File System Access API helpers
    app.js            UI, tab routing, wires all modules together
  manifest.json       PWA manifest (installable on mobile)
  sw.js               service worker (offline support)
  test-orders.csv     sample import file with 5 example orders
```

---

## Support

If this tool saves you time, consider buying me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/minimalhipster990)

---

## License

MIT License — Copyright (c) 2026 minimalhipster990.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, subject to the following condition: the above copyright notice and this permission notice must be included in all copies or substantial portions of the software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
