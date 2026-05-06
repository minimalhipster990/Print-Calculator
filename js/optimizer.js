// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

// Shelf-packing algorithm for 2D plate optimization
// Items are rectangular bounding boxes (W x D mm)
// Returns: { plates: number, utilization: number (0-1), layout: [...] }

function optNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function optPositive(value, fallback = 0) {
  return Math.max(optNumber(value, fallback), 0);
}

function optClamp(value, fallback = 0, min = -Infinity, max = Infinity) {
  return Math.min(Math.max(optNumber(value, fallback), min), max);
}

function printerZFits(itemHeight, plateZ) {
  const h = optPositive(itemHeight, 0);
  if (h === 0) return true;
  const z = optPositive(plateZ, 0);
  return z > 0 && h <= z;
}

function chooseFootprintOrientation(item, plateW, plateD, margin) {
  const w = optPositive(item.w, 0);
  const d = optPositive(item.d, 0);
  if (w <= 0 || d <= 0) return null;

  const candidates = [
    { w, d, rotated: false },
    { w: d, d: w, rotated: true }
  ].filter(c => (c.w + margin) <= plateW && (c.d + margin) <= plateD);

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    if (a.d !== b.d) return a.d - b.d;
    if (a.w !== b.w) return a.w - b.w;
    return Number(a.rotated) - Number(b.rotated);
  })[0];
}

function packItemsOnPlate(items, plateW, plateD, plateZ, packingMarginMm) {
  // items: [{ id, w, d, h, label }]
  const MARGIN = optClamp(packingMarginMm, 2, 0, 50);
  const normalized = (items || []).map(item => {
    const copy = {
      ...item,
      w: optPositive(item.w, 0),
      d: optPositive(item.d, 0),
      h: optPositive(item.h, 0)
    };
    if (!printerZFits(copy.h, plateZ)) {
      return { ...copy, doesNotFit: true };
    }
    const orientation = chooseFootprintOrientation(copy, plateW, plateD, MARGIN);
    if (!orientation) {
      return { ...copy, doesNotFit: true };
    }
    return {
      ...copy,
      layoutW: orientation.w,
      layoutD: orientation.d,
      rotated: orientation.rotated
    };
  });

  // Sort by oriented depth descending (tallest shelf items first = best shelf packing)
  const sorted = normalized.sort((a, b) => (b.layoutD || b.d) - (a.layoutD || a.d));

  const plates = [];
  let currentPlate = { shelves: [], usedArea: 0, itemCount: 0 };
  let currentShelfY = 0;
  let currentShelfX = 0;
  let currentShelfHeight = 0;

  function newPlate() {
    if (currentPlate.itemCount > 0) plates.push(currentPlate);
    currentPlate = { shelves: [], usedArea: 0, itemCount: 0 };
    currentShelfY = 0;
    currentShelfX = 0;
    currentShelfHeight = 0;
  }

  function placeItem(item) {
    item.plateIndex = plates.length;
    item.x = currentShelfX;
    item.y = currentShelfY;
    currentShelfX += item.layoutW + MARGIN;
    currentShelfHeight = Math.max(currentShelfHeight, item.layoutD + MARGIN);
    currentPlate.usedArea += item.w * item.d;
    currentPlate.itemCount += 1;
  }

  for (const item of sorted) {
    if (item.doesNotFit) continue;

    const itemW = item.layoutW + MARGIN;
    const itemD = item.layoutD + MARGIN;
    // Try to place in current shelf
    if (currentShelfX + itemW <= plateW && currentShelfY + itemD <= plateD) {
      placeItem(item);
    } else {
      // Start new shelf
      currentShelfY += currentShelfHeight;
      currentShelfX = 0;
      currentShelfHeight = 0;

      if (currentShelfY + itemD > plateD) {
        // No room for new shelf -- new plate
        newPlate();
        currentShelfY = 0;
      }

      placeItem(item);
    }
  }

  // Push last plate if it has items
  if (currentPlate.itemCount > 0) plates.push(currentPlate);
  if (plates.length === 0 && sorted.length > 0) plates.push(currentPlate);

  const totalPlates = Math.max(plates.length, 1);
  const plateArea = plateW * plateD;
  const totalUsedArea = sorted.filter(i => !i.doesNotFit).reduce((s, i) => s + i.w * i.d, 0);
  const utilization = totalUsedArea / (totalPlates * plateArea);

  return {
    plates: totalPlates,
    utilization: Math.min(utilization, 1),
    items: sorted,
    doesNotFitCount: sorted.filter(i => i.doesNotFit).length
  };
}

