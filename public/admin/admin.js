// Admin dashboard (vanilla JS SPA).
import { ShedScene, BUILTIN_KINDS } from '/js/shed3d.js';
import { defaultConfig, money, WALLS, DEFAULT_ROOFING } from '/js/shared/pricing.js';
const roofing = () => (Array.isArray(settings.roofing) && settings.roofing.length ? settings.roofing : DEFAULT_ROOFING);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => money(n);
const fmtDate = s => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
const PENCIL = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>';

const CATEGORIES = [['doors', 'Doors'], ['windows', 'Windows'], ['interior', 'Shelves & loft'], ['electrical', 'Electrical'], ['exterior', 'Exterior'], ['upgrades', 'Upgrades']];
const PLACEMENTS = [
  ['opening', 'Opening in wall (doors, windows, vents)'], ['wall_exterior', 'On outside of wall (flower box, lights)'],
  ['wall_interior', 'On inside of wall (shelves, benches, outlets)'], ['ceiling', 'Ceiling (lights)'], ['loft', 'Loft (runs full wall length)'],
  ['ground', 'Ground in front of a wall (ramps)'], ['roof', 'On the roof ridge (cupola)'], ['none', 'No 3D placement — line item / toggle'],
];
const PRICE_UNITS = [['each', 'Each'], ['per_ft_wall', 'Per ft of the wall it is on'], ['per_ft_width', 'Per ft of shed width'], ['per_ft_depth', 'Per ft of shed depth'], ['per_sqft', 'Per sq ft of floor'], ['per_ft_perimeter', 'Per ft of perimeter']];
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

// ---------------------------------------------------------------------------
// API + UI helpers
// ---------------------------------------------------------------------------
async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  if (r.status === 401 && !url.includes('/auth/')) { showLogin(); throw new Error('Please log in'); }
  if (r.status === 204) return null;
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data?.error || data || r.statusText);
  return data;
}
function toast(msg, bad = false) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); }
const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

function field(f, v) {
  const full = f.full ? ' full' : '';
  const help = f.help ? `<small>${f.help}</small>` : '';
  const val = v ?? f.default ?? '';
  switch (f.type) {
    case 'section': return `<div class="section-t">${esc(f.label)}</div>`;
    case 'checkbox': return `<label class="fld${full}"><span>&nbsp;</span><label class="chk"><input type="checkbox" name="${f.key}" ${val === true || val === 1 || val === '1' ? 'checked' : ''}>${esc(f.label)}</label>${help}</label>`;
    case 'multi': { const sel = Array.isArray(val) && val.length ? val : f.options.map(o => o[0]);
      return `<div class="fld${full}"><span>${esc(f.label)}</span><div class="row">${f.options.map(([k, l]) => `<label class="chk"><input type="checkbox" data-multi="${f.key}" value="${esc(k)}" ${sel.includes(k) ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>${help}</div>`; }
    case 'select': return `<label class="fld${full}"><span>${esc(f.label)}</span><select name="${f.key}">${(typeof f.options === 'function' ? f.options() : f.options).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}</label>`;
    case 'textarea': return `<label class="fld${full}"><span>${esc(f.label)}</span><textarea name="${f.key}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${esc(val)}</textarea>${help}</label>`;
    case 'json': return `<label class="fld${full}"><span>${esc(f.label)}</span><textarea class="code" name="${f.key}" data-json>${esc(typeof val === 'string' ? val : JSON.stringify(val || f.empty || {}, null, 2))}</textarea>${help}</label>`;
    case 'color': return `<label class="fld${full}"><span>${esc(f.label)}</span><div class="color-in"><input type="color" value="${esc(val || '#888888')}" data-mirror="${f.key}"><input name="${f.key}" value="${esc(val)}" class="in" style="flex:1"></div>${help}</label>`;
    case 'upload': return `<div class="fld${full}"><span>${esc(f.label)}</span><div class="upl"><input type="hidden" name="${f.key}" value="${esc(val)}"><div class="fn" data-fn="${f.key}">${val ? esc(val.split('/').pop()) : 'None'}</div>
      <label class="btn ghost sm">Upload<input type="file" accept="${f.accept}" data-upload="${f.key}" hidden></label>${'<button type="button" class="btn link sm" data-clear="' + f.key + '">Clear</button>'}</div>${help}</div>`;
    default: return `<label class="fld${full}"><span>${esc(f.label)}</span><input name="${f.key}" type="${f.type || 'text'}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.list ? `list="${f.list}"` : ''} ${f.required ? 'required' : ''}>${help}</label>`;
  }
}
function readFields(root, fields) {
  const out = {};
  for (const f of fields) {
    if (!f.key) continue;
    if (f.type === 'multi') { out[f.key] = [...root.querySelectorAll(`[data-multi="${f.key}"]:checked`)].map(x => x.value); continue; }
    const el = root.querySelector(`[name="${f.key}"]`); if (!el) continue;
    if (f.type === 'checkbox') out[f.key] = el.checked ? 1 : 0;
    else if (f.type === 'number') out[f.key] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'json') { try { out[f.key] = el.value.trim() ? JSON.parse(el.value) : (f.empty || {}); } catch { throw new Error(`"${f.label}" is not valid JSON`); } }
    else out[f.key] = el.value;
  }
  return out;
}
function wireInputs(root, onChange) {
  root.addEventListener('input', e => {
    const m = e.target.dataset.mirror; if (m) root.querySelector(`[name="${m}"]`).value = e.target.value;
    if (e.target.name && e.target.closest('.color-in')) { const c = e.target.closest('.color-in').querySelector('[type=color]'); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) c.value = e.target.value; }
    onChange && onChange();
  });
  root.addEventListener('change', guard(async e => {
    const k = e.target.dataset.upload; if (!k || !e.target.files[0]) return onChange && onChange();
    const fd = new FormData(); fd.append('file', e.target.files[0]);
    root.querySelector(`[data-fn="${k}"]`).textContent = 'Uploading…';
    const r = await api('POST', '/api/admin/upload', fd);
    root.querySelector(`[name="${k}"]`).value = r.url; root.querySelector(`[data-fn="${k}"]`).textContent = r.name;
    toast('Uploaded ' + r.name); onChange && onChange();
  }));
  root.addEventListener('click', e => {
    const k = e.target.dataset.clear; if (!k) return;
    root.querySelector(`[name="${k}"]`).value = ''; root.querySelector(`[data-fn="${k}"]`).textContent = 'None'; onChange && onChange();
  });
}

let modalScene = null;
function openModal({ title, body, narrow = false, foot = '', onMount }) {
  const dlg = $('#modal');
  dlg.className = 'modal' + (narrow ? ' narrow' : '');
  $('#modalBody').innerHTML = `<div class="m-head"><h2>${esc(title)}</h2><button class="icon-btn" data-x>&times;</button></div><div class="m-body">${body}</div>${foot ? `<div class="m-foot">${foot}</div>` : ''}`;
  $('[data-x]', dlg).onclick = closeModal;
  dlg.showModal();
  onMount && onMount($('#modalBody'));
}
function closeModal() { if (modalScene) { modalScene.dispose(); modalScene = null; } $('#modal').close(); }
$('#modal').addEventListener('close', () => { if (modalScene) { modalScene.dispose(); modalScene = null; } });
function confirmBox(msg) { return window.confirm(msg); }

// ---------------------------------------------------------------------------
// Auth + routing
// ---------------------------------------------------------------------------
let me = null, catalog = null, settings = {};
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  try { me = await api('POST', '/api/auth/login', fd); $('#login').hidden = true; start(); }
  catch (err) { $('#loginErr').textContent = err.message; $('#loginErr').hidden = false; }
};
$('#logout').onclick = async () => { await api('POST', '/api/auth/logout'); location.hash = ''; location.reload(); };

