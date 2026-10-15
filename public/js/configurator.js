// Customer-facing configurator: Style → Size → Colors → Options → Quote.
import { ShedScene } from './shed3d.js';
import { defaultConfig, priceConfig, money, WALLS, roofChoices, roofColorsFor, roofMaterialPrice, roofingList } from './shared/pricing.js';
import { shedGeometry, findSpot, canPlace } from './shared/geometry.js';
import { floorPlanSVG } from './shared/floorplan.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);

const STEPS = [
  { key: 'style', label: 'Style' }, { key: 'size', label: 'Size' }, { key: 'colors', label: 'Roof & Colors' },
  { key: 'options', label: 'Options' }, { key: 'quote', label: 'Quote' },
];
const CATS = [
  ['doors', 'Doors'], ['windows', 'Windows'], ['interior', 'Shelves & Loft'], ['electrical', 'Electrical'],
  ['exterior', 'Exterior'], ['upgrades', 'Upgrades'],
];

const state = { catalog: null, config: null, step: 0, maxStep: 0, selected: null, submitted: null, openCats: new Set(['doors']), interior: false };
let scene, optById = {}, uidSeq = 1;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------
const ICONS = {
  door_single: '<svg viewBox="0 0 32 32"><rect x="9" y="4" width="14" height="25" rx="1"/><circle cx="20" cy="17" r="1"/><rect x="12" y="7" width="8" height="8"/><rect x="12" y="18" width="8" height="8"/></svg>',
  door_glass: '<svg viewBox="0 0 32 32"><rect x="9" y="4" width="14" height="25" rx="1"/><rect x="12" y="7" width="8" height="10"/><path d="M16 7v10M12 12h8"/><circle cx="20" cy="21" r="1"/></svg>',
  door_double: '<svg viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="23"/><path d="M16 5v23M5 5l11 23M16 5l11 23M27 5 16 28M16 5 5 28"/></svg>',
  door_french: '<svg viewBox="0 0 32 32"><rect x="5" y="4" width="22" height="25"/><path d="M16 4v25M8 7h5v19H8zM19 7h5v19h-5zM8 13h5M8 19h5M19 13h5M19 19h5"/></svg>',
  door_rollup: '<svg viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="23"/><path d="M4 9h24M4 13h24M4 17h24M4 21h24M4 25h24"/></svg>',
  window: '<svg viewBox="0 0 32 32"><rect x="7" y="6" width="18" height="20"/><path d="M16 6v20M7 16h18M5 27h22"/></svg>',
  window_shutters: '<svg viewBox="0 0 32 32"><rect x="11" y="7" width="10" height="17"/><path d="M16 7v17M11 15h10M4 7h5v17H4zM23 7h5v17h-5z"/></svg>',
  window_transom: '<svg viewBox="0 0 32 32"><rect x="4" y="11" width="24" height="9"/><path d="M12 11v9M20 11v9"/></svg>',
  vent: '<svg viewBox="0 0 32 32"><path d="M16 5 4 17h24z"/><path d="M11 13h10M9 15h14"/></svg>',
  shelf: '<svg viewBox="0 0 32 32"><path d="M4 12h24M4 22h24M8 12v4M24 12v4M8 22v4M24 22v4"/></svg>',
  workbench: '<svg viewBox="0 0 32 32"><path d="M3 13h26M6 13v14M26 13v14M6 21h20"/><path d="M9 9h5v4M18 7h2v6"/></svg>',
  loft: '<svg viewBox="0 0 32 32"><path d="M4 28V12L16 4l12 8v16M4 15h12v-3M10 15v13M13 19l3-4"/></svg>',
  light: '<svg viewBox="0 0 32 32"><path d="M16 3v7M7 10h18l-3 6H10z"/><path d="M12 20l-2 4M16 20v5M20 20l2 4"/></svg>',
  ext_light: '<svg viewBox="0 0 32 32"><path d="M6 6v12M6 10h12M12 10l-4 0"/><path d="M12 14h12l-3-4h-6z"/><path d="M16 18l-1 3M20 18l1 3"/></svg>',
  outlet: '<svg viewBox="0 0 32 32"><rect x="9" y="5" width="14" height="22" rx="2"/><path d="M14 9v3M18 9v3M14 19v3M18 19v3"/></svg>',
  ramp: '<svg viewBox="0 0 32 32"><path d="M4 26h24V12z"/><path d="M10 22l2 4M16 18l3 8M22 15l3 11"/></svg>',
  cupola: '<svg viewBox="0 0 32 32"><path d="M16 2v5M8 15l8-8 8 8M10 15h12v13H10zM13 18h6v6h-6z"/></svg>',
  flowerbox: '<svg viewBox="0 0 32 32"><path d="M5 18h22l-2 9H7z"/><circle cx="10" cy="13" r="3"/><circle cx="17" cy="11" r="3"/><circle cx="23" cy="14" r="2.5"/></svg>',
  none: '<svg viewBox="0 0 32 32"><rect x="5" y="5" width="22" height="22" rx="5"/><path d="M10 16l4 4 8-8"/></svg>',
};
const iconFor = o => o.image_url ? `<img src="${esc(o.image_url)}" alt="">` : (ICONS[o.kind] || ICONS.none);
const ROOF_ICON = {
  gable: '<svg viewBox="0 0 120 90"><path d="M20 40 60 14l40 26M26 36v42h68V36"/><rect x="50" y="52" width="20" height="26"/><path d="M8 78h104"/></svg>',
  barn: '<svg viewBox="0 0 120 90"><path d="M14 48l14-24 32-12 32 12 14 24M20 44v34h80V44"/><path d="M46 52h28v26H46zM46 52l28 26M74 52 46 78M60 52v26"/><path d="M8 78h104"/></svg>',
  lean_to: '<svg viewBox="0 0 120 90"><path d="M14 22 106 38M20 23v55h80V37"/><rect x="34" y="44" width="16" height="34"/><rect x="60" y="42" width="28" height="9"/><path d="M8 78h104"/></svg>',
  saltbox: '<svg viewBox="0 0 120 90"><path d="M12 46 74 14l34 26M18 43v35h84V37"/><rect x="44" y="52" width="18" height="26"/><path d="M8 78h104"/></svg>',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const S = () => state.catalog.settings || {};
const showPrices = () => S().show_prices !== false;
const fmt = n => money(n, S().currency_symbol || '$');
const curStyle = () => state.catalog.styles.find(s => s.id === state.config.style_id);
const curSize = () => curStyle()?.sizes.find(z => z.id === state.config.size_id);
const geo = () => shedGeometry(curStyle(), curSize());
const toast = (msg, ms = 2600) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms); };
const newUid = () => 'u' + Date.now().toString(36) + (uidSeq++);

