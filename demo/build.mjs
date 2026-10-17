// Builds the static demo: the 3D builder (index) and the admin (admin.html) sharing an in-browser backend.
// Usage: npm run build:demo  →  demo/dist/
// To refresh the sample catalog, run the server with a fresh database and:
//   node demo/build.mjs --seed http://localhost:3000  (logs in as admin@example.com / changeme123)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const seedFrom = process.argv.includes('--seed') ? process.argv[process.argv.indexOf('--seed') + 1] : null;
if (seedFrom) {
  const login = await fetch(seedFrom + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'changeme123' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = p => fetch(seedFrom + p, { headers: { cookie } }).then(r => r.json());
  const settings = await get('/api/admin/settings');
  for (const k of Object.keys(settings)) if (k.startsWith('ghl_') || k === 'public_url') delete settings[k];
  writeFileSync('demo/seed-admin.json', JSON.stringify({ catalog: await get('/api/admin/catalog'), settings }, null, 1));
  console.log('Wrote demo/seed-admin.json');
}

const bundle = async entry => (await build({ entryPoints: [entry], bundle: true, minify: true, format: 'esm', write: false, loader: { '.json': 'json' } }))
  .outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const bannerCss = `
.demo-banner{background:#fff6e5;color:#7a3d06;font:13px/1.4 Inter,system-ui,sans-serif;text-align:center;padding:6px 12px;border-bottom:1px solid #f3dfb8}
.demo-banner a{color:#7a3d06;font-weight:700}
.demo-banner button{margin-left:10px;border:1px solid #e7c58c;background:#fff;border-radius:6px;padding:2px 8px;font:inherit;color:#7a3d06;cursor:pointer}`;
const inline = (html, cssFile, js, extraCss, title) => html
  .replace(/<script src="\/vendor\/pdf\/([^"]+)"><\/script>/g, (m, f) => `<script>${readFileSync('node_modules/' + (f.startsWith('jspdf') ? 'jspdf' : 'svg2pdf.js') + '/dist/' + f, 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/<link rel="stylesheet" href="[^"]+\.css">/, () => `<style>${readFileSync(cssFile, 'utf8')}${extraCss}</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="[^"]+"><\/script>/, () => `<script type="module">${js}</script>`)
  .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

mkdirSync('demo/dist', { recursive: true });
const pdfTags = '<script src="/vendor/pdf/jspdf.umd.min.js"></script><script src="/vendor/pdf/svg2pdf.umd.min.js"></script>';
const builder = inline(readFileSync('public/index.html', 'utf8').replace('<script type="module"', pdfTags + '\n<script type="module"'), 'public/css/app.css', await bundle('demo/entry.js'),
  bannerCss + `\nbody:has(.demo-banner) .layout{height:calc(100dvh - var(--top-h) - 31px)}`, 'Shed Builder Demo');
const admin = inline(readFileSync('public/admin/index.html', 'utf8'), 'public/admin/admin.css', await bundle('demo/admin-entry.js'), bannerCss, 'Shed Builder Admin Demo');
writeFileSync('demo/dist/shed-builder-demo.html', builder);
writeFileSync('demo/dist/admin.html', admin);
// Artifact-friendly fragment of the builder page (no doctype/html/head/body wrappers)
writeFileSync('demo/dist/shed-builder-demo.artifact.html', builder
  .replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<\/body>/gi, '').replace(/<body>/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, ''));
console.log('demo/dist: shed-builder-demo.html', (builder.length / 1024).toFixed(0) + ' KB, admin.html', (admin.length / 1024).toFixed(0) + ' KB');