const ROUTES = { dashboard, quotes, styles, colors, options, integrations, settings: settingsPage, account };
async function route() {
  const [r, arg] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const name = ROUTES[r] ? r : 'dashboard';
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.r === name));
  const old = $('#main'), fresh = old.cloneNode(false); old.replaceWith(fresh); // drop old listeners
  $('#main').innerHTML = '<div class="empty">Loading…</div>';
  try { await ROUTES[name](arg); } catch (e) { $('#main').innerHTML = `<div class="card card-pad err">${esc(e.message)}</div>`; }
}
async function loadCatalog() { catalog = await api('GET', '/api/admin/catalog'); return catalog; }
async function start() {
  $('#app').hidden = false;
  settings = await api('GET', '/api/admin/settings');
  $('#sideName').textContent = settings.company_name || 'Shed Builder';
  if (settings.brand_color) document.documentElement.style.setProperty('--brand', settings.brand_color);
  window.onhashchange = route; route();
}
(async () => { try { me = await api('GET', '/api/auth/me'); start(); } catch { showLogin(); } })();

function head(title, sub, actions = '') { return `<div class="head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`; }

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function dashboard() {
  const [s, keys, hooks] = await Promise.all([api('GET', '/api/admin/stats'), api('GET', '/api/admin/api-keys'), api('GET', '/api/v1/webhooks')]);
  const days = []; for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([d, s.daily.find(x => x.d === d)?.n || 0]); }
  const max = Math.max(1, ...days.map(d => d[1]));
  const won = s.byStatus.find(x => x.status === 'won')?.n || 0;
  const checks = [
    [settings.company_name && settings.company_name !== 'Your Shed Co.', 'Add your company name, logo and brand color', '#/settings'],
    [me.email !== 'admin@example.com', 'Change the default admin login', '#/account'],
    [settings.ghl_enabled || settings.ghl_inbound_webhook_url, 'Connect GoHighLevel', '#/integrations'],
    [hooks.length > 0 || keys.length > 0, 'Add a webhook or API key for other software', '#/integrations/webhooks'],
    [true, 'Review styles, sizes and prices', '#/styles'],
  ];
  $('#main').innerHTML = head('Dashboard', `Welcome back${me.name ? ', ' + esc(me.name) : ''}.`, `<a class="btn ghost" href="/" target="_blank">Open configurator ↗</a>`) + `
  <div class="grid g4">
    <div class="card card-pad stat"><div class="lbl">Quotes (30 days)</div><div class="val">${s.last30}</div></div>
    <div class="card card-pad stat"><div class="lbl">Quoted value (30 days)</div><div class="val">${fmt(s.value30)}</div></div>
    <div class="card card-pad stat"><div class="lbl">All-time quotes</div><div class="val">${s.total}</div></div>
    <div class="card card-pad stat"><div class="lbl">Won</div><div class="val">${won}</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card card-pad"><h2>Quotes per day</h2><p class="muted" style="margin:0">Last 30 days</p>
      <div class="bars">${days.map(([d, n]) => `<div style="height:${(n / max) * 100}%" title="${d}: ${n}"></div>`).join('')}</div></div>
    <div class="card card-pad"><h2>Getting set up</h2>${checks.map(([ok, t, href]) => `<a class="check ${ok ? 'done' : ''}" href="${href}" style="color:inherit;text-decoration:none"><span class="dot">${ok ? CHECK : ''}</span><span>${t}</span></a>`).join('')}</div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-pad" style="padding-bottom:6px"><h2>Popular styles</h2></div>
    ${s.byStyle.length ? `<table class="tbl"><tr><th>Style</th><th class="num">Quotes</th><th class="num">Avg. price</th></tr>${s.byStyle.map(r => `<tr><td>${esc(r.style_name)}</td><td class="num">${r.n}</td><td class="num">${fmt(r.avg)}</td></tr>`).join('')}</table>` : '<div class="empty">No quotes yet.</div>'}
  </div>`;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------
