# Tiny Legions — Production Helper

**A free, offline production management tool for resin 3D printing operations.**

Built for small-scale MSLA print farms — manage orders, optimize build plates, schedule print queues, and calculate accurate production costs, all from a single HTML file with no installation required.

> Copyright (c) 2026 minimalhipster990. All rights reserved.

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

### Option 1 — GitHub Pages (online, no install)

Open it directly in your browser. No download needed.

### Option 2 — Local / USB (fully offline)

1. Download or clone this repository
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari)
3. No server, no installation, no internet connection required

### Saving your data

On first use, click **New Data File** in the top bar. This creates a `.json` file on your computer where all orders and settings are saved. Next time, click **Open Data File** to reload it. Works across sessions and across different computers by copying the data file.

If you skip this step, data is saved to browser localStorage only (lost if you clear the browser).

---

## Tab 1 — Cost Calculator

### What it calculates

Enter your print parameters and the calculator updates live:

- **Material cost** — resin volume (model + supports) at your resin price per litre
- **Electricity cost** — print time × printer wattage × your electricity rate
- **Consumables cost** — IPA wash solution + FEP film amortised per print
- **Depreciation** — printer purchase price spread across its expected lifespan
- **Labor cost** — post-processing time × your hourly rate
- **Total production cost** — sum of all the above
- **Recommended sale price** — total cost adjusted for failed print risk % and profit margin %
- **Cost per cm³** — useful for comparing models of different sizes

### Formulas

```
resin_cost = model_volume_ml × (1 + support_pct/100) / 1000 × resin_price_per_L

electricity_cost = (print_time_h × printer_wattage_W / 1000) × electricity_rate_per_kWh

consumables_cost = (ipa_used_ml / 1000 × ipa_price_per_L) + (fep_cost / fep_lifespan_prints)

depreciation_cost = (printer_purchase_price / (lifespan_years × 365 × 8)) × print_time_h
  (assumes 8 operating hours per day)

labor_cost = (labor_time_min / 60) × labor_rate_per_h

total_cost = resin + electricity + consumables + depreciation + labor

sale_price = total_cost / (1 - failed_print_risk/100) / (1 - profit_margin/100)
```

### Tips

- Select a printer at the top and wattage fills automatically
- All inputs persist when you switch tabs — the calculator remembers your last values
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

**Full Plate** — you have already laid out the plate in your slicer (e.g. Lychee). The footprint is the footprint of the entire plate. Each quantity unit = one complete plate run. The app assigns a printer and schedules it without repacking.

### Importing orders

Click **Import CSV** and select a CSV file with these columns (in order):

```
OrderID, Customer, ModelName, FootprintW, FootprintD, Height, Quantity,
ResinType, Deadline (YYYY-MM-DD), Notes, OrderType (model/plate),
PrintTimeH, PrintTimeMin, ResinVolumeMl
```

A template CSV is included in the repository as `test-orders.csv`.

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
1. The app checks which printers in your fleet can fit the plate dimensions (both orientations are tested — portrait plates can be assigned to landscape printers)
2. The cheapest-to-run printer that fits is selected (lowest wattage)
3. Each qty unit becomes its own batch

**Single Model orders:**
1. Orders are grouped by resin type (you cannot mix resins on one plate)
2. Within each resin group, orders are sorted by earliest deadline first
3. The shelf-packing algorithm fits as many units as possible per plate
4. The printer with the best plate utilization % is selected from your fleet

### Shelf-packing algorithm (Next Fit Decreasing Height)

```
1. Sort all items by footprint depth (D) descending
2. Place items left to right on the current shelf
3. When an item does not fit horizontally, start a new shelf below
4. When no shelf fits on the current plate, start a new plate
5. Repeat until all items are placed
6. A 2mm margin is added between items
```

This runs for each printer in your fleet and the one with the best utilization wins.

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

### Wave scheduling

When you have multiple units of the same printer, batches are grouped into **waves** showing which plates can run in parallel:

- Wave 1 = first round of prints (all units printing simultaneously)
- Wave 2 = second round, and so on
- `slot` = which physical unit of that printer handles that batch

### Urgency flags

Each batch is colour-coded by days until its earliest deadline:

| Colour | Meaning |
|--------|---------|
| Green | More than 7 days |
| Amber | 4-7 days |
| Red | 3 days or fewer |
| Dark red | Overdue |

### Single-printer smart alert

If one printer in your fleet could handle all orders before the earliest deadline on its own, the app shows an alert above the queue. It calculates:

```
total_sequential_minutes = sum of all batch print times (single printer, sequential)
minutes_until_deadline = time from now to earliest deadline across all orders
```

If `total_sequential_minutes <= minutes_until_deadline`, the alert shows the cheaper option with estimated electricity savings vs running the full fleet in parallel.

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
- **Failed print risk %** — added as a buffer in sale price calculation
- **Profit margin %** — applied on top of cost to reach recommended sale price
- **Currency** — display currency symbol (cosmetic only, all values are in the currency you enter)

---

## Supported printers (built-in)

The app ships with specs for 23 common MSLA printers including:

Phrozen Sonic Mini 8K, Sonic Mighty 8K, Sonic Mega 8K, Sonic Mighty 4K
Elegoo Saturn 3 Ultra, Saturn 4 Ultra, Mars 4 Ultra, Jupiter 6K
Uniformation GK3 Pro, GKtwo
Anycubic Photon Mono X2, M3 Max, M5s Pro
Creality Halot-Mage Pro
Concepts3D Athena II
EPAX X1, X133 Pro
SparkMaker SLA
...and more

Custom printers can be added in the Settings tab with any build plate dimensions and wattage.

---

## Data & Privacy

All data is stored locally — in your browser's localStorage or in a JSON file on your own computer. Nothing is sent to any server. The app works fully offline after the initial page load.

---

## File structure

```
production-manager/
  index.html          entry point, full app shell
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
  test-orders.csv     sample import file with 7 test orders
```

---

## License

Copyright (c) 2026 minimalhipster990. All rights reserved.

This software is provided for personal and commercial use. You may not redistribute, resell, or publish modified versions without permission.
