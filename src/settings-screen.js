// Раздел «Настройки»: пороговые баллы, пары предметов (кто «Профиль 1»), логотип, резервная копия, хранилище.
import { db, getSetting, setSetting, requestPersistence } from './db.js';
import { t, getLang } from './i18n.js';
import { $, el } from './util.js';
import { DEFAULT_SUBJECTS } from './subjects.js';
import { DEFAULT_THRESHOLDS, PARTS } from './report.js';
import { getAppSettings } from './app-settings.js';
import { saveBackup, backupStatus, backupStatusText, restoreFromFile } from './backup-ui.js';
import { subjectName } from './export-xlsx.js';

export function initSettings() {
  $('#setThrSave').addEventListener('click', saveThresholds);
  $('#setThrReset').addEventListener('click', async () => { await setSetting('thresholds', null); renderSettings(); flash('#setThrMsg', t('set.saved')); });
  $('#setComboAdd').addEventListener('click', addCombo);
  $('#setLogoFile').addEventListener('change', e => setLogo(e.target));
  $('#setLogoRemove').addEventListener('click', async () => { await setSetting('logo', null); renderSettings(); document.dispatchEvent(new CustomEvent('logochange')); });
  $('#setBackup').addEventListener('click', async () => { await saveBackup(); renderSettings(); });
  $('#setRestoreFile').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await restoreFromFile(f, renderSettings); });
  $('#setPersist').addEventListener('click', async () => { await requestPersistence(); renderSettings(); });
  document.addEventListener('langchange', () => { if (!$('[data-screen=settings]').hidden) renderSettings(); });
}

function flash(sel, text) {
  const n = $(sel);
  n.textContent = text;
  setTimeout(() => { if (n.textContent === text) n.textContent = ''; }, 2500);
}

export async function renderSettings() {
  const lang = getLang();
  const { combos, thresholds } = await getAppSettings();

  // пороги
  const thr = $('#setThr');
  thr.textContent = '';
  thr.append(numField('total', t('set.thrTotal'), thresholds.total, 140));
  for (const p of PARTS) {
    const label = p === 'profile1' ? t('set.thrP1') : p === 'profile2' ? t('set.thrP2') : subjectName(p, lang);
    thr.append(numField(`min_${p}`, label, thresholds.min[p], p.startsWith('profile') ? 50 : p === 'history' ? 20 : 10));
  }

  // пары предметов
  const opts = () => DEFAULT_SUBJECTS.map(s => el('option', { value: s.code, text: s[lang] }));
  for (const id of ['#setComboP1', '#setComboP2']) { const s = $(id); const v = s.value; s.textContent = ''; s.append(...opts()); if (v) s.value = v; }
  if (!$('#setComboP2').value || $('#setComboP2').value === $('#setComboP1').value) $('#setComboP2').selectedIndex = 1;
  const list = $('#setCombos');
  list.textContent = '';
  combos.forEach(([a, b], i) => list.append(el('li', { class: 'combo-row' },
    el('span', {}, el('b', { text: subjectName(a, lang) }), ` (${t('set.p1')}) + ${subjectName(b, lang)} (${t('set.p2')})`),
    el('button', { type: 'button', class: 'btn-link', text: t('set.remove'), onclick: async () => { combos.splice(i, 1); await setSetting('combos', combos); renderSettings(); } }))));
  $('#setCombosEmpty').hidden = combos.length > 0;

  // логотип
  const logo = await getSetting('logo', null);
  $('#setLogoImg').hidden = !logo;
  if (logo) $('#setLogoImg').src = logo.data;
  $('#setLogoRemove').hidden = !logo;
  $('#setLogoNote').textContent = logo ? t('set.logoSet') : t('set.logoNone');

  // копия
  $('#setBackupNote').textContent = backupStatusText(await backupStatus());

  // хранилище
  let persisted = false, usage = null;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* нет */ }
  try { const e = await navigator.storage?.estimate?.(); usage = e?.usage; } catch { /* нет */ }
  const [st, te, re] = await Promise.all([db.all('students'), db.all('tests'), db.all('results')]);
  $('#setStorage').textContent = t('set.storage', { students: st.length, tests: te.length, results: re.length, mb: usage ? (usage / 1048576).toFixed(1) : '—' });
  $('#setPersistNote').textContent = persisted ? t('set.persistOn') : t('set.persistOff');
  $('#setPersist').hidden = !!persisted;
}

function numField(name, label, value, max) {
  return el('label', { class: 'num-field' }, el('span', { text: label }),
    el('input', { type: 'number', inputmode: 'numeric', min: 0, max, step: 1, name, value: String(value) }));
}

async function saveThresholds() {
  const get = n => Number($(`#setThr input[name="${n}"]`).value);
  const total = get('total');
  const min = Object.fromEntries(PARTS.map(p => [p, get(`min_${p}`)]));
  const bad = [total, ...Object.values(min)].some(v => !Number.isFinite(v) || v < 0 || v > 140);
  if (bad) { flash('#setThrMsg', t('set.thrBad')); return; }
  await setSetting('thresholds', { total, min });
  flash('#setThrMsg', t('set.saved'));
  document.dispatchEvent(new CustomEvent('datachange'));
}

async function addCombo() {
  const a = $('#setComboP1').value, b = $('#setComboP2').value;
  if (!a || !b || a === b) return;
  const { combos } = await getAppSettings();
  const rest = combos.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a)));
  rest.push([a, b]);
  await setSetting('combos', rest);
  renderSettings();
  document.dispatchEvent(new CustomEvent('datachange'));
}

async function setLogo(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);      // прозрачный фон → белый (печать)
    ctx.drawImage(img, 0, 0, c.width, c.height);
    await setSetting('logo', { data: c.toDataURL('image/png'), w: c.width, h: c.height, format: 'PNG' });
    renderSettings();
    document.dispatchEvent(new CustomEvent('logochange'));
  } catch {
    $('#setLogoNote').textContent = t('set.logoBad');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { DEFAULT_THRESHOLDS };
