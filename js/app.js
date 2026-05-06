// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

// ── Currency ─────────────────────────────────────────────────────────────────
const CURRENCIES = {
  EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥',
  CAD: 'CA$', AUD: 'AU$', CNY: '¥', KRW: '₩',
  PLN: 'zł', SEK: 'kr', NOK: 'kr', DKK: 'kr', CZK: 'Kč'
};

function getCurrencySymbol() {
  return CURRENCIES[settings.currency || 'EUR'] || '€';
}

function updateCurrencySymbols() {
  const sym = getCurrencySymbol();
  document.querySelectorAll('[data-curr]').forEach(el => {
    switch (el.dataset.curr) {
      case 'flat':    el.textContent = sym; break;
      case 'per-L':   el.textContent = `${sym}/L`; break;
      case 'per-kWh': el.textContent = `${sym}/kWh`; break;
      case 'per-h':   el.textContent = `${sym}/h`; break;
    }
  });
}

function onCurrencyChange() {
  settings.currency = document.getElementById('s-currency')?.value || 'EUR';
  void persistData({ settingsChanged: true });
  updateCurrencySymbols();
  calcRun();
}

function numOrDefault(value, fallback) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function getDepreciationHoursPerDay(source = settings) {
  return numOrDefault(source?.depreciationHoursPerDay ?? source?.operatingHoursPerDay, 16);
}

function getSchedulerOperatingHoursPerDay(source = settings) {
  return numOrDefault(source?.schedulerOperatingHoursPerDay ?? source?.operatingHoursPerDay, 16);
}

// ── State ──────────────────────────────────────────────────────────────────
let orders = loadOrders();
let settings = loadSettings();
let editingOrderId = null;
let currentBatches = [];
let queueMode = 'fleet';      // 'fleet' | 'single'
let queueSinglePrinterId = null;
let lastFileSaveOk = null;
let lastBrowserSaveOk = true;

async function persistData({ settingsChanged = false, ordersChanged = false } = {}) {
  let browserOk = true;
  if (settingsChanged) {
    const saved = saveSettings(settings);
    browserOk = browserOk && saved;
    if (saved) settings = loadSettings();
  }
  if (ordersChanged) {
    const saved = saveOrders(orders);
    browserOk = browserOk && saved;
    if (saved) orders = loadOrders();
  }

  const fileOk = await saveToFile({ savedAt: new Date().toISOString(), settings, orders });
  lastBrowserSaveOk = browserOk;
  lastFileSaveOk = isFileConnected() ? fileOk : null;
  updateFileStatus();
  if (!browserOk) {
    showToast('Browser save failed. Check backup status before closing.');
  }
  if (isFileConnected() && !fileOk) {
    showToast('Auto-save failed. Export a backup before closing.');
  }
  return browserOk && (!isFileConnected() || fileOk);
}

// ── Tab Routing ─────────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'calculator') initCalculatorTab();
  if (tab === 'orders') renderOrdersTable();
  if (tab === 'queue') initQueueTab();
  if (tab === 'settings') initSettingsTab();
}

// ── Calculator Tab ──────────────────────────────────────────────────────────
function initCalculatorTab() {
  const printerSel = document.getElementById('calc-printer');
  if (printerSel) {
    const prevPrinter = printerSel.value;
    printerSel.innerHTML = '';
    getAllPrinters(settings).forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      printerSel.appendChild(o);
    });
    if (prevPrinter && printerSel.querySelector(`[value="${CSS.escape(prevPrinter)}"]`)) {
      printerSel.value = prevPrinter;
    }
  }

  const resinSel = document.getElementById('calc-resin-type');
  if (resinSel) {
    const prevResin = resinSel.value;
    resinSel.innerHTML = '';
    (settings.resins || []).forEach(r => {
      const o = document.createElement('option');
      o.value = r.name;
      o.textContent = r.name;
      resinSel.appendChild(o);
    });
    if (prevResin) resinSel.value = prevResin;
  }

  syncCalculatorDefaultsFromSettings();
  calcUpdatePrinter();
  calcUpdateResinPrice();
  updateCurrencySymbols();
  calcRun();
}

function resetCalcDropdowns() {
  const printerSel = document.getElementById('calc-printer');
  const resinSel = document.getElementById('calc-resin-type');
  if (printerSel) printerSel.innerHTML = '';
  if (resinSel) resinSel.innerHTML = '';
}

function syncCalculatorDefaultsFromSettings() {
  const setDefault = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
  };

  setDefault('calc-electricity', settings.electricityRate ?? 0.25);
  setDefault('calc-ipa-price', settings.ipaPrice ?? 5);
  setDefault('calc-ipa-per-print', settings.ipaPerPrint ?? 30);
  setDefault('calc-fep-cost', settings.fepCost ?? 12);
  setDefault('calc-fep-lifespan', settings.fepLifespan ?? 200);
  setDefault('calc-labor-rate', settings.laborRate ?? 15);
  setDefault('calc-operating-hours', getDepreciationHoursPerDay(settings));
  setDefault('calc-risk', settings.failedPrintRisk ?? 10);
  setDefault('calc-margin', settings.profitMargin ?? 40);
  setDefault('calc-vat-rate', settings.vatRate ?? 22);
}

function calcUpdatePrinter() {
  const printerId = document.getElementById('calc-printer')?.value;
  if (!printerId) return;
  const printer = getPrinterByIdAll(printerId, settings);
  if (!printer) return;
  if (document.getElementById('calc-wattage')) document.getElementById('calc-wattage').value = printer.wattage;
  const isBuiltIn = !!PRINTERS.find(p => p.id === printerId);
  const dep = isBuiltIn ? (settings.printerDepreciation[printerId] || {}) : printer;
  if (document.getElementById('calc-purchase-price')) document.getElementById('calc-purchase-price').value = dep.purchasePrice || 0;
  if (document.getElementById('calc-lifespan')) document.getElementById('calc-lifespan').value = dep.lifespanYears || 5;
  calcRun();
}

function calcUpdateResinPrice() {
  const rt = document.getElementById('calc-resin-type')?.value;
  if (rt) {
    const resin = (settings.resins || []).find(r => r.name === rt);
    if (resin) document.getElementById('calc-resin-price').value = resin.price;
  }
  calcRun();
}

