// 工地／案件：每個工地的工時、收支、利潤，以及請款與應收追蹤
import * as store from './store.js';
import { $, esc, money, toast, today, md, ask, changed, crewHours } from './util.js';
import { formatNumber as fmt } from './units.js';

const NO_SITE = '（未填工地）';

export function allSites() {
  const sites = [...new Set([...store.distinct('crew', 'site'), ...store.distinct('ledger', 'site'), ...store.distinct('invoices', 'site')])];
  const blank = [...store.all('crew'), ...store.all('ledger')].some((r) => !(r.site || '').trim());
  return blank ? [...sites, NO_SITE] : sites;
}

export function outstanding() {
  return store
    .all('invoices')
    .filter((i) => (i.receivedAmount || 0) < i.amount)
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
}

export function siteStats(site) {
  const match = (r) => (r.site || NO_SITE) === site;
  const crew = store.all('crew').filter(match);
  const ledger = store.all('ledger').filter(match);
  const invoices = store.all('invoices').filter(match);
  const income = ledger.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = ledger.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const unpaidWages = crew.filter((r) => !r.paid).reduce((s, r) => s + (Number(r.wage) || 0), 0);
  const billed = invoices.reduce((s, i) => s + i.amount, 0);
  const received = invoices.reduce((s, i) => s + (i.receivedAmount || 0), 0);
  const dates = [...crew, ...ledger].map((r) => r.date).sort();
  return {
    site,
    hours: crew.reduce((s, r) => s + crewHours(r), 0),
    workDays: new Set(crew.map((r) => r.date)).size,
    income,
    expense,
    unpaidWages,
    profit: income - expense - unpaidWages,
    billed,
    receivable: billed - received,
    first: dates[0],
    last: dates.at(-1),
  };
}

function statsGrid(s) {
  return `<div class="stat-grid">
    <div><span>收入</span><b class="pos">${money(s.income)}</b></div>
    <div><span>支出</span><b class="neg">${money(s.expense)}</b></div>
    <div><span>未付工資</span><b class="${s.unpaidWages ? 'neg' : ''}">${money(s.unpaidWages)}</b></div>
    <div><span>利潤</span><b class="${s.profit >= 0 ? 'pos' : 'neg'}">${money(s.profit)}</b></div>
    <div><span>出工</span><b>${s.workDays} 天 · ${fmt(s.hours, 1)} 時</b></div>
    <div><span>應收未收</span><b class="${s.receivable ? 'warn-text' : ''}">${money(s.receivable)}</b></div>
  </div>`;
}

function renderOverview() {
  const stats = allSites()
    .map(siteStats)
    .sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  $('#site-overview').innerHTML = stats.length
    ? stats
        .map(
          (s) => `<button type="button" class="site-card" data-site="${esc(s.site)}">
            <div class="site-head"><b>${esc(s.site)}</b><span class="${s.profit >= 0 ? 'pos' : 'neg'}">利潤 ${money(s.profit)}</span></div>
            <span class="muted">收入 ${money(s.income)} · 支出 ${money(s.expense)} · ${s.workDays} 天${s.receivable ? ` · <span class="warn-text">應收 ${money(s.receivable)}</span>` : ''}</span>
          </button>`,
        )
        .join('')
    : '<p class="hint">在工班或帳務填上工地名稱，這裡就會自動出現。</p>';
}

