// 換算頁：單位換算、木材材積、坪數、鋼筋、混凝土、油漆、磁磚
import { UNIT_GROUPS, convert, timberCai, CAI_TO_M3, PING_TO_M2, REBARS, US_GALLON_L, formatNumber as fmt } from './units.js';
import { $, $$ } from './util.js';

let groupIdx = 0;

function renderGroups() {
  $('#unit-groups').innerHTML = UNIT_GROUPS.map(
    (g, i) => `<button type="button" class="chip ${i === groupIdx ? 'on' : ''}" data-i="${i}">${g.name}</button>`,
  ).join('');
  $('#conv-unit').innerHTML = UNIT_GROUPS[groupIdx].units.map((u, i) => `<option value="${i}">${u.name}</option>`).join('');
  renderConversion();
}

function renderConversion() {
  const group = UNIT_GROUPS[groupIdx];
  const from = group.units[$('#conv-unit').value || 0];
  const v = parseFloat($('#conv-value').value);
  $('#conv-results').innerHTML = group.units
    .filter((u) => u !== from)
    .map((u) => `<li><span>${u.name}</span><b>${Number.isFinite(v) ? fmt(convert(v, from.factor, u.factor)) : '—'}</b></li>`)
    .join('');
}

const num = (sel) => parseFloat($(sel).value);
const lengthFactor = (id) => UNIT_GROUPS[0].units.find((u) => u.id === id).factor;
const areaM2 = (value, unit) => (unit === 'ping' ? value * PING_TO_M2 : value);

const calculators = {
  timber() {
    const [w, t, l, q] = ['#tm-w', '#tm-t', '#tm-l', '#tm-q'].map(num);
    if (![w, t, l].every(Number.isFinite)) return '—';
    const cai = timberCai(w, t, l, Number.isFinite(q) ? q : 1);
    return `${fmt(cai, 3)} 才<small>${fmt(cai * CAI_TO_M3, 4)} 立方公尺 · ${fmt(cai / 100, 4)} 石</small>`;
  },
  ping() {
    const [l, w] = [num('#pg-l'), num('#pg-w')];
    if (!Number.isFinite(l) || !Number.isFinite(w)) return '—';
    const f = lengthFactor($('#pg-unit').value);
    const m2 = l * f * w * f;
    return `${fmt(m2 / PING_TO_M2, 3)} 坪<small>${fmt(m2, 3)} 平方公尺</small>`;
  },
  rebar() {
    const bar = REBARS[$('#rb-size').value];
    const [len, qty] = [num('#rb-len'), num('#rb-qty')];
    if (!Number.isFinite(len)) return '—';
    const kg = bar.kgm * len * (Number.isFinite(qty) ? qty : 1);
    return `${fmt(kg, 1)} 公斤<small>${fmt(kg / 1000, 3)} 公噸 · 單位重 ${bar.kgm} kg/m</small>`;
  },
  concrete() {
    const [l, w, t] = [num('#cc-l'), num('#cc-w'), num('#cc-t')];
    if (![l, w, t].every(Number.isFinite)) return '—';
    const loss = num('#cc-loss') || 0;
    const truck = num('#cc-truck') || 0;
    const m3 = l * w * (t / 100) * (1 + loss / 100);
    return `${fmt(m3, 2)} 方（立方公尺）<small>含損耗 ${loss}%${truck ? ` · 約 ${Math.ceil(m3 / truck)} 車（每車 ${truck} 方）` : ''}</small>`;
  },
  paint() {
    const area = num('#pt-area');
    if (!Number.isFinite(area)) return '—';
    const m2 = areaM2(area, $('#pt-unit').value);
    const coats = num('#pt-coats') || 1;
    const cover = num('#pt-cover') || 10;
    const liters = (m2 * coats) / cover;
    const gal = liters / US_GALLON_L;
    return `${fmt(liters, 1)} 公升<small>約 ${fmt(gal, 1)} 加侖 · ${Math.ceil(gal / 5)} 桶（5 加侖）</small>`;
  },
  tile() {
    const area = num('#tl-area');
    const [tw, th] = [num('#tl-w'), num('#tl-h')];
    if (![area, tw, th].every(Number.isFinite) || !tw || !th) return '—';
    const m2 = areaM2(area, $('#tl-unit').value);
    const loss = num('#tl-loss') || 0;
    const pieces = Math.ceil(((m2 / ((tw / 100) * (th / 100))) * (1 + loss / 100)));
    const perBox = num('#tl-box');
    return `${pieces.toLocaleString('zh-TW')} 片<small>${fmt(m2, 2)} 平方公尺 · 含損耗 ${loss}%${perBox ? ` · ${Math.ceil(pieces / perBox)} 箱` : ''}</small>`;
  },
};

function renderCalc(card) {
  const name = card.dataset.calc;
  $('.big-result', card).innerHTML = calculators[name]();
}

export function initConvert() {
  $('#rb-size').innerHTML = REBARS.map((r, i) => `<option value="${i}">${r.no}（${r.d}）</option>`).join('');
  $('#rb-size').value = '1';
  $('#unit-groups').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    groupIdx = Number(b.dataset.i);
    renderGroups();
  });
  $('#conv-value').addEventListener('input', renderConversion);
  $('#conv-unit').addEventListener('change', renderConversion);

  // 計算機切換
  $('#calc-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]');
    if (!b) return;
    $$('#calc-tabs .chip').forEach((c) => c.classList.toggle('on', c === b));
    $$('[data-calc]').forEach((c) => (c.hidden = c.dataset.calc !== b.dataset.show));
  });
  $$('[data-calc]').forEach((card) => {
    card.addEventListener('input', () => renderCalc(card));
    card.addEventListener('change', () => renderCalc(card));
    renderCalc(card);
  });
  renderGroups();
}
