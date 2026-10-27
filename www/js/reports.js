// 報表：統計圖表、師傅薪資結算、匯出 Excel、備份
import * as store from './store.js';
import { $, esc, money, toast, today, shiftDate, shiftMonth, weekStart, lastDayOfMonth, md, ask, changed, crewHours } from './util.js';
import { formatNumber as fmt } from './units.js';
import { allSites, siteStats } from './sites.js';
import { exportWorkbook, saveTextFile } from './export.js';

function range() {
  return [$('#rp-from').value, $('#rp-to').value];
}
const inRange = (r) => {
  const [from, to] = range();
  return r.date >= from && r.date <= to;
};

function setRange(preset) {
  const t = today();
  const ym = t.slice(0, 7);
  const ws = weekStart(t);
  const ranges = {
    week: [ws, shiftDate(ws, 6)],
    lastweek: [shiftDate(ws, -7), shiftDate(ws, -1)],
    month: [ym + '-01', lastDayOfMonth(ym)],
    lastmonth: [shiftMonth(ym, -1) + '-01', lastDayOfMonth(shiftMonth(ym, -1))],
    year: [t.slice(0, 4) + '-01-01', t.slice(0, 4) + '-12-31'],
    all: ['2000-01-01', '2099-12-31'],
  };
  [$('#rp-from').value, $('#rp-to').value] = ranges[preset];
  document.querySelectorAll('#rp-presets .chip').forEach((c) => c.classList.toggle('on', c.dataset.preset === preset));
  renderReports();
}

// ---------- 圖表 ----------
function barRows(items, { signed = false } = {}) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return items
    .map(
      (i) => `<div class="hbar">
        <span class="label">${esc(i.label)}</span>
        <span class="track"><span class="fill ${signed && i.value < 0 ? 'neg-bg' : i.cls || ''}" style="width:${(Math.abs(i.value) / max) * 100}%"></span></span>
        <span class="val ${signed ? (i.value >= 0 ? 'pos' : 'neg') : ''}">${money(i.value)}</span>
      </div>`,
    )
    .join('');
}

function renderMonthly() {
  const to = range()[1].slice(0, 7);
  const end = to > today().slice(0, 7) ? today().slice(0, 7) : to;
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(end, i - 5));
  const data = months.map((m) => {
    const rows = store.all('ledger').filter((r) => r.date.startsWith(m));
    return {
      m,
      income: rows.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0),
      expense: rows.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
    };
  });
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  $('#chart-monthly').innerHTML = `<div class="cols">${data
    .map(
      (d) => `<div class="col" title="${d.m} 收入 ${money(d.income)} 支出 ${money(d.expense)}">
        <div class="bars">
          <span class="b inc" style="height:${(d.income / max) * 100}%"></span>
          <span class="b exp" style="height:${(d.expense / max) * 100}%"></span>
        </div>
        <span class="net ${d.income - d.expense >= 0 ? 'pos' : 'neg'}">${shortMoney(d.income - d.expense)}</span>
        <span class="m">${Number(d.m.slice(5))}月</span>
      </div>`,
    )
    .join('')}</div>
    <div class="legend"><span><i class="inc"></i>收入</span><span><i class="exp"></i>支出</span><span>數字為結餘</span></div>`;
}

function shortMoney(n) {
  const a = Math.abs(n);
  const s = a >= 10000 ? fmt(a / 10000, 1) + '萬' : Math.round(a).toLocaleString('zh-TW');
  return (n < 0 ? '−' : '') + s;
}

function renderCategories() {
  const rows = store.all('ledger').filter((r) => r.type === 'expense' && inRange(r));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const map = new Map();
  for (const r of rows) map.set(r.category, (map.get(r.category) || 0) + r.amount);
  const items = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: `${label} ${Math.round((value / total) * 100)}%`, value, cls: 'exp-bg' }));
  $('#chart-categories').innerHTML = items.length ? barRows(items) + `<p class="hint">支出合計 ${money(total)}</p>` : '<p class="hint">這段期間沒有支出</p>';
}

function renderSiteProfit() {
  const items = allSites()
    .map(siteStats)
    .sort((a, b) => b.profit - a.profit)
    .map((s) => ({ label: s.site, value: s.profit }));
  $('#chart-sites').innerHTML = items.length ? barRows(items, { signed: true }) + '<p class="hint">利潤 = 收入 − 支出 − 未付工資（全部期間）</p>' : '<p class="hint">還沒有工地資料</p>';
}

