// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

// Group orders into print batches, assign printers, sort by deadline

function orderPrintTimeMin(order) {
  return ((parseInt(order.printTimeH) || 0) * 60) + (parseInt(order.printTimeMin) || 0);
}

function orderScheduleWarning(order) {
  const missing = [];
  if ((parseFloat(order.height) || 0) <= 0) missing.push('height');
  if (orderPrintTimeMin(order) <= 0) missing.push('print time');
  if (missing.length === 0) return '';
  return `"${order.modelName}" is missing required ${missing.join(' and ')}. Add complete physical and timing data before scheduling.`;
}

function orderToItem(order) {
  return {
    id: order.id,
    orderId: order.id,
    label: `${order.modelName} (${order.orderId || order.id})`,
    w: parseFloat(order.footprintW),
    d: parseFloat(order.footprintD),
    h: parseFloat(order.height),
    printTimeMin: orderPrintTimeMin(order),
    resinVolumeMl: parseFloat(order.resinVolumeMl) || 0
  };
}

function createUnscheduledOrderBatch(order, warning, batchId) {
  return {
    batchId,
    printer: null,
    orderType: order.orderType || 'model',
    resinType: order.resinType || 'Standard Grey',
    items: [orderToItem(order)],
    orders: [order],
    utilization: 0,
    printTimeMin: 0,
    resinVolumeMl: 0,
    earliestDeadline: order.deadline || null,
    latestDeadline: order.deadline || null,
    warning
  };
}

function getDeadlinesForOrders(orders) {
  const withDeadlines = (orders || []).filter(o => o.deadline);
  return {
    earliestDeadline: [...withDeadlines].sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]?.deadline || null,
    latestDeadline: [...withDeadlines].sort((a, b) => new Date(b.deadline) - new Date(a.deadline))[0]?.deadline || null
  };
}

function getPackingPrinterSlots(availablePrinters, fleet) {
  const slots = [];
  for (const printer of availablePrinters) {
    const count = Math.max(parseInt(fleet[printer.id]) || 1, 1);
    for (let i = 0; i < count; i++) slots.push(printer);
  }
  return slots.sort((a, b) => {
    const areaDiff = (b.plateW * b.plateD) - (a.plateW * a.plateD);
    if (areaDiff !== 0) return areaDiff;
    return a.wattage - b.wattage;
  });
}

