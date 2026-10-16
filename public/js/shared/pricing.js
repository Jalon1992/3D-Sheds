// Shared pricing + configuration helpers. Used by the browser AND the server
// (the server re-prices every quote with this same code, so prices can't be tampered with).

import { shedGeometry, roofArea, WALLS, wallLength } from './geometry.js';
export { WALLS, wallLength };

/** Roofing materials. Admin can rename/re-price these in Settings → Roofing. */
export const DEFAULT_ROOFING = [
  { key: 'shingle', name: 'Architectural Shingles', description: '30-year dimensional asphalt shingles.', price: 0, price_unit: 'per_roof_sqft', active: true },
  { key: 'metal', name: 'Ag Panel Metal', description: '29-ga ribbed steel panels, 40-year paint.', price: 0.85, price_unit: 'per_roof_sqft', active: true },
];
// ---------------------------------------------------------------------------
// Price tiers (up to 4). Pricing mode decides how a customer's tier is chosen:
//   none   – everyone gets the default tier
//   dealer – the tier of the dealer lot the customer picks
//   zip    – the tier assigned to the customer's ZIP (exact, range "38300-38399" or prefix "383")
// A tier = { id, name, adjust_pct, delivery_fee?, overrides: { 'size:12': 3999, 'option:5': 300,
//           'color:8': 150, 'roofing:metal': 0.95 } }. Overrides win; anything else gets adjust_pct.
// ---------------------------------------------------------------------------
export const MAX_TIERS = 4;
export function findDealer(catalog, id) {
  return (catalog.settings?.dealers || []).find(d => String(d.id) === String(id)) || null;
}
export function zipTierId(entries, zip) {
  if (!/^\d{5}$/.test(String(zip || ''))) return null;
  const z = String(zip); let best = null, bestLen = -1;
  for (const e of entries || []) {
    const m = String(e.match || '').trim();
    if (m === z) return e.tier;
    const r = m.match(/^(\d{5})\s*-\s*(\d{5})$/);
    if (r && z >= r[1] && z <= r[2] && bestLen < 5) { best = e.tier; bestLen = 4.5; }
    else if (/^\d{1,4}$/.test(m) && z.startsWith(m) && m.length > bestLen) { best = e.tier; bestLen = m.length; }
  }
  return best;
}
export function resolveTier(catalog, config = {}) {
  const st = catalog.settings || {};
  const tiers = Array.isArray(st.price_tiers) ? st.price_tiers : [];
  if (!tiers.length) return null;
  let id = null, dealer = null;
  if (st.pricing_mode === 'dealer') { dealer = findDealer(catalog, config.dealer_id); id = dealer?.tier ?? null; }
  else if (st.pricing_mode === 'zip') id = zipTierId(st.zip_tiers, config.zip);
  const tier = tiers.find(t => String(t.id) === String(id ?? st.default_tier ?? 1)) || tiers[0];
  return { ...tier, dealer };
}
const r2 = n => Math.round(n * 100) / 100;
/** A copy of the catalog with every price set for one tier. */
export function tierCatalog(catalog, tier) {
  if (!tier) return { ...catalog, _tiered: true, _tier: null };
  const pct = 1 + (Number(tier.adjust_pct) || 0) / 100, ov = tier.overrides || {};
  const has = k => ov[k] !== undefined && ov[k] !== null && ov[k] !== '';
  const adj = (base, key, whole) => has(key) ? Number(ov[key]) : (pct === 1 ? base : (whole ? Math.round((Number(base) || 0) * pct) : r2((Number(base) || 0) * pct)));
  const styles = catalog.styles.map(s => ({ ...s, sizes: s.sizes.map(z => ({ ...z, price: adj(z.price, 'size:' + z.id, true) })) }));
  const options = catalog.options.map(o => ({ ...o, price: adj(o.price, 'option:' + o.id, !o.price_unit || o.price_unit === 'each') }));
  const colors = catalog.colors.map(c => ({ ...c, price: adj(c.price, 'color:' + c.id, true) }));
  const settings = { ...catalog.settings, roofing: roofingList(catalog).map(r => ({ ...r, price: adj(r.price, 'roofing:' + r.key, r.price_unit === 'each') })) };
  if (tier.delivery_fee !== undefined && tier.delivery_fee !== null && tier.delivery_fee !== '') settings.delivery_fee = Number(tier.delivery_fee);
  return { ...catalog, styles, options, colors, settings, _tiered: true, _tier: tier };
}

