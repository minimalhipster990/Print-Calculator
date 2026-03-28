// Tiny Legions — Production Helper
// Copyright (c) 2026 minimalhipster990. All rights reserved.

const PRINTERS = [
  // ── Andrea's printers ────────────────────────────────────────────────────
  { id: 'mini8k',         name: 'Phrozen Sonic Mini 8K',           plateW: 165,    plateD: 72,    plateZ: 180, wattage: 48  },
  { id: 'athena2',        name: 'Concepts3D Athena II',             plateW: 212,    plateD: 118,   plateZ: 235, wattage: 350 },
  { id: 'gk3pro',         name: 'Uniformation GK3 Pro',             plateW: 222,    plateD: 130,   plateZ: 240, wattage: 120 },
  // ── Elegoo ───────────────────────────────────────────────────────────────
  { id: 'c_mars2pro',     name: 'Elegoo Mars 2 Pro',                plateW: 150,    plateD: 95.6,  plateZ: 160, wattage: 36  },
  { id: 'c_mars3pro',     name: 'Elegoo Mars 3 Pro',                plateW: 150,    plateD: 95.6,  plateZ: 175, wattage: 36  },
  { id: 'c_mars4ultra',   name: 'Elegoo Mars 4 Ultra',              plateW: 160,    plateD: 95.6,  plateZ: 165, wattage: 72  },
  { id: 'c_mars5ultra',   name: 'Elegoo Mars 5 Ultra',              plateW: 160,    plateD: 95.6,  plateZ: 165, wattage: 72  },
  { id: 'c_saturn3ultra', name: 'Elegoo Saturn 3 Ultra',            plateW: 218.88, plateD: 122.88,plateZ: 260, wattage: 180 },
  { id: 'c_saturn4ultra', name: 'Elegoo Saturn 4 Ultra',            plateW: 218,    plateD: 122,   plateZ: 220, wattage: 144 },
  { id: 'c_jupiterse',    name: 'Elegoo Jupiter SE',                plateW: 287,    plateD: 166,   plateZ: 300, wattage: 200 },
  // ── Anycubic ─────────────────────────────────────────────────────────────
  { id: 'c_mono4',        name: 'Anycubic Photon Mono 4',           plateW: 153.4,  plateD: 87,    plateZ: 165, wattage: 54  },
  { id: 'c_mono4ultra',   name: 'Anycubic Photon Mono 4 Ultra',     plateW: 153.4,  plateD: 87,    plateZ: 165, wattage: 66  },
  { id: 'c_monox6ks',     name: 'Anycubic Photon Mono X 6Ks',       plateW: 195.84, plateD: 122.4, plateZ: 200, wattage: 120 },
  { id: 'c_m5s',          name: 'Anycubic Photon Mono M5s',         plateW: 223,    plateD: 126,   plateZ: 200, wattage: 120 },
  { id: 'c_m7',           name: 'Anycubic Photon Mono M7',          plateW: 223,    plateD: 126,   plateZ: 230, wattage: 120 },
  { id: 'c_m7pro',        name: 'Anycubic Photon Mono M7 Pro',      plateW: 223,    plateD: 126,   plateZ: 230, wattage: 240 },
  // ── Phrozen ──────────────────────────────────────────────────────────────
  { id: 'c_sonicmini4k',  name: 'Phrozen Sonic Mini 4K',            plateW: 134,    plateD: 75,    plateZ: 130, wattage: 40  },
  { id: 'c_sonicxl4k',    name: 'Phrozen Sonic XL 4K',              plateW: 200,    plateD: 125,   plateZ: 200, wattage: 180 },
  { id: 'c_sonicmega8k',  name: 'Phrozen Sonic Mega 8K',            plateW: 330,    plateD: 185,   plateZ: 400, wattage: 240 },
  // ── Creality ─────────────────────────────────────────────────────────────
  { id: 'c_halotmagepro', name: 'Creality Halot-Mage Pro',          plateW: 228,    plateD: 128,   plateZ: 230, wattage: 150 },
  { id: 'c_halotoneplus', name: 'Creality HALOT-ONE Plus',           plateW: 172,    plateD: 102,   plateZ: 160, wattage: 100 },
  // ── Other ────────────────────────────────────────────────────────────────
  { id: 'c_form3',        name: 'Formlabs Form 3',                  plateW: 145,    plateD: 145,   plateZ: 185, wattage: 65  },
  { id: 'c_proxima6',     name: 'Voxelab Proxima 6',                plateW: 140,    plateD: 89,    plateZ: 160, wattage: 60  }
];

// Preference order for print queue optimizer: cheapest-to-run first (sorted by wattage)
const PRINTER_PREFERENCE_ORDER = PRINTERS
  .slice()
  .sort((a, b) => a.wattage - b.wattage)
  .map(p => p.id);

function getPrinterById(id) {
  return PRINTERS.find(p => p.id === id);
}

function getAllPrinters(settings) {
  const custom = (settings && settings.customPrinters) ? settings.customPrinters : [];
  return [...PRINTERS, ...custom];
}

function getPrinterByIdAll(id, settings) {
  return getAllPrinters(settings).find(p => p.id === id);
}
