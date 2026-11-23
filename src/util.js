// Общие помощники для экранов.

export const $ = s => document.querySelector(s);

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) e.append(c);
  return e;
}

/** Сохранить файл: на iPhone откроется просмотр с кнопкой «Поделиться» (Файлы, Google Диск, печать). */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Отдать файл пользователю: на iPhone — меню «Поделиться» (Файлы, Google Диск, почта),
 * если оно недоступно — обычное скачивание.
 */
export async function shareOrSave(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; /* иначе — скачиваем */ }
  }
  saveBlob(blob, filename);
  return 'saved';
}

let exceljsPromise;
export const loadExcelJS = () => (exceljsPromise ??= new Promise((resolve, reject) => {
  if (window.ExcelJS) return resolve(window.ExcelJS);
  const s = document.createElement('script');
  s.src = 'vendor/exceljs/exceljs.bare.min.js';
  s.onload = () => resolve(window.ExcelJS);
  s.onerror = () => { exceljsPromise = null; reject(new Error('ExcelJS')); };
  document.head.append(s);
}));

let xlsxPromise;
export const loadXLSX = () => (xlsxPromise ??= import('../vendor/xlsx/xlsx.mjs'));

export async function readWorkbook(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  return { XLSX, wb };
}

export async function saveWorkbook(wb, filename) {
  const XLSX = await loadXLSX();
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  saveBlob(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

// Шрифты для PDF (кириллица и казахские буквы)
async function fileToBase64(url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
let fontsPromise;
export const loadFonts = () => (fontsPromise ??= Promise.all([
  fileToBase64('vendor/fonts/DejaVuSans.ttf'),
  fileToBase64('vendor/fonts/DejaVuSans-Bold.ttf'),
]).then(([regular, bold]) => ({ regular, bold })));

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtDate = iso => (iso ? iso.split('-').reverse().join('.') : '');

/** Простое окно подтверждения на нашем диалоге (системный confirm на iPhone выглядит чужеродно, но надёжен). */
export const confirmAsk = text => window.confirm(text);