function pricing() { try { return priceConfig(state.catalog, state.config); } catch { return null; } }
function rebuild() {
  scene.build(state.catalog, state.config);
  renderTotal();
}
function renderTotal() {
  const p = pricing();
  $('#total').textContent = p ? (showPrices() ? fmt(p.subtotal) : '—') : '—';
  $('#totalLabel').textContent = showPrices() ? 'Your price' : 'Price on request';
}
function optDelta(o, it) {
  // price shown on swap tiles relative to the current slot
  const size = curSize();
  const tmp = { ...state.config, items: [{ uid: 'x', option_id: o.id, wall: it?.wall, standard_of: it?.standard_of || null }] };
  const p = priceConfig(state.catalog, tmp).lines.find(l => l.type === 'option');
  return p ? p.amount : 0;
}

// ---------------------------------------------------------------------------
// Item operations
// ---------------------------------------------------------------------------
function preferredWall(o) {
  if (o.kind === 'vent') return WALLS.find(w => geo().isGable(w));
  if (o.placement === 'loft') return 'back';
  if (['wall_interior', 'floor'].includes(o.placement)) return geo().W >= geo().D ? 'back' : 'left';
  // the wall facing the camera
  const c = scene.camera.position, a = Math.atan2(c.x, c.z) * 180 / Math.PI;
  if (a > -45 && a <= 45) return 'front';
  if (a > 45 && a <= 135) return 'right';
  if (a < -45 && a >= -135) return 'left';
  return 'back';
}
function addOption(o) {
  const items = state.config.items;
  if (o.placement === 'none') {
    if (items.some(i => i.option_id === o.id)) return removeItem(items.find(i => i.option_id === o.id).uid);
    items.push({ uid: newUid(), option_id: o.id, wall: null, offset: 0 }); rebuild(); renderPanel(); return;
  }
  const count = items.filter(i => i.option_id === o.id).length;
  if (count >= (o.max_qty || 10)) return toast(`Maximum of ${o.max_qty} for ${o.name}`);
  let spot = null;
  if (o.kind === 'flowerbox') {
    // Prefer to sit under a window that doesn't already have one
    for (const w of items) {
      const wo = optById[w.option_id];
      if (!wo || !String(wo.kind).startsWith('window') || wo.kind === 'window_transom') continue;
      const cand = { uid: '__c', option_id: o.id, wall: w.wall, offset: w.offset };
      if (canPlace(geo(), optById, items, o, cand, '__c')) { spot = { wall: w.wall, offset: w.offset }; break; }
    }
  }
  if (!spot) spot = findSpot(geo(), optById, items, o, preferredWall(o));
  if (!spot) return toast(`No room left for ${o.name} — try a bigger size or move something.`);
  const it = { uid: newUid(), option_id: o.id, wall: spot.wall, offset: spot.offset };
  items.push(it);
  if (['wall_interior', 'loft', 'ceiling'].includes(o.placement) && !state.interior) setInterior(true);
  rebuild(); selectItem(it.uid); renderPanel();
  if (spot.wall && WALLS.includes(spot.wall)) showWall(spot.wall);
}
function removeItem(uid) {
  state.config.items = state.config.items.filter(i => i.uid !== uid);
  if (state.selected === uid) selectItem(null);
  rebuild(); renderPanel();
}
function swapItem(uid, newId) {
  const it = state.config.items.find(i => i.uid === uid); const o = optById[newId];
  if (!it || !o) return;
  const prev = it.option_id, prevW = it.w, prevH = it.h;
  it.option_id = newId; delete it.w; delete it.h;
  if (!canPlace(geo(), optById, state.config.items, o, it, uid)) {
    const spot = findSpot(geo(), optById, state.config.items, o, it.wall, it.offset, uid);
    if (!spot) { it.option_id = prev; if (prevW) it.w = prevW; if (prevH) it.h = prevH; return toast(`${o.name} doesn't fit here — remove or move something first.`); }
    Object.assign(it, spot);
  }
  rebuild(); selectItem(uid); renderPanel();
}
function moveItem(uid, dir) {
  const it = state.config.items.find(i => i.uid === uid); const o = optById[it.option_id];
  const g = geo();
  for (let step = 0.5; step < 40; step += 0.5) {
    const cand = { ...it, offset: +(it.offset + dir * step).toFixed(2) };
    if (o.placement === 'ceiling') { const lim = (g.ridgeAlongZ ? g.D : g.W) / 2 - 1; if (Math.abs(cand.offset) > lim) break; Object.assign(it, cand); rebuild(); selectItem(uid); return; }
    if (o.placement === 'roof') { if (Math.abs(cand.offset) > g.L / 2 - 1.5) break; Object.assign(it, cand); rebuild(); selectItem(uid); return; }
    if (Math.abs(cand.offset) > g.wallLen(it.wall) / 2) break;
    if (canPlace(g, optById, state.config.items, o, cand, uid)) { it.offset = cand.offset; rebuild(); selectItem(uid); return; }
  }
  toast("Can't move further that way");
}
function moveToWall(uid, wall) {
  const it = state.config.items.find(i => i.uid === uid); const o = optById[it.option_id];
  if (o.kind === 'vent' && !geo().isGable(wall)) return toast('Gable vents only fit on the gable ends');
  const spot = findSpot(geo(), optById, state.config.items.filter(i => i.uid !== uid), o, wall, 0, uid);
  if (!spot || spot.wall !== wall) return toast(`No room on the ${wall} wall`);
  Object.assign(it, spot); rebuild(); selectItem(uid); showWall(wall); renderPanel();
}
// ---- Drag & drop: called continuously while an item is dragged on the 3D model
let dragQueued = null;
function dragItem(uid, hit) {
  $('#viewport').classList.add('dragging');
  const it = state.config.items.find(i => i.uid === uid); if (!it) return;
  const o = optById[it.option_id]; const g = geo();
  let { wall, offset } = hit;
  offset = Math.round(offset * 4) / 4; // snap to 3"
  if (o.placement === 'ceiling' || o.placement === 'roof') {
    const lim = o.placement === 'ceiling' ? (g.ridgeAlongZ ? g.D : g.W) / 2 - 1 : g.L / 2 - 1.5;
    if (o.placement === 'ceiling' && wall !== 'ceiling') return;
    if (o.placement === 'roof' && wall !== 'roof') return;
    offset = Math.max(-lim, Math.min(lim, offset));
    // ceiling/roof offsets run along the ridge; front/back camera axis flips sign
    if (offset === it.offset) return;
    it.offset = offset; queueRebuild(uid); return;
  }
  if (!WALLS.includes(wall)) return;
  if (o.kind === 'vent' && !g.isGable(wall)) return;
  if (o.placement === 'loft') { if (wall === it.wall) return; if (state.config.items.some(i => i.uid !== uid && i.wall === wall && optById[i.option_id]?.placement === 'loft')) return; it.wall = wall; it.offset = 0; queueRebuild(uid); return; }
  // clamp into the wall so dragging past a corner edge still slides it to the end
  const L = g.wallLen(wall), half = (Number(it.w) || Number(o.width) || 1) / 2, m = 0.45;
  offset = Math.max(-L / 2 + m + half, Math.min(L / 2 - m - half, offset));
  if (wall === it.wall && offset === it.offset) return;
  const cand = { ...it, wall, offset };
  if (!canPlace(g, optById, state.config.items, o, cand, uid)) return; // blocked: stay at last good spot
  it.wall = wall; it.offset = offset; queueRebuild(uid);
}
function queueRebuild(uid) {
  if (dragQueued) return;
  dragQueued = requestAnimationFrame(() => { dragQueued = null; rebuild(); scene.select(uid); });
}
function renderPanelIfOptions() { if (STEPS[state.step].key === 'options') renderPanel(); }

