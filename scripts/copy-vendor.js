// Copies the Three.js build + addons into public/vendor so the app is fully self-hosted (no CDN needed).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'three');
const dst = join(root, 'public', 'vendor', 'three');
if (!existsSync(src)) { console.log('three not installed yet, skipping'); process.exit(0); }
mkdirSync(dst, { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) {
  if (existsSync(join(src, 'build', f))) cpSync(join(src, 'build', f), join(dst, f));
}
cpSync(join(src, 'examples', 'jsm'), join(dst, 'addons'), { recursive: true });
console.log('Copied three.js to public/vendor/three');
