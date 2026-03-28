// Group orders into print batches, assign printers, sort by deadline

function generateQueue(orders, settings) {
  if (!orders || orders.length === 0) return [];

  // Group by resin type
  const resinGroups = {};
  for (const order of orders) {
    const key = order.resinType || 'Standard Grey';
    if (!resinGroups[key]) resinGroups[key] = [];
    resinGroups[key].push(order);
  }

  const batches = [];

  for (const [resinType, groupOrders] of Object.entries(resinGroups)) {
    // Sort group by deadline (earliest first)
    const sorted = [...groupOrders].sort((a, b) => {
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    // Pack items onto plates using recommended printer
    const allItems = expandItems(sorted);
    const { printer, packResult } = recommendPrinter(allItems, settings);

    if (!printer) continue;

    // Group items by plate index
    const byPlate = {};
    for (const item of packResult.items) {
      if (item.doesNotFit) continue;
      const pi = item.plateIndex ?? 0;
      if (!byPlate[pi]) byPlate[pi] = [];
      byPlate[pi].push(item);
    }

    // Each plate = one batch
    for (const [plateIdx, plateItems] of Object.entries(byPlate)) {
      // Find the latest deadline among orders on this plate
      const orderIdsOnPlate = [...new Set(plateItems.map(i => i.orderId))];
      const ordersOnPlate = sorted.filter(o => orderIdsOnPlate.includes(o.id));
      const latestDeadline = ordersOnPlate
        .filter(o => o.deadline)
        .sort((a, b) => new Date(b.deadline) - new Date(a.deadline))[0]?.deadline || null;
      const earliestDeadline = ordersOnPlate
        .filter(o => o.deadline)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]?.deadline || null;

      const plateArea = printer.plateW * printer.plateD;
      const usedArea = plateItems.reduce((s, i) => s + i.w * i.d, 0);
      const utilization = usedArea / plateArea;

      batches.push({
        batchId: `B${batches.length + 1}`,
        printer,
        resinType,
        plateIndex: parseInt(plateIdx),
        items: plateItems,
        orders: ordersOnPlate,
        utilization,
        earliestDeadline,
        latestDeadline,
        plateArea,
        usedArea
      });
    }

    // Handle items that don't fit any printer
    const noFitItems = packResult.items.filter(i => i.doesNotFit);
    if (noFitItems.length > 0) {
      batches.push({
        batchId: `B${batches.length + 1}-OVERSIZED`,
        printer: null,
        resinType,
        plateIndex: 0,
        items: noFitItems,
        orders: [],
        utilization: 0,
        earliestDeadline: null,
        latestDeadline: null,
        warning: 'These items exceed all printer build plates. Check dimensions.'
      });
    }
  }

  // Sort batches by earliest deadline
  batches.sort((a, b) => {
    if (!a.earliestDeadline) return 1;
    if (!b.earliestDeadline) return -1;
    return new Date(a.earliestDeadline) - new Date(b.earliestDeadline);
  });

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