function parseTimeOfDay(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return null;
  const [hour, minute] = String(value).split(':').map(n => parseInt(n, 10));
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function getOperatingWindowSettings(settings) {
  const start = parseTimeOfDay(settings && settings.productionStartTime);
  const hours = parseFloat(settings && (
    settings.schedulerOperatingHoursPerDay ?? settings.operatingHoursPerDay
  ));
  if (!start || !Number.isFinite(hours) || hours >= 24) return null;
  return { start, hours: Math.max(hours, 1) };
}

function windowForDay(anchor, windowSettings, dayOffset = 0) {
  const startAt = new Date(anchor.getTime());
  startAt.setDate(startAt.getDate() + dayOffset);
  startAt.setHours(windowSettings.start.hour, windowSettings.start.minute, 0, 0);
  const endAt = new Date(startAt.getTime() + (windowSettings.hours * 60 * 60 * 1000));
  return { startAt, endAt };
}

function alignToOperatingWindow(date, settings) {
  const d = new Date(date.getTime());
  const windowSettings = getOperatingWindowSettings(settings);
  if (!windowSettings) return d;

  const previousWindow = windowForDay(d, windowSettings, -1);
  if (d >= previousWindow.startAt && d < previousWindow.endAt) return d;

  const todayWindow = windowForDay(d, windowSettings, 0);
  if (d < todayWindow.startAt) return todayWindow.startAt;
  if (d >= todayWindow.startAt && d < todayWindow.endAt) return d;

  return windowForDay(d, windowSettings, 1).startAt;
}

function getQueueTurnaroundMin(settings) {
  const minutes = parseFloat(settings && settings.queueTurnaroundMin);
  return Number.isFinite(minutes) ? Math.max(minutes, 0) : 0;
}

function getQueuePackingMarginMm(settings) {
  const margin = parseFloat(settings && settings.queuePackingMarginMm);
  return Number.isFinite(margin) ? Math.min(Math.max(margin, 0), 50) : 2;
}

function generateQueue(orders, settings) {
  if (!orders || orders.length === 0) return [];

  // Build available printer list from the real fleet config. For daily use,
  // an empty fleet must be explicit instead of silently using the catalog.
  const fleet = settings.printerFleet || {};
  const fleetIds = Object.keys(fleet).filter(id => (fleet[id] || 0) > 0);
  let availablePrinters;
  if (fleetIds.length > 0) {
    availablePrinters = fleetIds
      .map(id => getPrinterByIdAll(id, settings))
      .filter(Boolean)
      .sort((a, b) => a.wattage - b.wattage); // cheapest-to-run first
  } else {
    return [{
      batchId: 'B1-NO-FLEET',
      printer: null,
      resinType: '',
      items: [],
      orders,
      utilization: 0,
      printTimeMin: 0,
      resinVolumeMl: 0,
      earliestDeadline: null,
      latestDeadline: null,
      warning: 'No printer fleet configured. Add the printers you actually own before generating a production queue.'
    }];
  }

  const batches = [];
  const schedulableOrders = [];
  for (const order of orders) {
    const warning = orderScheduleWarning(order);
    if (warning) {
      batches.push(createUnscheduledOrderBatch(order, warning, `B${batches.length + 1}-INCOMPLETE`));
    } else {
      schedulableOrders.push(order);
    }
  }

  // ── Full Plate orders: each is its own batch, no packing ─────────────────
  const plateOrders = schedulableOrders.filter(o => o.orderType === 'plate');
  for (const order of plateOrders) {
    const qty = parseInt(order.quantity) || 1;
    const printTimeMin = orderPrintTimeMin(order);
    const resinVolumeMl = parseFloat(order.resinVolumeMl) || 0;
    const item = orderToItem(order);
    // Direct size comparison — no packing margin, plate layout is already finalised in Lychee
    const candidatePrinters = findPrintersForPlate(item.w, item.d, item.h, availablePrinters, settings);
    if (candidatePrinters.length === 0) {
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
        warning: `"${order.modelName}" plate (${item.w}×${item.d}×${item.h}mm) does not fit any printer in your fleet. Add a larger printer or check dimensions.`
      });
      continue;
    }
    const printer = candidatePrinters[0];
    const plateArea = printer.plateW * printer.plateD;
    const usedArea = item.w * item.d;
    // qty = number of identical plate runs
    for (let q = 0; q < qty; q++) {
      batches.push({
        batchId: `B${batches.length + 1}`,
        orderType: 'plate',
        printer,
        candidatePrinters,
        resinType: order.resinType || 'Standard Grey',
        items: [{ ...item, plateIndex: 0 }],
        orders: [order],
        utilization: Math.min(usedArea / plateArea, 1),
        printTimeMin,
        resinVolumeMl,
        earliestDeadline: order.deadline || null,
        latestDeadline: order.deadline || null,
        plateArea,
        usedArea
      });
    }
  }

  // ── Single Model orders: group by resin, pack onto plates ─────────────────
  const modelOrders = schedulableOrders.filter(o => o.orderType !== 'plate');
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

    let remainingItems = expandItems(sorted);
    const packingPrinters = getPackingPrinterSlots(availablePrinters, fleet);
    const packingMarginMm = getQueuePackingMarginMm(settings);

    while (remainingItems.length > 0) {
      let placedInRound = false;

      for (const printer of packingPrinters) {
        if (remainingItems.length === 0) break;
        const packResult = packItemsOnPlate(remainingItems, printer.plateW, printer.plateD, printer.plateZ, packingMarginMm);
        const plateItems = packResult.items.filter(item => !item.doesNotFit && (item.plateIndex ?? 0) === 0);
        if (plateItems.length === 0) continue;

        placedInRound = true;
        const placedIds = new Set(plateItems.map(item => item.id));
        remainingItems = remainingItems.filter(item => !placedIds.has(item.id));

        const orderIdsOnPlate = [...new Set(plateItems.map(i => i.orderId))];
        const ordersOnPlate = sorted.filter(o => orderIdsOnPlate.includes(o.id));
        const { earliestDeadline, latestDeadline } = getDeadlinesForOrders(ordersOnPlate);

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
          candidatePrinters: [printer],
          resinType,
          plateIndex: batches.length,
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

      if (!placedInRound) break;
    }

    if (remainingItems.length > 0) {
      const noFitOrderIds = [...new Set(remainingItems.map(i => i.orderId))];
      const ordersOnPlate = sorted.filter(o => noFitOrderIds.includes(o.id));
      const { earliestDeadline, latestDeadline } = getDeadlinesForOrders(ordersOnPlate);
      batches.push({
        batchId: `B${batches.length + 1}-OVERSIZED`,
        printer: null,
        resinType,
        items: remainingItems,
        orders: ordersOnPlate,
        utilization: 0,
        printTimeMin: 0,
        resinVolumeMl: 0,
        earliestDeadline,
        latestDeadline,
        warning: fleetIds.length > 0
          ? 'These items exceed all printers in your fleet. Add a larger printer or check dimensions.'
          : 'These items exceed all available build volumes. Check dimensions.'
      });
    }
  }

  // Sort batches by earliest deadline
  batches.sort((a, b) => {
    if (!a.earliestDeadline) return 1;
    if (!b.earliestDeadline) return -1;
    return new Date(a.earliestDeadline) - new Date(b.earliestDeadline);
  });

  assignTimeline(batches, availablePrinters, fleet, settings);

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