/** Color groups customers can pick from (each can be switched off in Settings). */
export const COLOR_GROUPS = [['siding', 'Siding'], ['trim', 'Trim'], ['roof', 'Roof'], ['door', 'Doors'], ['window', 'Windows']];
export function colorGroupEnabled(catalog, key) {
  const g = catalog.settings?.color_groups;
  return !(g && g[key] === false);
}

export function roofingList(catalog) {
  const r = catalog.settings?.roofing;
  return Array.isArray(r) && r.length ? r : DEFAULT_ROOFING;
}
/** Roofing materials a style allows (in admin order). */
export function roofChoices(catalog, style) {
  const all = roofingList(catalog).filter(r => r.active !== false && r.active !== 0);
  const allowed = Array.isArray(style.roof_choices) && style.roof_choices.length ? style.roof_choices : all.map(r => r.key);
  const list = all.filter(r => allowed.includes(r.key));
  return list.length ? list : all.filter(r => r.key === style.roof_material);
}
export function roofMaterialPrice(mat, style, size) {
  if (!mat) return 0;
  const p = Number(mat.price) || 0;
  switch (mat.price_unit) {
    case 'per_roof_sqft': return p * roofArea(shedGeometry(style, size));
    case 'per_sqft': return p * size.width * size.depth;
    default: return p;
  }
}
/** Roof colors that work with a roofing material (colors with no material set work with all). */
export function roofColorsFor(catalog, matKey) {
  return catalog.colors.filter(c => c.category === 'roof' && c.active !== 0 && (!c.material || c.material === matKey));
}