// Expand order items by quantity into individual item objects
function expandItems(orders) {
  const items = [];
  for (const order of orders) {
    const printTimeMin = (parseInt(order.printTimeH) || 0) * 60 + (parseInt(order.printTimeMin) || 0);
    const resinVolumeMl = parseFloat(order.resinVolumeMl) || 0;
    for (let i = 0; i < order.quantity; i++) {
      items.push({
        id: `${order.id}_${i}`,
        orderId: order.id,
        label: `${order.modelName} (${order.orderId || order.id})`,
        w: parseFloat(order.footprintW),
        d: parseFloat(order.footprintD),
        h: parseFloat(order.height),
        printTimeMin,
        resinVolumeMl
      });
    }
  }
  return items;
}

// Direct printer selection for full-plate orders (no margin — plate is already finalised in Lychee)
// Tries both orientations so a portrait plate can be assigned to a landscape printer
function resolvePlateArgs(hOrAvailablePrinters, availablePrintersOrSettings, maybeSettings) {
  let h = 0;
  let availablePrinters = hOrAvailablePrinters;
  let settings = availablePrintersOrSettings;

  if (!Array.isArray(hOrAvailablePrinters) && hOrAvailablePrinters !== null) {
    h = hOrAvailablePrinters;
    availablePrinters = availablePrintersOrSettings;
    settings = maybeSettings;
  }

  return { h, availablePrinters, settings };
}

function findPrintersForPlate(w, d, hOrAvailablePrinters, availablePrintersOrSettings, maybeSettings) {
  const { h, availablePrinters, settings } = resolvePlateArgs(hOrAvailablePrinters, availablePrintersOrSettings, maybeSettings);
  const plateWidth = optPositive(w, 0);
  const plateDepth = optPositive(d, 0);
  return (availablePrinters || getAllPrinters(settings)).filter(p => {
    if (!printerZFits(h, p.plateZ)) return false;
    return (p.plateW >= plateWidth && p.plateD >= plateDepth)
      || (p.plateW >= plateDepth && p.plateD >= plateWidth);
  }).slice().sort((a, b) => a.wattage - b.wattage);
}

function findPrinterForPlate(w, d, hOrAvailablePrinters, availablePrintersOrSettings, maybeSettings) {
  const candidates = findPrintersForPlate(w, d, hOrAvailablePrinters, availablePrintersOrSettings, maybeSettings);
  if (candidates.length === 0) return null;
  return candidates[0];
}

// Recommend which printer to use for a set of items
// Returns the printer with best utilization that fits all items
// availablePrinters: optional array to restrict which printers are considered
function recommendPrinter(items, settings, availablePrinters) {
  let printerOrder;
  if (availablePrinters) {
    printerOrder = availablePrinters.filter(Boolean);
  } else {
    const builtInOrdered = PRINTER_PREFERENCE_ORDER.map(id => getPrinterById(id));
    const customPrinters = (settings && settings.customPrinters) ? settings.customPrinters : [];
    printerOrder = [...builtInOrdered, ...customPrinters];
  }

  let bestResult = null;
  let bestPrinter = null;
  const packingMarginMm = settings && settings.queuePackingMarginMm;

  function isBetterFullFit(result, printer) {
    if (!bestResult) return true;
    if (result.plates !== bestResult.plates) return result.plates < bestResult.plates;
    if (result.utilization !== bestResult.utilization) return result.utilization > bestResult.utilization;
    return printer.wattage < bestPrinter.wattage;
  }

  function isBetterPartialFit(result, printer, minNotFit) {
    if (result.doesNotFitCount !== minNotFit) return result.doesNotFitCount < minNotFit;
    if (!bestResult) return true;
    if (result.plates !== bestResult.plates) return result.plates < bestResult.plates;
    if (result.utilization !== bestResult.utilization) return result.utilization > bestResult.utilization;
    return printer.wattage < bestPrinter.wattage;
  }

  for (const printer of printerOrder) {
    const result = packItemsOnPlate(items, printer.plateW, printer.plateD, printer.plateZ, packingMarginMm);

    if (result.doesNotFitCount === 0) {
      if (isBetterFullFit(result, printer)) {
        bestResult = result;
        bestPrinter = printer;
      }
    }
  }

  // If nothing fits fully, pick the one with fewest doesn't-fit items
  if (!bestPrinter) {
    let minNotFit = Infinity;
    for (const printer of printerOrder) {
      const result = packItemsOnPlate(items, printer.plateW, printer.plateD, printer.plateZ, packingMarginMm);
      if (isBetterPartialFit(result, printer, minNotFit)) {
        minNotFit = result.doesNotFitCount;
        bestResult = result;
        bestPrinter = printer;
      }
    }
  }

  return { printer: bestPrinter, packResult: bestResult };
}
