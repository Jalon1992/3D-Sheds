// Outbound integrations: generic signed webhooks + native GoHighLevel (LeadConnector API v2).
import crypto from 'node:crypto';
import { all, get, run, getSettings } from './db.js';

export const EVENTS = ['quote.created', 'quote.updated', 'quote.status_changed', 'test'];

/** Public, integration-friendly representation of a quote (also used as the API response). */
export function formatQuote(q, baseUrl) {
  const p = q.pricing || {};
  const lines = p.lines || [];
  const colors = lines.filter(l => l.type === 'color').reduce((a, l) => (a[l.category] = l.label.split(': ')[1], a), {});
  const options = lines.filter(l => l.type === 'option').map(l => ({
    name: l.label, category: l.category, wall: l.wall, price: l.amount, note: l.note || undefined,
  }));
  const roofLine = lines.find(l => l.type === 'roof');
  const roofing = roofLine ? roofLine.label.replace(/^Roofing:\s*/, '') : undefined;
  const base = (baseUrl || '').replace(/\/$/, '');
  const summary = [
    `${q.style_name} ${q.size_label}`,
    roofing ? `Roof: ${roofing}` : '',
    Object.entries(colors).map(([k, v]) => `${k}: ${v}`).join(', '),
    options.length ? 'Options: ' + options.map(o => o.name).join(', ') : '',
    `Total: $${Number(q.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ].filter(Boolean).join(' | ');
  return {
    id: q.id,
    number: q.number,
    status: q.status,
    created_at: q.created_at,
    updated_at: q.updated_at,
    customer: {
      first_name: q.first_name, last_name: q.last_name, full_name: [q.first_name, q.last_name].filter(Boolean).join(' '),
      email: q.email, phone: q.phone, address: q.address, city: q.city, state: q.state, zip: q.zip,
      notes: q.notes, sms_consent: !!q.sms_consent,
    },
    shed: {
      style: q.style_name, size: q.size_label,
      width_ft: p.size?.width, depth_ft: p.size?.depth, sq_ft: p.size ? p.size.width * p.size.depth : undefined,
      roofing, colors,
    },
    options,
    pricing: { subtotal: p.subtotal, delivery: p.delivery, tax: p.tax, tax_rate: p.tax_rate, total: p.total },
    summary,
    links: {
      view_3d: `${base}/?q=${q.token}`,
      download_3d_model: `${base}/?q=${q.token}&download=glb`,
      floor_plan_svg: `${base}/q/${q.token}/floorplan.svg`,
      admin: `${base}/admin/#/quotes/${q.id}`,
    },
    source: q.source, utm: q.utm || undefined,
    integrations: { ghl_contact_id: q.ghl_contact_id, ghl_opportunity_id: q.ghl_opportunity_id },
    config: q.config,
  };
}

function log(webhook_id, target, event, status, ok, attempt, response) {
  run('INSERT INTO webhook_log (webhook_id, target, event, status, ok, attempt, response) VALUES (?,?,?,?,?,?,?)',
    webhook_id, target, event, status, ok ? 1 : 0, attempt, String(response ?? '').slice(0, 2000));
  run('DELETE FROM webhook_log WHERE id NOT IN (SELECT id FROM webhook_log ORDER BY id DESC LIMIT 1000)');
}

async function postJSON(url, body, headers = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body, signal: ctrl.signal });
    const text = await r.text();
    return { status: r.status, ok: r.ok, text };
  } catch (e) {
    return { status: 0, ok: false, text: e.message };
  } finally { clearTimeout(t); }
}

/** Deliver one webhook with signature + retries (1s, 5s, 25s). */
export async function deliver(hook, event, data) {
  const payload = JSON.stringify({ event, delivery_id: crypto.randomUUID(), sent_at: new Date().toISOString(), data });
  const headers = { 'User-Agent': 'ShedBuilder-Webhooks/1.0', 'X-ShedBuilder-Event': event };
  if (hook.secret) headers['X-ShedBuilder-Signature'] = 'sha256=' + crypto.createHmac('sha256', hook.secret).update(payload).digest('hex');
  Object.assign(headers, hook.headers || {});
  const delays = [0, 1000, 5000, 25000];
  let last;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await new Promise(r => setTimeout(r, delays[i]));
    last = await postJSON(hook.url, payload, headers);
    log(hook.id || null, hook.url, event, last.status, last.ok, i + 1, last.text);
    if (last.ok || (last.status >= 400 && last.status < 500 && last.status !== 429)) break;
  }
  return last;
}

