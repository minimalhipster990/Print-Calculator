// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

// Group orders into print batches, assign printers, sort by deadline

function generateQueue(orders, settings) {
  if (!orders || orders.length === 0) return [];

  // Build available printer list from fleet config, or fall back to all printers
  const fleet = settings.printerFleet || {};
  const fleetIds = Object.keys(fleet).filter(id => (fleet[id] || 0) > 0);
  let availablePrinters;
  if (fleetIds.length > 0) {
    availablePrinters = fleetIds
      .map(id => getPrinterByIdAll(id, settings))
      .filter(Boolean)
      .sort((a, b) => a.wattage - b.wattage); // cheapest-to-run first
  } else {
    availablePrinters = null; // signals recommendPrinter to use all printers
  }

  const batches = [];

  // ── Full Plate orders: each is its own batch, no packing ─────────────────
  const plateOrders = orders.filter(o => o.orderType === 'plate');
  for (const order of plateOrders) {
    const qty = parseInt(order.quantity) || 1;
    const printTimeMin = (parseInt(order.printTimeH) || 0) * 60 + (parseInt(order.printTimeMin) || 0);
    const resinVolumeMl = parseFloat(order.resinVolumeMl) || 0;
    const item = {
      id: order.id,
      orderId: order.id,
      label: `${order.modelName} (${order.orderId || order.id})`,
      w: parseFloat(order.footprintW),
      d: parseFloat(order.footprintD),
      h: parseFloat(order.height),
      printTimeMin,
      resinVolumeMl
    };
    // Direct size comparison — no packing margin, plate layout is already finalised in Lychee
    const printer = findPrinterForPlate(item.w, item.d, availablePrinters, settings);
    if (!printer) {
      batches.push({
        batchId: `B${batches.length + 1}-OVERSIZED`,
        printer: null,
        orderType: 'plate',
        resinType: order.resinType || 'Standard Grey',
        items: [item],
        orders: [order],
        utilization: 0,
        printTimeMin: 0,
        resinVolumeMl: 0,
        earliestDeadline: order.deadline || null,
        latestDeadline: order.deadline || null,
        warning: `"${order.modelName}" plate (${item.w}×${item.d}mm) does not fit any printer in your fleet. Add a larger printer.`
      });
      continue;
    }
    const plateArea = printer.plateW * printer.plateD;
    const usedArea = item.w * item.d;
    // qty = number of identical plate runs
    for (let q = 0; q < qty; q++) {
      batches.push({
        batchId: `B${batches.length + 1}`,
        orderType: 'plate',
        printer,
        resinType: order.resinType || 'Standard Grey',
        items: [{ ...item, plateIndex: 0 }],
        orders: [order],
        utilization: Math.min(usedArea / plateArea, 1),
        printTimeMin,
        resinVolumeMl,
        earliestDeadline: order.deadline || null,
        latestDeadline: order.deadline || null
      });
    }
  }

  // ── Single Model orders: group by resin, pack onto plates ─────────────────
  const modelOrders = orders.filter(o => o.orderType !== 'plate');
  const resinGroups = {};
  for (const order of modelOrders) {
    const key = order.resinType || 'Standard Grey';
    if (!resinGroups[key]) resinGroups[key] = [];
    resinGroups[key].push(order);
  }

  for (const [resinType, groupOrders] of Object.entries(resinGroups)) {
    // Sort group by deadline (earliest first)
    const sorted = [...groupOrders].sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    const allItems = expandItems(sorted);
    const { printer, packResult } = recommendPrinter(allItems, settings, availablePrinters);
    if (!printer) continue;

    const byPlate = {};
    for (const item of packResult.items) {
      if (item.doesNotFit) continue;
      const pi = item.plateIndex ?? 0;
      if (!byPlate[pi]) byPlate[pi] = [];
      byPlate[pi].push(item);
    }

    for (const [plateIdx, plateItems] of Object.entries(byPlate)) {
      const orderIdsOnPlate = [...new Set(plateItems.map(i => i.orderId))];
      const ordersOnPlate = sorted.filter(o => orderIdsOnPlate.includes(o.id));
      const earliestDeadline = ordersOnPlate
        .filter(o => o.deadline)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]?.deadline || null;
      const latestDeadline = ordersOnPlate
        .filter(o => o.deadline)
        .sort((a, b) => new Date(b.deadline) - new Date(a.deadline))[0]?.deadline || null;

      const plateArea = printer.plateW * printer.plateD;
      const usedArea = plateItems.reduce((s, i) => s + i.w * i.d, 0);

      // Print time = max of all items on this plate (resin prints all layers simultaneously)
      const printTimes = plateItems.map(i => i.printTimeMin || 0).filter(t => t > 0);
      const printTimeMin = printTimes.length > 0 ? Math.max(...printTimes) : 0;

      // Resin volume = sum of all items on this plate
      const resinVolumeMl = plateItems.reduce((s, i) => s + (i.resinVolumeMl || 0), 0);

      batches.push({
        batchId: `B${batches.length + 1}`,
        orderType: 'model',
        printer,
        resinType,
        plateIndex: parseInt(plateIdx),
        items: plateItems,
        orders: ordersOnPlate,
        utilization: usedArea / plateArea,
        printTimeMin,
        resinVolumeMl,
        earliestDeadline,
        latestDeadline,
        plateArea,
        usedArea
      });
    }

    const noFitItems = packResult.items.filter(i => i.doesNotFit);
    if (noFitItems.length > 0) {
      batches.push({
        batchId: `B${batches.length + 1}-OVERSIZED`,
        printer: null,
        resinType,
        items: noFitItems,
        orders: [],
        utilization: 0,
        printTimeMin: 0,
        resinVolumeMl: 0,
        earliestDeadline: null,
        latestDeadline: null,
        warning: fleetIds.length > 0
          ? 'These items exceed all printers in your fleet. Add a larger printer or check dimensions.'
          : 'These items exceed all available build plates. Check dimensions.'
      });
    }
  }

  // Sort batches by earliest deadline
  batches.sort((a, b) => {
    if (!a.earliestDeadline) return 1;
    if (!b.earliestDeadline) return -1;
    return new Date(a.earliestDeadline) - new Date(b.earliestDeadline);
  });

  // Assign wave and slot indices based on fleet counts
  // Batches for the same printer are spread across N slots (N = fleet count for that printer)
  // waveIndex = which "round" of prints this batch belongs to for its printer
  // slotIndex = which unit of that printer handles this batch
  const printerBatches = {};
  for (const batch of batches) {
    if (!batch.printer) continue;
    const pid = batch.printer.id;
    if (!printerBatches[pid]) printerBatches[pid] = [];
    printerBatches[pid].push(batch);
  }
  for (const [pid, pBatches] of Object.entries(printerBatches)) {
    const count = fleet[pid] || 1;
    for (let j = 0; j < pBatches.length; j++) {
      pBatches[j].waveIndex = Math.floor(j / count) + 1;
      pBatches[j].slotIndex = (j % count) + 1;
      pBatches[j].printerCount = count;
    }
  }

  // Flag urgency based on deadline vs today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const batch of batches) {
    if (!batch.earliestDeadline) {
      batch.urgency = 'none';
    } else {
      const daysLeft = Math.ceil((new Date(batch.earliestDeadline) - today) / (1000 * 60 * 60 * 24));
      batch.daysLeft = daysLeft;
      if (daysLeft < 0) batch.urgency = 'overdue';
      else if (daysLeft <= 3) batch.urgency = 'urgent';
      else if (daysLeft <= 7) batch.urgency = 'warning';
      else batch.urgency = 'ok';
    }
  }

  return batches;
}

function exportQueueCSV(batches) {
  const rows = [['Batch', 'Printer', 'Resin Type', 'Model', 'Qty', 'Deadline', 'Days Left', 'Plate Utilization %', 'Status']];
  for (const batch of batches) {
    // Count quantities per model in this batch
    const modelCounts = {};
    for (const item of batch.items) {
      const key = item.label;
      modelCounts[key] = (modelCounts[key] || 0) + 1;
    }
    const firstModel = Object.entries(modelCounts)[0];
    const printerName = batch.printer ? batch.printer.name : 'OVERSIZED';
    rows.push([
      batch.batchId,
      printerName,
      batch.resinType,
      firstModel ? firstModel[0] : '',
      firstModel ? firstModel[1] : '',
      batch.earliestDeadline || '',
      batch.daysLeft !== undefined ? batch.daysLeft : '',
      batch.utilization ? Math.round(batch.utilization * 100) : 0,
      batch.urgency || ''
    ]);
    // Additional models in same batch on separate rows
    const otherModels = Object.entries(modelCounts).slice(1);
    for (const [model, qty] of otherModels) {
      rows.push(['', '', '', model, qty, '', '', '', '']);
    }
  }

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tl-print-queue-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
