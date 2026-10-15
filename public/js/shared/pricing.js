// Shared pricing + configuration helpers. Used by the browser AND the server
// (the server re-prices every quote with this same code, so prices can't be tampered with).

import { shedGeometry, roofArea, WALLS, wallLength } from './geometry.js';
export { WALLS, wallLength };

/** Roofing materials. Admin can rename/re-price these in Settings → Roofing. */
export const DEFAULT_ROOFING = [
  { key: 'shingle', name: 'Architectural Shingles', description: '30-year dimensional asphalt shingles.', price: 0, price_unit: 'per_roof_sqft', active: true },
  { key: 'metal', name: 'Ag Panel Metal', description: '29-ga ribbed steel panels, 40-year paint.', price: 0.85, price_unit: 'per_roof_sqft', active: true },
];
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
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return symbol + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
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
  const settings = catalog.settings || {};
  const style = catalog.styles.find(s => s.id === config.style_id);
  if (!style) throw new Error('Unknown style');
  const size = style.sizes.find(s => s.id === config.size_id);
  if (!size) throw new Error('Unknown size for this style');
  const optById = Object.fromEntries(catalog.options.map(o => [o.id, o]));
  const colorById = Object.fromEntries(catalog.colors.map(c => [c.id, c]));
  const lines = [];

  lines.push({ type: 'base', label: `${style.name} ${size.width}' x ${size.depth}'`, amount: Number(size.price) || 0 });

  // Roofing: the style's default material is included; other materials charge the difference.
  const roofing = roofingList(catalog);
  const mat = roofing.find(r => r.key === config.roof_material) || roofing.find(r => r.key === style.roof_material);
  if (mat) {
    const std = roofing.find(r => r.key === style.roof_material);
    const isStd = !std || std.key === mat.key;
    const amt = isStd ? 0 : Math.max(0, roofMaterialPrice(mat, style, size) - roofMaterialPrice(std, style, size));
    lines.push({ type: 'roof', label: `Roofing: ${mat.name}`, amount: Math.round(amt), roof_material: mat.key, note: isStd ? 'Standard' : `Upgrade from ${std.name}` });
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
        amt = Math.max(0, amt - credit);
        note = orig ? `Upgrade from ${orig.name}` : 'Upgrade';
      }
    }
    lines.push({
      type: 'option', label: o.name, amount: round2(amt), option_id: o.id, uid: it.uid,
      category: o.category, wall: it.wall || null, note,
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const delivery = round2(Number(settings.delivery_fee) || 0);
  const taxRate = Number(settings.tax_rate) || 0;
  const tax = round2((subtotal + (settings.tax_delivery ? delivery : 0)) * taxRate / 100);
  const total = round2(subtotal + delivery + tax);
  return { lines, subtotal, delivery, tax, tax_rate: taxRate, total, style, size };
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
  for (const k of ['siding', 'trim', 'roof', 'door']) {
    const v = Number(raw.colors?.[k]);
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
  return { style_id: style.id, size_id: size.id, roof_material, colors, items };
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