function calcNormalizeTime() {
  const hEl = document.getElementById('calc-hours');
  const mEl = document.getElementById('calc-minutes');
  if (!hEl || !mEl) return;
  let h = parseInt(hEl.value) || 0;
  let m = parseInt(mEl.value) || 0;
  if (m >= 60) { h += Math.floor(m / 60); m = m % 60; hEl.value = h; mEl.value = m; }
  if (h < 0) { hEl.value = 0; }
  if (m < 0) { mEl.value = 0; }
}

function calcRun() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  const totalPrintMinutes = (g('calc-hours') * 60) + g('calc-minutes');
  const inputs = {
    modelVolume: g('calc-volume'),
    supportPct: g('calc-support-pct'),
    resinPrice: g('calc-resin-price'),
    printerWattage: g('calc-wattage'),
    printTime: totalPrintMinutes,
    electricityRate: g('calc-electricity'),
    ipaPrice: g('calc-ipa-price'),
    ipaPerPrint: g('calc-ipa-per-print'),
    fepCost: g('calc-fep-cost'),
    fepLifespan: g('calc-fep-lifespan'),
    purchasePrice: g('calc-purchase-price'),
    lifespanYears: g('calc-lifespan'),
    operatingHoursPerDay: g('calc-operating-hours') || 16,
    laborTime: g('calc-labor-time'),
    laborRate: g('calc-labor-rate'),
    otherConsumables: g('calc-other-consumables'),
    failedPrintRisk: g('calc-risk'),
    profitMargin: g('calc-margin'),
    vatRate: g('calc-vat-rate'),
    boxMaterials: g('calc-box-materials'),
    labelsAndTape: g('calc-labels-tape'),
    brandingInserts: g('calc-branding'),
    packingTime: g('calc-packing-time'),
    shippingCost: g('calc-shipping-cost')
  };

  const result = runCalculation(inputs);
  const sym = getCurrencySymbol();
  const fmt = v => `${sym}${v.toFixed(2)}`;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('out-resin', fmt(result.costs.resin));
  set('out-electricity', fmt(result.costs.electricity));
  set('out-consumables', fmt(result.costs.consumables));
  set('out-depreciation', fmt(result.costs.depreciation));
  set('out-labor', fmt(result.costs.labor));
  set('out-packaging', fmt(result.costs.packaging));
  set('out-shipping', fmt(result.costs.shipping));
  set('out-total', fmt(result.suggestedPriceExVat));
  set('out-vat', fmt(result.vatAmount));
  set('out-fulfillment', fmt(result.fulfillmentPriceExVat));
  set('out-sale-price', fmt(result.finalPriceInclVat));
  set(
    'out-price-breakdown',
    `${fmt(result.suggestedPriceExVat)} print + ${fmt(result.vatAmount)} VAT + ${fmt(result.fulfillmentPriceExVat)} packaging & shipping`
  );
  set('out-per-cm3', `${sym}${result.costPerCm3.toFixed(3)}/cm³`);
}

