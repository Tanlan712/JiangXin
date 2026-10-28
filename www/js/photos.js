// 照片存在手機的 IndexedDB（容量比 localStorage 大很多），拍照後先壓縮
import { $, esc } from './util.js';

const DB_NAME = 'jiangxin-photos';
const STORE = 'photos';
const MAX_SIDE = 1600;

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function compress(file) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || file), 'image/jpeg', 0.8));
}

export async function addPhoto(file) {
  const blob = await compress(file);
  const id = newId();
  await tx('readwrite', (s) => s.put(blob, id));
  return id;
}

export function getPhoto(id) {
  return tx('readonly', (s) => s.get(id));
}

export async function deletePhotos(ids = []) {
  for (const id of ids) await tx('readwrite', (s) => s.delete(id));
}

// 把 <img data-photo="id"> 換成真正的圖片
const urls = new Map();
export async function hydrate(root = document) {
  for (const img of root.querySelectorAll('img[data-photo]:not([src])')) {
    const id = img.dataset.photo;
    if (!urls.has(id)) {
      const blob = await getPhoto(id);
      if (!blob) continue;
      urls.set(id, URL.createObjectURL(blob));
    }
    img.src = urls.get(id);
  }
}

export function thumbs(ids = []) {
  if (!ids.length) return '';
  return `<div class="thumbs">${ids.map((id) => `<img data-photo="${esc(id)}" alt="照片" loading="lazy">`).join('')}</div>`;
}

// 表單上的照片欄位：拍照／相簿＋預覽＋刪除
export class PhotoField {
  constructor(container) {
    this.el = container;
    this.ids = [];
    this.removed = [];
    container.innerHTML = `
      <div class="photo-buttons">
        <label class="btn-like"><span class="ms" aria-hidden="true">photo_camera</span>拍照<input type="file" accept="image/*" capture="environment" hidden></label>
        <label class="btn-like"><span class="ms" aria-hidden="true">photo_library</span>相簿<input type="file" accept="image/*" multiple hidden></label>
      </div>
      <div class="thumbs editable"></div>`;
    container.querySelectorAll('input[type=file]').forEach((input) =>
      input.addEventListener('change', async () => {
        for (const f of input.files) this.ids.push(await addPhoto(f));
        input.value = '';
        this.render();
      }),
    );
    container.querySelector('.thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (!b) return;
      this.removed.push(b.dataset.rm);
      this.ids = this.ids.filter((id) => id !== b.dataset.rm);
      this.render();
    });
  }
  set(ids = []) {
    this.ids = [...ids];
    this.removed = [];
    this.render();
  }
  // 儲存時呼叫：刪掉被移除的照片
  async commit() {
    await deletePhotos(this.removed);
    this.removed = [];
    return [...this.ids];
  }
  // 取消時呼叫：刪掉這次新拍但沒存的照片
  async discard(keep = []) {
    const keepSet = new Set(keep);
    await deletePhotos(this.ids.filter((id) => !keepSet.has(id)));
    this.set([]);
  }
  render() {
    const box = this.el.querySelector('.thumbs');
    box.innerHTML = this.ids
      .map((id) => `<span class="thumb"><img data-photo="${esc(id)}" alt="照片"><button type="button" data-rm="${esc(id)}" aria-label="移除照片"><span class="ms" aria-hidden="true">close</span></button></span>`)
      .join('');
    hydrate(box);
  }
}

// 點縮圖看大圖
document.addEventListener('click', (e) => {
  const img = e.target.closest('.thumbs:not(.editable) img[data-photo]');
  if (!img) return;
  const viewer = $('#viewer');
  $('#viewer img').src = img.src;
  viewer.hidden = false;
});