function invoiceRow(i) {
  const left = i.amount - (i.receivedAmount || 0);
  const overdue = left > 0 && i.dueDate && i.dueDate < today();
  const status = left <= 0 ? '<span class="pill ok">已收齊</span>' : overdue ? '<span class="pill bad">已過期</span>' : '<span class="pill warn">未收</span>';
  return `<li data-inv="${i.id}">
    <div class="main">
      <b>${money(i.amount)} ${status}</b>
      <span class="muted">${esc(i.site || NO_SITE)} · 請款 ${md(i.date)}${i.dueDate ? ` · 期限 ${md(i.dueDate)}` : ''}${i.note ? ' · ' + esc(i.note) : ''}</span>
      ${i.receivedAmount ? `<span class="muted">已收 ${money(i.receivedAmount)}${left > 0 ? `，還差 ${money(left)}` : ''}</span>` : ''}
      <form class="receive-form" hidden>
        <input name="amount" type="number" inputmode="decimal" value="${left > 0 ? left : ''}" aria-label="收到金額" required>
        <input name="date" type="date" value="${today()}" aria-label="收款日期" required>
        <button type="submit" class="primary">確認收款</button>
      </form>
    </div>
    <div class="actions">
      ${left > 0 ? '<button type="button" class="small-btn" data-receive>收款</button>' : ''}
      <button class="icon-btn danger" data-inv-del aria-label="刪除請款">✕</button>
    </div>
  </li>`;
}

function renderDetail() {
  const site = $('#site-select').value;
  $('#site-overview-card').hidden = !!site;
  $('#site-detail').hidden = !site;
  const invoices = store
    .all('invoices')
    .filter((i) => !site || (i.site || NO_SITE) === site)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (site) {
    $('#site-stats').innerHTML = statsGrid(siteStats(site));
    $('#invoice-form').site.value = site === NO_SITE ? '' : site;
  }
  const due = outstanding().filter((i) => !site || (i.site || NO_SITE) === site);
  $('#invoice-summary').textContent = due.length
    ? `未收 ${due.length} 筆，共 ${money(due.reduce((s, i) => s + i.amount - (i.receivedAmount || 0), 0))}`
    : '目前沒有未收款';
  $('#invoice-list').innerHTML = invoices.map(invoiceRow).join('') || '<li class="hint">還沒有請款紀錄</li>';
}

export function renderSites() {
  const sel = $('#site-select');
  const cur = sel.value;
  const sites = allSites();
  sel.innerHTML = `<option value="">全部工地</option>` + sites.map((s) => `<option>${esc(s)}</option>`).join('');
  sel.value = sites.includes(cur) ? cur : '';
  renderOverview();
  renderDetail();
}

export function initSites() {
  const f = $('#invoice-form');
  f.date.value = today();
  $('#site-select').addEventListener('change', renderDetail);
  $('#site-overview').addEventListener('click', (e) => {
    const b = e.target.closest('[data-site]');
    if (!b) return;
    $('#site-select').value = b.dataset.site;
    renderDetail();
    window.scrollTo(0, 0);
  });

  f.addEventListener('submit', (e) => {
    e.preventDefault();
    store.upsert('invoices', {
      site: f.site.value.trim(),
      date: f.date.value,
      dueDate: f.dueDate.value,
      amount: Number(f.amount.value),
      note: f.note.value.trim(),
      receivedAmount: 0,
    });
    toast('已記錄請款');
    f.amount.value = f.note.value = f.dueDate.value = '';
    changed();
  });

  $('#invoice-list').addEventListener('click', async (e) => {
    const li = e.target.closest('[data-inv]');
    if (!li) return;
    if (e.target.closest('[data-receive]')) {
      $('.receive-form', li).hidden = false;
      $('.receive-form input', li).focus();
    }
    if (e.target.closest('[data-inv-del]') && (await ask('刪除這筆請款？（已記入帳務的收款不會刪除）', '刪除'))) {
      store.remove('invoices', li.dataset.inv);
      changed();
    }
  });

  // 收款：更新請款單並自動記一筆收入
  $('#invoice-list').addEventListener('submit', (e) => {
    e.preventDefault();
    const li = e.target.closest('[data-inv]');
    const inv = store.get('invoices', li.dataset.inv);
    const amount = Number(e.target.amount.value);
    const date = e.target.date.value;
    if (!(amount > 0)) return;
    store.upsert('invoices', { ...inv, receivedAmount: (inv.receivedAmount || 0) + amount, receivedDate: date });
    store.upsert('ledger', { type: 'income', date, amount, category: '工程款', site: inv.site, note: `請款 ${md(inv.date)} 收款`, photos: [] });
    toast('已收款，並記入帳務收入');
    changed();
  });
}