// ── Orders Tab ──────────────────────────────────────────────────────────────
function setOrderType(type) {
  document.querySelectorAll('.order-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const hidden = document.getElementById('field-orderType');
  if (hidden) hidden.value = type;
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty-state">No orders yet. Click "Add Order" to start.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const typeBadge = o.orderType === 'plate'
      ? '<span class="type-badge type-plate">Plate</span>'
      : '<span class="type-badge type-model">Model</span>';
    const ptH = parseInt(o.printTimeH) || 0;
    const ptM = parseInt(o.printTimeMin) || 0;
    const printTime = (ptH || ptM) ? `${ptH}h ${ptM}m` : '—';
    const qty = parseInt(o.quantity) || 1;
    const totalMin = qty * (ptH * 60 + ptM);
    const totalTime = totalMin > 0 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '—';
    return `
    <tr>
      <td>${esc(o.orderId)}</td>
      <td>${esc(o.customer)}</td>
      <td>${esc(o.modelName)}${typeBadge}</td>
      <td>${o.footprintW} × ${o.footprintD}</td>
      <td>${o.height}</td>
      <td>${o.quantity}</td>
      <td>${printTime}</td>
      <td>${totalTime}</td>
      <td><span class="resin-badge">${esc(o.resinType)}</span></td>
      <td>${o.deadline ? formatDate(o.deadline) : '—'}</td>
      <td>
        <button class="btn-icon" onclick="editOrder('${escJsString(o.id)}')">✎</button>
        <button class="btn-icon btn-danger" onclick="deleteOrder('${escJsString(o.id)}')">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function openOrderModal(id) {
  editingOrderId = id || null;
  const order = id ? orders.find(o => o.id === id) : null;
  document.getElementById('modal-title').textContent = order ? 'Edit Order' : 'Add Order';

  ['orderId','customer','modelName','footprintW','footprintD','height','quantity','deadline','notes'].forEach(f => {
    const el = document.getElementById('field-' + f);
    if (el) el.value = order ? (order[f] || '') : '';
  });

  setOrderType(order?.orderType || 'model');

  const ptH = document.getElementById('field-printTimeH');
  const ptM = document.getElementById('field-printTimeMin');
  if (ptH) ptH.value = order?.printTimeH ?? 0;
  if (ptM) ptM.value = order?.printTimeMin ?? 0;

  const rv = document.getElementById('field-resinVolume');
  if (rv) rv.value = order?.resinVolumeMl || '';

  const rtSel = document.getElementById('field-resinType');
  rtSel.innerHTML = '';
  (settings.resins || []).forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.name;
    opt.textContent = r.name;
    if (order && order.resinType === r.name) opt.selected = true;
    rtSel.appendChild(opt);
  });

  document.getElementById('order-modal').classList.add('open');
}

function closeOrderModal() {
  document.getElementById('order-modal').classList.remove('open');
  editingOrderId = null;
}

function saveOrder() {
  const g = id => document.getElementById('field-' + id)?.value?.trim() || '';
  const order = {
    id: editingOrderId || `ord_${Date.now()}`,
    orderId: g('orderId'),
    customer: g('customer'),
    modelName: g('modelName'),
    orderType: document.getElementById('field-orderType')?.value || 'model',
    footprintW: parseFloat(g('footprintW')) || 0,
    footprintD: parseFloat(g('footprintD')) || 0,
    height: parseFloat(g('height')) || 0,
    quantity: parseInt(g('quantity')) || 1,
    printTimeH: parseInt(document.getElementById('field-printTimeH')?.value) || 0,
    printTimeMin: parseInt(document.getElementById('field-printTimeMin')?.value) || 0,
    resinVolumeMl: parseFloat(document.getElementById('field-resinVolume')?.value) || 0,
    resinType: document.getElementById('field-resinType')?.value || 'Standard Grey',
    deadline: g('deadline'),
    notes: g('notes')
  };

  if (!order.modelName) { alert('Model name is required.'); return; }
  if (!order.footprintW || !order.footprintD) { alert('Footprint dimensions are required.'); return; }
  if (!order.height) { alert('Height is required for scheduling.'); return; }
  if (((order.printTimeH * 60) + order.printTimeMin) <= 0) { alert('Print time is required for scheduling.'); return; }

  if (editingOrderId) {
    const idx = orders.findIndex(o => o.id === editingOrderId);
    if (idx !== -1) orders[idx] = order;
  } else {
    orders.push(order);
  }

  void persistData({ ordersChanged: true });
  closeOrderModal();
  renderOrdersTable();
}

function editOrder(id) { openOrderModal(id); }

function deleteOrder(id) {
  if (!confirm('Delete this order?')) return;
  orders = orders.filter(o => o.id !== id);
  void persistData({ ordersChanged: true });
  renderOrdersTable();
}

function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  row.push(field);
  rows.push(row);
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function parseOrdersCSVText(text, makeId) {
  const rows = parseCSVRows(text);
  const ordersToImport = [];
  const idFor = makeId || ((index) => `ord_${Date.now()}_${index}`);

  for (const rawCols of rows.slice(1)) {
    const cols = rawCols.map(c => c.trim());
    const order = {
      id: idFor(ordersToImport.length, cols),
      orderId: cols[0] || '', customer: cols[1] || '', modelName: cols[2] || '',
      footprintW: parseFloat(cols[3]) || 0, footprintD: parseFloat(cols[4]) || 0,
      height: parseFloat(cols[5]) || 0, quantity: parseInt(cols[6]) || 1,
      resinType: cols[7] || 'Standard Grey', deadline: cols[8] || '', notes: cols[9] || '',
      orderType: cols[10] || 'model',
      printTimeH: parseInt(cols[11]) || 0,
      printTimeMin: parseInt(cols[12]) || 0,
      resinVolumeMl: parseFloat(cols[13]) || 0
    };
    if (order.modelName) ordersToImport.push(order);
  }

  return ordersToImport;
}

function importOrdersCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const imported = parseOrdersCSVText(e.target.result);
    orders.push(...imported);
    void persistData({ ordersChanged: true });
    renderOrdersTable();
    alert(`Imported ${imported.length} orders.`);
  };
  reader.readAsText(file);
}

function handleImportBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    if (importAllData(e.target.result)) {
      orders = loadOrders();
      settings = loadSettings();
      void persistData();
      initSettingsTab();
      renderOrdersTable();
      updateCurrencySymbols();
      showToast('Backup imported.');
    } else {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

// ── Queue Tab: Fleet Config ──────────────────────────────────────────────────
function initQueueTab() {
  queueMode = 'fleet';
  queueSinglePrinterId = null;
  renderFleet();
  refreshFleetDropdown();
  const alertEl = document.getElementById('queue-alert');
  if (alertEl) alertEl.innerHTML = '';
  const container = document.getElementById('queue-container');
  if (container && !currentBatches.length) {
    container.innerHTML = '<div class="empty-state">Configure your fleet above, then click "Generate Queue".</div>';
  }
}

function renderFleet() {
  const container = document.getElementById('fleet-container');
  if (!container) return;
  const fleet = settings.printerFleet || {};
  const active = Object.entries(fleet).filter(([, count]) => count > 0);

  if (active.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:8px 0;font-size:13px">No printers added. Add the printers you actually own before generating a production queue.</div>';
    return;
  }

  container.innerHTML = active.map(([id, count]) => {
    const printer = getPrinterByIdAll(id, settings);
    if (!printer) return '';
    return `<div class="fleet-row" data-printer-id="${esc(id)}">
      <span class="fleet-printer-name">${esc(printer.name)}</span>
      <div class="fleet-count-control">
        <button class="btn-icon" onclick="adjustFleetCount('${escJsString(id)}', -1)" title="Remove one">−</button>
        <span class="fleet-count">${count}</span>
        <button class="btn-icon" onclick="adjustFleetCount('${escJsString(id)}', 1)" title="Add one">+</button>
      </div>
      <button class="btn-icon btn-danger" onclick="removeFromFleet('${escJsString(id)}')">✕</button>
    </div>`;
  }).join('');
}

function refreshFleetDropdown() {
  const sel = document.getElementById('fleet-add-select');
  if (!sel) return;
  const fleet = settings.printerFleet || {};
  const available = getAllPrinters(settings).filter(p => !fleet[p.id]);
  if (available.length === 0) {
    sel.innerHTML = '<option value="">All printers in fleet</option>';
  } else {
    sel.innerHTML = available.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  }
  const addBtn = document.getElementById('fleet-add-btn');
  if (addBtn) addBtn.disabled = available.length === 0;
}

function adjustFleetCount(id, delta) {
  if (!settings.printerFleet) settings.printerFleet = {};
  const next = Math.max(0, (settings.printerFleet[id] || 0) + delta);
  if (next === 0) delete settings.printerFleet[id];
  else settings.printerFleet[id] = next;
  void persistData({ settingsChanged: true });
  renderFleet();
  refreshFleetDropdown();
}

function removeFromFleet(id) {
  if (!settings.printerFleet) return;
  delete settings.printerFleet[id];
  void persistData({ settingsChanged: true });
  renderFleet();
  refreshFleetDropdown();
}

function addToFleet() {
  const sel = document.getElementById('fleet-add-select');
  if (!sel || !sel.value) return;
  const id = sel.value;
  if (!settings.printerFleet) settings.printerFleet = {};
  if (settings.printerFleet[id]) return; // already in fleet, use +/- instead
  settings.printerFleet[id] = 1;
  void persistData({ settingsChanged: true });
  renderFleet();
  refreshFleetDropdown();
}

function estimateBatchCost(batch) {
  if (!batch.printer || !batch.printTimeMin) return null;
  const resinObj = (settings.resins || []).find(r => r.name === batch.resinType);
  const isBuiltIn = !!PRINTERS.find(p => p.id === batch.printer.id);
  const dep = isBuiltIn ? ((settings.printerDepreciation || {})[batch.printer.id] || {}) : batch.printer;
  const inputs = {
    modelVolume: batch.resinVolumeMl || 0,
    supportPct: settings.queueSupportPct ?? 20,
    resinPrice: resinObj ? resinObj.price : 35,
    printerWattage: batch.printer.wattage,
    printTime: batch.printTimeMin,
    electricityRate: settings.electricityRate ?? 0.25,
    ipaPrice: settings.ipaPrice ?? 5,
    ipaPerPrint: settings.ipaPerPrint ?? 30,
    fepCost: settings.fepCost ?? 12,
    fepLifespan: settings.fepLifespan ?? 200,
    purchasePrice: dep.purchasePrice ?? 0,
    lifespanYears: dep.lifespanYears ?? 5,
    operatingHoursPerDay: getDepreciationHoursPerDay(settings),
    laborTime: settings.queueLaborTimeMin ?? 30,
    laborRate: settings.laborRate ?? 15,
    otherConsumables: settings.queueOtherConsumables ?? 0.30,
    failedPrintRisk: settings.failedPrintRisk ?? 10,
    profitMargin: settings.profitMargin ?? 40,
    vatRate: numOrDefault(settings.vatRate, 22),
    boxMaterials: 0, labelsAndTape: 0, brandingInserts: 0, packingTime: 0, shippingCost: 0
  };
  return runCalculation(inputs);
}

// ── Queue Tab ───────────────────────────────────────────────────────────────
function switchToSinglePrinter(id) {
  queueMode = 'single';
  queueSinglePrinterId = id;
  renderQueue();
}

function switchToParallel() {
  queueMode = 'fleet';
  queueSinglePrinterId = null;
  renderQueue();
}

function dismissQueueInsight() {
  const alertEl = document.getElementById('queue-alert');
  if (alertEl) alertEl.innerHTML = '';
}

function renderQueueAlert(parallelBatches) {
  const alertEl = document.getElementById('queue-alert');
  if (!alertEl) return;

  const fleet = settings.printerFleet || {};
  const fleetIds = Object.keys(fleet).filter(id => (fleet[id] || 0) > 0);

  // Only show insight when fleet has more than 1 printer type
  if (fleetIds.length <= 1) { alertEl.innerHTML = ''; return; }

  const fleetPrinters = fleetIds.map(id => getPrinterByIdAll(id, settings)).filter(Boolean)
    .sort((a, b) => a.wattage - b.wattage);
  const scheduleStartAt = new Date().toISOString();

  function evaluateSinglePrinter(printer) {
    const singleSettings = { ...settings, scheduleStartAt, printerFleet: { [printer.id]: 1 } };
    const singleBatches = generateQueue(orders, singleSettings);
    if (singleBatches.some(b => !b.printer)) return null;
    if (singleBatches.some(b => (b.minutesLate || 0) > 0)) return null;
    const timedBatches = singleBatches.filter(b => b.printTimeMin > 0);
    if (timedBatches.length === 0) return null;
    const deadlines = singleBatches.filter(b => b.earliestDeadline).map(b => new Date(b.earliestDeadline));
    if (deadlines.length === 0) return null;
    const singleElec = singleBatches.reduce((s, b) =>
      s + (b.printer ? calcElectricityCost(b.printer.wattage, b.printTimeMin || 0, settings.electricityRate ?? 0.25) : 0), 0);
    return {
      printer,
      batches: singleBatches,
      singleElec,
      totalMin: singleBatches.reduce((s, b) => s + (b.printTimeMin || 0), 0),
      earliestDeadline: new Date(Math.min(...deadlines.map(d => d.getTime())))
    };
  }

  let bestSingle = null;
  if (queueMode === 'single' && queueSinglePrinterId) {
    const selectedPrinter = getPrinterByIdAll(queueSinglePrinterId, settings);
    bestSingle = selectedPrinter ? evaluateSinglePrinter(selectedPrinter) : null;
  } else {
    for (const printer of fleetPrinters) {
      const candidate = evaluateSinglePrinter(printer);
      if (candidate && (!bestSingle || candidate.singleElec < bestSingle.singleElec)) {
        bestSingle = candidate;
      }
    }
  }

  if (!bestSingle) { alertEl.innerHTML = ''; return; }

  // Compute electricity cost difference
  const sym = getCurrencySymbol();
  const rate = settings.electricityRate ?? 0.25;
  const parallelElec = parallelBatches.reduce((s, b) =>
    s + (b.printer ? calcElectricityCost(b.printer.wattage, b.printTimeMin || 0, rate) : 0), 0);
  const savings = parallelElec - bestSingle.singleElec;

  const totalH = Math.floor(bestSingle.totalMin / 60);
  const totalM = bestSingle.totalMin % 60;

  if (queueMode === 'single') {
    alertEl.innerHTML = `
      <div class="queue-insight-card queue-insight-single">
        <div class="queue-insight-body">
          <strong>Showing single-printer view</strong>
          <p>Using only the <strong>${esc(bestSingle.printer.name)}</strong> — ${totalH}h ${totalM}m total, sequential.
          ${savings > 0 ? `Saves approx. <strong>${sym}${savings.toFixed(2)}</strong> in electricity vs. the full fleet.` : ''}</p>
          <div class="queue-insight-actions">
            <button class="btn btn-secondary btn-sm" onclick="switchToParallel()">Switch back to parallel fleet</button>
          </div>
        </div>
      </div>`;
  } else {
    alertEl.innerHTML = `
      <div class="queue-insight-card">
        <div class="queue-insight-body">
          <strong>Single printer can handle this</strong>
          <p>Your <strong>${esc(bestSingle.printer.name)}</strong> can complete all orders by <strong>${formatDate(bestSingle.earliestDeadline.toISOString().slice(0,10))}</strong> without parallelising (${totalH}h ${totalM}m sequential).
          ${savings > 0 ? `Using it alone saves approx. <strong>${sym}${savings.toFixed(2)}</strong> in electricity.` : ''}</p>
          <div class="queue-insight-actions">
            <button class="btn btn-secondary btn-sm" onclick="switchToSinglePrinter('${escJsString(bestSingle.printer.id)}')">Use ${esc(bestSingle.printer.name)} only</button>
            <button class="btn btn-ghost btn-sm" onclick="dismissQueueInsight()">Keep parallel fleet</button>
          </div>
        </div>
      </div>`;
  }
}

function renderQueue() {
  const container = document.getElementById('queue-container');
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = '<div class="empty-state">No orders to schedule. Add orders first.</div>';
    return;
  }

  const activeSettings = (queueMode === 'single' && queueSinglePrinterId)
    ? { ...settings, printerFleet: { [queueSinglePrinterId]: 1 } }
    : settings;
  currentBatches = generateQueue(orders, activeSettings);

  if (currentBatches.length === 0) {
    container.innerHTML = '<div class="empty-state">Could not generate queue. Check order dimensions.</div>';
    return;
  }

  const urgencyLabel = { ok: 'On Track', warning: 'Due Soon', urgent: 'Urgent', overdue: 'Overdue', none: '' };
  const fleet = settings.printerFleet || {};
  const hasFleet = Object.values(fleet).some(n => n > 0);

  function batchCardHTML(batch) {
    const printerName = batch.printer ? batch.printer.name : 'NO PRINTER';
    const utilPct = Math.round((batch.utilization || 0) * 100);
    const slotLabel = (batch.printerCount > 1)
      ? `<span class="printer-slot">#${batch.slotIndex} of ${batch.printerCount}</span>`
      : '';

    // Plate contents
    const modelCounts = {};
    for (const item of batch.items) modelCounts[item.label] = (modelCounts[item.label] || 0) + 1;
    const modelList = Object.entries(modelCounts)
      .map(([label, qty]) => `<span class="model-tag">${esc(label)} ×${qty}</span>`).join('');
    const contentsLabel = batch.orderType === 'plate' ? 'Plate contents' : `Plate contents (${batch.items.length} pcs)`;

    // Print time
    const ptMin = batch.printTimeMin || 0;
    const printTimeStr = ptMin > 0
      ? `${Math.floor(ptMin / 60)}h ${ptMin % 60}m`
      : '—';
    const scheduledStartStr = batch.scheduledStartAt ? formatDateTime(batch.scheduledStartAt) : '';
    const scheduledEndStr = batch.scheduledEndAt ? formatDateTime(batch.scheduledEndAt) : '';
    const readyForNextStr = batch.readyForNextAt ? formatDateTime(batch.readyForNextAt) : '';

    // Cost estimate
    const sym = getCurrencySymbol();
    const costResult = estimateBatchCost(batch);
    let costHTML = '';
    if (costResult) {
      const hasResin = (batch.resinVolumeMl || 0) > 0;
      const resinNote = hasResin ? '' : ' <span class="cost-no-volume">(resin excluded — add volume for full estimate)</span>';
      costHTML = `<div class="batch-cost">
        <span>Production cost: <strong>${sym}${costResult.total.toFixed(2)}</strong>${resinNote}</span>
        <span>Batch estimate excl. packaging/shipping: <strong>${sym}${costResult.salePrice.toFixed(2)}</strong></span>
        ${ptMin > 0 ? `<span>Electricity: <strong>${sym}${costResult.costs.electricity.toFixed(2)}</strong></span>` : ''}
      </div>`;
    } else if (ptMin === 0) {
      costHTML = `<div class="batch-cost"><span class="cost-no-volume">Add print time to get cost estimate</span></div>`;
    }

    return `
      <div class="batch-card urgency-${batch.urgency || 'none'}">
        <div class="batch-header">
          <span class="batch-id">${batch.batchId}</span>
          <span class="printer-tag">${esc(printerName)}${slotLabel}</span>
          <span class="resin-badge">${esc(batch.resinType)}</span>
          ${batch.urgency && batch.urgency !== 'none' ? `<span class="urgency-tag ${batch.urgency}">${urgencyLabel[batch.urgency]}</span>` : ''}
        </div>
        <div class="batch-models" title="${contentsLabel}">${modelList}</div>
        <div class="batch-meta">
          <span>Print time: <strong>${printTimeStr}</strong></span>
          <span>Plate fill: <strong>${utilPct}%</strong></span>
          ${batch.printer ? `<span>Plate: <strong>${batch.printer.plateW}×${batch.printer.plateD}mm</strong></span>` : ''}
          ${scheduledStartStr ? `<span>Start: <strong>${scheduledStartStr}</strong></span>` : ''}
          ${scheduledEndStr ? `<span>ETA: <strong>${scheduledEndStr}</strong></span>` : ''}
          ${readyForNextStr ? `<span>Ready: <strong>${readyForNextStr}</strong></span>` : ''}
          ${batch.minutesLate > 0 ? `<span class="cost-no-volume">${Math.ceil(batch.minutesLate / 60)}h late</span>` : ''}
          ${batch.earliestDeadline ? `<span>Deadline: <strong>${formatDate(batch.earliestDeadline)}</strong></span>` : ''}
          ${batch.daysLeft !== undefined ? `<span>${batch.daysLeft < 0 ? Math.abs(batch.daysLeft) + ' days overdue' : batch.daysLeft + ' days left'}</span>` : ''}
        </div>
        ${costHTML}
        ${batch.warning ? `<div class="batch-warning">${esc(batch.warning)}</div>` : ''}
      </div>`;
  }

  if (hasFleet && currentBatches.some(b => b.waveIndex)) {
    // Group into waves — each wave = set of plates that can run simultaneously
    const waves = {};
    const noWave = [];
    for (const batch of currentBatches) {
      if (batch.waveIndex) {
        if (!waves[batch.waveIndex]) waves[batch.waveIndex] = [];
        waves[batch.waveIndex].push(batch);
      } else {
        noWave.push(batch);
      }
    }
    container.innerHTML = Object.entries(waves)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([waveNum, wBatches]) => {
        const parallelCount = wBatches.length;
        const note = parallelCount > 1 ? ` — ${parallelCount} plates running simultaneously` : '';
        return `<div class="wave-header">Wave ${waveNum}${note}</div>${wBatches.map(batchCardHTML).join('')}`;
      }).join('')
      + noWave.map(batchCardHTML).join('');
  } else {
    container.innerHTML = currentBatches.map(batchCardHTML).join('');
  }

  // Smart single-printer insight alert
  renderQueueAlert(currentBatches);
}

