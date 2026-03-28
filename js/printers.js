const PRINTERS = [
  {
    id: 'mini8k',
    name: 'Phrozen Sonic Mini 8K',
    plateW: 165,
    plateD: 72,
    plateZ: 180,
    wattage: 48,
    purchasePrice: 0,
    lifespanYears: 5
  },
  {
    id: 'athena2',
    name: 'Concepts3D Athena II',
    plateW: 212,
    plateD: 118,
    plateZ: 235,
    wattage: 350,
    purchasePrice: 0,
    lifespanYears: 5
  },
  {
    id: 'gk3pro',
    name: 'Uniformation GK3 Pro',
    plateW: 222,
    plateD: 130,
    plateZ: 240,
    wattage: 120,
    purchasePrice: 0,
    lifespanYears: 5
  }
];

// Sorted cheapest-to-run first (preference order for printer recommendation)
const PRINTER_PREFERENCE_ORDER = ['mini8k', 'gk3pro', 'athena2'];

function getPrinterById(id) {
  return PRINTERS.find(p => p.id === id);
}
