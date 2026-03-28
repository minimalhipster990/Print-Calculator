// ── State ──────────────────────────────────────────────────────────────────
let orders = loadOrders();
let settings = loadSettings();
let editingOrderId = null;
let currentBatches = [];

// ── Tab Routing ─────────────────────────────────────────────────────────────
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + tab));
  if (tab === 'calculator') initCalculatorTab();
  if (tab === 'orders') renderOrdersTable();
  if (tab === 'queue') renderQueue();
  if (tab === 'settings') initSettingsTab();
}

// ── Calculator Tab ──────────────────────────────────────────────────────────
function initCalculatorTab() {
  const sel = document.getElementById('calc-printer');
  if (sel && sel.children.length === 0) {
    PRINTERS.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      sel.appendChild(o);
    });
  }
  populateCalcResinTypes();
  calcUpdatePrinter();
  calcRun();
}

function populateCalcResinTypes() {
  const sel = document.getElementById('calc-resin-type');
  if (!sel || sel.children.length > 0) return;
  Object.keys(settings.resinPrices).forEach(rt => {
    const o = document.createElement('option');
    o.value = rt;
    o.textContent = rt;
    sel.appendChild(o);
  });
}

function calcUpdatePrinter() {
  const printerId = document.getElementById('calc-printer')?.value;
  if (!printerId) return;
  const printer = getPrinterById(printerId);
  const dep = settings.printerDepreciation[printerId] || {};
  if (document.getElementById('calc-wattage')) document.getElementById('calc-wattage').value = printer.wattage;
  if (document.getElementById('calc-purchase-price')) document.getElementById('calc-purchase-price').value = dep.purchasePrice || 0;
  if (document.getElementById('calc-lifespan')) document.getElementById('calc-lifespan').value = dep.lifespanYears || 5;
  calcRun();
}

function calcUpdateResinPrice() {
  const rt = document.getElementById('calc-resin-type')?.value;
  if (rt && settings.resinPrices[rt]) {
    document.getElementById('calc-resin-price').value = settings.resinPrices[rt];
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
    laborTime: g('calc-labor-time'),
    laborRate: g('calc-labor-rate'),
    failedPrintRisk: g('calc-risk'),
    profitMargin: g('calc-margin'),
    boxMaterials: g('calc-box-materials'),
    labelsAndTape: g('calc-labels-tape'),
    brandingInserts: g('calc-branding'),
    packingTime: g('calc-packing-time'),
    shippingCost: g('calc-shipping-cost')
  };

  const result = runCalculation(inputs);

  const fmt = v => `€${v.toFixed(2)}`;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('out-resin', fmt(result.costs.resin));
  set('out-electricity', fmt(result.costs.electricity));
  set('out-consumables', fmt(result.costs.consumables));
  set('out-depreciation', fmt(result.costs.depreciation));
  set('out-labor', fmt(result.costs.labor));
  set('out-packaging', fmt(result.costs.packaging));
  set('out-shipping', fmt(result.costs.shipping));
  set('out-total', fmt(result.total));
  set('out-sale-price', fmt(result.salePrice));
  set('out-per-cm3', `€${result.costPerCm3.toFixed(3)}/cm³`);
}