function exportCurrentQueueCSV(batches = currentBatches) {
  const sym = getCurrencySymbol();
  const enriched = (batches || []).map(batch => {
    const costResult = estimateBatchCost(batch);
    return {
      ...batch,
      productionCost: costResult ? costResult.total : null,
      batchEstimate: costResult ? costResult.salePrice : null,
      currencySymbol: sym
    };
  });
  exportQueueCSV(enriched);
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
function initSettingsTab() {
  const g = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  g('s-currency', settings.currency || 'EUR');
  g('s-electricity', settings.electricityRate);
  g('s-labor-rate', settings.laborRate);
  g('s-operating-hours', getDepreciationHoursPerDay(settings));
  g('s-scheduler-hours', getSchedulerOperatingHoursPerDay(settings));
  g('s-production-start', settings.productionStartTime || '08:00');
  g('s-turnaround', settings.queueTurnaroundMin ?? 30);
  g('s-queue-support', settings.queueSupportPct ?? 20);
  g('s-queue-labor-time', settings.queueLaborTimeMin ?? 30);
  g('s-queue-other-consumables', settings.queueOtherConsumables ?? 0.30);
  g('s-queue-packing-margin', settings.queuePackingMarginMm ?? 2);
  g('s-risk', settings.failedPrintRisk);
  g('s-margin', settings.profitMargin);
  g('s-vat-rate', settings.vatRate ?? 22);
  g('s-ipa-price', settings.ipaPrice);
  g('s-ipa-per-print', settings.ipaPerPrint);
  g('s-fep-cost', settings.fepCost);
  g('s-fep-lifespan', settings.fepLifespan);

  // Resin rows — display mode
  const resinContainer = document.getElementById('resin-prices-container');
  if (resinContainer) {
    const resinHeader = `<div class="settings-col-header">
      <span class="settings-col-header-spacer"></span>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <span class="settings-col-header-val" style="width:100px">Cost/L</span>
        <span class="settings-col-header-val" style="width:100px">Density</span>
      </div>
      <div style="width:60px;flex-shrink:0"></div>
    </div>`;
    resinContainer.innerHTML = resinHeader + (settings.resins || []).map(r => resinRowHTML(r, 'display')).join('');
  }

  // Built-in printer depreciation — display mode
  const depContainer = document.getElementById('printer-dep-container');
  if (depContainer) {
    const depHeader = `<div class="settings-col-header">
      <span class="settings-col-header-spacer"></span>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <span class="settings-col-header-val" style="width:80px">Purchase</span>
        <span class="settings-col-header-val" style="width:80px">Lifespan</span>
      </div>
      <div style="width:32px;flex-shrink:0"></div>
    </div>`;
    depContainer.innerHTML = depHeader + PRINTERS.map(p => {
      const dep = settings.printerDepreciation[p.id] || {};
      return printerDepRowHTML(p, dep, 'display');
    }).join('');
  }

  // Custom printer cards — display mode
  const customContainer = document.getElementById('custom-printers-container');
  if (customContainer) {
    customContainer.innerHTML = (settings.customPrinters || []).map(p => customPrinterCardHTML(p, 'display')).join('');
  }

  updateCurrencySymbols();
}

// ── Resin Row Rendering ───────────────────────────────────────────────────────
function resinRowHTML(r, mode) {
  if (mode === 'edit') {
    return `
      <div class="resin-row editing" data-name="${esc(r.name)}">
        <input type="text" class="resin-name" value="${esc(r.name)}" placeholder="Resin name">
        <div class="resin-fields">
          <div class="input-with-unit"><input type="number" class="resin-price" min="0" step="0.5" value="${r.price}"><span class="unit">€/L</span></div>
          <div class="input-with-unit"><input type="number" class="resin-density" min="0.5" max="3" step="0.01" value="${r.density}"><span class="unit">g/cm³</span></div>
        </div>
        <div class="row-actions">
          <button class="btn-icon btn-confirm" onclick="doneResinRow(this)" title="Save">✓</button>
          <button class="btn-icon" onclick="cancelResinRow(this)" title="Cancel">✕</button>
        </div>
      </div>`;
  }
  return `
    <div class="resin-row" data-name="${esc(r.name)}">
      <span class="resin-display-name">${esc(r.name)}</span>
      <div class="resin-fields-display">
        <span class="resin-display-val">${getCurrencySymbol()}${Number(r.price).toFixed(2)}/L</span>
        <span class="resin-display-val">${Number(r.density).toFixed(2)} g/cm³</span>
      </div>
      <div class="row-actions">
        <button class="btn-icon" onclick="editResinRow(this)" title="Edit">✎</button>
        <button class="btn-icon btn-danger" onclick="deleteResinRow(this)" title="Delete">✕</button>
      </div>
    </div>`;
}

function editResinRow(btn) {
  const row = btn.closest('.resin-row');
  const name = row.dataset.name;
  const resin = (settings.resins || []).find(r => r.name === name);
  if (!resin) return;
  row.outerHTML = resinRowHTML(resin, 'edit');
  // Re-query after outerHTML replacement
  const newRow = document.querySelector(`#resin-prices-container .resin-row[data-name="${CSS.escape(name)}"]`);
  if (newRow) newRow.querySelector('.resin-name').focus();
}

function cancelResinRow(btn) {
  const row = btn.closest('.resin-row');
  const originalName = row.dataset.name;
  if (!originalName) { row.remove(); return; }
  const resin = (settings.resins || []).find(r => r.name === originalName);
  if (!resin) { row.remove(); return; }
  row.outerHTML = resinRowHTML(resin, 'display');
}

function doneResinRow(btn) {
  const row = btn.closest('.resin-row');
  const oldName = row.dataset.name;
  const newName = row.querySelector('.resin-name').value.trim();
  const newPrice = parseFloat(row.querySelector('.resin-price').value) || 0;
  const newDensity = parseFloat(row.querySelector('.resin-density').value) || 1.10;

  if (!newName) { alert('Resin name is required.'); return; }

  // Duplicate check (ignore self)
  const duplicate = (settings.resins || []).find(r => r.name === newName && r.name !== oldName);
  if (duplicate) { alert(`A resin named "${newName}" already exists.`); return; }

  const updated = { name: newName, price: newPrice, density: newDensity };
  const idx = (settings.resins || []).findIndex(r => r.name === (oldName || '\x00'));
  if (idx !== -1) {
    settings.resins[idx] = updated;
  } else {
    if (!settings.resins) settings.resins = [];
    settings.resins.push(updated);
  }

  void persistData({ settingsChanged: true });
  resetCalcDropdowns();
  row.outerHTML = resinRowHTML(updated, 'display');
  showToast('Resin saved.');
}

function addResinRow() {
  const container = document.getElementById('resin-prices-container');
  if (!container) return;
  const blank = document.createElement('div');
  blank.innerHTML = resinRowHTML({ name: '', price: 35, density: 1.10 }, 'edit');
  const newRow = blank.firstElementChild;
  newRow.dataset.name = ''; // empty = unsaved
  container.appendChild(newRow);
  newRow.querySelector('.resin-name').focus();
}

function deleteResinRow(btn) {
  const row = btn.closest('.resin-row');
  const name = row.dataset.name;
  if (name) {
    settings.resins = (settings.resins || []).filter(r => r.name !== name);
    void persistData({ settingsChanged: true });
    resetCalcDropdowns();
  }
  row.remove();
}

// ── Built-in Printer Depreciation ────────────────────────────────────────────
function printerDepRowHTML(p, dep, mode) {
  if (mode === 'edit') {
    return `
      <div class="printer-dep-row editing" data-printer-id="${esc(p.id)}">
        <span class="printer-name">${esc(p.name)}</span>
        <div class="printer-dep-inputs">
          <div class="input-with-unit"><input type="number" class="dep-price" min="0" step="10" value="${dep.purchasePrice || 0}"><span class="unit" data-curr="flat">€</span></div>
          <div class="input-with-unit"><input type="number" class="dep-life" min="1" step="1" value="${dep.lifespanYears || 5}"><span class="unit">yrs</span></div>
        </div>
        <div class="row-actions">
          <button class="btn-icon btn-confirm" onclick="donePrinterDepRow(this)" title="Save">✓</button>
          <button class="btn-icon" onclick="cancelPrinterDepRow(this)" title="Cancel">✕</button>
        </div>
      </div>`;
  }
  return `
    <div class="printer-dep-row" data-printer-id="${esc(p.id)}">
      <span class="printer-name">${esc(p.name)}</span>
      <div class="printer-dep-display">
        <span class="printer-dep-val">${getCurrencySymbol()}${dep.purchasePrice || 0}</span>
        <span class="printer-dep-val">${dep.lifespanYears || 5} yrs</span>
      </div>
      <button class="btn-icon" onclick="editPrinterDepRow(this)" title="Edit">✎</button>
    </div>`;
}

function editPrinterDepRow(btn) {
  const row = btn.closest('.printer-dep-row');
  const pid = row.dataset.printerId;
  const printer = PRINTERS.find(p => p.id === pid);
  if (!printer) return;
  const dep = settings.printerDepreciation[pid] || {};
  row.outerHTML = printerDepRowHTML(printer, dep, 'edit');
  document.querySelector(`#printer-dep-container .printer-dep-row[data-printer-id="${CSS.escape(pid)}"] .dep-price`)?.focus();
}

function cancelPrinterDepRow(btn) {
  const row = btn.closest('.printer-dep-row');
  const pid = row.dataset.printerId;
  const printer = PRINTERS.find(p => p.id === pid);
  const dep = settings.printerDepreciation[pid] || {};
  row.outerHTML = printerDepRowHTML(printer, dep, 'display');
}

function donePrinterDepRow(btn) {
  const row = btn.closest('.printer-dep-row');
  const pid = row.dataset.printerId;
  const printer = PRINTERS.find(p => p.id === pid);
  const purchasePrice = parseFloat(row.querySelector('.dep-price').value) || 0;
  const lifespanYears = parseFloat(row.querySelector('.dep-life').value) || 5;
  const dep = { purchasePrice, lifespanYears };

  settings.printerDepreciation[pid] = dep;
  void persistData({ settingsChanged: true });
  row.outerHTML = printerDepRowHTML(printer, dep, 'display');
  showToast('Printer depreciation saved.');
}

// ── Custom Printer Cards ──────────────────────────────────────────────────────
function customPrinterCardHTML(p, mode) {
  if (mode === 'edit') {
    return `
      <div class="custom-printer-card editing" data-id="${esc(p.id)}">
        <div class="custom-printer-header">
          <input type="text" class="cp-name" value="${esc(p.name)}" placeholder="Printer name">
          <div class="row-actions">
            <button class="btn-icon btn-confirm" onclick="doneCustomPrinterCard(this)" title="Save">✓</button>
            <button class="btn-icon" onclick="cancelCustomPrinterCard(this)" title="Cancel">✕</button>
          </div>
        </div>
        <div class="custom-printer-specs">
          <div class="form-group"><label>Plate W (mm)</label><input type="number" class="cp-plateW" min="0" step="1" value="${p.plateW || 0}"></div>
          <div class="form-group"><label>Plate D (mm)</label><input type="number" class="cp-plateD" min="0" step="1" value="${p.plateD || 0}"></div>
          <div class="form-group"><label>Plate Z (mm)</label><input type="number" class="cp-plateZ" min="0" step="1" value="${p.plateZ || 0}"></div>
          <div class="form-group"><label>Wattage (W)</label><input type="number" class="cp-wattage" min="0" step="1" value="${p.wattage || 0}"></div>
          <div class="form-group"><label>Purchase (€)</label><input type="number" class="cp-purchase" min="0" step="10" value="${p.purchasePrice || 0}"></div>
          <div class="form-group"><label>Lifespan (yrs)</label><input type="number" class="cp-lifespan" min="1" step="1" value="${p.lifespanYears || 5}"></div>
        </div>
      </div>`;
  }
  return `
    <div class="custom-printer-card" data-id="${esc(p.id)}">
      <div class="custom-printer-display-header">
        <span class="custom-printer-display-name">${esc(p.name)}</span>
        <div class="row-actions">
          <button class="btn-icon" onclick="editCustomPrinterCard(this)" title="Edit">✎</button>
          <button class="btn-icon btn-danger" onclick="deleteCustomPrinterCard(this)" title="Delete">✕</button>
        </div>
      </div>
      <div class="custom-printer-specs-display">
        <span>Plate: <strong>${p.plateW}×${p.plateD}×${p.plateZ} mm</strong></span>
        <span>Power: <strong>${p.wattage} W</strong></span>
        <span>Purchase: <strong>${getCurrencySymbol()}${p.purchasePrice}</strong></span>
        <span>Lifespan: <strong>${p.lifespanYears} yrs</strong></span>
      </div>
    </div>`;
}

function editCustomPrinterCard(btn) {
  const card = btn.closest('.custom-printer-card');
  const id = card.dataset.id;
  const printer = (settings.customPrinters || []).find(p => p.id === id);
  if (!printer) return;
  card.outerHTML = customPrinterCardHTML(printer, 'edit');
  document.querySelector(`#custom-printers-container .custom-printer-card[data-id="${CSS.escape(id)}"] .cp-name`)?.focus();
}

function cancelCustomPrinterCard(btn) {
  const card = btn.closest('.custom-printer-card');
  const id = card.dataset.id;
  const printer = (settings.customPrinters || []).find(p => p.id === id);
  if (!printer) { card.remove(); return; } // new unsaved card
  card.outerHTML = customPrinterCardHTML(printer, 'display');
}

function doneCustomPrinterCard(btn) {
  const card = btn.closest('.custom-printer-card');
  const id = card.dataset.id;
  const name = card.querySelector('.cp-name').value.trim();
  if (!name) { alert('Printer name is required.'); return; }

  const updated = {
    id,
    name,
    plateW: parseFloat(card.querySelector('.cp-plateW').value) || 0,
    plateD: parseFloat(card.querySelector('.cp-plateD').value) || 0,
    plateZ: parseFloat(card.querySelector('.cp-plateZ').value) || 0,
    wattage: parseFloat(card.querySelector('.cp-wattage').value) || 0,
    purchasePrice: parseFloat(card.querySelector('.cp-purchase').value) || 0,
    lifespanYears: parseFloat(card.querySelector('.cp-lifespan').value) || 5
  };

  if (!settings.customPrinters) settings.customPrinters = [];
  const idx = settings.customPrinters.findIndex(p => p.id === id);
  if (idx !== -1) settings.customPrinters[idx] = updated;
  else settings.customPrinters.push(updated);

  void persistData({ settingsChanged: true });
  resetCalcDropdowns();
  card.outerHTML = customPrinterCardHTML(updated, 'display');
  showToast('Printer saved.');
}

function deleteCustomPrinterCard(btn) {
  const card = btn.closest('.custom-printer-card');
  const id = card.dataset.id;
  if (!confirm('Remove this printer?')) return;
  settings.customPrinters = (settings.customPrinters || []).filter(p => p.id !== id);
  void persistData({ settingsChanged: true });
  resetCalcDropdowns();
  card.remove();
  showToast('Printer removed.');
}

function addCustomPrinterRow() {
  const container = document.getElementById('custom-printers-container');
  if (!container) return;
  const newP = { id: `custom_${Date.now()}`, name: '', plateW: 0, plateD: 0, plateZ: 0, wattage: 0, purchasePrice: 0, lifespanYears: 5 };
  const blank = document.createElement('div');
  blank.innerHTML = customPrinterCardHTML(newP, 'edit');
  const card = blank.firstElementChild;
  container.appendChild(card);
  card.querySelector('.cp-name').focus();
}

// ── Global Settings Save ──────────────────────────────────────────────────────
function saveSettingsForm() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  settings.currency = document.getElementById('s-currency')?.value || 'EUR';
  settings.electricityRate = g('s-electricity');
  settings.laborRate = g('s-labor-rate');
  settings.depreciationHoursPerDay = Math.max(g('s-operating-hours') || 16, 1);
  settings.operatingHoursPerDay = settings.depreciationHoursPerDay;
  settings.schedulerOperatingHoursPerDay = Math.max(g('s-scheduler-hours') || 16, 1);
  settings.productionStartTime = document.getElementById('s-production-start')?.value || '08:00';
  settings.queueTurnaroundMin = Math.max(g('s-turnaround'), 0);
  settings.queueSupportPct = Math.max(g('s-queue-support'), 0);
  settings.queueLaborTimeMin = Math.max(g('s-queue-labor-time'), 0);
  settings.queueOtherConsumables = Math.max(g('s-queue-other-consumables'), 0);
  settings.queuePackingMarginMm = Math.max(g('s-queue-packing-margin'), 0);
  settings.failedPrintRisk = g('s-risk');
  settings.profitMargin = g('s-margin');
  settings.vatRate = Math.max(numOrDefault(document.getElementById('s-vat-rate')?.value, 22), 0);
  settings.ipaPrice = g('s-ipa-price');
  settings.ipaPerPrint = g('s-ipa-per-print');
  settings.fepCost = g('s-fep-cost');
  settings.fepLifespan = g('s-fep-lifespan');

  void persistData({ settingsChanged: true });
  syncCalculatorDefaultsFromSettings();
  calcUpdatePrinter();
  calcUpdateResinPrice();
  updateCurrencySymbols();
  calcRun();
  showToast('Settings saved.');
}

