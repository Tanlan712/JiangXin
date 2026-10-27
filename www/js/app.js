import * as store from './store.js';
import { $, $$, onChange, fillDatalist } from './util.js';
import { initConvert } from './convert.js';
import { initCrew, renderCrew } from './crew.js';
import { initLedger, renderLedger } from './ledger.js';
import { initSites, renderSites, allSites } from './sites.js';
import { initReports, renderReports } from './reports.js';
import { attachMic } from './voice.js';

const TITLES = { convert: '單位換算', crew: '工班紀錄', ledger: '收支帳務', sites: '工地與請款', reports: '報表與薪資' };

function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#page-title').textContent = TITLES[name];
  window.scrollTo(0, 0);
}

function refreshSuggestions() {
  fillDatalist('#dl-sites', allSites().filter((s) => !s.startsWith('（')));
  fillDatalist('#dl-workers', store.distinct('crew', 'worker'));
}

function renderAll() {
  refreshSuggestions();
  renderCrew();
  renderLedger();
  renderSites();
  renderReports();
}

$$('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-goto]');
  if (go) showTab(go.dataset.goto);
});
$('#viewer').addEventListener('click', () => ($('#viewer').hidden = true));

initConvert();
initCrew();
initLedger();
initSites();
initReports();
attachMic($('#invoice-form').note);
onChange(renderAll);
renderAll();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register('sw.js');
}
