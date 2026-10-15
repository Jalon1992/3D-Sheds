// Downloads inside a claude.ai artifact (the sandbox blocks normal downloads).
// .glb is not on the artifact download allowlist, so it is wrapped in a .zip.
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipOne(name, bytes) {
  const nm = new TextEncoder().encode(name), crc = crc32(bytes), n = bytes.length;
  const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, n, true); lh.setUint32(22, n, true); lh.setUint16(26, nm.length, true);
  const cd = new DataView(new ArrayBuffer(46)); cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint32(16, crc, true); cd.setUint32(20, n, true); cd.setUint32(24, n, true); cd.setUint16(28, nm.length, true);
  const cdOff = 30 + nm.length + n, cdLen = 46 + nm.length;
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, 1, true); end.setUint16(10, 1, true); end.setUint32(12, cdLen, true); end.setUint32(16, cdOff, true);
  return new Blob([lh, nm, bytes, cd, nm, end], { type: 'application/zip' });
}
let dl;
const dlReady = (async () => { try { dl = window.claude?.use ? await window.claude.use('downloads') : null; } catch { dl = null; } })();
window.__shedSave = async (blob, name) => {
  await dlReady;
  if (!dl) { // not inside an artifact viewer: normal browser download
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000); return;
  }
  let data = blob, filename = name;
  if (name.endsWith('.glb')) { data = zipOne(name, new Uint8Array(await blob.arrayBuffer())); filename = name.replace(/\.glb$/, '.zip'); }
  try { await dl.save({ filename, data }); } catch (e) { if (e?.code !== 'declined') console.warn('Download failed', e); }
};