export function money(n, symbol = '$') {
  const raw = Math.round((Number(n) || 0) * 100) / 100;
  const v = Math.abs(raw);
  return (raw < 0 ? '−' : '') + symbol + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** Price of one option for a given shed size, before standard-option credit. */
export function optionPrice(opt, size, qty = 1, wall = null) {
  const p = Number(opt.price) || 0;
  switch (opt.price_unit) {
    case 'per_ft_wall': return p * (wall && wall !== 'ceiling' && wall !== 'roof' ? wallLength(wall, size) : size.width) * qty;
    case 'per_ft_width': return p * size.width * qty;
    case 'per_ft_depth': return p * size.depth * qty;
    case 'per_sqft': return p * size.width * size.depth * qty;
    case 'per_ft_perimeter': return p * 2 * (size.width + size.depth) * qty;
    default: return p * qty;
  }
}

/** Build the default configuration for a style + size (standard options pre-placed). */
export function defaultConfig(catalog, styleId, sizeId) {
  const style = catalog.styles.find(s => s.id === styleId) || catalog.styles[0];
  const size = (style.sizes.find(s => s.id === sizeId)) || style.sizes[0];
  const firstColor = cat => (catalog.colors.find(c => c.category === cat && c.active !== 0) || {}).id || null;
  const d = style.default_colors || {};
  const items = (style.standard_options || []).map((s, i) => ({
    uid: 'std' + i,
    option_id: s.option_id,
    wall: s.wall || null,
    offset: Number(s.offset) || 0,
    ...(Number(s.w) > 0 ? { w: Number(s.w) } : {}),
    ...(Number(s.h) > 0 ? { h: Number(s.h) } : {}),
    standard_of: s.option_id,
  }));
  const choices = roofChoices(catalog, style);
  const roof_material = (choices.find(r => r.key === style.roof_material) || choices[0] || {}).key || 'shingle';
  const roofCols = roofColorsFor(catalog, roof_material);
  return {
    style_id: style.id,
    size_id: size ? size.id : null,
    roof_material,
    colors: {
      siding: d.siding || firstColor('siding'),
      trim: d.trim || firstColor('trim'),
      roof: roofCols.find(c => c.id === d.roof)?.id || roofCols[0]?.id || d.roof || firstColor('roof'),
      door: d.door || firstColor('door'),
      window: d.window || firstColor('window'),
    },
    items,
  };
}

/**
 * Compute line items + totals for a configuration.
 * Standard options are included in the base price. Swapping a standard option for another
 * charges only the difference (never a credit). Removing a standard option gives no credit.
 */
export function priceConfig(catalog, config) {
  if (!catalog._tiered) catalog = tierCatalog(catalog, resolveTier(catalog, config));
  const tier = catalog._tier;
  const settings = catalog.settings || {};
  const style = catalog.styles.find(s => s.id === config.style_id);
  if (!style) throw new Error('Unknown style');
  const size = style.sizes.find(s => s.id === config.size_id);
  if (!size) throw new Error('Unknown size for this style');
  const optById = Object.fromEntries(catalog.options.map(o => [o.id, o]));
  const colorById = Object.fromEntries(catalog.colors.map(c => [c.id, c]));
  const lines = [];
  // Pricing rules (Admin → Settings → Pricing)
  const credits = settings.downgrade_credit !== false;   // swapping a standard item for a cheaper one lowers the price
  const removeCredit = settings.remove_credit !== false; // removing a standard item credits its price

  lines.push({ type: 'base', label: `${style.name} ${size.width}' x ${size.depth}'`, amount: Number(size.price) || 0 });

  // Roofing: the style's default material is included; other materials charge the difference.
  const roofing = roofingList(catalog);
  const mat = roofing.find(r => r.key === config.roof_material) || roofing.find(r => r.key === style.roof_material);
  if (mat) {
    const std = roofing.find(r => r.key === style.roof_material);
    const isStd = !std || std.key === mat.key;
    let amt = isStd ? 0 : roofMaterialPrice(mat, style, size) - roofMaterialPrice(std, style, size);
    if (!credits) amt = Math.max(0, amt);
    lines.push({ type: 'roof', label: `Roofing: ${mat.name}`, amount: Math.round(amt), roof_material: mat.key,
      note: isStd ? 'Standard' : `${amt < 0 ? 'Change' : 'Upgrade'} from ${std.name}` });
  }

  for (const [cat, id] of Object.entries(config.colors || {})) {
    const c = colorById[id];
    if (!c) continue;
    const amt = Number(c.price) || 0;
    lines.push({ type: 'color', category: cat, label: `${cap(cat)} color: ${c.name}`, amount: amt, color_id: c.id });
  }

  for (const it of config.items || []) {
    const o = optById[it.option_id];
    if (!o) continue;
    let amt = optionPrice(o, size, it.qty || 1, it.wall);
    let note = '';
    if (it.standard_of) {
      if (it.standard_of === it.option_id) { amt = 0; note = 'Standard'; }
      else {
        const orig = optById[it.standard_of];
        const credit = orig ? optionPrice(orig, size, 1, it.wall) : 0;
        amt = amt - credit;
        if (!credits) amt = Math.max(0, amt);
        note = orig ? `${amt < 0 ? 'Change' : 'Upgrade'} from ${orig.name}` : 'Upgrade';
      }
    }
    lines.push({
      type: 'option', label: o.name, amount: round2(amt), option_id: o.id, uid: it.uid,
      category: o.category, wall: it.wall || null, note,
    });
  }

  if (removeCredit) {
    const want = {}, have = {};
    for (const so of style.standard_options || []) want[so.option_id] = (want[so.option_id] || 0) + 1;
    for (const it of config.items || []) if (it.standard_of) have[it.standard_of] = (have[it.standard_of] || 0) + 1;
    for (const [id, n] of Object.entries(want)) {
      const o = optById[id]; const missing = n - (have[id] || 0);
      for (let k = 0; k < missing && o; k++) lines.push({ type: 'option', label: `Removed: ${o.name}`, amount: -round2(optionPrice(o, size, 1)), option_id: o.id, category: o.category, note: 'Credit for removed standard item' });
    }
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const delivery = round2(Number(settings.delivery_fee) || 0);
  const taxRate = Number(settings.tax_rate) || 0;
  const tax = round2((subtotal + (settings.tax_delivery ? delivery : 0)) * taxRate / 100);
  const total = round2(subtotal + delivery + tax);
  const dealer = settings.pricing_mode === 'dealer' ? findDealer(catalog, config.dealer_id) : null;
  return { lines, subtotal, delivery, tax, tax_rate: taxRate, total, style, size,
    tier_id: tier?.id ?? null, tier_name: tier?.name ?? null,
    dealer: dealer ? { id: dealer.id, name: dealer.name, city: dealer.city, state: dealer.state, phone: dealer.phone, email: dealer.email } : null,
    zip: settings.pricing_mode === 'zip' ? (config.zip || null) : null };
}

/** Validate/sanitise a config coming from an untrusted client. */
export function sanitizeConfig(catalog, raw) {
  const style = catalog.styles.find(s => s.id === Number(raw?.style_id));
  if (!style) throw new Error('style_id is invalid');
  const size = style.sizes.find(s => s.id === Number(raw.size_id));
  if (!size) throw new Error('size_id is invalid for this style');
  const colorIds = new Set(catalog.colors.map(c => c.id));
  const optIds = new Set(catalog.options.map(o => o.id));
  const choices = roofChoices(catalog, style);
  const roof_material = (choices.find(r => r.key === raw.roof_material) || choices.find(r => r.key === style.roof_material) || choices[0] || {}).key || null;
  const colors = {};
  const defaults = defaultConfig(catalog, style.id, size.id).colors;
  for (const k of COLOR_GROUPS.map(g => g[0])) {
    const v = Number(raw.colors?.[k]);
    if (!colorGroupEnabled(catalog, k)) { if (defaults[k]) colors[k] = defaults[k]; continue; }
    if (colorIds.has(v)) colors[k] = v;
  }
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 200)
    .filter(i => optIds.has(Number(i.option_id)))
    .map((i, n) => ({
      uid: String(i.uid || 'i' + n).slice(0, 40),
      option_id: Number(i.option_id),
      wall: WALLS.includes(i.wall) ? i.wall : (i.wall === 'ceiling' || i.wall === 'roof' ? i.wall : null),
      offset: clampNum(i.offset, -100, 100),
      qty: Math.max(1, Math.min(99, Number(i.qty) || 1)),
      ...(Number(i.w) > 0 ? { w: clampNum(i.w, 0.25, 40) } : {}),
      ...(Number(i.h) > 0 ? { h: clampNum(i.h, 0.25, 20) } : {}),
      standard_of: optIds.has(Number(i.standard_of)) ? Number(i.standard_of) : null,
    }));
  // Standard slots must actually be standard for this style
  const std = new Set((style.standard_options || []).map(s => s.option_id));
  for (const it of items) if (it.standard_of && !std.has(it.standard_of)) it.standard_of = null;
  const out = { style_id: style.id, size_id: size.id, roof_material, colors, items };
  if (findDealer(catalog, raw.dealer_id)) out.dealer_id = findDealer(catalog, raw.dealer_id).id;
  if (/^\d{5}$/.test(String(raw.zip || ''))) out.zip = String(raw.zip);
  return out;
}

/** World-space centre of a wall-mounted item (x, z) in feet. Front wall faces +z. */
export function wallPoint(wall, offset, size) {
  const W = size.width, D = size.depth;
  switch (wall) {
    case 'front': return { x: offset, z: D / 2, nx: 0, nz: 1 };
    case 'back': return { x: -offset, z: -D / 2, nx: 0, nz: -1 };
    case 'right': return { x: W / 2, z: -offset, nx: 1, nz: 0 };
    case 'left': return { x: -W / 2, z: offset, nx: -1, nz: 0 };
    default: return { x: 0, z: offset, nx: 0, nz: 0 };
  }
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function round2(n) { return Math.round(n * 100) / 100; }
function clampNum(v, a, b) { v = Number(v) || 0; return Math.max(a, Math.min(b, v)); }