// ---------- 薪資結算 ----------
function payrollRows() {
  const map = new Map();
  for (const r of store.all('crew').filter(inRange)) {
    const p = map.get(r.worker) || { worker: r.worker, days: new Set(), hours: 0, total: 0, paid: 0, unpaidIds: [] };
    p.days.add(r.date);
    p.hours += crewHours(r);
    const w = Number(r.wage) || 0;
    p.total += w;
    if (r.paid) p.paid += w;
    else if (w) p.unpaidIds.push(r.id);
    map.set(r.worker, p);
  }
  return [...map.values()].sort((a, b) => b.total - b.paid - (a.total - a.paid));
}

function renderPayroll() {
  const rows = payrollRows();
  const unpaid = rows.reduce((s, p) => s + p.total - p.paid, 0);
  $('#payroll-summary').textContent = rows.length ? `${rows.length} 位師傅 · 未付合計 ${money(unpaid)}` : '這段期間沒有工班紀錄';
  $('#payroll-list').innerHTML = rows
    .map((p) => {
      const left = p.total - p.paid;
      return `<li>
        <div class="main">
          <b>${esc(p.worker)} ${left > 0 ? '<span class="pill warn">未付 ' + money(left) + '</span>' : p.total ? '<span class="pill ok">已結清</span>' : ''}</b>
          <span class="muted">${p.days.size} 天 · ${fmt(p.hours, 1)} 小時 · 應付 ${money(p.total)} · 已付 ${money(p.paid)}</span>
        </div>
        ${left > 0 ? `<button type="button" class="small-btn" data-settle="${esc(p.worker)}">結清</button>` : ''}
      </li>`;
    })
    .join('');
}

async function settle(worker) {
  const p = payrollRows().find((x) => x.worker === worker);
  if (!p || !p.unpaidIds.length) return;
  const [from, to] = range();
  const left = p.total - p.paid;
  if (!(await ask(`${worker} ${md(from)}～${md(to)} 的工資 ${money(left)} 標記為已付，並記入帳務支出？`, '結清'))) return;
  // 依工地分開記支出，工地利潤才算得準
  const bySite = new Map();
  for (const id of p.unpaidIds) {
    const r = store.get('crew', id);
    bySite.set(r.site, (bySite.get(r.site) || 0) + (Number(r.wage) || 0));
  }
  store.patch('crew', p.unpaidIds, { paid: true, paidDate: today() });
  for (const [site, amount] of bySite) {
    store.upsert('ledger', { type: 'expense', date: today(), amount, category: '工資', site, note: `${worker} ${md(from)}～${md(to)}`, photos: [] });
  }
  toast(`${worker} 已結清 ${money(left)}`);
  changed();
}

export function renderReports() {
  renderMonthly();
  renderCategories();
  renderSiteProfit();
  renderPayroll();
  $('#data-stats').textContent = `目前共有 ${store.all('crew').length} 筆工班紀錄、${store.all('ledger').length} 筆收支、${store.all('invoices').length} 筆請款。`;
}

export function initReports() {
  $('#rp-presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (b) setRange(b.dataset.preset);
  });
  ['#rp-from', '#rp-to'].forEach((s) =>
    $(s).addEventListener('change', () => {
      document.querySelectorAll('#rp-presets .chip').forEach((c) => c.classList.remove('on'));
      renderReports();
    }),
  );
  $('#payroll-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-settle]');
    if (b) settle(b.dataset.settle);
  });

  $('#ex-xlsx').addEventListener('click', async () => {
    const [from, to] = range();
    try {
      const name = await exportWorkbook({
        crew: store.all('crew').filter(inRange),
        ledger: store.all('ledger').filter(inRange),
        invoices: store.all('invoices').filter(inRange),
        payroll: payrollRows(),
        from,
        to,
        crewHours,
      });
      toast('已匯出 ' + name);
    } catch (err) {
      toast('匯出失敗：' + err.message);
    }
  });

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
    e.target.value = '';
    if (!file || !(await ask('還原會用備份檔取代目前所有資料，確定嗎？', '還原'))) return;
    try {
      store.importJSON(await file.text());
      toast('還原完成');
      changed();
    } catch (err) {
      toast('還原失敗：' + err.message);
    }
  });

  setRange('month');
}