function assignTimeline(batches, availablePrinters, fleet, settings) {
  const scheduleStart = getScheduleStart(settings);
  const turnaroundMin = getQueueTurnaroundMin(settings);
  const slots = [];
  for (const printer of availablePrinters) {
    const count = fleet[printer.id] || 1;
    for (let i = 0; i < count; i++) {
      slots.push({
        printer,
        slotIndex: i + 1,
        printerCount: count,
        availableAt: new Date(scheduleStart.getTime())
      });
    }
  }

  const assignedByPrinter = {};
  for (const batch of batches) {
    if (!batch.printer) continue;
    const candidateIds = new Set((batch.candidatePrinters || [batch.printer]).map(p => p.id));
    const candidateSlots = slots.filter(slot => candidateIds.has(slot.printer.id));
    if (candidateSlots.length === 0) continue;

    candidateSlots.sort((a, b) => {
      if (a.availableAt.getTime() !== b.availableAt.getTime()) return a.availableAt - b.availableAt;
      return a.printer.wattage - b.printer.wattage;
    });

    const slot = candidateSlots[0];
    const startAt = alignToOperatingWindow(slot.availableAt, settings);
    const endAt = new Date(startAt.getTime() + ((batch.printTimeMin || 0) * 60 * 1000));
    const readyAtRaw = new Date(endAt.getTime() + (turnaroundMin * 60 * 1000));
    const readyAt = alignToOperatingWindow(readyAtRaw, settings);
    const pid = slot.printer.id;
    assignedByPrinter[pid] = (assignedByPrinter[pid] || 0) + 1;

    batch.printer = slot.printer;
    batch.slotIndex = slot.slotIndex;
    batch.printerCount = slot.printerCount;
    batch.waveIndex = Math.floor((assignedByPrinter[pid] - 1) / slot.printerCount) + 1;
    batch.scheduledStartAt = startAt.toISOString();
    batch.scheduledEndAt = endAt.toISOString();
    batch.readyForNextAt = readyAt.toISOString();
    batch.minutesLate = calculateMinutesLate(endAt, batch.earliestDeadline);
    batch.isLate = batch.minutesLate > 0;

    const usedArea = batch.usedArea ?? batch.items.reduce((sum, item) => sum + (item.w * item.d), 0);
    batch.usedArea = usedArea;
    batch.plateArea = slot.printer.plateW * slot.printer.plateD;
    batch.utilization = Math.min(usedArea / batch.plateArea, 1);

    slot.availableAt = readyAt;
  }
}

function getScheduleStart(settings) {
  const configured = settings && settings.scheduleStartAt ? new Date(settings.scheduleStartAt) : new Date();
  if (Number.isNaN(configured.getTime())) return new Date();
  return configured;
}

function deadlineEndOfDay(deadline) {
  if (!deadline) return null;
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  const d = isoDateOnly ? new Date(`${deadline}T23:59:59`) : new Date(deadline);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function calculateMinutesLate(endAt, deadline) {
  const due = deadlineEndOfDay(deadline);
  if (!due) return 0;
  return Math.max(0, Math.ceil((endAt - due) / (1000 * 60)));
}

function exportQueueCSV(batches) {
  const rows = [[
    'Batch',
    'Printer',
    'Slot',
    'Wave',
    'Resin Type',
    'Model',
    'Qty',
    'Scheduled Start',
    'Scheduled End',
    'Ready For Next',
    'Deadline',
    'Days Left',
    'Late Minutes',
    'Plate Utilization %',
    'Status',
    'Warning',
    'Production Cost',
    'Batch Estimate'
  ]];
  for (const batch of batches) {
    // Count quantities per model in this batch
    const modelCounts = {};
    for (const item of batch.items) {
      const key = item.label;
      modelCounts[key] = (modelCounts[key] || 0) + 1;
    }
    const firstModel = Object.entries(modelCounts)[0];
    const printerName = batch.printer ? batch.printer.name : 'OVERSIZED';
    const currencySymbol = batch.currencySymbol || '';
    rows.push([
      batch.batchId,
      printerName,
      batch.slotIndex ? `${batch.slotIndex} of ${batch.printerCount || 1}` : '',
      batch.waveIndex || '',
      batch.resinType,
      firstModel ? firstModel[0] : '',
      firstModel ? firstModel[1] : '',
      batch.scheduledStartAt || '',
      batch.scheduledEndAt || '',
      batch.readyForNextAt || '',
      batch.earliestDeadline || '',
      batch.daysLeft !== undefined ? batch.daysLeft : '',
      batch.minutesLate || 0,
      batch.utilization ? Math.round(batch.utilization * 100) : 0,
      batch.urgency || '',
      batch.warning || '',
      formatMoneyCell(batch.productionCost, currencySymbol),
      formatMoneyCell(batch.batchEstimate, currencySymbol)
    ]);
    // Additional models in same batch on separate rows
    const otherModels = Object.entries(modelCounts).slice(1);
    for (const [model, qty] of otherModels) {
      rows.push(['', '', '', '', '', model, qty, '', '', '', '', '', '', '', '', '', '', '']);
    }
  }

  const csv = rows.map(r => r.map(formatCSVCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tl-print-queue-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatMoneyCell(value, currencySymbol) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? `${currencySymbol}${n.toFixed(2)}` : '';
}

function formatCSVCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}