// ── Utilities ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function escJsString(str) {
  return esc(String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n'));
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── File Status ──────────────────────────────────────────────────────────────
function updateFileStatus() {
  const el = document.getElementById('file-status');
  if (!el) return;
  if (isFileConnected()) {
    if (lastBrowserSaveOk === false) {
      el.innerHTML = `<span class="file-dot"></span> Browser save failed. File target: <strong>${esc(getFileName())}</strong>`;
      el.className = 'file-status disconnected';
    } else if (lastFileSaveOk === false) {
      el.innerHTML = `<span class="file-dot"></span> Auto-save failed for <strong>${esc(getFileName())}</strong>. Export a backup.`;
      el.className = 'file-status disconnected';
    } else {
      el.innerHTML = `<span class="file-dot connected"></span> Auto-saving to <strong>${esc(getFileName())}</strong>`;
      el.className = 'file-status connected';
    }
  } else {
    el.innerHTML = '<span class="file-dot"></span> Browser only &mdash; use Export Backup to move or protect data';
    el.className = 'file-status disconnected';
  }
}

async function handleConnectNew() {
  const ok = await connectNewDataFile();
  lastFileSaveOk = ok ? true : null;
  if (ok) { updateFileStatus(); showToast('Data file connected. Auto-save enabled.'); }
  else { updateFileStatus(); showToast('Could not connect a data file. Browser storage is still active.'); }
}

async function handleOpenExisting() {
  const ok = await openExistingDataFile();
  if (ok) {
    orders = loadOrders();
    settings = loadSettings();
    updateFileStatus();
    renderOrdersTable();
    showToast('Data loaded from file.');
  } else {
    updateFileStatus();
    showToast('Could not open that data file.');
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateFileStatus();
  updateCurrencySymbols();
  showTab('calculator');
});