// ── Orders Tab ──────────────────────────────────────────────────────────────
function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No orders yet. Click "Add Order" to start.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td>${esc(o.orderId)}</td>
      <td>${esc(o.customer)}</td>
      <td>${esc(o.modelName)}</td>
      <td>${o.footprintW} × ${o.footprintD}</td>
      <td>${o.height}</td>
      <td>${o.quantity}</td>
      <td><span class="resin-badge">${esc(o.resinType)}</span></td>
      <td>${o.deadline ? formatDate(o.deadline) : '—'}</td>
      <td>
        <button class="btn-icon" onclick="editOrder('${o.id}')">✎</button>
        <button class="btn-icon btn-danger" onclick="deleteOrder('${o.id}')">✕</button>
      </td>
    </tr>
  `).join('');
}

function openOrderModal(id) {
  editingOrderId = id || null;
  const order = id ? orders.find(o => o.id === id) : null;
  const modal = document.getElementById('order-modal');
  const title = document.getElementById('modal-title');
  title.textContent = order ? 'Edit Order' : 'Add Order';

  const fields = ['orderId','customer','modelName','footprintW','footprintD','height','quantity','deadline','notes'];
  fields.forEach(f => {
    const el = document.getElementById('field-' + f);
    if (el) el.value = order ? (order[f] || '') : '';
  });

  // Resin type dropdown
  const rtSel = document.getElementById('field-resinType');
  rtSel.innerHTML = '';
  Object.keys(settings.resinPrices).forEach(rt => {
    const opt = document.createElement('option');
    opt.value = rt;
    opt.textContent = rt;
    if (order && order.resinType === rt) opt.selected = true;
    rtSel.appendChild(opt);
  });

  modal.classList.add('open');
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
    footprintW: parseFloat(g('footprintW')) || 0,
    footprintD: parseFloat(g('footprintD')) || 0,
    height: parseFloat(g('height')) || 0,
    quantity: parseInt(g('quantity')) || 1,
    resinType: document.getElementById('field-resinType')?.value || 'Standard Grey',
    deadline: g('deadline'),
    notes: g('notes')
  };

  if (!order.modelName) { alert('Model name is required.'); return; }
  if (!order.footprintW || !order.footprintD) { alert('Footprint dimensions are required.'); return; }

  if (editingOrderId) {
    const idx = orders.findIndex(o => o.id === editingOrderId);
    if (idx !== -1) orders[idx] = order;
  } else {
    orders.push(order);
  }

  saveOrders(orders);
  saveToFile().then(updateFileStatus);
  closeOrderModal();
  renderOrdersTable();
}

function editOrder(id) { openOrderModal(id); }

function deleteOrder(id) {
  if (!confirm('Delete this order?')) return;
  orders = orders.filter(o => o.id !== id);
  saveOrders(orders);
  saveToFile().then(updateFileStatus);
  renderOrdersTable();
}

function importOrdersCSV(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.split('\n').slice(1); // skip header
    let added = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
      const order = {
        id: `ord_${Date.now()}_${added}`,
        orderId: cols[0] || '',
        customer: cols[1] || '',
        modelName: cols[2] || '',
        footprintW: parseFloat(cols[3]) || 0,
        footprintD: parseFloat(cols[4]) || 0,
        height: parseFloat(cols[5]) || 0,
        quantity: parseInt(cols[6]) || 1,
        resinType: cols[7] || 'Standard Grey',
        deadline: cols[8] || '',
        notes: cols[9] || ''
      };
      if (order.modelName) { orders.push(order); added++; }
    }
    saveOrders(orders);
    renderOrdersTable();
    alert(`Imported ${added} orders.`);
  };
  reader.readAsText(file);
}

// ── Queue Tab ───────────────────────────────────────────────────────────────
function renderQueue() {
  const container = document.getElementById('queue-container');
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = '<div class="empty-state">No orders to schedule. Add orders first.</div>';
    return;
  }

  currentBatches = generateQueue(orders, settings);

  if (currentBatches.length === 0) {
    container.innerHTML = '<div class="empty-state">Could not generate queue. Check order dimensions.</div>';
    return;
  }

  const urgencyLabel = { ok: 'On Track', warning: 'Due Soon', urgent: 'Urgent', overdue: 'Overdue', none: '' };

  container.innerHTML = currentBatches.map((batch, i) => {
    const printerName = batch.printer ? batch.printer.name : 'NO PRINTER';
    const utilPct = Math.round((batch.utilization || 0) * 100);
    const modelCounts = {};
    for (const item of batch.items) {
      modelCounts[item.label] = (modelCounts[item.label] || 0) + 1;
    }
    const modelList = Object.entries(modelCounts)
      .map(([label, qty]) => `<span class="model-tag">${esc(label)} ×${qty}</span>`)
      .join('');

    return `
      <div class="batch-card urgency-${batch.urgency || 'none'}">
        <div class="batch-header">
          <span class="batch-id">${batch.batchId}</span>
          <span class="printer-tag">${esc(printerName)}</span>
          <span class="resin-badge">${esc(batch.resinType)}</span>
          ${batch.urgency && batch.urgency !== 'none' ? `<span class="urgency-tag ${batch.urgency}">${urgencyLabel[batch.urgency]}</span>` : ''}
        </div>
        <div class="batch-models">${modelList}</div>
        <div class="batch-meta">
          <span>Plate utilization: <strong>${utilPct}%</strong></span>
          ${batch.earliestDeadline ? `<span>Deadline: <strong>${formatDate(batch.earliestDeadline)}</strong></span>` : ''}
          ${batch.daysLeft !== undefined ? `<span>${batch.daysLeft < 0 ? Math.abs(batch.daysLeft) + ' days overdue' : batch.daysLeft + ' days left'}</span>` : ''}
          ${batch.printer ? `<span>Plate: ${batch.printer.plateW}×${batch.printer.plateD}mm</span>` : ''}
        </div>
        ${batch.warning ? `<div class="batch-warning">${batch.warning}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
function initSettingsTab() {
  const g = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  g('s-electricity', settings.electricityRate);
  g('s-labor-rate', settings.laborRate);
  g('s-risk', settings.failedPrintRisk);
  g('s-margin', settings.profitMargin);
  g('s-ipa-price', settings.ipaPrice);
  g('s-ipa-per-print', settings.ipaPerPrint);
  g('s-fep-cost', settings.fepCost);
  g('s-fep-lifespan', settings.fepLifespan);

  // Resin prices
  const container = document.getElementById('resin-prices-container');
  if (container) {
    container.innerHTML = Object.entries(settings.resinPrices).map(([rt, price]) => `
      <div class="setting-row">
        <label>${esc(rt)}</label>
        <div class="input-with-unit">
          <input type="number" min="0" step="0.5" id="rp-${slugify(rt)}" value="${price}">
          <span class="unit">€/L</span>
        </div>
      </div>
    `).join('');
  }

  // Printer depreciation
  PRINTERS.forEach(p => {
    const dep = settings.printerDepreciation[p.id] || {};
    g(`dep-price-${p.id}`, dep.purchasePrice || 0);
    g(`dep-life-${p.id}`, dep.lifespanYears || 5);
  });
}

function saveSettingsForm() {
  const g = id => parseFloat(document.getElementById(id)?.value) || 0;
  settings.electricityRate = g('s-electricity');
  settings.laborRate = g('s-labor-rate');
  settings.failedPrintRisk = g('s-risk');
  settings.profitMargin = g('s-margin');
  settings.ipaPrice = g('s-ipa-price');
  settings.ipaPerPrint = g('s-ipa-per-print');
  settings.fepCost = g('s-fep-cost');
  settings.fepLifespan = g('s-fep-lifespan');

  Object.keys(settings.resinPrices).forEach(rt => {
    const el = document.getElementById(`rp-${slugify(rt)}`);
    if (el) settings.resinPrices[rt] = parseFloat(el.value) || 0;
  });

  PRINTERS.forEach(p => {
    settings.printerDepreciation[p.id] = {
      purchasePrice: g(`dep-price-${p.id}`),
      lifespanYears: g(`dep-life-${p.id}`)
    };
  });

  saveSettings(settings);
  saveToFile().then(updateFileStatus);
  showToast('Settings saved.');
}

// ── Utilities ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
    el.innerHTML = `<span class="file-dot connected"></span> Auto-saving to <strong>${getFileName()}</strong>`;
    el.className = 'file-status connected';
  } else {
    el.innerHTML = `<span class="file-dot"></span> Browser only &mdash; data won't move to another PC`;
    el.className = 'file-status disconnected';
  }
}

async function handleConnectNew() {
  const ok = await connectNewDataFile();
  if (ok) { updateFileStatus(); showToast('Data file connected. Auto-save enabled.'); }
}

async function handleOpenExisting() {
  const ok = await openExistingDataFile();
  if (ok) {
    orders = loadOrders();
    settings = loadSettings();
    updateFileStatus();
    renderOrdersTable();
    showToast('Data loaded from file.');
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateFileStatus();
  showTab('calculator');
});
