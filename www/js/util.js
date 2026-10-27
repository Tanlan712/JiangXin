// 共用小工具
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => root.querySelectorAll(sel);

export function pad(n) {
  return String(n).padStart(2, '0');
}
export function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function today() {
  return isoDate(new Date());
}
export function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
export function shiftMonth(ym, months) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function lastDayOfMonth(ym) {
  return shiftDate(shiftMonth(ym, 1) + '-01', -1);
}
// 星期一為一週開始
export function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00');
  const offset = (d.getDay() + 6) % 7;
  return shiftDate(iso, -offset);
}
export function weekday(iso) {
  return '日一二三四五六'[new Date(iso + 'T00:00:00').getDay()];
}
export function md(iso) {
  return iso.slice(5).replace('-', '/');
}
export function money(n) {
  const v = Math.round(n);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('zh-TW');
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2400);
}
export function fillDatalist(id, values) {
  $(id).innerHTML = values.map((v) => `<option value="${esc(v)}">`).join('');
}
export function splitNames(s) {
  return s.split(/[,，、\s]+/).map((x) => x.trim()).filter(Boolean);
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

// 頁面內的確認視窗（不依賴瀏覽器 confirm）
export function ask(message, okText = '確定') {
  return new Promise((resolve) => {
    const dlg = $('#confirm');
    $('#confirm-msg').textContent = message;
    $('#confirm-ok').textContent = okText;
    const done = (v) => {
      dlg.hidden = true;
      $('#confirm-ok').onclick = $('#confirm-cancel').onclick = null;
      resolve(v);
    };
    $('#confirm-ok').onclick = () => done(true);
    $('#confirm-cancel').onclick = () => done(false);
    dlg.hidden = false;
  });
}

// 簡單的事件匯流排：資料變更後讓各頁重新整理
const listeners = new Set();
export function onChange(fn) {
  listeners.add(fn);
}
export function changed() {
  for (const fn of listeners) fn();
}
