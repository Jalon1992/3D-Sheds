// Admin demo setup: point "Open configurator" at the builder page and show a banner.
window.__configuratorUrl = 'index.html';
addEventListener('DOMContentLoaded', () => {
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.innerHTML = '<b>Admin demo</b> — changes are saved in this browser only and show up in the <a href="index.html">3D builder</a>. Webhooks and GoHighLevel run only on your deployed app. <button type="button" id="demoReset">Reset demo data</button>';
  document.body.prepend(b);
  b.querySelector('#demoReset').onclick = () => {
    if (b.dataset.confirm) return window.__shedDemoReset();
    b.dataset.confirm = '1'; b.querySelector('#demoReset').textContent = 'Click again to reset everything';
  };
});
