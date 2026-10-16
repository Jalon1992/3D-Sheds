// Drawing package: one PDF per quote with a 3D cover + spec sheet, the floor plan and all four elevations.
// Uses jsPDF + svg2pdf (loaded as /vendor/pdf/*.umd.min.js → window.jspdf).
import { ShedScene } from './shed3d.js';
import { floorPlanSVG } from './shared/floorplan.js';
import { elevationSVG } from './shared/elevations.js';

const PAGE = { w: 792, h: 612, m: 32 };      // US Letter landscape, points
const INK = [29, 38, 36], MUTED = [125, 136, 133];

function svgEl(markup) {
  const el = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  host.appendChild(el); document.body.appendChild(host);
  return { el, done: () => host.remove() };
}
async function placeSVG(doc, markup, box) {
  const { el, done } = svgEl(markup);
  const vb = el.viewBox.baseVal, ar = vb.width / vb.height;
  let w = box.w, h = w / ar; if (h > box.h) { h = box.h; w = h * ar; }
  try { await doc.svg(el, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h }); }
  finally { done(); }
}
function frame(doc, meta, title, n, total) {
  const { w, h, m } = PAGE;
  doc.setDrawColor(...INK); doc.setLineWidth(0.8); doc.rect(m - 10, m - 10, w - 2 * m + 20, h - 2 * m + 20);
  // title block along the bottom
  const y = h - m - 26;
  doc.setLineWidth(0.5); doc.line(m - 10, y - 8, w - m + 10, y - 8);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK);
  doc.text(title, m, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
  doc.text([meta.company, `${meta.quote}${meta.customer ? ' · ' + meta.customer : ''}`].filter(Boolean).join('   ·   '), m, y + 19);
  doc.text(`${meta.shed}   ·   ${meta.date}`, w / 2, y + 19, { align: 'center' });
  doc.text(`Sheet ${n} of ${total}`, w - m, y + 6, { align: 'right' });
  doc.text('Dimensions are nominal. Verify on site before building.', w - m, y + 19, { align: 'right' });
}

async function render3D(catalog, config) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-4000px;top:0;width:1200px;height:800px';
  document.body.appendChild(host);
  const sc = new ShedScene(host);
  try {
    sc.build(catalog, config); sc.frame('front34', false);
    await new Promise(r => setTimeout(r, 400)); // let custom .glb models load
    sc.renderer.render(sc.scene, sc.camera);
    return sc.renderer.domElement.toDataURL('image/jpeg', 0.9);
  } finally { sc.dispose(); host.remove(); }
}

/**
 * @param catalog full catalog (styles with sizes, colors, options, settings)
 * @param quote   formatted quote (as returned by GET /api/v1/quotes/:id) incl. config + pricing_lines
 * @returns Blob (application/pdf)
 */
export async function buildDrawingPackage(catalog, quote, { company = '' } = {}) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('PDF library failed to load');
  const config = quote.config;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const meta = {
    company, quote: `Quote ${quote.number}`, customer: quote.customer?.full_name || '',
    shed: `${quote.shed.style} ${quote.shed.size}${quote.shed.roofing ? ' · ' + quote.shed.roofing : ''}`,
    date: new Date().toLocaleDateString('en-US'),
  };
  const total = 4;
  const { w, h, m } = PAGE, area = { x: m, y: m, w: w - 2 * m, h: h - 2 * m - 46 };

  // 1 — cover: 3D view + spec sheet
  const img = await render3D(catalog, config);
  const imgW = area.w * 0.6, imgH = imgW / 1.5;
  doc.addImage(img, 'JPEG', area.x, area.y, imgW, Math.min(imgH, area.h));
  let y = area.y + 6; const x = area.x + imgW + 18, colW = area.w - imgW - 18;
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(quote.shed.style, x, y + 10); y += 28;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const kv = [['Size', `${quote.shed.size} (${quote.shed.sq_ft} sq ft)`], ['Roofing', quote.shed.roofing || ''],
    ...Object.entries(quote.shed.colors || {}).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v]),
    ...(quote.dealer ? [['Dealer lot', quote.dealer.name]] : []),
    ['Customer', meta.customer], ['Delivery', [quote.customer?.address, quote.customer?.city, quote.customer?.state, quote.customer?.zip].filter(Boolean).join(', ')]];
  for (const [k, v] of kv) {
    if (!v) continue;
    doc.setTextColor(...MUTED); doc.text(k, x, y); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(String(v), colW - 70); doc.text(lines, x + 70, y); y += 14 * lines.length;
  }
  y += 8; doc.setFont('helvetica', 'bold'); doc.text('Options', x, y); y += 14; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const o of quote.options || []) {
    if (y > area.y + area.h - 10) { doc.text('…', x, y); break; }
    const lines = doc.splitTextToSize(`• ${o.name}${o.wall ? ` — ${o.wall} wall` : ''}${o.note === 'Standard' ? ' (standard)' : ''}`, colW);
    doc.text(lines, x, y); y += 11.5 * lines.length;
  }
  frame(doc, meta, '3D VIEW & SPECIFICATIONS', 1, total);

  // 2 — floor plan
  doc.addPage();
  await placeSVG(doc, floorPlanSVG(catalog, config, { customer: quote.customer, quote_number: quote.number }), area);
  frame(doc, meta, 'FLOOR PLAN', 2, total);

  // 3, 4 — elevations, two per sheet at the same scale
  const pairs = [['front', 'back'], ['left', 'right']];
  for (const [i, pair] of pairs.entries()) {
    doc.addPage();
    const els = pair.map(wall => elevationSVG(catalog, config, wall));
    const half = { w: (area.w - 16) / 2, h: area.h };
    // common scale so both views on a sheet match
    const scale = Math.min(...els.map(e => Math.min(half.w / e.width, half.h / e.height)));
    for (const [k, e] of els.entries()) {
      const bw = e.width * scale, bh = e.height * scale;
      await placeSVG(doc, e.svg, { x: area.x + k * (half.w + 16) + (half.w - bw) / 2, y: area.y + (half.h - bh) / 2, w: bw, h: bh });
    }
    frame(doc, meta, `${pair[0].toUpperCase()} & ${pair[1].toUpperCase()} ELEVATIONS`, 3 + i, total);
  }
  return doc.output('blob');
}
