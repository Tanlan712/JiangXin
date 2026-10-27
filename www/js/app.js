import { UNIT_GROUPS, convert, timberCai, CAI_TO_M3, PING_TO_M2, formatNumber } from './units.js';
import * as store from './store.js';
import { exportWorkbook, saveTextFile } from './export.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const EXPENSE_CATEGORIES = ['工資', '材料', '工具', '機具租用', '運費', '油資', '餐費', '雜支'];
const INCOME_CATEGORIES = ['工程款', '訂金', '追加款', '其他收入'];

// ---------- 共用 ----------
function pad(n) {
  return String(n).padStart(2, '0');
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function shiftMonth(ym, months) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function money(n) {
  return '$' + Math.round(n).toLocaleString('zh-TW');
}
function weekday(iso) {
  return '日一二三四五六'[new Date(iso + 'T00:00:00').getDay()];
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}
function fillDatalist(id, values) {
  $(id).innerHTML = values.map((v) => `<option value="${esc(v)}">`).join('');
}

// 工時：收工早於上工視為跨夜
export function crewHours(r) {
  const [sh, sm] = r.start.split(':').map(Number);
  const [eh, em] = r.end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  mins -= Number(r.breakMin) || 0;
  return Math.max(0, mins) / 60;
}

// ---------- 分頁 ----------
const TITLES = { convert: '單位換算', crew: '工班紀錄', ledger: '收支帳務', export: '匯出與備份' };
function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#page-title').textContent = TITLES[name];
  if (name === 'export') renderStats();
  window.scrollTo(0, 0);
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- 單位換算 ----------
let groupIdx = 0;
function renderGroups() {
  $('#unit-groups').innerHTML = UNIT_GROUPS.map(
    (g, i) => `<button type="button" class="chip ${i === groupIdx ? 'on' : ''}" data-i="${i}">${g.name}</button>`,
  ).join('');
  $('#conv-unit').innerHTML = UNIT_GROUPS[groupIdx].units
    .map((u, i) => `<option value="${i}">${u.name}</option>`)
    .join('');
  renderConversion();
}
function renderConversion() {
  const group = UNIT_GROUPS[groupIdx];
  const from = group.units[$('#conv-unit').value || 0];
  const v = parseFloat($('#conv-value').value);
  $('#conv-results').innerHTML = group.units
    .filter((u) => u !== from)
    .map((u) => `<li><span>${u.name}</span><b>${Number.isFinite(v) ? formatNumber(convert(v, from.factor, u.factor)) : '—'}</b></li>`)
    .join('');
}
$('#unit-groups').addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  groupIdx = Number(b.dataset.i);
  renderGroups();
});
$('#conv-value').addEventListener('input', renderConversion);
$('#conv-unit').addEventListener('change', renderConversion);

function renderTimber() {
  const [w, t, l, q] = ['#tm-w', '#tm-t', '#tm-l', '#tm-q'].map((s) => parseFloat($(s).value));
  if (![w, t, l].every(Number.isFinite)) {
    $('#tm-result').textContent = '—';
    return;
  }
  const cai = timberCai(w, t, l, Number.isFinite(q) ? q : 1);
  $('#tm-result').innerHTML = `${formatNumber(cai, 3)} 才<small>${formatNumber(cai * CAI_TO_M3, 4)} 立方公尺 · ${formatNumber(cai / 100, 4)} 石</small>`;
}
['#tm-w', '#tm-t', '#tm-l', '#tm-q'].forEach((s) => $(s).addEventListener('input', renderTimber));

function renderPing() {
  const l = parseFloat($('#pg-l').value);
  const w = parseFloat($('#pg-w').value);
  if (!Number.isFinite(l) || !Number.isFinite(w)) {
    $('#pg-result').textContent = '—';
    return;
  }
  const len = UNIT_GROUPS[0].units.find((u) => u.id === $('#pg-unit').value).factor;
  const m2 = l * len * w * len;
  $('#pg-result').innerHTML = `${formatNumber(m2 / PING_TO_M2, 3)} 坪<small>${formatNumber(m2, 3)} 平方公尺</small>`;
}
['#pg-l', '#pg-w'].forEach((s) => $(s).addEventListener('input', renderPing));
$('#pg-unit').addEventListener('change', renderPing);

