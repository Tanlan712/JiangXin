// 工班紀錄
import * as store from './store.js';
import { $, $$, esc, money, toast, today, shiftDate, weekday, splitNames, crewHours, ask, changed, md } from './util.js';
import { formatNumber as fmt } from './units.js';
import { PhotoField, thumbs, hydrate, deletePhotos } from './photos.js';
import { attachMic } from './voice.js';

const form = () => $('#crew-form');
let photoField;
let editingPhotos = [];

export function renderCrew() {
  const day = $('#crew-day').value;
  const rows = store
    .all('crew')
    .filter((r) => r.date === day)
    .sort((a, b) => a.site.localeCompare(b.site) || a.start.localeCompare(b.start));
  const hours = rows.reduce((s, r) => s + crewHours(r), 0);
  const wages = rows.reduce((s, r) => s + (Number(r.wage) || 0), 0);
  const people = new Set(rows.map((r) => r.worker)).size;
  $('#crew-summary').innerHTML = rows.length
    ? `星期${weekday(day)} · ${people} 人 · 共 ${fmt(hours, 1)} 小時${wages ? ' · 工資 ' + money(wages) : ''}`
    : `星期${weekday(day)} · 這天還沒有紀錄`;
  $('#crew-list').innerHTML = rows
    .map(
      (r) => `<li>
        <div class="main">
          <b>${esc(r.worker)} ${r.wage ? `<span class="pill ${r.paid ? 'ok' : 'warn'}">${r.paid ? '已付' : '未付'}</span>` : ''}</b>
          <span>${esc(r.site)}</span>
          <span class="muted">${r.start}–${r.end} · ${fmt(crewHours(r), 1)} 小時${r.wage ? ' · ' + money(r.wage) : ''}${r.note ? ' · ' + esc(r.note) : ''}</span>
          ${thumbs(r.photos)}
        </div>
        <div class="actions">
          <button class="icon-btn" data-edit="${r.id}" aria-label="編輯">✎</button>
          <button class="icon-btn danger" data-del="${r.id}" aria-label="刪除">✕</button>
        </div>
      </li>`,
    )
    .join('');
  hydrate($('#crew-list'));
  renderWorkerChips();
}

function renderWorkerChips() {
  const workers = store.distinct('crew', 'worker');
  $('#worker-chips').innerHTML = workers
    .slice(0, 16)
    .map((w) => `<button type="button" class="chip" data-v="${esc(w)}">${esc(w)}</button>`)
    .join('');
}

function resetForm() {
  const f = form();
  const keep = { site: f.site.value, start: f.start.value, end: f.end.value, breakMin: f.breakMin.value };
  f.reset();
  f.id.value = '';
  f.date.value = $('#crew-day').value;
  f.site.value = keep.site;
  f.start.value = keep.start || '08:00';
  f.end.value = keep.end || '17:00';
  f.breakMin.value = keep.breakMin || '60';
  $('#crew-form-title').textContent = '新增工班紀錄';
  $('#crew-cancel').hidden = true;
  photoField.set([]);
  editingPhotos = [];
}

// 上一個有紀錄的日子（通常是昨天）
function previousDay(day) {
  const dates = [...new Set(store.all('crew').map((r) => r.date))].filter((d) => d < day).sort();
  return dates.at(-1);
}

async function copyPrevious() {
  const day = $('#crew-day').value;
  const prev = previousDay(day);
  if (!prev) return toast('之前沒有紀錄可以複製');
  const rows = store.all('crew').filter((r) => r.date === prev);
  if (!(await ask(`把 ${md(prev)}（${weekday(prev)}）的 ${rows.length} 筆紀錄複製到 ${md(day)}？`, '複製'))) return;
  store.addMany(
    'crew',
    rows.map(({ id, photos, paid, ...r }) => ({ ...r, date: day, photos: [], paid: false })),
  );
  toast(`已複製 ${rows.length} 筆`);
  changed();
}

function shiftDay(n) {
  $('#crew-day').value = shiftDate($('#crew-day').value, n);
  form().date.value = $('#crew-day').value;
  renderCrew();
}

export function initCrew() {
  const f = form();
  photoField = new PhotoField($('#crew-photos'));
  attachMic(f.note);
  $('#crew-day').value = today();
  f.date.value = today();

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = {
      date: f.date.value,
      site: f.site.value.trim(),
      start: f.start.value,
      end: f.end.value,
      breakMin: Number(f.breakMin.value) || 0,
      wage: f.wage.value === '' ? '' : Number(f.wage.value),
      note: f.note.value.trim(),
      photos: await photoField.commit(),
    };
    if (f.id.value) {
      const old = store.get('crew', f.id.value);
      store.upsert('crew', { ...old, ...base, worker: f.worker.value.trim() });
      toast('已更新');
    } else {
      const names = splitNames(f.worker.value);
      // 照片只掛在第一位，避免重複
      store.addMany('crew', names.map((worker, i) => ({ ...base, worker, paid: false, photos: i === 0 ? base.photos : [] })));
      toast(`已新增 ${names.length} 筆`);
    }
    $('#crew-day').value = base.date;
    photoField.set([]);
    resetForm();
    changed();
  });

  $('#crew-cancel').addEventListener('click', async () => {
    await photoField.discard(editingPhotos);
    resetForm();
  });

  $('#crew-list').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    const edit = e.target.closest('[data-edit]');
    if (del && (await ask('確定刪除這筆紀錄？', '刪除'))) {
      const r = store.get('crew', del.dataset.del);
      await deletePhotos(r.photos);
      store.remove('crew', r.id);
      changed();
    }
    if (edit) {
      const r = store.get('crew', edit.dataset.edit);
      for (const k of ['id', 'date', 'site', 'worker', 'start', 'end', 'breakMin', 'wage', 'note']) f[k].value = r[k] ?? '';
      editingPhotos = r.photos || [];
      photoField.set(editingPhotos);
      $('#crew-form-title').textContent = '編輯工班紀錄';
      $('#crew-cancel').hidden = false;
      f.scrollIntoView({ behavior: 'smooth' });
    }
  });

  $$('[data-crew-shift]').forEach((b) => b.addEventListener('click', () => shiftDay(Number(b.dataset.crewShift))));
  $('#crew-day').addEventListener('change', () => {
    f.date.value = $('#crew-day').value;
    renderCrew();
  });
  $('#crew-copy').addEventListener('click', copyPrevious);

  $('#worker-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const cur = splitNames(f.worker.value);
    if (!cur.includes(b.dataset.v)) cur.push(b.dataset.v);
    f.worker.value = cur.join(', ');
  });
}
