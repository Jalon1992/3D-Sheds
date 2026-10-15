// Builds a single self-contained HTML demo of the customer configurator (no server needed).
// Usage: node demo/build.mjs  →  demo/dist/shed-builder-demo.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const r = await build({ entryPoints: ['demo/entry.js'], bundle: true, minify: true, format: 'esm', write: false, loader: { '.json': 'json' } });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('public/css/app.css', 'utf8') + `
.demo-banner{background:#fff6e5;color:#7a3d06;font-size:13px;text-align:center;padding:6px 12px;border-bottom:1px solid #f3dfb8}
body:has(.demo-banner) .layout{height:calc(100dvh - var(--top-h) - 31px)}`;
let html = readFileSync('public/index.html', 'utf8');
html = html.replace(/<link rel="stylesheet" href="\/css\/app.css">/, () => `<style>${css}</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="\/js\/configurator.js"><\/script>/, () => `<script type="module">${js}</script>`)
  .replace('<title>Design Your Shed in 3D</title>', '<title>Shed Builder Demo</title>');
mkdirSync('demo/dist', { recursive: true });
writeFileSync('demo/dist/shed-builder-demo.html', html);
console.log('demo/dist/shed-builder-demo.html', (html.length / 1024).toFixed(0) + ' KB');

// Artifact-friendly fragment (no doctype/html/head/body wrappers).
const frag = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>|<\/html>|<head>|<\/head>|<\/body>/gi, '')
  .replace(/<body>/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
writeFileSync('demo/dist/shed-builder-demo.artifact.html', frag);