function showWall(wall) {
  const v = state.interior ? 'in_' + wall : wall;
  scene.view(v); document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}

// ---------------------------------------------------------------------------
// Selected item card
// ---------------------------------------------------------------------------
function selectItem(uid) {
  state.selected = uid; scene.select(uid);
  const card = $('#itemcard');
  const it = uid && state.config.items.find(i => i.uid === uid);
  if (!it) { card.hidden = true; return; }
  const o = optById[it.option_id];
  const alts = state.catalog.options.filter(x => x.active !== 0 && (o.swap_group ? x.swap_group === o.swap_group : (x.category === o.category && x.placement === o.placement)));
  const isStd = it.standard_of && it.standard_of === it.option_id;
  const price = optDelta(o, it);
  const wallable = ['opening', 'wall_interior', 'wall_exterior', 'ground', 'loft'].includes(o.placement);
  const movable = o.placement !== 'loft';
  card.innerHTML = `
    <div class="ic-head"><div><div class="ic-title">${esc(o.name)}</div>
      <div class="ic-meta">${isStd ? 'Included standard' : (showPrices() ? fmt(price) : '')}${it.wall && WALLS.includes(it.wall) ? ' · ' + it.wall + ' wall' : ''}</div></div>
      <button class="x" data-act="close" aria-label="Close">&times;</button></div>
    ${alts.length > 1 ? `<div class="ic-label">${it.standard_of ? 'Upgrade or change' : 'Change to'}</div>
    <div class="swaps">${alts.map(a => {
      const d = optDelta(a, it);
      return `<button class="swap ${a.id === o.id ? 'on' : ''}" data-swap="${a.id}"><div class="ico">${iconFor(a)}</div><b>${esc(a.name)}</b>${showPrices() ? `<span>${d ? (it.standard_of ? '+' : '') + fmt(d) : (it.standard_of ? 'Included' : fmt(0))}</span>` : ''}</button>`;
    }).join('')}</div>` : ''}
    ${(wallable || movable) ? `<div class="ic-label">Position</div><div class="ic-row">
      ${wallable ? `<div class="walls">${WALLS.map(w => `<button data-wall="${w}" class="${it.wall === w ? 'on' : ''}">${w}</button>`).join('')}</div>` : ''}
      ${movable ? `<div class="mv"><button data-move="-1" aria-label="Move left"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button><button data-move="1" aria-label="Move right"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>` : ''}
    </div>` : ''}
    <div class="ic-foot"><button class="link-danger" data-act="remove">Remove</button>
      <button class="btn primary sm" data-act="close">Done</button></div>`;
  card.hidden = false;
}
$('#itemcard').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const uid = state.selected;
  if (b.dataset.act === 'close') selectItem(null);
  else if (b.dataset.act === 'remove') removeItem(uid);
  else if (b.dataset.swap) swapItem(uid, Number(b.dataset.swap));
  else if (b.dataset.wall) moveToWall(uid, b.dataset.wall);
  else if (b.dataset.move) moveItem(uid, Number(b.dataset.move));
});

