// 資料存在手機本機（localStorage），不需要網路
const KEY = 'jiangxin-data-v1';

function emptyData() {
  return { crew: [], ledger: [] };
}

let data = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw);
    return { ...emptyData(), ...parsed };
  } catch {
    return emptyData();
  }
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function all(kind) {
  return data[kind];
}

export function upsert(kind, record) {
  const list = data[kind];
  if (record.id) {
    const i = list.findIndex((r) => r.id === record.id);
    if (i >= 0) list[i] = record;
    else list.push(record);
  } else {
    list.push({ ...record, id: newId() });
  }
  save();
}

export function addMany(kind, records) {
  for (const r of records) data[kind].push({ ...r, id: newId() });
  save();
}

export function remove(kind, id) {
  data[kind] = data[kind].filter((r) => r.id !== id);
  save();
}

export function exportJSON() {
  return JSON.stringify({ app: 'JiangXin', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed.crew) || !Array.isArray(parsed.ledger)) {
    throw new Error('檔案格式不對');
  }
  data = { crew: parsed.crew, ledger: parsed.ledger };
  save();
}

// 歷史輸入過的值，用來做快速選單
export function distinct(kind, field) {
  const counts = new Map();
  for (const r of data[kind]) {
    const v = (r[field] || '').trim();
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}