// ---------- 工班紀錄 ----------
const crewForm = $('#crew-form');

function renderCrew() {
  const day = $('#crew-day').value;
  const rows = store
    .all('crew')
    .filter((r) => r.date === day)
    .sort((a, b) => a.site.localeCompare(b.site) || a.start.localeCompare(b.start));
  const hours = rows.reduce((s, r) => s + crewHours(r), 0);
  const wages = rows.reduce((s, r) => s + (Number(r.wage) || 0), 0);
  const people = new Set(rows.map((r) => r.worker)).size;
  $('#crew-summary').innerHTML = rows.length
    ? `星期${weekday(day)} · ${people} 人 · 共 ${formatNumber(hours, 1)} 小時${wages ? ' · 工資 ' + money(wages) : ''}`
    : `星期${weekday(day)} · 這天還沒有紀錄`;
  $('#crew-list').innerHTML = rows
    .map(
      (r) => `<li>
        <div class="main">
          <b>${esc(r.worker)}</b>
          <span>${esc(r.site)}</span>
          <span class="muted">${r.start}–${r.end} · ${formatNumber(crewHours(r), 1)} 小時${r.wage ? ' · ' + money(r.wage) : ''}${r.note ? ' · ' + esc(r.note) : ''}</span>
        </div>
        <div class="actions">
          <button class="icon-btn" data-edit="${r.id}" aria-label="編輯">✎</button>
          <button class="icon-btn danger" data-del="${r.id}" aria-label="刪除">✕</button>
        </div>
      </li>`,
    )
    .join('');
  refreshSuggestions();
}

function resetCrewForm() {
  const keep = { site: crewForm.site.value, start: crewForm.start.value, end: crewForm.end.value, breakMin: crewForm.breakMin.value };
  crewForm.reset();
  crewForm.id.value = '';
  crewForm.date.value = $('#crew-day').value;
  crewForm.site.value = keep.site;
  crewForm.start.value = keep.start || '08:00';
  crewForm.end.value = keep.end || '17:00';
  crewForm.breakMin.value = keep.breakMin || '60';
  $('#crew-form-title').textContent = '新增工班紀錄';
  $('#crew-cancel').hidden = true;
}

crewForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = crewForm;
  const base = {
    date: f.date.value,
    site: f.site.value.trim(),
    start: f.start.value,
    end: f.end.value,
    breakMin: Number(f.breakMin.value) || 0,
    wage: f.wage.value === '' ? '' : Number(f.wage.value),
    note: f.note.value.trim(),
  };
  if (f.id.value) {
    store.upsert('crew', { ...base, id: f.id.value, worker: f.worker.value.trim() });
    toast('已更新');
  } else {
    const names = f.worker.value.split(/[,，、\s]+/).map((s) => s.trim()).filter(Boolean);
    store.addMany('crew', names.map((worker) => ({ ...base, worker })));
    toast(`已新增 ${names.length} 筆`);
  }
  $('#crew-day').value = base.date;
  resetCrewForm();
  renderCrew();
});

$('#crew-cancel').addEventListener('click', resetCrewForm);

$('#crew-list').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  const edit = e.target.closest('[data-edit]');
  if (del && confirm('確定刪除這筆紀錄？')) {
    store.remove('crew', del.dataset.del);
    renderCrew();
  }
  if (edit) {
    const r = store.all('crew').find((x) => x.id === edit.dataset.edit);
    for (const k of ['id', 'date', 'site', 'worker', 'start', 'end', 'breakMin', 'wage', 'note']) crewForm[k].value = r[k] ?? '';
    $('#crew-form-title').textContent = '編輯工班紀錄';
    $('#crew-cancel').hidden = false;
    crewForm.scrollIntoView({ behavior: 'smooth' });
  }
});

