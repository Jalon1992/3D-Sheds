// First-run seed: sample styles, sizes, colors and options so the configurator works out of the box.
// Everything here is editable (or deletable) from the admin dashboard.
import { db, get, run, setSettings, getSettings } from './db.js';
import { DEFAULT_ROOFING } from '../public/js/shared/pricing.js';
import { hashPassword } from './auth.js';

export function seed() {
  // Admin user
  if (!get('SELECT id FROM users LIMIT 1')) {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const pw = process.env.ADMIN_PASSWORD || 'changeme123';
    run('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', email.toLowerCase(), 'Admin', hashPassword(pw));
    console.log(`\n  Admin login created → ${email} / ${process.env.ADMIN_PASSWORD ? '(from ADMIN_PASSWORD)' : pw}`);
    if (!process.env.ADMIN_PASSWORD) console.log('  ⚠  Change this password in Admin → Account right away.\n');
  }

  if (getSettings().company_name === undefined) {
    setSettings({
      company_name: 'Your Shed Co.', headline: 'Design your shed in 3D', logo_url: '', brand_color: '#2f6b4f',
      currency_symbol: '$', tax_rate: 0, tax_delivery: false, delivery_fee: 0, show_prices: true, require_phone: true,
      phone: '', website: '', privacy_url: '',
      success_message: 'Thanks! Your quote is on its way. A member of our team will reach out shortly.',
      consent_text: 'I agree to receive calls and text messages about my quote. Msg & data rates may apply. Reply STOP to opt out.',
      ghl_enabled: false, ghl_token: '', ghl_location_id: '', ghl_pipeline_id: '', ghl_stage_id: '',
      ghl_tags: 'shed-quote, 3d-builder', ghl_source: '3D Shed Builder', ghl_inbound_webhook_url: '',
      ghl_add_note: true, ghl_send_updates: false, ghl_custom_fields: {}, public_url: '',
    });
  }
  if (getSettings().roofing === undefined) setSettings({ roofing: DEFAULT_ROOFING });
  if (getSettings().price_tiers === undefined) setSettings({
    pricing_mode: 'none', default_tier: 1,
    price_tiers: [
      { id: 1, name: 'Standard', adjust_pct: 0, overrides: {} },
      { id: 2, name: 'Tier 2', adjust_pct: 5, overrides: {} },
      { id: 3, name: 'Tier 3', adjust_pct: 10, overrides: {} },
      { id: 4, name: 'Tier 4', adjust_pct: 15, overrides: {} },
    ],
    dealers: [
      { id: 'lot1', name: 'Sample Lot – Main Street', address: '100 Main St', city: 'Example City', state: 'TN', zip: '38301', phone: '', email: '', tier: 1 },
      { id: 'lot2', name: 'Sample Lot – Highway 45', address: '2000 Hwy 45', city: 'Sample Town', state: 'TN', zip: '38330', phone: '', email: '', tier: 2 },
    ],
    zip_tiers: [],
  });
  if (getSettings().color_groups === undefined) setSettings({ color_groups: { siding: true, trim: true, roof: true, door: true, window: true } });
  if (getSettings().downgrade_credit === undefined) setSettings({ downgrade_credit: true, remove_credit: true });

  if (get('SELECT id FROM styles LIMIT 1')) return;

  const ins = (table, obj) => {
    const keys = Object.keys(obj);
    const vals = keys.map(k => (obj[k] !== null && typeof obj[k] === 'object') ? JSON.stringify(obj[k]) : obj[k]);
    return Number(run(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...vals).lastInsertRowid);
  };

  // ---- Colors
  const C = {};
  const colors = [
    ['siding', 'Barn Red', '#8c2d22'], ['siding', 'Clay', '#c2b49a'], ['siding', 'Charcoal', '#3d4043'],
    ['siding', 'Arctic White', '#eeeee8'], ['siding', 'Sage', '#8a9a7b'], ['siding', 'Navy', '#2b3a55'],
    ['siding', 'Pewter', '#8d9290'], ['siding', 'Natural Cedar', '#b07a4f', 150],
    ['trim', 'White', '#f4f4ef'], ['trim', 'Black', '#1e1f20'], ['trim', 'Clay', '#c2b49a'], ['trim', 'Charcoal', '#3d4043'],
    ['roof', 'Charcoal', '#3a3c3e', 0, 'shingle'], ['roof', 'Weathered Wood', '#6b5f53', 0, 'shingle'], ['roof', 'Onyx Black', '#202122', 0, 'shingle'],
    ['roof', 'Driftwood', '#7d7466', 0, 'shingle'], ['roof', 'Hunter Green', '#33463a', 0, 'shingle'],
    ['roof', 'Galvalume', '#b9bec0', 0, 'metal'], ['roof', 'Black', '#1f2022', 0, 'metal'], ['roof', 'Charcoal Gray', '#45484b', 0, 'metal'],
    ['roof', 'Burnished Slate', '#4a3f35', 0, 'metal'], ['roof', 'Barn Red', '#7a2620', 0, 'metal'], ['roof', 'Forest Green', '#2f4a36', 0, 'metal'],
    ['roof', 'Ocean Blue', '#2c4a63', 0, 'metal'], ['roof', 'Polar White', '#eceeea', 0, 'metal'],
    ['window', 'White', '#f6f6f2'], ['window', 'Match Trim', '#f4f4ef'], ['window', 'Black', '#1e1f20'],
    ['window', 'Bronze', '#4a3b2c'], ['window', 'Almond', '#d9cdb4'],
    ['door', 'Match Trim', '#f4f4ef'], ['door', 'Black', '#1e1f20'], ['door', 'Barn Red', '#8c2d22'], ['door', 'Natural Wood', '#9a6a40', 95],
  ];
  colors.forEach(([category, name, hex, price, material], i) => { C[name + ':' + category] = ins('colors', { category, name, hex, price: price || 0, material: material || null, sort: i }); });

  // ---- Options
  const O = {};
  const opt = (key, o) => { O[key] = ins('options', o); };
  let s = 0;
  opt('door36', { name: '36" Single Door', category: 'doors', kind: 'door_single', placement: 'opening', swap_group: 'door', width: 3, height: 6.67, price: 275, sort: s++, description: 'Pre-hung wood door with lock set.' });
  opt('door9lite', { name: '9-Lite Glass Door', category: 'doors', kind: 'door_glass', placement: 'opening', swap_group: 'door', width: 3, height: 6.67, price: 595, sort: s++, description: 'Residential steel door with 9-lite glass.' });
  opt('dbl4', { name: "4' Double Doors", category: 'doors', kind: 'door_double', placement: 'opening', swap_group: 'door', width: 4, height: 6.33, price: 425, sort: s++ });
  opt('dbl6', { name: "6' Double Doors", category: 'doors', kind: 'door_double', placement: 'opening', swap_group: 'door', width: 6, height: 6.33, price: 625, sort: s++ });
  opt('french', { name: 'French Doors (5\')', category: 'doors', kind: 'door_french', placement: 'opening', swap_group: 'door', width: 5, height: 6.67, price: 1150, sort: s++ });
  opt('roll6', { name: "6' x 6' Roll-Up Door", category: 'doors', kind: 'door_rollup', placement: 'opening', swap_group: 'door', width: 6, height: 6, price: 895, sort: s++ });
  opt('roll8', { name: "8' x 7' Roll-Up Door", category: 'doors', kind: 'door_rollup', placement: 'opening', swap_group: 'door', width: 8, height: 7, price: 1295, sort: s++ });
  s = 0;
  opt('win23', { name: '2\' x 3\' Window', category: 'windows', kind: 'window', placement: 'opening', swap_group: 'window', width: 2, height: 3, elevation: 3.5, price: 155, sort: s++ });
  opt('win33', { name: '3\' x 3\' Window', category: 'windows', kind: 'window', placement: 'opening', swap_group: 'window', width: 3, height: 3, elevation: 3.5, price: 195, sort: s++ });
  opt('winsh', { name: 'Window w/ Shutters', category: 'windows', kind: 'window_shutters', placement: 'opening', swap_group: 'window', width: 2, height: 3, elevation: 3.5, price: 235, sort: s++ });
  opt('transom', { name: 'Transom Window', category: 'windows', kind: 'window_transom', placement: 'opening', swap_group: 'window', width: 3, height: 1.25, elevation: 5.5, price: 175, sort: s++ });
  opt('vent', { name: 'Gable Vent', category: 'exterior', kind: 'vent', placement: 'opening', swap_group: 'vent', width: 1.5, height: 1, elevation: -1, price: 45, sort: 0, description: 'Auto-placed high in the gable.' });
  opt('flower', { name: 'Flower Box', category: 'exterior', kind: 'flowerbox', placement: 'wall_exterior', width: 2.5, height: 0.7, depth: 0.75, elevation: 2.7, price: 95, sort: 1 });
  opt('ramp', { name: 'Wood Ramp', category: 'exterior', kind: 'ramp', placement: 'ground', width: 4, height: 0.7, depth: 3.5, price: 295, sort: 2 });
  opt('cupola', { name: 'Cupola', category: 'exterior', kind: 'cupola', placement: 'roof', width: 2, height: 2.5, depth: 2, price: 349, sort: 3 });
  opt('extlight', { name: 'Exterior Barn Light', category: 'electrical', kind: 'ext_light', placement: 'wall_exterior', width: 0.8, height: 1, depth: 1, elevation: 6.9, price: 125, sort: 4 });
  s = 0;
  opt('shelf', { name: "6' Shelf (16\" deep)", category: 'interior', kind: 'shelf', placement: 'wall_interior', width: 6, height: 0.1, depth: 1.33, elevation: 4.5, price: 110, sort: s++ });
  opt('bench', { name: "6' Workbench", category: 'interior', kind: 'workbench', placement: 'wall_interior', width: 6, height: 3, depth: 2, elevation: 0, price: 295, sort: s++ });
  opt('loft', { name: "Storage Loft (4' deep)", category: 'interior', kind: 'loft', placement: 'loft', width: 0, height: 0.3, depth: 4, price: 32, price_unit: 'per_ft_wall', max_qty: 2, sort: s++, description: 'Runs the full length of the wall it sits on. Priced per linear foot.' });
  s = 0;
  opt('elec', { name: 'Electrical Package', category: 'electrical', kind: 'none', placement: 'none', price: 1150, sort: s++, max_qty: 1, description: '60A sub-panel, 2 outlets, 1 switch, 2 LED lights. Hook-up to house not included.' });
  opt('led', { name: 'LED Shop Light', category: 'electrical', kind: 'light', placement: 'ceiling', width: 4, height: 0.2, depth: 0.5, price: 85, sort: s++ });
  opt('outlet', { name: 'Duplex Outlet', category: 'electrical', kind: 'outlet', placement: 'wall_interior', width: 0.3, height: 0.45, depth: 0.1, elevation: 1.5, price: 65, sort: s++ });
  s = 0;
  opt('insul', { name: 'Insulation Package', category: 'upgrades', kind: 'none', placement: 'none', price: 3.5, price_unit: 'per_sqft', max_qty: 1, sort: s++, description: 'R-13 walls, R-19 roof.' });
  opt('radiant', { name: 'Radiant Barrier Roof', category: 'upgrades', kind: 'none', placement: 'none', price: 1.25, price_unit: 'per_sqft', max_qty: 1, sort: s++ });
  opt('floor', { name: '3/4" Floor Upgrade', category: 'upgrades', kind: 'none', placement: 'none', price: 0.85, price_unit: 'per_sqft', max_qty: 1, sort: s++ });
  opt('anchor', { name: 'Anchor Kit', category: 'upgrades', kind: 'none', placement: 'none', price: 175, max_qty: 1, sort: s++ });

  // ---- Styles + sizes
  const style = (st, sizes, perSqft, baseAdd) => {
    const id = ins('styles', st);
    sizes.forEach(([w, d], i) => ins('sizes', { style_id: id, width: w, depth: d, price: Math.round((w * d * perSqft + baseAdd) / 5) * 5, sort: i }));
  };
  style({
    name: 'Classic Gable', description: 'Timeless A-frame in LP SmartSide. Door on the gable end.', roof_type: 'gable', ridge_axis: 'depth',
    wall_height: 7, roof_pitch: 6, overhang: 0.75, gable_overhang: 0.5, siding_type: 'lp_smartside', roof_material: 'shingle', sort: 0,
    default_colors: { siding: C['Clay:siding'], trim: C['White:trim'], roof: C['Charcoal:roof'], door: C['Match Trim:door'] },
    standard_options: [{ option_id: O.door36, wall: 'front', offset: 0 }, { option_id: O.win23, wall: 'left', offset: 0 }, { option_id: O.win23, wall: 'right', offset: 0 }, { option_id: O.vent, wall: 'back', offset: 0 }],
  }, [[8, 8], [8, 10], [8, 12], [10, 12], [10, 14], [10, 16], [12, 16], [12, 20]], 34, 1400);
  style({
    name: 'Lofted Barn', description: 'Gambrel roof with extra headroom and a built-in loft.', roof_type: 'barn', ridge_axis: 'width',
    wall_height: 7, roof_pitch: 5, roof_pitch_lower: 18, gambrel_lower_len: 3.25, overhang: 0.6, siding_type: 'lp_smartside', roof_material: 'shingle', sort: 1,
    default_colors: { siding: C['Barn Red:siding'], trim: C['White:trim'], roof: C['Weathered Wood:roof'], door: C['Match Trim:door'] },
    standard_options: [{ option_id: O.dbl4, wall: 'front', offset: 0 }, { option_id: O.win23, wall: 'front', offset: -3.6 }, { option_id: O.win23, wall: 'front', offset: 3.6 }, { option_id: O.loft, wall: 'left', offset: 0 }],
  }, [[12, 10], [14, 10], [16, 10], [12, 12], [16, 12], [20, 12], [24, 12]], 40, 1600);
  style({
    name: 'Modern Lean-To', description: 'Single-slope studio look with a metal roof.', roof_type: 'lean_to', ridge_axis: 'width',
    wall_height: 7.5, roof_pitch: 2.5, overhang: 1, siding_type: 'lp_smartside', roof_material: 'metal', gable_overhang: 0.5, sort: 2,
    default_colors: { siding: C['Charcoal:siding'], trim: C['Black:trim'], roof: C['Black:roof'], door: C['Natural Wood:door'] },
    standard_options: [{ option_id: O.door9lite, wall: 'front', offset: -2 }, { option_id: O.transom, wall: 'front', offset: 1.75 }],
  }, [[10, 8], [12, 8], [10, 10], [12, 10], [14, 10], [16, 12]], 48, 1800);
  style({
    name: 'Garage', description: 'Tall walls and a roll-up door for mowers, ATVs and workshops.', roof_type: 'gable', ridge_axis: 'depth',
    wall_height: 8, roof_pitch: 5, overhang: 0.75, roof_edge: 'board_drip', siding_type: 'lp_smartside', roof_material: 'metal', sort: 3,
    default_colors: { siding: C['Pewter:siding'], trim: C['White:trim'], roof: C['Galvalume:roof'], door: C['Match Trim:door'] },
    standard_options: [{ option_id: O.roll8, wall: 'front', offset: 0 }, { option_id: O.door36, wall: 'right', offset: 2 }, { option_id: O.win23, wall: 'left', offset: 0 }],
  }, [[10, 12], [10, 16], [12, 16], [12, 20], [12, 24], [14, 24]], 42, 2400);

  console.log('  Seeded sample catalog (styles, sizes, colors, options).');
}