// ---------------------------------------------------------------------------
// Panel steps
// ---------------------------------------------------------------------------
function renderSteps() {
  $('#steps').innerHTML = STEPS.map((s, i) => `<button data-step="${i}" class="${i === state.step ? 'on' : ''} ${i < state.maxStep || (state.submitted && i < 4) ? 'done' : ''}" ${i > state.maxStep ? 'disabled' : ''}><span class="n">${i + 1}</span><span class="lbl">${s.label}</span></button>`).join('');
}
$('#steps').addEventListener('click', e => { const b = e.target.closest('button[data-step]'); if (b && !b.disabled) go(Number(b.dataset.step)); });

function go(i) {
  if (i === 4) selectItem(null);
  state.step = Math.max(0, Math.min(STEPS.length - 1, i));
  state.maxStep = Math.max(state.maxStep, state.step);
  renderSteps(); renderPanel();
  $('#panel').scrollTop = 0;
  if (window.innerWidth <= 900) window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#next').onclick = () => { if (state.step === 4) return submitQuote(); go(state.step + 1); };
$('#back').onclick = () => go(state.step - 1);

function renderPanel() {
  const key = STEPS[state.step].key;
  const el = $('#panel');
  $('#back').style.visibility = state.step === 0 ? 'hidden' : 'visible';
  $('#next').textContent = state.step === 4 ? 'Get my quote' : `Next: ${STEPS[state.step + 1]?.label}`;
  $('#next').hidden = !!(state.step === 4 && state.submitted);
  if (key === 'style') el.innerHTML = renderStyle();
  if (key === 'size') el.innerHTML = renderSize();
  if (key === 'colors') el.innerHTML = renderColors();
  if (key === 'options') el.innerHTML = renderOptions();
  if (key === 'quote') el.innerHTML = state.submitted ? renderDone() : renderQuote();
  renderTotal();
}

function renderStyle() {
  const cur = curStyle();
  return `<h2>${esc(S().headline || 'Choose a style')}</h2><p class="sub">Pick a style to start. You can change anything later.</p>
  <div class="cards">${state.catalog.styles.map(s => {
    const from = Math.min(...s.sizes.map(z => z.price));
    return `<button class="card ${s.id === cur.id ? 'on' : ''}" data-style="${s.id}">
      <div class="thumb">${s.image_url ? `<img src="${esc(s.image_url)}" alt="">` : (ROOF_ICON[s.roof_type] || ROOF_ICON.gable)}</div>
      <div class="ct"><b>${esc(s.name)}</b><small>${showPrices() ? `From <strong>${fmt(from)}</strong>` : `${s.sizes.length} sizes`}</small></div></button>`;
  }).join('')}</div>
  ${cur.description ? `<p class="desc">${esc(cur.description)}</p>` : ''}`;
}
function renderSize() {
  const st = curStyle();
  return `<h2>Choose a size</h2><p class="sub">${esc(st.name)} sizes, width × depth. The front wall is the width.</p>
  <div class="sizes">${st.sizes.map(z => `<button class="size ${z.id === state.config.size_id ? 'on' : ''}" data-size="${z.id}">
    <b>${z.width}' × ${z.depth}'</b><small>${z.width * z.depth} sq ft</small>${showPrices() ? `<span>${fmt(z.price)}</span>` : ''}</button>`).join('')}</div>`;
}
const ROOF_ICONS = {
  shingle: '<svg viewBox="0 0 48 32"><path d="M2 8h44M2 16h44M2 24h44"/><path d="M8 8v8M18 8v8M30 8v8M40 8v8M13 16v8M25 16v8M35 16v8M6 24v6M20 24v6M32 24v6M42 24v6"/></svg>',
  metal: '<svg viewBox="0 0 48 32"><path d="M2 4v24M14 4v24M26 4v24M38 4v24"/><path d="M6 4v24M10 4v24M18 4v24M22 4v24M30 4v24M34 4v24M42 4v24" stroke-width="0.8"/><circle cx="14" cy="10" r="1"/><circle cx="26" cy="10" r="1"/><circle cx="38" cy="10" r="1"/><circle cx="14" cy="22" r="1"/><circle cx="26" cy="22" r="1"/><circle cx="38" cy="22" r="1"/></svg>',
};
function roofDelta(mat) {
  const st = curStyle(), z = curSize();
  const std = roofingList(state.catalog).find(r => r.key === st.roof_material);
  if (!std || std.key === mat.key) return 0;
  return Math.round(Math.max(0, roofMaterialPrice(mat, st, z) - roofMaterialPrice(std, st, z)));
}
function renderColors() {
  const groups = [['siding', 'Siding'], ['trim', 'Trim'], ['roof', 'Roof color'], ['door', 'Doors']];
  const cs = state.catalog.colors;
  const choices = roofChoices(state.catalog, curStyle());
  let html = `<h2>Roofing &amp; colors</h2><p class="sub">Tap an option — the 3D shed updates instantly.</p>`;
  if (choices.length > 1) {
    html += `<h3>Roofing</h3><div class="roofs">${choices.map(r => {
      const d = roofDelta(r);
      return `<button class="roofopt ${r.key === state.config.roof_material ? 'on' : ''}" data-roofmat="${esc(r.key)}"><span class="ri">${ROOF_ICONS[r.key] || ROOF_ICONS.shingle}</span><span class="rt"><b>${esc(r.name)}</b>${r.description ? `<small>${esc(r.description)}</small>` : ''}</span>${showPrices() ? `<em>${d ? '+' + fmt(d) : 'Included'}</em>` : ''}</button>`;
    }).join('')}</div>`;
  }
  html += groups.map(([k, label]) => {
    const list = k === 'roof' ? roofColorsFor(state.catalog, state.config.roof_material) : cs.filter(c => c.category === k && c.active !== 0);
    if (!list.length) return '';
    const sel = list.find(c => c.id === state.config.colors[k]);
    return `<h3>${label}</h3><p class="chosen">${sel ? `<b>${esc(sel.name)}</b>${sel.price && showPrices() ? ' · +' + fmt(sel.price) : ''}` : ''}</p>
    <div class="swatches">${list.map(c => `<button class="sw ${c.id === state.config.colors[k] ? 'on' : ''}" data-color="${k}:${c.id}" title="${esc(c.name)}"><i style="background:${esc(c.hex)}"></i>${esc(c.name)}${c.price && showPrices() ? `<em>+${fmt(c.price)}</em>` : ''}</button>`).join('')}</div>`;
  }).join('');
  return html;
}
function setRoofMaterial(key) {
  state.config.roof_material = key;
  const ok = roofColorsFor(state.catalog, key);
  if (!ok.some(c => c.id === state.config.colors.roof)) state.config.colors.roof = ok[0]?.id ?? state.config.colors.roof;
}
function renderOptions() {
  const items = state.config.items;
  const onShed = items.filter(i => optById[i.option_id]?.placement !== 'none');
  const counts = {}; for (const i of items) counts[i.option_id] = (counts[i.option_id] || 0) + 1;
  const size = curSize();
  let html = `<h2>Add options</h2><p class="sub">Standard items are already on your shed. Click anything on the 3D model to upgrade, move or remove it.</p>`;
  if (onShed.length) html += `<h3>On your shed</h3><div class="onshed">${onShed.map(i => { const o = optById[i.option_id]; return `<button class="${i.standard_of ? 'std' : ''}" data-sel="${i.uid}">${esc(o.name)}${i.wall && WALLS.includes(i.wall) ? ` · ${i.wall}` : ''}</button>`; }).join('')}</div>`;
  for (const [cat, label] of CATS) {
    const list = state.catalog.options.filter(o => o.category === cat && o.active !== 0);
    if (!list.length) continue;
    const n = list.reduce((s, o) => s + (counts[o.id] || 0), 0);
    html += `<div class="acc ${state.openCats.has(cat) ? 'open' : ''}" data-cat="${cat}"><button data-acc="${cat}">${esc(label)}${n ? `<span class="cnt">${n}</span>` : ''}<svg class="chev" viewBox="0 0 24 24" ${n ? '' : 'style="margin-left:auto"'}><path d="M6 9l6 6 6-6"/></svg></button><div class="acc-body">`;
    for (const o of list) {
      const c = counts[o.id] || 0;
      const pr = (() => { try { return priceConfig(state.catalog, { ...state.config, items: [{ uid: 'p', option_id: o.id, wall: 'back' }] }).lines.find(l => l.type === 'option')?.amount ?? 0; } catch { return o.price; } })();
      const unit = { per_sqft: ` (${fmt(o.price)}/sq ft)`, per_ft_wall: ` (${fmt(o.price)}/ft)`, per_ft_width: ` (${fmt(o.price)}/ft)` }[o.price_unit] || '';
      html += `<div class="opt"><div class="ico">${iconFor(o)}</div><div class="meta"><b>${esc(o.name)}</b>${o.description ? `<small>${esc(o.description)}</small>` : ''}${showPrices() ? `<span class="p">${fmt(pr)}${unit}</span>` : ''}</div>`;
      if (o.placement === 'none') html += `<button class="tog ${c ? 'on' : ''}" data-toggle="${o.id}" aria-label="Toggle ${esc(o.name)}"></button>`;
      else html += `<div class="qty">${c ? `<button data-dec="${o.id}" aria-label="Remove one">−</button><span>${c}</span>` : ''}<button class="add" data-add="${o.id}" aria-label="Add ${esc(o.name)}">+</button></div>`;
      html += `</div>`;
    }
    html += `</div></div>`;
  }
  return html;
}
function renderQuote() {
  const p = pricing();
  const sp = showPrices();
  const lines = p.lines.filter(l => l.type !== 'color' || l.amount);
  const st = S();
  return `<h2>Your quote</h2><p class="sub">Review your shed and tell us where to send your quote.</p>
  <div class="lines">${lines.map(l => `<div class="line"><div>${esc(l.label)}${l.note ? `<small>${esc(l.note)}</small>` : ''}${l.wall && WALLS.includes(l.wall) ? `<small>${esc(l.wall)} wall</small>` : ''}</div><div>${sp ? (l.note === 'Standard' ? 'Included' : fmt(l.amount)) : ''}</div></div>`).join('')}
  ${sp && p.delivery ? `<div class="line"><div>Delivery</div><div>${fmt(p.delivery)}</div></div>` : ''}
  ${sp && p.tax ? `<div class="line"><div>Tax (${p.tax_rate}%)</div><div>${fmt(p.tax)}</div></div>` : ''}
  ${sp ? `<div class="line tot"><div>Total</div><div>${fmt(p.total)}</div></div>` : ''}</div>
  <form class="form" id="qform" novalidate>
    <div class="field"><label>First name *</label><input name="first_name" autocomplete="given-name" required></div>
    <div class="field"><label>Last name</label><input name="last_name" autocomplete="family-name"></div>
    <div class="field full"><label>Email *</label><input name="email" type="email" autocomplete="email" required></div>
    <div class="field full"><label>Phone${st.require_phone ? ' *' : ''}</label><input name="phone" type="tel" autocomplete="tel" ${st.require_phone ? 'required' : ''}></div>
    <div class="field full"><label>Delivery address</label><input name="address" autocomplete="street-address"></div>
    <div class="field"><label>City</label><input name="city" autocomplete="address-level2"></div>
    <div class="field"><label>State / ZIP</label><div style="display:flex;gap:6px"><input name="state" autocomplete="address-level1" style="width:40%" maxlength="20"><input name="zip" autocomplete="postal-code" inputmode="numeric" style="width:60%"></div></div>
    <div class="field full"><label>Anything else we should know?</label><textarea name="notes" placeholder="Site details, timeline, questions…"></textarea></div>
    ${st.consent_text ? `<label class="consent full"><input type="checkbox" name="sms_consent">${esc(st.consent_text)}${st.privacy_url ? ` <a href="${esc(st.privacy_url)}" target="_blank" rel="noopener">Privacy policy</a>` : ''}</label>` : ''}
    <div class="err full" id="qerr" hidden></div>
  </form>`;
}
function renderDone() {
  const q = state.submitted;
  return `<div class="done"><div class="ok"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></div>
    <h2>Quote sent!</h2><p class="sub">${esc(S().success_message || 'Thanks! We will be in touch shortly.')}</p>
    <div class="qn">Quote ${esc(q.number)}${showPrices() ? ' · ' + fmt(q.pricing.total) : ''}</div>
    <div class="stack">
      <button class="btn ghost block" data-dl="glb"><svg viewBox="0 0 24 24"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/></svg>Download 3D model (.glb)</button>
      <button class="btn ghost block" data-dl="plan"><svg viewBox="0 0 24 24"><path d="M3 3h18v18H3zM3 12h7M14 3v7M14 14v7"/></svg>View / print floor plan</button>
      <button class="btn ghost block" data-dl="link"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>Copy link to my design</button>
    </div></div>`;
}

$('#panel').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.style) {
    const id = Number(d.style); if (id === state.config.style_id) return;
    const old = curSize(); const st = state.catalog.styles.find(s => s.id === id);
    const near = st.sizes.reduce((a, z) => (Math.abs(z.width * z.depth - old.width * old.depth) < Math.abs(a.width * a.depth - old.width * old.depth) ? z : a), st.sizes[0]);
    const keepColors = state.config.colors, keepRoof = state.config.roof_material;
    state.config = defaultConfig(state.catalog, id, near.id);
    if (state.maxStep >= 2) {
      state.config.colors = { ...keepColors };
      if (roofChoices(state.catalog, st).some(r => r.key === keepRoof)) state.config.roof_material = keepRoof;
      setRoofMaterial(state.config.roof_material);
    }
    selectItem(null); rebuild(); renderPanel();
  } else if (d.size) {
    state.config.size_id = Number(d.size);
    // re-validate items that may no longer fit
    const g = geo(); const keep = [];
    for (const it of state.config.items) {
      const o = optById[it.option_id];
      if (!it.wall || !WALLS.includes(it.wall) || canPlace(g, optById, keep, o, it, it.uid)) { keep.push(it); continue; }
      const spot = findSpot(g, optById, keep, o, it.wall, it.offset, it.uid);
      if (spot) keep.push({ ...it, ...spot });
    }
    state.config.items = keep;
    rebuild(); renderPanel();
  } else if (d.roofmat) {
    setRoofMaterial(d.roofmat); rebuild(); renderPanel();
  } else if (d.color) {
    const [k, id] = d.color.split(':'); state.config.colors[k] = Number(id); rebuild(); renderPanel();
  } else if (d.acc) {
    state.openCats.has(d.acc) ? state.openCats.delete(d.acc) : state.openCats.add(d.acc); b.parentElement.classList.toggle('open');
  } else if (d.add) addOption(optById[d.add]);
  else if (d.toggle) addOption(optById[d.toggle]);
  else if (d.dec) {
    const list = state.config.items.filter(i => i.option_id === Number(d.dec));
    const nonStd = list.filter(i => !i.standard_of); removeItem((nonStd.at(-1) || list.at(-1)).uid);
  } else if (d.sel) { selectItem(d.sel); const it = state.config.items.find(i => i.uid === d.sel); if (it && WALLS.includes(it.wall)) showWall(it.wall); }
  else if (d.dl === 'glb') downloadGLB();
  else if (d.dl === 'plan') openPlan();
  else if (d.dl === 'link') { navigator.clipboard?.writeText(`${location.origin}/?q=${state.submitted.token}`); toast('Link copied'); }
});

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------
async function submitQuote() {
  const f = $('#qform'); const err = $('#qerr');
  const data = Object.fromEntries(new FormData(f).entries());
  data.sms_consent = !!f.querySelector('[name=sms_consent]')?.checked;
  const need = ['first_name', 'email', ...(S().require_phone ? ['phone'] : [])];
  const miss = need.filter(k => !String(data[k] || '').trim());
  if (miss.length || !/^\S+@\S+\.\S+$/.test(data.email || '')) {
    err.textContent = miss.length ? 'Please fill in the required fields.' : 'Please enter a valid email.'; err.hidden = false;
    (f.querySelector(`[name=${miss[0] || 'email'}]`))?.focus(); return;
  }
  const btn = $('#next'); btn.disabled = true; btn.textContent = 'Sending…';
  const utm = {}; for (const [k, v] of params) if (k.startsWith('utm_') || k === 'gclid' || k === 'fbclid') utm[k] = v;
  try {
    const r = await fetch('/api/v1/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: state.config, customer: data, utm, source: params.get('source') || document.referrer || 'configurator' }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Something went wrong');
    j.token = new URL(j.links.view_3d).searchParams.get('q');
    state.submitted = j;
    try { window.parent !== window && window.parent.postMessage({ type: 'shedbuilder:quote', quote: j }, '*'); } catch { /* ignore */ }
    history.replaceState(null, '', `?q=${j.token}`);
    renderSteps(); renderPanel();
    if (S().thank_you_url) setTimeout(() => { (window.top || window).location.href = S().thank_you_url + (S().thank_you_url.includes('?') ? '&' : '?') + 'quote=' + encodeURIComponent(j.number); }, 2500);
  } catch (e) { err.textContent = e.message; err.hidden = false; }
  finally { btn.disabled = false; if (!state.submitted) btn.textContent = 'Get my quote'; }
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
function fileBase() { const q = state.submitted; const st = curStyle(), z = curSize(); return (q ? q.number + '-' : '') + `${st.name}-${z.width}x${z.depth}`.replace(/[^a-z0-9-]+/gi, '-'); }
function saveBlob(blob, name) { if (window.__shedSave) return window.__shedSave(blob, name); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
async function downloadGLB() {
  toast('Preparing 3D model…');
  try { saveBlob(await scene.exportGLB(), fileBase() + '.glb'); toast('3D model downloaded (.glb)'); }
  catch (e) { console.error(e); toast('Could not export model'); }
}
function planSVG() {
  const q = state.submitted;
  return floorPlanSVG(state.catalog, state.config, { customer: q ? q.customer : {}, quote_number: q?.number });
}
function openPlan() { $('#planBox').innerHTML = planSVG(); $('#planDlg').showModal(); }
$('#btnPlan').onclick = openPlan;
$('#btnGlb').onclick = downloadGLB;
$('#planSvg').onclick = () => saveBlob(new Blob([planSVG()], { type: 'image/svg+xml' }), fileBase() + '-floor-plan.svg');
$('#planPrint').onclick = () => window.print();
document.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => b.closest('dialog').close()));