$$('[data-crew-shift]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#crew-day').value = shiftDate($('#crew-day').value, Number(b.dataset.crewShift));
    crewForm.date.value = $('#crew-day').value;
    renderCrew();
  }),
);
$('#crew-day').addEventListener('change', () => {
  crewForm.date.value = $('#crew-day').value;
  renderCrew();
});

$('#worker-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const cur = crewForm.worker.value.split(/[,，、\s]+/).filter(Boolean);
  if (!cur.includes(b.dataset.v)) cur.push(b.dataset.v);
  crewForm.worker.value = cur.join(', ');
});

// ---------- 收支帳務 ----------
const ledgerForm = $('#ledger-form');

function ledgerType() {
  return ledgerForm.querySelector('input[name=type]:checked').value;
}

function renderCategoryChips() {
  const defaults = ledgerType() === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const used = store.all('ledger').filter((r) => r.type === ledgerType()).map((r) => r.category);
  const cats = [...new Set([...defaults, ...used])];
  $('#category-chips').innerHTML = cats.map((c) => `<button type="button" class="chip" data-v="${esc(c)}">${esc(c)}</button>`).join('');
  fillDatalist('#dl-categories', cats);
}

function renderLedger() {
  const ym = $('#ledger-month').value;
  const rows = store.all('ledger').filter((r) => r.date.startsWith(ym));
  const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  $('#ledger-totals').innerHTML = `
    <div><span>收入</span><b class="pos">${money(income)}</b></div>
    <div><span>支出</span><b class="neg">${money(expense)}</b></div>
    <div><span>結餘</span><b class="${income - expense >= 0 ? 'pos' : 'neg'}">${money(income - expense)}</b></div>`;

  const byDay = new Map();
  for (const r of rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }
  const days = [...byDay.keys()].sort().reverse();
  $('#ledger-list').innerHTML = days.length
    ? days
        .map((d) => {
          const items = byDay.get(d);
          const net = items.reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);
          return `<div class="day-group">
            <div class="day-head"><span>${d.slice(5).replace('-', '/')}（${weekday(d)}）</span><span class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></div>
            <ul class="list">${items
              .map(
                (r) => `<li>
                <div class="main">
                  <b>${esc(r.category)}</b>
                  <span class="muted">${[r.site, r.note].filter(Boolean).map(esc).join(' · ')}</span>
                </div>
                <b class="${r.type === 'income' ? 'pos' : 'neg'}">${r.type === 'income' ? '+' : '−'}${money(r.amount)}</b>
                <div class="actions">
                  <button class="icon-btn" data-edit="${r.id}" aria-label="編輯">✎</button>
                  <button class="icon-btn danger" data-del="${r.id}" aria-label="刪除">✕</button>
                </div>
              </li>`,
              )
              .join('')}</ul>
          </div>`;
        })
        .join('')
    : '<p class="hint">這個月還沒有收支紀錄</p>';
  renderCategoryChips();
  refreshSuggestions();
}

function resetLedgerForm() {
  const date = ledgerForm.date.value;
  ledgerForm.reset();
  ledgerForm.id.value = '';
  ledgerForm.date.value = date || today();
  $('#ledger-form-title').textContent = '新增一筆';
  $('#ledger-cancel').hidden = true;
  renderCategoryChips();
}

ledgerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = ledgerForm;
  const record = {
    type: ledgerType(),
    date: f.date.value,
    amount: Number(f.amount.value),
    category: f.category.value.trim(),
    site: f.site.value.trim(),
    note: f.note.value.trim(),
  };
  if (f.id.value) record.id = f.id.value;
  store.upsert('ledger', record);
  toast(f.id.value ? '已更新' : '已記錄');
  $('#ledger-month').value = record.date.slice(0, 7);
  resetLedgerForm();
  renderLedger();
});

$('#ledger-cancel').addEventListener('click', resetLedgerForm);

