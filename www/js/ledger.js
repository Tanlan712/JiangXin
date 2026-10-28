// 收支帳務
import * as store from './store.js';
import { $, $$, esc, money, toast, today, shiftMonth, weekday, md, ask, changed, fillDatalist } from './util.js';
import { PhotoField, thumbs, hydrate, deletePhotos } from './photos.js';
import { attachMic } from './voice.js';
import { outstanding } from './sites.js';

export const EXPENSE_CATEGORIES = ['工資', '材料', '工具', '機具租用', '運費', '油資', '餐費', '雜支'];
export const INCOME_CATEGORIES = ['工程款', '訂金', '追加款', '其他收入'];

const form = () => $('#ledger-form');
let photoField;
let editingPhotos = [];

function ledgerType() {
  return form().querySelector('input[name=type]:checked').value;
}

function renderCategoryChips() {
  const type = ledgerType();
  const defaults = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const used = store.all('ledger').filter((r) => r.type === type).map((r) => r.category);
  const cats = [...new Set([...defaults, ...used])];
  $('#category-chips').innerHTML = cats.map((c) => `<button type="button" class="chip" data-v="${esc(c)}">${esc(c)}</button>`).join('');
  fillDatalist('#dl-categories', cats);
}

function renderTemplates() {
  const list = store.all('templates');
  $('#tpl-chips').innerHTML = list.length
    ? list
        .map(
          (t) =>
            `<span class="chip tpl ${t.type}"><button type="button" data-tpl="${t.id}">${esc(t.label)}</button><button type="button" class="x" data-tpl-del="${t.id}" aria-label="刪除常用"><span class="ms" aria-hidden="true">close</span></button></span>`,
        )
        .join('')
    : '<span class="hint">填好下面的表單後按「存成常用」，下次一鍵帶入。</span>';
}

function renderBanner() {
  const due = outstanding();
  const overdue = due.filter((i) => i.dueDate && i.dueDate < today());
  const total = due.reduce((s, i) => s + i.amount - (i.receivedAmount || 0), 0);
  $('#ledger-banner').hidden = !due.length;
  $('#ledger-banner').innerHTML = due.length
    ? `<b>未收款 ${due.length} 筆，共 ${money(total)}</b>${overdue.length ? `<span>其中 ${overdue.length} 筆已過期</span>` : ''}<button type="button" class="link" data-goto="sites">查看</button>`
    : '';
}

export function renderLedger() {
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
            <div class="day-head"><span>${md(d)}（${weekday(d)}）</span><span class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : '−'}${money(Math.abs(net))}</span></div>
            <ul class="list">${items
              .map(
                (r) => `<li>
                <div class="main">
                  <b>${esc(r.category)}</b>
                  <span class="muted">${[r.site, r.note].filter(Boolean).map(esc).join(' · ')}</span>
                  ${thumbs(r.photos)}
                </div>
                <b class="${r.type === 'income' ? 'pos' : 'neg'}">${r.type === 'income' ? '+' : '−'}${money(r.amount)}</b>
                <div class="actions">
                  <button class="icon-btn" data-edit="${r.id}" aria-label="編輯"><span class="ms" aria-hidden="true">edit</span></button>
                  <button class="icon-btn danger" data-del="${r.id}" aria-label="刪除"><span class="ms" aria-hidden="true">delete</span></button>
                </div>
              </li>`,
              )
              .join('')}</ul>
          </div>`;
        })
        .join('')
    : '<p class="hint">這個月還沒有收支紀錄</p>';
  hydrate($('#ledger-list'));
  renderCategoryChips();
  renderTemplates();
  renderBanner();
}

function resetForm() {
  const f = form();
  const date = f.date.value;
  f.reset();
  f.id.value = '';
  f.date.value = date || today();
  $('#ledger-form-title').textContent = '新增一筆';
  $('#ledger-cancel').hidden = true;
  photoField.set([]);
  editingPhotos = [];
  renderCategoryChips();
}

function setType(type) {
  form().querySelector(`input[name=type][value=${type}]`).checked = true;
  renderCategoryChips();
}

export function initLedger() {
  const f = form();
  photoField = new PhotoField($('#ledger-photos'));
  attachMic(f.note);
  $('#ledger-month').value = today().slice(0, 7);
  f.date.value = today();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const record = {
      type: ledgerType(),
      date: f.date.value,
      amount: Number(f.amount.value),
      category: f.category.value.trim(),
      site: f.site.value.trim(),
      note: f.note.value.trim(),
      photos: await photoField.commit(),
    };
    if (f.id.value) record.id = f.id.value;
    store.upsert('ledger', record);
    toast(f.id.value ? '已更新' : '已記錄');
    $('#ledger-month').value = record.date.slice(0, 7);
    photoField.set([]);
    resetForm();
    changed();
  });

  $('#ledger-cancel').addEventListener('click', async () => {
    await photoField.discard(editingPhotos);
    resetForm();
  });

  f.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', renderCategoryChips));

  $('#category-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (b) f.category.value = b.dataset.v;
  });

  // 常用項目
  $('#tpl-save').addEventListener('click', () => {
    if (!f.category.value.trim()) return toast('先填類別再存成常用');
    const label = [f.category.value.trim(), f.note.value.trim()].filter(Boolean).join(' ') + (f.amount.value ? ` ${money(Number(f.amount.value))}` : '');
    store.upsert('templates', {
      label,
      type: ledgerType(),
      category: f.category.value.trim(),
      amount: f.amount.value,
      site: f.site.value.trim(),
      note: f.note.value.trim(),
    });
    toast('已存成常用');
    renderTemplates();
  });
  $('#tpl-chips').addEventListener('click', async (e) => {
    const use = e.target.closest('[data-tpl]');
    const del = e.target.closest('[data-tpl-del]');
    if (use) {
      const t = store.get('templates', use.dataset.tpl);
      setType(t.type);
      for (const k of ['category', 'amount', 'site', 'note']) f[k].value = t[k] ?? '';
      f.amount.focus();
    }
    if (del && (await ask('刪除這個常用項目？', '刪除'))) {
      store.remove('templates', del.dataset.tplDel);
      renderTemplates();
    }
  });

  $('#ledger-list').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    const edit = e.target.closest('[data-edit]');
    if (del && (await ask('確定刪除這筆收支？', '刪除'))) {
      const r = store.get('ledger', del.dataset.del);
      await deletePhotos(r.photos);
      store.remove('ledger', r.id);
      changed();
    }
    if (edit) {
      const r = store.get('ledger', edit.dataset.edit);
      setType(r.type);
      for (const k of ['id', 'date', 'amount', 'category', 'site', 'note']) f[k].value = r[k] ?? '';
      editingPhotos = r.photos || [];
      photoField.set(editingPhotos);
      $('#ledger-form-title').textContent = '編輯收支';
      $('#ledger-cancel').hidden = false;
      f.scrollIntoView({ behavior: 'smooth' });
    }
  });

  $$('[data-ledger-shift]').forEach((b) =>
    b.addEventListener('click', () => {
      $('#ledger-month').value = shiftMonth($('#ledger-month').value, Number(b.dataset.ledgerShift));
      renderLedger();
    }),
  );
  $('#ledger-month').addEventListener('change', renderLedger);
}
