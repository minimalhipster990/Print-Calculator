// Shelf-packing algorithm for 2D plate optimization
// Items are rectangular bounding boxes (W x D mm)
// Returns: { plates: number, utilization: number (0-1), layout: [...] }

function packItemsOnPlate(items, plateW, plateD) {
  // items: [{ id, w, d, label }]
  // Sort by depth descending (tallest items first = best shelf packing)
  const sorted = [...items].sort((a, b) => b.d - a.d);

  const plates = [];
  let currentPlate = { shelves: [], usedArea: 0 };
  let currentShelfY = 0;
  let currentShelfX = 0;
  let currentShelfHeight = 0;
  const MARGIN = 2; // 2mm margin between parts

  function newPlate() {
    plates.push(currentPlate);
    currentPlate = { shelves: [], usedArea: 0 };
    currentShelfY = 0;
    currentShelfX = 0;
    currentShelfHeight = 0;
  }

  for (const item of sorted) {
    const itemW = item.w + MARGIN;
    const itemD = item.d + MARGIN;

    if (itemW > plateW || itemD > plateD) {
      // Item doesn't fit on this printer at all
      item.doesNotFit = true;
      continue;
    }

    // Try to place in current shelf
    if (currentShelfX + itemW <= plateW) {
      // Fits in current shelf
      if (currentShelfY + itemD > plateD) {
        // No vertical room -- need new plate
        newPlate();
        currentShelfY = 0;
        currentShelfX = 0;
        currentShelfHeight = itemD;
      }
      item.plateIndex = plates.length;
      item.x = currentShelfX;
      item.y = currentShelfY;
      currentShelfX += itemW;
      currentShelfHeight = Math.max(currentShelfHeight, itemD);
      currentPlate.usedArea += item.w * item.d;
    } else {
      // Start new shelf
      currentShelfY += currentShelfHeight + MARGIN;
      currentShelfX = 0;
      currentShelfHeight = 0;

      if (currentShelfY + itemD > plateD) {
        // No room for new shelf -- new plate
        newPlate();
        currentShelfY = 0;
      }

      item.plateIndex = plates.length;
      item.x = currentShelfX;
      item.y = currentShelfY;
      currentShelfX = itemW;
      currentShelfHeight = itemD;
      currentPlate.usedArea += item.w * item.d;
    }
  }

  // Push last plate if it has items
  if (sorted.some(i => i.plateIndex === plates.length)) {
    plates.push(currentPlate);
  }
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
function findPrinterForPlate(w, d, availablePrinters, settings) {
  const candidates = (availablePrinters || getAllPrinters(settings)).filter(p => {
    return (p.plateW >= w && p.plateD >= d) || (p.plateW >= d && p.plateD >= w);
  });
  if (candidates.length === 0) return null;
  return candidates.slice().sort((a, b) => a.wattage - b.wattage)[0];
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

  for (const printer of printerOrder) {
    const result = packItemsOnPlate(items, printer.plateW, printer.plateD);

    if (result.doesNotFitCount === 0) {
      if (!bestResult) {
        bestResult = result;
        bestPrinter = printer;
      } else if (result.utilization > bestResult.utilization) {
        bestResult = result;
        bestPrinter = printer;
      }
    }
  }

  // If nothing fits fully, pick the one with fewest doesn't-fit items
  if (!bestPrinter) {
    let minNotFit = Infinity;
    for (const printer of printerOrder) {
      const result = packItemsOnPlate(items, printer.plateW, printer.plateD);
      if (result.doesNotFitCount < minNotFit) {
        minNotFit = result.doesNotFitCount;
        bestResult = result;
        bestPrinter = printer;
      }
    }
  }

  return { printer: bestPrinter, packResult: bestResult };
}