// ---------------------------------------------------------------------------
// Viewport controls
// ---------------------------------------------------------------------------
function setInterior(on) {
  state.interior = on; scene.setInterior(on);
  document.querySelectorAll('#viewMode button').forEach(b => b.classList.toggle('on', (b.dataset.mode === 'int') === on));
  scene.view(on ? 'inside' : 'front34');
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.v === (on ? '' : 'front34')));
}
$('#viewMode').onclick = e => { const b = e.target.closest('button'); if (b) setInterior(b.dataset.mode === 'int'); };
$('#views').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  scene.view(b.dataset.v); document.querySelectorAll('#views button').forEach(x => x.classList.toggle('on', x === b));
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function boot() {
  if (params.get('embed') === '1') document.body.classList.add('embed');
  const r = await fetch('/api/v1/catalog'); state.catalog = await r.json();
  const cat = state.catalog;
  if (!cat.styles.length) { $('#panel').innerHTML = '<h2>Coming soon</h2><p class="sub">No shed styles have been published yet. Add some in the admin.</p>'; $('#loading').classList.add('gone'); return; }
  optById = Object.fromEntries(cat.options.map(o => [o.id, o]));
  const st = cat.settings || {};
  if (st.brand_color) document.documentElement.style.setProperty('--brand', st.brand_color);
  $('#company').textContent = st.company_name || 'Shed Builder';
  document.title = `${st.company_name ? st.company_name + ' — ' : ''}Design your shed in 3D`;
  if (st.logo_url) { $('#logo').src = st.logo_url; $('#logo').hidden = false; $('#company').hidden = true; }
  if (st.phone) { $('#phone').textContent = st.phone; $('#phone').href = 'tel:' + st.phone.replace(/[^\d+]/g, ''); $('#phone').hidden = false; }

  scene = new ShedScene($('#viewport'), {
    onSelect: uid => { selectItem(uid); $('#hint').classList.add('gone'); },
    onDrag: dragItem,
    onDragEnd: uid => { $('#viewport').classList.remove('dragging'); selectItem(uid); renderPanelIfOptions(); },
  });
  const token = params.get('q');
  if (token) {
    try {
      const q = await (await fetch('/api/v1/shared/' + encodeURIComponent(token))).json();
      if (q.config) {
        state.config = q.config;
        if (!state.config.roof_material) state.config.roof_material = cat.styles.find(s => s.id === q.config.style_id)?.roof_material || 'shingle';
        state.maxStep = 3; state.step = 3;
        if (!cat.styles.find(s => s.id === q.config.style_id)) throw new Error('style gone');
      }
    } catch { state.config = null; }
  }
  if (!state.config) {
    const sid = Number(params.get('style')) || cat.styles[0].id;
    const style = cat.styles.find(s => s.id === sid) || cat.styles[0];
    const zid = Number(params.get('size'));
    state.config = defaultConfig(cat, style.id, style.sizes.find(z => z.id === zid)?.id);
    if (params.get('style')) { state.step = 1; state.maxStep = 1; }
  }
  rebuild();
  renderSteps(); renderPanel();
  setTimeout(() => $('#loading').classList.add('gone'), 150);
  setTimeout(() => $('#hint').classList.add('gone'), 9000);
  if (params.get('download') === 'glb') setTimeout(downloadGLB, 1200);
  if (params.get('download') === 'plan') setTimeout(openPlan, 600);
}
boot().catch(e => { console.error(e); $('#panel').innerHTML = `<h2>Something went wrong</h2><p class="sub">${esc(e.message)}</p>`; });
