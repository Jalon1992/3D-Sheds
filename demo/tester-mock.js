// Tester build: the 3D designer only (no admin link), running on the in-browser demo backend.
import './backend.js';
import './downloads.js';

addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.innerHTML = '<b>Test drive</b> — design a shed, drag doors & windows, try colors and options. Quotes are only a test and aren\'t sent anywhere. <button type="button" id="demoStartOver">Start over</button>';
  document.body.prepend(b);
  b.querySelector('#demoStartOver').onclick = () => {
    if (!confirm('Start over with a fresh shed?')) return;
    try { localStorage.removeItem('shedbuilder-location'); } catch { /* ignore */ }
    if (window.__shedDemoReset) window.__shedDemoReset(); else location.reload();
  };
  const p = document.getElementById('planPrint'); if (p && window.parent !== window) p.hidden = true;
});