async function quotes(id) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const render = async () => {
    const search = $('#qs')?.value || '', status = $('#qst')?.value || '';
    const res = await api('GET', `/api/v1/quotes?limit=200&q=${encodeURIComponent(search)}&status=${status}`);
    $('#qtable').innerHTML = res.data.length ? `<table class="tbl"><tr><th>Quote</th><th>Date</th><th>Customer</th><th>Shed</th><th class="num">Total</th><th>Status</th><th>CRM</th></tr>
      ${res.data.map(x => `<tr class="click" data-id="${x.id}"><td><b>${esc(x.number)}</b></td><td class="muted">${fmtDate(x.created_at)}</td>
      <td>${esc(x.customer.full_name)}<div class="muted" style="font-size:12.5px">${esc(x.customer.email)} ${x.customer.phone ? '· ' + esc(x.customer.phone) : ''}</div></td>
      <td>${esc(x.shed.style)} <span class="muted">${esc(x.shed.size)}</span></td><td class="num"><b>${fmt(x.pricing.total)}</b></td>
      <td><span class="pill ${esc(x.status)}">${esc(x.status)}</span></td><td>${x.integrations.ghl_contact_id ? '<span class="pill on">GHL ✓</span>' : '<span class="muted">—</span>'}</td></tr>`).join('')}</table>`
      : '<div class="empty">No quotes found. Submit one from the configurator to see it here.</div>';
    $('#qcount').textContent = `${res.total} quote${res.total === 1 ? '' : 's'}`;
  };
  $('#main').innerHTML = head('Quotes', 'Every quote submitted from the configurator or the API.', `<a class="btn ghost" href="#" id="csv">Export CSV</a>`) + `
    <div class="row" style="margin-bottom:12px"><input class="in" id="qs" placeholder="Search name, email, phone or quote #" style="max-width:340px">
      <select class="in" id="qst" style="max-width:160px"><option value="">All statuses</option>${STATUSES.map(s => `<option>${s}</option>`).join('')}</select><span class="muted" id="qcount"></span></div>
    <div class="card tbl-wrap" id="qtable"></div>`;
  let t; $('#qs').oninput = () => { clearTimeout(t); t = setTimeout(render, 250); };
  $('#qst').onchange = render;
  $('#qtable').onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr) quoteDetail(Number(tr.dataset.id), render); };
  $('#csv').onclick = guard(async e => {
    e.preventDefault();
    const res = await api('GET', '/api/v1/quotes?limit=500');
    const rows = [['Quote', 'Date', 'Status', 'First', 'Last', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Style', 'Size', 'Options', 'Total', '3D link']];
    for (const x of res.data) rows.push([x.number, x.created_at, x.status, x.customer.first_name, x.customer.last_name, x.customer.email, x.customer.phone, x.customer.address, x.customer.city, x.customer.state, x.customer.zip, x.shed.style, x.shed.size, x.options.map(o => o.name).join('; '), x.pricing.total, x.links.view_3d]);
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'shed-quotes.csv'; a.click();
  });
  await render();
  if (id) quoteDetail(Number(id), render);
}
async function quoteDetail(id, refresh) {
  const x = await api('GET', `/api/v1/quotes/${id}`);
  const c = x.customer;
  openModal({
    title: `Quote ${x.number} — ${c.full_name}`,
    body: `<div class="drawer"><div>
      <div class="row" style="margin-bottom:14px"><a class="btn ghost sm" target="_blank" href="${esc(x.links.view_3d)}">Open in 3D ↗</a>
        <a class="btn ghost sm" target="_blank" href="${esc(x.links.download_3d_model)}">Download 3D model (.glb)</a>
        <a class="btn ghost sm" target="_blank" href="/api/v1/quotes/${x.id}/floorplan.svg" download="${esc(x.number)}-floor-plan.svg">Download floor plan</a></div>
      <div class="plan-prev"><img src="/api/v1/quotes/${x.id}/floorplan.svg" alt="Floor plan"></div>
      <h3 style="margin:18px 0 6px">Line items</h3><div class="lines">${x.pricing_lines.map(l => `<div class="ln"><div>${esc(l.label)}${l.note ? `<small>${esc(l.note)}</small>` : ''}${l.wall ? `<small>${esc(l.wall)}</small>` : ''}</div><div>${fmt(l.amount)}</div></div>`).join('')}
      ${x.pricing.delivery ? `<div class="ln"><div>Delivery</div><div>${fmt(x.pricing.delivery)}</div></div>` : ''}${x.pricing.tax ? `<div class="ln"><div>Tax</div><div>${fmt(x.pricing.tax)}</div></div>` : ''}
      <div class="ln tot"><div>Total</div><div>${fmt(x.pricing.total)}</div></div></div>
    </div><div>
      <div class="card card-pad"><dl class="kv">
        <dt>Name</dt><dd>${esc(c.full_name)}</dd><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>
        <dt>Phone</dt><dd>${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : '—'}</dd>
        <dt>Address</dt><dd>${esc([c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')) || '—'}</dd>
        <dt>SMS consent</dt><dd>${c.sms_consent ? 'Yes' : 'No'}</dd><dt>Notes</dt><dd>${esc(c.notes) || '—'}</dd>
        <dt>Submitted</dt><dd>${fmtDate(x.created_at)}</dd><dt>Source</dt><dd>${esc(x.source) || '—'}</dd>
        <dt>GHL</dt><dd>${x.integrations.ghl_contact_id ? `Contact <code>${esc(x.integrations.ghl_contact_id)}</code>` : 'Not synced'}</dd>
      </dl></div>
      <div class="card card-pad" style="margin-top:14px;display:grid;gap:12px">
        <label class="fld"><span>Status</span><select id="qStatus">${STATUSES.map(s => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="fld"><span>Internal notes</span><textarea id="qNotes">${esc(x.internal_notes || '')}</textarea></label>
        <button class="btn primary" id="qSave">Save</button>
        <button class="btn ghost" id="qResend">Re-send to webhooks / GHL</button>
        <button class="btn danger" id="qDel">Delete quote</button>
      </div></div></div>`,
    onMount: root => {
      $('#qSave', root).onclick = guard(async () => { await api('PATCH', `/api/v1/quotes/${id}`, { status: $('#qStatus').value, internal_notes: $('#qNotes').value }); toast('Saved'); refresh && refresh(); });
      $('#qResend', root).onclick = guard(async () => { await api('POST', `/api/v1/quotes/${id}/resend`); toast('Queued — check Integrations → Delivery log'); });
      $('#qDel', root).onclick = guard(async () => { if (!confirmBox('Delete this quote permanently?')) return; await api('DELETE', `/api/v1/quotes/${id}`); closeModal(); refresh && refresh(); toast('Deleted'); });
    },
  });
}

// ---------------------------------------------------------------------------
// Styles & sizes
// ---------------------------------------------------------------------------
const STYLE_FIELDS = () => [
  { key: 'name', label: 'Style name', required: true },
  { key: 'sort', label: 'Sort order', type: 'number' },
  { key: 'description', label: 'Short description (shown to customers)', type: 'textarea', full: true },
  { key: 'roof_type', label: 'Roof style', type: 'select', options: [['gable', 'Gable (A-frame)'], ['barn', 'Barn / gambrel'], ['lean_to', 'Lean-to (single slope)'], ['saltbox', 'Saltbox (offset gable)']] },
  { key: 'ridge_axis', label: 'Front wall', type: 'select', options: [['depth', 'Gable end faces front'], ['width', 'Eave (long side) faces front']] },
  { key: 'wall_height', label: 'Wall height (ft)', type: 'number', step: '0.25' },
  { key: 'roof_pitch', label: 'Roof pitch (rise per 12")', type: 'number', step: '0.5' },
  { key: 'siding_type', label: 'Siding', type: 'select', options: [['lap', 'Lap siding'], ['board_batten', 'Board & batten'], ['t111', 'T1-11 panel'], ['metal', 'Metal']] },
  { key: 'overhang', label: 'Eave overhang (ft)', type: 'number', step: '0.05', help: 'Along the low sides of the roof (where water runs off).' },
  { key: 'gable_overhang', label: 'Gable overhang (ft)', type: 'number', step: '0.05', help: 'At the gable/rake ends. Blank = same as eave.' },
  { key: 'roof_material', label: 'Standard roofing (included in price)', type: 'select', options: roofing().map(r => [r.key, r.name]) },
  { key: 'roof_choices', label: 'Roofing customers can choose', type: 'multi', options: roofing().map(r => [r.key, r.name]), help: 'Other choices are charged the difference from the standard roofing.' },
  { key: 'image_url', label: 'Card image (optional — otherwise an icon is shown)', type: 'upload', accept: 'image/*' },
  { key: 'active', label: 'Visible to customers', type: 'checkbox', default: 1 },
];
async function styles() {
  await loadCatalog();
  $('#main').innerHTML = head('Styles & sizes', 'Each style has its own roof, siding, sizes, prices and standard (included) options.', `<button class="btn primary" id="addStyle">+ New style</button>`) + `
    <div class="scards">${catalog.styles.map(s => `<div class="card scard"><div class="pv" data-pv="${s.id}">${s.image_url ? `<img src="${esc(s.image_url)}">` : ''}</div>
      <div class="body"><b>${esc(s.name)}</b> ${s.active ? '' : '<span class="pill off">Hidden</span>'}<div class="muted">${s.sizes.length} sizes · ${s.sizes.length ? fmt(Math.min(...s.sizes.map(z => z.price))) + ' – ' + fmt(Math.max(...s.sizes.map(z => z.price))) : 'no sizes'}</div>
      <div class="muted" style="font-size:12.5px;margin-top:4px">${esc(s.roof_type.replace('_', '-'))} roof · ${esc(s.siding_type.replace('_', ' & '))} · ${s.wall_height}' walls</div></div>
      <div class="foot"><button class="btn ghost sm" data-edit="${s.id}">${PENCIL} Edit</button><div class="row"><button class="icon-btn" title="Duplicate" data-dup="${s.id}">${COPY}</button><button class="icon-btn" title="Delete" data-del="${s.id}">${TRASH}</button></div></div></div>`).join('')}</div>`;
  $('#addStyle').onclick = () => styleEditor(null);
  $('#main').onclick = guard(async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) styleEditor(catalog.styles.find(s => s.id === Number(b.dataset.edit)));
    if (b.dataset.dup) { await api('POST', `/api/admin/duplicate/styles/${b.dataset.dup}`); toast('Duplicated'); styles(); }
    if (b.dataset.del && confirmBox('Delete this style and all its sizes?')) { await api('DELETE', `/api/v1/styles/${b.dataset.del}`); toast('Deleted'); styles(); }
  });
  // static thumbnails rendered with the real 3D engine
  renderThumbs();
}
async function renderThumbs() {
  const holder = document.createElement('div'); holder.style.cssText = 'position:fixed;left:-2000px;top:0;width:540px;height:340px';
  document.body.appendChild(holder);
  const sc = new ShedScene(holder);
  for (const s of catalog.styles) {
    const el = $(`[data-pv="${s.id}"]`); if (!el || s.image_url || !s.sizes.length) continue;
    const cfg = defaultConfig(catalog, s.id, s.sizes[Math.floor(s.sizes.length / 2)].id);
    sc.build(catalog, cfg); sc.frame('front34', false);
    await new Promise(r => setTimeout(r, 60));
    el.innerHTML = `<img src="${sc.snapshot()}" alt="">`;
  }
  sc.dispose(); holder.remove();
}