/** Fire an event to every subscribed webhook + GHL. Runs in the background. */
export function emit(event, quoteRow, baseUrl) {
  const data = formatQuote(quoteRow, baseUrl);
  const hooks = all('SELECT * FROM webhooks WHERE active = 1');
  for (const h of hooks) {
    const evs = Array.isArray(h.events) ? h.events : [];
    if (evs.includes(event) || evs.includes('*')) deliver(h, event, data).catch(() => {});
  }
  const s = getSettings();
  if (s.ghl_inbound_webhook_url && (event === 'quote.created' || s.ghl_send_updates)) {
    deliver({ id: null, url: s.ghl_inbound_webhook_url, headers: {} }, event, flatForGHL(data)).catch(() => {});
  }
  if (event === 'quote.created' && s.ghl_enabled && s.ghl_token && s.ghl_location_id) {
    pushToGHL(quoteRow, data).catch(e => log(null, 'GHL API', event, 0, false, 1, e.message));
  }
}

/** GHL inbound-webhook triggers map flat keys most easily — send both nested and flat. */
function flatForGHL(d) {
  return {
    ...d,
    first_name: d.customer.first_name, last_name: d.customer.last_name, full_name: d.customer.full_name,
    email: d.customer.email, phone: d.customer.phone, address1: d.customer.address, city: d.customer.city,
    state: d.customer.state, postal_code: d.customer.zip, quote_number: d.number, quote_total: d.pricing.total,
    shed_style: d.shed.style, shed_size: d.shed.size, shed_roofing: d.shed.roofing, shed_summary: d.summary, shed_3d_link: d.links.view_3d,
    floor_plan_link: d.links.floor_plan_svg, options_list: d.options.map(o => o.name).join(', '),
  };
}

function pick(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }

const GHL_BASE = 'https://services.leadconnectorhq.com';

async function ghl(method, path, token, body) {
  const r = await fetch(GHL_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  log(null, 'GHL ' + method + ' ' + path.split('?')[0], 'ghl', r.status, r.ok, 1, text);
  if (!r.ok) throw new Error(`GHL ${path} → ${r.status}: ${text.slice(0, 300)}`);
  return json;
}

/** Native GHL push: upsert contact → (optional) opportunity → note with the full quote. */
export async function pushToGHL(quoteRow, data) {
  const s = getSettings();
  const token = s.ghl_token, locationId = s.ghl_location_id;
  const tags = String(s.ghl_tags || 'shed-quote').split(',').map(t => t.trim()).filter(Boolean);
  const customFields = [];
  if (s.ghl_custom_fields && typeof s.ghl_custom_fields === 'object') {
    for (const [key, path] of Object.entries(s.ghl_custom_fields)) {
      const v = pick(data, String(path));
      if (v != null) customFields.push({ key, field_value: typeof v === 'object' ? JSON.stringify(v) : v });
    }
  }
  const c = data.customer;
  const contact = await ghl('POST', '/contacts/upsert', token, {
    locationId, firstName: c.first_name, lastName: c.last_name, email: c.email, phone: c.phone,
    address1: c.address, city: c.city, state: c.state, postalCode: c.zip,
    source: s.ghl_source || '3D Shed Builder', tags,
    ...(customFields.length ? { customFields } : {}),
  });
  const contactId = contact?.contact?.id || contact?.id;
  let oppId = null;
  if (contactId && s.ghl_pipeline_id && s.ghl_stage_id) {
    const opp = await ghl('POST', '/opportunities/', token, {
      locationId, pipelineId: s.ghl_pipeline_id, pipelineStageId: s.ghl_stage_id, contactId,
      name: `${c.full_name || c.email} – ${data.shed.style} ${data.shed.size} (${data.number})`,
      status: 'open', monetaryValue: data.pricing.total,
    });
    oppId = opp?.opportunity?.id || opp?.id || null;
  }
  if (contactId && s.ghl_add_note !== false) {
    const body = [
      `Shed quote ${data.number} — $${Number(data.pricing.total).toFixed(2)}`,
      `${data.shed.style} ${data.shed.size}`,
      data.shed.roofing ? `Roofing: ${data.shed.roofing}` : '',
      ...Object.entries(data.shed.colors).map(([k, v]) => `${k}: ${v}`),
      '', 'Options:', ...data.options.map(o => `• ${o.name}${o.wall ? ' (' + o.wall + ')' : ''} ${o.price ? '$' + o.price : ''}`),
      '', `3D view: ${data.links.view_3d}`, `Floor plan: ${data.links.floor_plan_svg}`,
      c.notes ? `\nCustomer notes: ${c.notes}` : '',
    ].join('\n');
    await ghl('POST', `/contacts/${contactId}/notes`, token, { body });
  }
  run("UPDATE quotes SET ghl_contact_id = ?, ghl_opportunity_id = ?, ghl_status = 'synced' WHERE id = ?", contactId || null, oppId, quoteRow.id);
  return { contactId, oppId };
}

export function recentLog(limit = 100) {
  return all('SELECT * FROM webhook_log ORDER BY id DESC LIMIT ?', limit);
}
export function getQuoteRow(id) { return get('SELECT * FROM quotes WHERE id = ?', id); }
