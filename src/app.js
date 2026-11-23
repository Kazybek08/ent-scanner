import { initI18n, setLang, getLang, t } from './i18n.js';
import { buildSheetPdf } from './sheet-pdf.js';
import { SHEET_VERSION } from './template.js';
import { initScan, renderScan } from './scan.js';
import { initStudents, renderStudents } from './students.js';
import { initTests, renderTests } from './tests-screen.js';
import { initForm } from './form.js';
import { requestPersistence } from './db.js';

const $ = sel => document.querySelector(sel);

// ---------- Навигация по экранам (через #адрес) ----------
const SCREENS = ['print', 'scan', 'students', 'tests'];         // готовые разделы
const SOON = ['review', 'settings'];
const RENDER = { scan: renderScan, students: renderStudents, tests: renderTests };

function route() {
  const name = location.hash.slice(1) || 'home';
  const ready = SCREENS.includes(name);
  const soon = SOON.includes(name);
  const show = ready ? name : soon ? 'soon' : 'home';
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s.dataset.screen !== show; });
  $('#backBtn').hidden = show === 'home';
  $('#screenTitle').textContent = show === 'home' ? t('app.title') : t(`nav.${name}`);
  if (soon) {
    const tile = document.querySelector(`.tile[href="#${name}"]`);
    $('#soonText').textContent = t('soon.text', { date: tile?.dataset.soon ?? '' });
  }
  if (ready && RENDER[name]) RENDER[name]().catch(e => console.error(e));
  window.scrollTo(0, 0);
}

$('#backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back(); else location.hash = '';
});
window.addEventListener('hashchange', route);
document.addEventListener('langchange', () => {
  route(); updateLangButtons(); updateLogoNote();
  $('#printStatus').textContent = '';
});

// ---------- Переключатель языка ----------
function updateLangButtons() {
  document.querySelectorAll('.lang button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
}
document.querySelectorAll('.lang button').forEach(b =>
  b.addEventListener('click', () => setLang(b.dataset.lang)));

// ---------- Печать бланка ----------
async function fileToBase64(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let fontsPromise;
const loadFonts = () => (fontsPromise ??= Promise.all([
  fileToBase64('vendor/fonts/DejaVuSans.ttf'),
  fileToBase64('vendor/fonts/DejaVuSans-Bold.ttf'),
]).then(([regular, bold]) => ({ regular, bold })));

// Логотип: пока берём файл docs/logo.png из проекта (позже — из «Настроек»).
let logoPromise;
const loadLogo = () => (logoPromise ??= (async () => {
  try {
    const res = await fetch('docs/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = data; });
    return { data, format: 'PNG', w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
})());

async function updateLogoNote() {
  const logo = await loadLogo();
  $('#logoNote').textContent = t(logo ? 'print.logo.ok' : 'print.logo.missing');
}

$('#downloadPdf').addEventListener('click', async () => {
  const btn = $('#downloadPdf');
  const status = $('#printStatus');
  btn.disabled = true;
  status.classList.remove('error');
  status.textContent = t('print.building');
  try {
    const [fonts, logo] = await Promise.all([loadFonts(), loadLogo()]);
    const doc = buildSheetPdf({ jsPDF: window.jspdf.jsPDF, fonts, logo });
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blank-ENT-v${SHEET_VERSION}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status.textContent = t('print.ready');
  } catch (e) {
    console.error(e);
    status.classList.add('error');
    status.textContent = t('print.error', { error: e.message });
  } finally {
    btn.disabled = false;
  }
});

// ---------- Офлайн-режим ----------
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    $('#offlineNote').hidden = false;
  } catch (e) { console.warn('SW', e); }
}

function showInstallHint() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('#installNote').hidden = !!standalone;
}

// ---------- Старт ----------
await initI18n();
initForm();
initScan();
initStudents();
initTests();
requestPersistence();
updateLangButtons();
route();
updateLogoNote();
showInstallHint();
registerSW();