function styleEditor(style) {
  const isNew = !style;
  const s = style || { name: '', roof_type: 'gable', ridge_axis: 'depth', wall_height: 7, roof_pitch: 6, overhang: 0.75, gable_overhang: 0.5, siding_type: 'lap', roof_material: 'shingle', active: 1, sort: catalog.styles.length, sizes: [], standard_options: [], default_colors: {} };
  let sizes = (s.sizes || []).map(z => ({ ...z }));
  if (!sizes.length) sizes = [{ width: 8, depth: 10, price: 3500, active: 1 }, { width: 10, depth: 12, price: 5200, active: 1 }];
  let stds = (s.standard_options || []).map(x => ({ ...x }));
  let previewIdx = Math.min(sizes.length - 1, 1);
  const optSel = (v, i) => `<select data-std="${i}" data-k="option_id">${catalog.options.filter(o => o.placement !== 'none').map(o => `<option value="${o.id}" ${o.id === v ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
  const colorSel = cat => `<label class="fld"><span>Default ${cat} color</span><select name="dc_${cat}"><option value="">First in list</option>${catalog.colors.filter(c => c.category === cat).map(c => `<option value="${c.id}" ${c.id === s.default_colors?.[cat] ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
  const sizesHTML = () => `<table class="mini"><tr><th>Width (ft)</th><th>Depth (ft)</th><th>Base price</th><th>Active</th><th></th><th></th></tr>
    ${sizes.map((z, i) => `<tr><td><input type="number" step="0.5" data-sz="${i}" data-k="width" value="${z.width}"></td><td><input type="number" step="0.5" data-sz="${i}" data-k="depth" value="${z.depth}"></td>
    <td><input type="number" step="1" data-sz="${i}" data-k="price" value="${z.price}"></td><td><input type="checkbox" data-sz="${i}" data-k="active" ${z.active !== 0 ? 'checked' : ''}></td>
    <td><button type="button" class="icon-btn" data-pvsize="${i}" title="Preview this size" style="${i === previewIdx ? 'border-color:var(--brand);color:var(--brand)' : ''}">👁</button></td><td><button type="button" class="icon-btn" data-rmsize="${i}">${TRASH}</button></td></tr>`).join('')}</table>
    <div class="row" style="margin-top:8px"><button type="button" class="btn ghost sm" id="addSize">+ Add size</button>
    <span class="muted" style="margin-left:auto">Fill prices:</span><input class="in" id="ppsf" type="number" placeholder="$/sq ft" style="width:90px"><input class="in" id="pbase" type="number" placeholder="+ base $" style="width:90px"><button type="button" class="btn ghost sm" id="fillP">Apply</button></div>`;
  const optOf = id => catalog.options.find(o => o.id === Number(id)) || {};
  const stdHTML = () => `<table class="mini"><tr><th>Option</th><th>Wall</th><th>Offset (ft)</th><th>Width (ft)</th><th>Height (ft)</th><th></th></tr>
    ${stds.map((x, i) => `<tr><td>${optSel(x.option_id, i)}</td><td><select data-std="${i}" data-k="wall">${WALLS.map(w => `<option ${w === x.wall ? 'selected' : ''}>${w}</option>`).join('')}</select></td>
    <td><input type="number" step="0.25" data-std="${i}" data-k="offset" value="${x.offset || 0}"></td>
    <td><input type="number" step="0.05" data-std="${i}" data-k="w" value="${x.w ?? ''}" placeholder="${optOf(x.option_id).width ?? ''}"></td>
    <td><input type="number" step="0.05" data-std="${i}" data-k="h" value="${x.h ?? ''}" placeholder="${optOf(x.option_id).height ?? ''}"></td>
    <td><button type="button" class="icon-btn" data-rmstd="${i}">${TRASH}</button></td></tr>`).join('')}</table>
    <button type="button" class="btn ghost sm" id="addStd" style="margin-top:8px">+ Add standard option</button>
    <div class="muted" style="font-size:12px;margin-top:6px">Offset is measured from the centre of the wall, looking at it from outside (+ = right). Width/height let you size a door or window just for this style (leave blank to use the option's own size — e.g. make the 36" door 6'-8" tall here, 7'-0" on the garage). Standard options are included in the base price; customers pay only the difference to upgrade.</div>`;

  openModal({
    title: isNew ? 'New style' : `Edit ${s.name}`,
    body: `<div class="split"><div><form class="form" id="sf">${STYLE_FIELDS().map(f => field(f, s[f.key])).join('')}
      <div class="section-t">Sizes &amp; prices</div><div class="full" id="sizesBox">${sizesHTML()}</div>
      <div class="section-t">Standard options (already on the shed)</div><div class="full" id="stdBox">${stdHTML()}</div>
      <div class="section-t">Default colors</div>${['siding', 'trim', 'roof', 'door'].map(colorSel).join('')}
      </form></div><div><div class="preview3d" id="pv"><div class="pv-note">Live preview</div></div></div></div>`,
    foot: `<span></span><div class="row"><button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" id="saveStyle">Save style</button></div>`,
    onMount: root => {
      modalScene = new ShedScene($('#pv', root));
      const collect = () => {
        const d = readFields($('#sf', root), STYLE_FIELDS());
        d.standard_options = stds.map(x => ({ option_id: Number(x.option_id), wall: x.wall, offset: Number(x.offset) || 0,
          ...(Number(x.w) > 0 ? { w: Number(x.w) } : {}), ...(Number(x.h) > 0 ? { h: Number(x.h) } : {}) }));
        d.default_colors = {}; for (const c of ['siding', 'trim', 'roof', 'door']) { const v = $(`[name=dc_${c}]`, root).value; if (v) d.default_colors[c] = Number(v); }
        return d;
      };
      const preview = () => {
        try {
          const d = collect();
          const sz = sizes[previewIdx] || sizes[0]; if (!sz || !sz.width || !sz.depth) return;
          const st = { ...d, id: -1, sizes: [{ ...sz, id: -1, width: Number(sz.width), depth: Number(sz.depth), price: Number(sz.price) || 0 }] };
          const cat = { ...catalog, settings: { ...catalog.settings, roofing: roofing() }, styles: [st] };
          const cfg = defaultConfig(cat, -1, -1); cfg.roof_material = d.roof_material;
          modalScene.build(cat, cfg);
        } catch (e) { console.warn(e); }
      };
      let t; const later = () => { clearTimeout(t); t = setTimeout(preview, 200); };
      wireInputs(root, later);
      const redrawSizes = () => { $('#sizesBox', root).innerHTML = sizesHTML(); later(); };
      const redrawStd = () => { $('#stdBox', root).innerHTML = stdHTML(); later(); };
      root.addEventListener('input', e => {
        const d = e.target.dataset;
        if (d.sz !== undefined) { sizes[d.sz][d.k] = d.k === 'active' ? (e.target.checked ? 1 : 0) : e.target.value; later(); }
        if (d.std !== undefined) { stds[d.std][d.k] = e.target.value; later(); }
      });
      root.addEventListener('change', e => { const d = e.target.dataset; if (d.std !== undefined) { stds[d.std][d.k] = e.target.value; if (d.k === 'option_id') redrawStd(); else later(); } if (d.sz !== undefined && d.k === 'active') sizes[d.sz].active = e.target.checked ? 1 : 0; });
      root.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.id === 'addSize') { const l = sizes.at(-1) || { width: 8, depth: 8, price: 0 }; sizes.push({ width: l.width, depth: Number(l.depth) + 2, price: l.price, active: 1 }); redrawSizes(); }
        if (b.dataset.rmsize !== undefined) { sizes.splice(Number(b.dataset.rmsize), 1); previewIdx = Math.min(previewIdx, sizes.length - 1); redrawSizes(); }
        if (b.dataset.pvsize !== undefined) { previewIdx = Number(b.dataset.pvsize); redrawSizes(); }
        if (b.id === 'fillP') { const p = Number($('#ppsf', root).value), base = Number($('#pbase', root).value) || 0; if (!p) return toast('Enter a $/sq ft'); sizes.forEach(z => (z.price = Math.round((z.width * z.depth * p + base) / 5) * 5)); redrawSizes(); }
        if (b.id === 'addStd') { stds.push({ option_id: catalog.options.find(o => o.placement === 'opening')?.id, wall: 'front', offset: 0 }); redrawStd(); }
        if (b.dataset.rmstd !== undefined) { stds.splice(Number(b.dataset.rmstd), 1); redrawStd(); }
        if (b.dataset.cancel !== undefined) closeModal();
      });
      $('#saveStyle', root).onclick = guard(async () => {
        const d = collect();
        if (!d.name) throw new Error('Name is required');
        const saved = isNew ? await api('POST', '/api/v1/styles', d) : await api('PATCH', `/api/v1/styles/${s.id}`, d);
        await api('PUT', `/api/admin/styles/${saved.id}/sizes`, sizes.map(z => ({ ...z, width: Number(z.width), depth: Number(z.depth), price: Number(z.price) })));
        closeModal(); toast('Style saved'); styles();
      });
      preview();
    },
  });
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------
const COLOR_FIELDS = [
  { key: 'name', label: 'Color name', required: true },
  { key: 'category', label: 'Used for', type: 'select', options: [['siding', 'Siding'], ['trim', 'Trim'], ['roof', 'Roof'], ['door', 'Doors']] },
  { key: 'hex', label: 'Color', type: 'color' },
  { key: 'material', label: 'Roof colors: offered for', type: 'select', options: () => [['', 'All roofing types'], ...roofing().map(r => [r.key, r.name + ' only'])], help: 'Only used for roof colors.' },
  { key: 'price', label: 'Upcharge ($)', type: 'number', step: '1', help: '0 = no extra charge' },
  { key: 'sort', label: 'Sort order', type: 'number' },
  { key: 'active', label: 'Available to customers', type: 'checkbox', default: 1 },
];
async function colors() {
  await loadCatalog();
  const groups = [['siding', 'Siding'], ['trim', 'Trim'], ['roof', 'Roof'], ['door', 'Doors']];
  settings = await api('GET', '/api/admin/settings');
  const R = roofing();
  const unitTxt = { per_roof_sqft: '/ sq ft of roof', per_sqft: '/ sq ft of floor', each: 'flat' };
  $('#main').innerHTML = head('Roofing & colors', 'Tip: name a door color “Match Trim” and doors will automatically use the trim color.', `<button class="btn primary" id="addColor">+ New color</button>`) + `
    <div class="card" style="margin-bottom:16px"><div class="card-pad" style="padding-bottom:4px"><h2>Roofing materials</h2><p class="muted" style="margin:0">Customers pick these on the “Roof &amp; Colors” step. Each style's <b>standard roofing</b> is included; others charge the difference. Which ones each style offers is set in Styles &amp; sizes.</p></div>
    <table class="tbl"><tr><th>Key</th><th>Name shown to customers</th><th>Description</th><th class="num">Price</th><th>Priced</th><th>Active</th></tr>
    ${R.map((r, i) => `<tr><td class="mono">${esc(r.key)}</td><td><input class="in" data-rf="${i}" data-k="name" value="${esc(r.name)}"></td><td><input class="in" data-rf="${i}" data-k="description" value="${esc(r.description || '')}"></td>
      <td class="num"><input class="in" type="number" step="0.01" data-rf="${i}" data-k="price" value="${r.price}" style="width:90px"></td>
      <td><select class="in" data-rf="${i}" data-k="price_unit">${Object.entries(unitTxt).map(([k, l]) => `<option value="${k}" ${k === r.price_unit ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><input type="checkbox" data-rf="${i}" data-k="active" ${r.active !== false && r.active !== 0 ? 'checked' : ''}></td></tr>`).join('')}</table>
    <div class="card-pad" style="padding-top:10px"><button class="btn primary sm" id="saveRoofing">Save roofing</button></div></div>` +
    groups.map(([k, l]) => `<div class="card" style="margin-bottom:16px"><div class="card-pad" style="padding-bottom:4px"><h2>${l}</h2></div><table class="tbl"><tr><th style="width:50px"></th><th>Name</th><th>Hex</th>${k === 'roof' ? '<th>Roofing</th>' : ''}<th class="num">Upcharge</th><th>Status</th><th></th></tr>
      ${catalog.colors.filter(c => c.category === k).map(c => `<tr><td><span class="sw" style="background:${esc(c.hex)}"></span></td><td><b>${esc(c.name)}</b></td>${k === 'roof' ? `<td>${esc(R.find(r => r.key === c.material)?.name || 'All')}</td>` : ''}<td class="mono">${esc(c.hex)}</td><td class="num">${c.price ? fmt(c.price) : '—'}</td><td><span class="pill ${c.active ? 'on' : 'off'}">${c.active ? 'Active' : 'Hidden'}</span></td>
      <td class="num"><button class="icon-btn" data-edit="${c.id}">${PENCIL}</button> <button class="icon-btn" data-del="${c.id}">${TRASH}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">None yet</td></tr>'}</table></div>`).join('');
  $('#saveRoofing').onclick = guard(async () => {
    const out = R.map(r => ({ ...r }));
    $$('[data-rf]').forEach(el => { const r = out[el.dataset.rf]; const k = el.dataset.k; r[k] = el.type === 'checkbox' ? el.checked : (k === 'price' ? Number(el.value) || 0 : el.value); });
    await api('PUT', '/api/admin/settings', { roofing: out }); toast('Roofing saved'); colors();
  });
  $('#addColor').onclick = () => simpleEditor('Color', '/api/v1/colors', COLOR_FIELDS, null, colors, { hex: '#888888', category: 'siding', price: 0, active: 1 });
  $('#main').onclick = guard(async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) simpleEditor('Color', '/api/v1/colors', COLOR_FIELDS, catalog.colors.find(c => c.id === Number(b.dataset.edit)), colors);
    if (b.dataset.del && confirmBox('Delete this color?')) { await api('DELETE', `/api/v1/colors/${b.dataset.del}`); colors(); }
  });
}
function simpleEditor(noun, base, fields, row, done, defaults = {}) {
  openModal({
    title: row ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`, narrow: true,
    body: `<form class="form" id="ef">${fields.map(f => field(f, row ? row[f.key] : defaults[f.key])).join('')}</form>`,
    foot: `<span></span><div class="row"><button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" id="esave">Save</button></div>`,
    onMount: root => {
      wireInputs(root);
      $('[data-cancel]', root).onclick = closeModal;
      $('#esave', root).onclick = guard(async () => {
        const d = readFields($('#ef', root), fields);
        row ? await api('PATCH', `${base}/${row.id}`, d) : await api('POST', base, d);
        closeModal(); toast(`${noun} saved`); done();
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
const OPTION_FIELDS = () => [
  { key: 'name', label: 'Option name', required: true, full: true },
  { key: 'description', label: 'Description (shown to customers)', type: 'textarea', full: true },
  { key: 'category', label: 'Category', type: 'select', options: CATEGORIES },
  { key: 'swap_group', label: 'Swap group', list: 'swapGroups', help: 'Options in the same group can be swapped for each other on the model (e.g. "door").' },
  { key: 'placement', label: 'Where it goes', type: 'select', options: PLACEMENTS, full: true },
  { key: 'kind', label: 'Built-in 3D model', type: 'select', options: Object.entries(BUILTIN_KINDS), help: 'Used unless you upload a custom .glb model below.' },
  { key: 'model_url', label: 'Custom 3D model (.glb)', type: 'upload', accept: '.glb,.gltf', help: 'Exported from SketchUp, Blender, etc. It is scaled to the width/height/depth below.' },
  { key: 'width', label: 'Width (ft)', type: 'number', step: '0.05' },
  { key: 'height', label: 'Height (ft)', type: 'number', step: '0.05' },
  { key: 'depth', label: 'Depth (ft)', type: 'number', step: '0.05' },
  { key: 'elevation', label: 'Height off floor (ft)', type: 'number', step: '0.05', help: 'Doors = 0. Use -1 to auto-place high in the gable.' },
  { key: 'price', label: 'Price ($)', type: 'number', step: '0.01' },
  { key: 'price_unit', label: 'Priced', type: 'select', options: PRICE_UNITS },
  { key: 'max_qty', label: 'Max per shed', type: 'number' },
  { key: 'sort', label: 'Sort order', type: 'number' },
  { key: 'image_url', label: 'Thumbnail image (optional)', type: 'upload', accept: 'image/*' },
  { key: 'plan_label', label: 'Floor plan label (optional)' },
  { key: 'active', label: 'Available to customers', type: 'checkbox', default: 1 },
];
async function options() {
  await loadCatalog();
  const cat = new URLSearchParams(location.hash.split('?')[1] || '').get('cat') || '';
  const list = catalog.options.filter(o => !cat || o.category === cat);
  const unit = o => ({ per_sqft: '/sq ft', per_ft_wall: '/ft', per_ft_width: '/ft', per_ft_depth: '/ft', per_ft_perimeter: '/ft' }[o.price_unit] || '');
  $('#main').innerHTML = head('Options & 3D models', 'Doors, windows, shelves, wiring and upgrades. Each can use a built-in 3D model or your own .glb.', `<button class="btn primary" id="addOpt">+ New option</button>`) + `
    <div class="tabs">${[['', 'All'], ...CATEGORIES].map(([k, l]) => `<button data-cat="${k}" class="${k === cat ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="card tbl-wrap"><table class="tbl"><tr><th>Option</th><th>Category</th><th>Placement</th><th>3D model</th><th>Size (ft)</th><th class="num">Price</th><th>Status</th><th></th></tr>
    ${list.map(o => `<tr><td><b>${esc(o.name)}</b>${o.swap_group ? `<div class="muted" style="font-size:12px">swap group: ${esc(o.swap_group)}</div>` : ''}</td><td>${esc(o.category)}</td><td class="muted">${esc(o.placement)}</td>
      <td>${o.model_url ? '<span class="pill on">Custom .glb</span>' : `<span class="muted">${esc(BUILTIN_KINDS[o.kind] || o.kind)}</span>`}</td>
      <td class="muted">${o.placement === 'none' ? '—' : `${o.width ?? ''} × ${o.height ?? ''}`}</td><td class="num">${fmt(o.price)}${unit(o)}</td>
      <td><span class="pill ${o.active ? 'on' : 'off'}">${o.active ? 'Active' : 'Hidden'}</span></td>
      <td class="num" style="white-space:nowrap"><button class="icon-btn" data-edit="${o.id}">${PENCIL}</button> <button class="icon-btn" data-dup="${o.id}" title="Duplicate">${COPY}</button> <button class="icon-btn" data-del="${o.id}">${TRASH}</button></td></tr>`).join('')}</table></div>`;
  $('#addOpt').onclick = () => optionEditor(null);
  $('#main').onclick = guard(async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.cat !== undefined) { location.hash = '#/options' + (b.dataset.cat ? '?cat=' + b.dataset.cat : ''); return; }
    if (b.dataset.edit) optionEditor(catalog.options.find(o => o.id === Number(b.dataset.edit)));
    if (b.dataset.dup) { await api('POST', `/api/admin/duplicate/options/${b.dataset.dup}`); toast('Duplicated'); options(); }
    if (b.dataset.del && confirmBox('Delete this option? It will also disappear from styles that include it as standard.')) { await api('DELETE', `/api/v1/options/${b.dataset.del}`); options(); }
  });
}
function optionEditor(row) {
  const fields = OPTION_FIELDS();
  const o = row || { category: 'doors', placement: 'opening', kind: 'door_single', width: 3, height: 6.67, depth: 0.3, elevation: 0, price: 0, price_unit: 'each', max_qty: 10, active: 1, swap_group: 'door' };
  const groups = [...new Set(catalog.options.map(x => x.swap_group).filter(Boolean))];
  openModal({
    title: row ? `Edit ${o.name}` : 'New option',
    body: `<datalist id="swapGroups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
      <div class="split"><form class="form" id="of">${fields.map(f => field(f, o[f.key])).join('')}</form>
      <div><div class="preview3d" id="pv"><div class="pv-note">3D preview</div></div>
      <div class="callout" style="margin-top:12px">Tip: For your own models, export a <b>.glb</b> with the front facing <b>+Z</b> and Y up. It will be stretched to the width × height × depth you enter, so match those to the real product.</div></div></div>`,
    foot: `<span></span><div class="row"><button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" id="osave">Save option</button></div>`,
    onMount: root => {
      modalScene = new ShedScene($('#pv', root));
      const preview = () => { try { modalScene.previewOption(readFields($('#of', root), fields)); } catch (e) { console.warn(e); } };
      let t; wireInputs(root, () => { clearTimeout(t); t = setTimeout(preview, 200); });
      $('[data-cancel]', root).onclick = closeModal;
      $('#osave', root).onclick = guard(async () => {
        const d = readFields($('#of', root), fields);
        if (!d.name) throw new Error('Name is required');
        row ? await api('PATCH', `/api/v1/options/${row.id}`, d) : await api('POST', '/api/v1/options', d);
        closeModal(); toast('Option saved'); options();
      });
      preview();
    },
  });
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------
const GHL_FIELDS = [
  { type: 'section', label: 'Option A — Native API (creates contact, opportunity and note)' },
  { key: 'ghl_enabled', label: 'Send every new quote to GoHighLevel', type: 'checkbox', full: true },
  { key: 'ghl_token', label: 'Private Integration token', full: true, help: 'GHL → Settings → Private Integrations → Create. Scopes: contacts.write, opportunities.write.' },
  { key: 'ghl_location_id', label: 'Location (sub-account) ID', help: 'GHL → Settings → Business Profile.' },
  { key: 'ghl_tags', label: 'Tags', help: 'Comma separated.' },
  { key: 'ghl_pipeline_id', label: 'Pipeline ID (optional)', help: 'Leave blank to skip creating an opportunity.' },
  { key: 'ghl_stage_id', label: 'Pipeline stage ID (optional)' },
  { key: 'ghl_source', label: 'Contact source' },
  { key: 'ghl_add_note', label: 'Add the full quote as a contact note', type: 'checkbox' },
  { key: 'ghl_custom_fields', label: 'Custom field mapping (optional)', type: 'json', full: true, empty: {},
    help: 'Map GHL custom field keys to quote values, e.g. <code>{"shed_style": "shed.style", "shed_size": "shed.size", "quote_total": "pricing.total", "shed_3d_link": "links.view_3d"}</code>' },
  { type: 'section', label: 'Option B — Workflow “Inbound Webhook” trigger (no token needed)' },
  { key: 'ghl_inbound_webhook_url', label: 'Inbound webhook URL', full: true, ph: 'https://services.leadconnectorhq.com/hooks/…', help: 'In GHL: Automation → Workflows → Add trigger “Inbound Webhook” → copy the URL here. Flat fields like first_name, email, phone, shed_style, quote_total, shed_3d_link are included for easy mapping.' },
  { key: 'ghl_send_updates', label: 'Also send status changes to the inbound webhook', type: 'checkbox', full: true },
];
async function integrations(tab = 'ghl') {
  const tabs = [['ghl', 'GoHighLevel'], ['webhooks', 'Webhooks'], ['api', 'API keys'], ['embed', 'Embed / links'], ['log', 'Delivery log']];
  $('#main').innerHTML = head('Integrations & API', 'Send quotes to GoHighLevel, Zapier, Make, n8n or any software with webhooks and a REST API.', `<a class="btn ghost" href="/docs" target="_blank">API docs ↗</a>`) +
    `<div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div><div id="tabBody"></div>`;
  $('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) location.hash = '#/integrations/' + b.dataset.tab; };
  const body = $('#tabBody');
  const origin = settings.public_url || location.origin;

  if (tab === 'ghl') {
    settings = await api('GET', '/api/admin/settings');
    body.innerHTML = `<div class="card card-pad"><div class="callout" style="margin-bottom:16px">Use <b>either</b> option (or both). Option A pushes contacts &amp; opportunities directly. Option B triggers a GHL workflow where you can map fields, send texts/emails, assign users, etc.</div>
      <form class="form" id="gf">${GHL_FIELDS.map(f => field(f, settings[f.key])).join('')}</form>
      <div class="row" style="margin-top:18px"><button class="btn primary" id="gsave">Save</button><button class="btn ghost" id="gtest">Send latest quote to GHL now</button></div></div>`;
    wireInputs(body);
    $('#gsave').onclick = guard(async () => { await api('PUT', '/api/admin/settings', readFields($('#gf'), GHL_FIELDS)); toast('GoHighLevel settings saved'); settings = await api('GET', '/api/admin/settings'); });
    $('#gtest').onclick = guard(async () => { await api('PUT', '/api/admin/settings', readFields($('#gf'), GHL_FIELDS)); const r = await api('POST', '/api/admin/ghl/test'); toast('Sent! Contact ' + r.contactId); });
  }

  if (tab === 'webhooks') {
    const hooks = await api('GET', '/api/v1/webhooks');
    body.innerHTML = `<div class="row" style="margin-bottom:12px"><button class="btn primary" id="addHook">+ Add webhook</button><span class="muted">Works with Zapier “Catch Hook”, Make “Custom webhook”, n8n, or your own server.</span></div>
      <div class="card tbl-wrap">${hooks.length ? `<table class="tbl"><tr><th>Name</th><th>URL</th><th>Events</th><th>Signed</th><th>Status</th><th></th></tr>${hooks.map(h => `<tr><td><b>${esc(h.name || 'Webhook')}</b></td><td class="mono" style="max-width:340px;overflow:hidden;text-overflow:ellipsis">${esc(h.url)}</td><td>${(h.events || []).map(e => `<span class="pill">${esc(e)}</span>`).join(' ')}</td><td>${h.secret ? 'Yes' : 'No'}</td><td><span class="pill ${h.active ? 'on' : 'off'}">${h.active ? 'Active' : 'Paused'}</span></td>
        <td class="num" style="white-space:nowrap"><button class="btn ghost sm" data-test="${h.id}">Send test</button> <button class="icon-btn" data-edit="${h.id}">${PENCIL}</button> <button class="icon-btn" data-del="${h.id}">${TRASH}</button></td></tr>`).join('')}</table>` : '<div class="empty">No webhooks yet.</div>'}</div>
      <div class="card card-pad" style="margin-top:16px"><h2>Payload</h2><p class="muted">Each delivery is a JSON POST. Verify the signature with HMAC-SHA256 of the raw body using your secret.</p>
      <pre class="snip">POST {your url}
X-ShedBuilder-Event: quote.created
X-ShedBuilder-Signature: sha256=…

{ "event": "quote.created", "delivery_id": "…", "sent_at": "…",
  "data": { "id": 12, "number": "Q-10012", "status": "new",
    "customer": { "first_name", "last_name", "full_name", "email", "phone", "address", "city", "state", "zip", "notes", "sms_consent" },
    "shed": { "style", "size", "width_ft", "depth_ft", "sq_ft", "colors": { "siding", "trim", "roof", "door" } },
    "options": [ { "name", "category", "wall", "price" } ],
    "pricing": { "subtotal", "delivery", "tax", "total" },
    "summary": "Lofted Barn 12' x 16' | … | Total: $9,450.00",
    "links": { "view_3d", "download_3d_model", "floor_plan_svg", "admin" },
    "config": { …exact configuration… } } }</pre></div>`;
    const events = await api('GET', '/api/admin/events');
    const hookEditor = h => {
      const evs = new Set(h?.events || ['quote.created']);
      openModal({
        title: h ? 'Edit webhook' : 'New webhook', narrow: true,
        body: `<form class="form" id="hf">
          <label class="fld full"><span>Name</span><input name="name" value="${esc(h?.name || '')}" placeholder="e.g. Zapier → Google Sheets"></label>
          <label class="fld full"><span>URL</span><input name="url" value="${esc(h?.url || '')}" placeholder="https://hooks.zapier.com/…" required></label>
          <div class="fld full"><span>Events</span><div class="row">${[...events, '*'].map(e => `<label class="chk"><input type="checkbox" value="${e}" data-ev ${evs.has(e) ? 'checked' : ''}>${e === '*' ? 'All events' : e}</label>`).join('')}</div></div>
          <label class="fld full"><span>Signing secret (optional)</span><div class="row"><input name="secret" class="in" value="${esc(h?.secret || '')}" style="flex:1"><button type="button" class="btn ghost sm" id="gen">Generate</button></div></label>
          <label class="fld full"><span>Extra headers (JSON, optional)</span><textarea class="code" name="headers">${esc(JSON.stringify(h?.headers || {}, null, 2))}</textarea><small>e.g. <code>{"Authorization": "Bearer abc"}</code></small></label>
          <label class="chk full"><input type="checkbox" name="active" ${!h || h.active ? 'checked' : ''}>Active</label></form>`,
        foot: `<span></span><div class="row"><button class="btn ghost" data-cancel>Cancel</button><button class="btn primary" id="hsave">Save</button></div>`,
        onMount: root => {
          $('[data-cancel]', root).onclick = closeModal;
          $('#gen', root).onclick = () => { $('[name=secret]', root).value = 'whsec_' + crypto.getRandomValues(new Uint8Array(18)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), ''); };
          $('#hsave', root).onclick = guard(async () => {
            let headers; try { headers = JSON.parse($('[name=headers]', root).value || '{}'); } catch { throw new Error('Headers must be valid JSON'); }
            const d = { name: $('[name=name]', root).value, url: $('[name=url]', root).value.trim(), secret: $('[name=secret]', root).value, headers, active: $('[name=active]', root).checked ? 1 : 0, events: $$('[data-ev]:checked', root).map(x => x.value) };
            h ? await api('PATCH', `/api/v1/webhooks/${h.id}`, d) : await api('POST', '/api/v1/webhooks', d);
            closeModal(); toast('Webhook saved'); integrations('webhooks');
          });
        },
      });
    };
    $('#addHook').onclick = () => hookEditor(null);
    body.onclick = guard(async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) hookEditor(hooks.find(h => h.id === Number(b.dataset.edit)));
      if (b.dataset.del && confirmBox('Delete this webhook?')) { await api('DELETE', `/api/v1/webhooks/${b.dataset.del}`); integrations('webhooks'); }
      if (b.dataset.test) { b.disabled = true; const r = await api('POST', `/api/v1/webhooks/${b.dataset.test}/test`); b.disabled = false; toast(r.ok ? `Delivered (HTTP ${r.status})` : `Failed: HTTP ${r.status} ${r.response || ''}`, !r.ok); }
    });
  }

  if (tab === 'api') {
    const keys = await api('GET', '/api/admin/api-keys');
    body.innerHTML = `<div class="row" style="margin-bottom:12px"><input class="in" id="kname" placeholder="Key name, e.g. Zapier" style="max-width:260px"><button class="btn primary" id="newKey">Create API key</button></div>
      <div id="newKeyBox"></div>
      <div class="card tbl-wrap">${keys.length ? `<table class="tbl"><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>${keys.map(k => `<tr><td><b>${esc(k.name)}</b></td><td class="mono">${esc(k.prefix)}…</td><td class="muted">${fmtDate(k.created_at)}</td><td class="muted">${k.last_used ? fmtDate(k.last_used) : 'Never'}</td><td class="num"><button class="icon-btn" data-del="${k.id}">${TRASH}</button></td></tr>`).join('')}</table>` : '<div class="empty">No API keys yet.</div>'}</div>
      <div class="card card-pad" style="margin-top:16px"><h2>Quick start</h2><p class="muted">Full reference with “Try it” buttons: <a href="/docs" target="_blank">${esc(origin)}/docs</a> · OpenAPI spec: <a href="/api/openapi.json" target="_blank">/api/openapi.json</a></p>
<pre class="snip"># List recent quotes
curl ${esc(origin)}/api/v1/quotes?since=2026-01-01 -H "X-API-Key: sb_live_…"

# Mark a quote as won
curl -X PATCH ${esc(origin)}/api/v1/quotes/12 -H "X-API-Key: sb_live_…" -H "Content-Type: application/json" -d '{"status":"won"}'

# Subscribe a webhook (REST hooks — Zapier/Make/n8n)
curl -X POST ${esc(origin)}/api/v1/webhooks -H "X-API-Key: sb_live_…" -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/hook","events":["quote.created"]}'

# Public (no key): catalog, live pricing and quote submission for custom front-ends
curl ${esc(origin)}/api/v1/catalog</pre></div>`;
    $('#newKey').onclick = guard(async () => {
      const r = await api('POST', '/api/admin/api-keys', { name: $('#kname').value || 'API key' });
      $('#newKeyBox').innerHTML = `<div class="callout warn" style="margin-bottom:14px"><b>Copy this key now — it won't be shown again.</b><pre class="snip" id="kval">${esc(r.key)}</pre><button class="btn ghost sm" id="kcopy" style="margin-top:8px">Copy</button> <button class="btn ghost sm" onclick="location.reload()">Done</button></div>`;
      $('#kcopy').onclick = () => { navigator.clipboard.writeText(r.key); toast('Copied'); };
    });
    body.onclick = guard(async e => { const b = e.target.closest('[data-del]'); if (b && confirmBox('Revoke this key? Anything using it will stop working.')) { await api('DELETE', `/api/admin/api-keys/${b.dataset.del}`); integrations('api'); } });
  }

  if (tab === 'embed') {
    await loadCatalog();
    const iframe = `<iframe src="${origin}/?embed=1" style="width:100%;height:860px;border:0;border-radius:12px" allow="fullscreen" title="3D Shed Builder"></iframe>`;
    const listener = `<script>
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'shedbuilder:quote') {
    // e.data.quote has number, customer, pricing, links …
    // e.g. fire a pixel, then send them to your thank-you page:
    // window.location.href = '/thank-you?quote=' + e.data.quote.number;
  }
});
<\/script>`;
    body.innerHTML = `<div class="grid g2"><div class="card card-pad"><h2>Embed in a GHL funnel or any website</h2><p class="muted">In GHL: Sites → Funnels/Websites → add a <b>Custom JS/HTML</b> element and paste:</p><pre class="snip">${esc(iframe)}</pre><button class="btn ghost sm" data-copy="${esc(iframe)}">Copy</button>
      <p class="muted" style="margin-top:16px">UTM parameters on the parent page aren't visible inside the iframe — add them to the src (e.g. <code>?embed=1&amp;utm_source=facebook</code>) and they're saved with the quote.</p>
      <p class="muted">Optional: react to submissions on the parent page:</p><pre class="snip">${esc(listener)}</pre></div>
      <div class="card card-pad"><h2>Direct links</h2><p class="muted">Link straight to a style (skips step 1) — great for ads and buttons.</p>
      <table class="tbl"><tr><th>Style</th><th>Link</th></tr><tr><td>Start page</td><td class="mono">${esc(origin)}/</td></tr>${catalog.styles.map(s => `<tr><td>${esc(s.name)}</td><td class="mono">${esc(origin)}/?style=${s.id}</td></tr>`).join('')}</table>
      <p class="muted" style="margin-top:14px">Set a <b>Thank-you page URL</b> in Settings to redirect after a quote is submitted.</p></div></div>`;
    body.onclick = e => { const b = e.target.closest('[data-copy]'); if (b) { navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } };
  }

  if (tab === 'log') {
    const log = await api('GET', '/api/admin/webhook-log');
    body.innerHTML = `<div class="card tbl-wrap">${log.length ? `<table class="tbl"><tr><th>Time</th><th>Target</th><th>Event</th><th>Result</th><th>Response</th></tr>${log.map(l => `<tr><td class="muted" style="white-space:nowrap">${fmtDate(l.created_at)}</td><td class="mono" style="max-width:300px;overflow:hidden;text-overflow:ellipsis">${esc(l.target)}</td><td>${esc(l.event)}</td><td><span class="pill ${l.ok ? 'won' : 'lost'}">${l.status || 'ERR'}${l.attempt > 1 ? ' · try ' + l.attempt : ''}</span></td><td class="mono muted" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(l.response)}">${esc(l.response)}</td></tr>`).join('')}</table>` : '<div class="empty">Nothing sent yet.</div>'}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const SETTINGS_FIELDS = [
  { type: 'section', label: 'Branding' },
  { key: 'company_name', label: 'Company name' }, { key: 'headline', label: 'Configurator headline' },
  { key: 'logo_url', label: 'Logo', type: 'upload', accept: 'image/*' }, { key: 'brand_color', label: 'Brand color', type: 'color' },
  { key: 'phone', label: 'Phone (shown in header)' }, { key: 'website', label: 'Website' },
  { type: 'section', label: 'Pricing' },
  { key: 'show_prices', label: 'Show prices to customers', type: 'checkbox' }, { key: 'currency_symbol', label: 'Currency symbol' },
  { key: 'delivery_fee', label: 'Delivery fee ($)', type: 'number', step: '0.01' }, { key: 'tax_rate', label: 'Sales tax (%)', type: 'number', step: '0.001' },
  { key: 'tax_delivery', label: 'Charge tax on delivery', type: 'checkbox' },
  { type: 'section', label: 'Quote form' },
  { key: 'require_phone', label: 'Phone number is required', type: 'checkbox' },
  { key: 'consent_text', label: 'SMS / call consent text (A2P)', type: 'textarea', full: true, help: 'Leave blank to hide the checkbox.' },
  { key: 'privacy_url', label: 'Privacy policy URL' }, { key: 'thank_you_url', label: 'Thank-you page URL (optional redirect)' },
  { key: 'success_message', label: 'Success message', type: 'textarea', full: true },
  { type: 'section', label: 'Advanced' },
  { key: 'public_url', label: 'Public URL of this app', full: true, ph: 'https://builder.yourdomain.com', help: 'Used for links in webhooks/GHL. Leave blank to auto-detect.' },
];
async function settingsPage() {
  settings = await api('GET', '/api/admin/settings');
  $('#main').innerHTML = head('Settings', 'Branding, pricing rules and the quote form.') + `<div class="card card-pad"><form class="form" id="setf">${SETTINGS_FIELDS.map(f => field(f, settings[f.key])).join('')}</form>
    <div class="row" style="margin-top:18px"><button class="btn primary" id="ssave">Save settings</button></div></div>`;
  wireInputs($('#main'));
  $('#ssave').onclick = guard(async () => {
    await api('PUT', '/api/admin/settings', readFields($('#setf'), SETTINGS_FIELDS));
    settings = await api('GET', '/api/admin/settings');
    $('#sideName').textContent = settings.company_name || 'Shed Builder';
    if (settings.brand_color) document.documentElement.style.setProperty('--brand', settings.brand_color);
    toast('Settings saved');
  });
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
async function account() {
  const users = await api('GET', '/api/admin/users');
  $('#main').innerHTML = head('Account & users') + `<div class="grid g2">
    <div class="card card-pad"><h2>Your login</h2><form class="form" id="af" style="margin-top:12px">
      <label class="fld"><span>Name</span><input name="name" value="${esc(me.name || '')}"></label>
      <label class="fld"><span>Email</span><input name="email" type="email" value="${esc(me.email)}"></label>
      <label class="fld"><span>Current password *</span><input name="current_password" type="password" autocomplete="current-password"></label>
      <label class="fld"><span>New password</span><input name="new_password" type="password" autocomplete="new-password" placeholder="8+ characters"></label></form>
      <button class="btn primary" id="asave" style="margin-top:14px">Update</button></div>
    <div class="card card-pad"><h2>Team members</h2><table class="tbl" style="margin:10px 0">${users.map(u => `<tr><td><b>${esc(u.name || '')}</b> <span class="muted">${esc(u.email)}</span></td><td class="num">${u.id === me.id ? '<span class="pill">You</span>' : `<button class="icon-btn" data-del="${u.id}">${TRASH}</button>`}</td></tr>`).join('')}</table>
      <form class="form" id="uf"><label class="fld"><span>Name</span><input name="name"></label><label class="fld"><span>Email</span><input name="email" type="email"></label>
      <label class="fld full"><span>Temporary password</span><input name="password" type="text" placeholder="8+ characters"></label></form>
      <button class="btn ghost" id="uadd" style="margin-top:12px">+ Add team member</button></div></div>`;
  $('#asave').onclick = guard(async () => { const d = Object.fromEntries(new FormData($('#af'))); await api('POST', '/api/admin/account', d); me = await api('GET', '/api/auth/me'); toast('Account updated'); account(); });
  $('#uadd').onclick = guard(async () => { await api('POST', '/api/admin/users', Object.fromEntries(new FormData($('#uf')))); toast('User added'); account(); });
  $('#main').onclick = guard(async e => { const b = e.target.closest('[data-del]'); if (b && confirmBox('Remove this user?')) { await api('DELETE', `/api/admin/users/${b.dataset.del}`); account(); } });
}