ledgerForm.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', renderCategoryChips));

$('#category-chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (b) ledgerForm.category.value = b.dataset.v;
});

$('#ledger-list').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  const edit = e.target.closest('[data-edit]');
  if (del && confirm('確定刪除這筆收支？')) {
    store.remove('ledger', del.dataset.del);
    renderLedger();
  }
  if (edit) {
    const r = store.all('ledger').find((x) => x.id === edit.dataset.edit);
    ledgerForm.querySelector(`input[name=type][value=${r.type}]`).checked = true;
    for (const k of ['id', 'date', 'amount', 'category', 'site', 'note']) ledgerForm[k].value = r[k] ?? '';
    $('#ledger-form-title').textContent = '編輯收支';
    $('#ledger-cancel').hidden = false;
    renderCategoryChips();
    ledgerForm.scrollIntoView({ behavior: 'smooth' });
  }
});

$$('[data-ledger-shift]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#ledger-month').value = shiftMonth($('#ledger-month').value, Number(b.dataset.ledgerShift));
    renderLedger();
  }),
);
$('#ledger-month').addEventListener('change', renderLedger);

// ---------- 快速選單 ----------
function refreshSuggestions() {
  const sites = [...new Set([...store.distinct('crew', 'site'), ...store.distinct('ledger', 'site')])];
  fillDatalist('#dl-sites', sites);
  const workers = store.distinct('crew', 'worker');
  fillDatalist('#dl-workers', workers);
  $('#worker-chips').innerHTML = workers
    .slice(0, 12)
    .map((w) => `<button type="button" class="chip" data-v="${esc(w)}">${esc(w)}</button>`)
    .join('');
}

// ---------- 匯出／備份 ----------
function setRange(preset) {
  const t = today();
  const ym = t.slice(0, 7);
  const ranges = {
    month: [ym + '-01', t],
    lastmonth: [shiftMonth(ym, -1) + '-01', shiftDate(ym + '-01', -1)],
    year: [t.slice(0, 4) + '-01-01', t],
    all: ['2000-01-01', '2099-12-31'],
  };
  [$('#ex-from').value, $('#ex-to').value] = ranges[preset];
}
$('#ex-presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-preset]');
  if (b) setRange(b.dataset.preset);
});

$('#ex-xlsx').addEventListener('click', async () => {
  const from = $('#ex-from').value;
  const to = $('#ex-to').value;
  const inRange = (r) => r.date >= from && r.date <= to;
  try {
    const name = await exportWorkbook({
      crew: store.all('crew').filter(inRange),
      ledger: store.all('ledger').filter(inRange),
      from,
      to,
      crewHours,
    });
    toast('已匯出 ' + name);
  } catch (err) {
    toast('匯出失敗：' + err.message);
  }
});

function renderStats() {
  $('#data-stats').textContent = `目前共有 ${store.all('crew').length} 筆工班紀錄、${store.all('ledger').length} 筆收支。`;
}

$('#bk-save').addEventListener('click', async () => {
  try {
    const name = `JiangXin_backup_${today()}.json`;
    await saveTextFile(name, store.exportJSON(), 'application/json');
    toast('已下載 ' + name);
  } catch (err) {
    toast('備份失敗：' + err.message);
  }
});
$('#bk-load').addEventListener('click', () => $('#bk-file').click());
$('#bk-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('還原會用備份檔取代目前所有資料，確定嗎？')) return;
  try {
    store.importJSON(await file.text());
    renderCrew();
    renderLedger();
    renderStats();
    toast('還原完成');
  } catch (err) {
    toast('還原失敗：' + err.message);
  }
  e.target.value = '';
});

// ---------- 啟動 ----------
$('#crew-day').value = today();
$('#ledger-month').value = today().slice(0, 7);
crewForm.date.value = today();
ledgerForm.date.value = today();
setRange('month');
renderGroups();
renderCrew();
renderLedger();

if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
  navigator.serviceWorker.register('sw.js');
}
