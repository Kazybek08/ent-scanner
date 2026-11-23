// Переводы интерфейса. Все тексты — только в i18n/kk.json и i18n/ru.json.
const STORAGE_KEY = 'ent.lang';
export const LANGS = ['kk', 'ru'];
let lang = 'kk';
let dict = {};

function savedLang() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export async function initI18n() {
  const saved = savedLang();
  await setLang(LANGS.includes(saved) ? saved : 'kk');
}

export async function setLang(next) {
  const res = await fetch(`i18n/${next}.json`);
  dict = await res.json();
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* приватный режим */ }
  document.documentElement.lang = next;
  applyTranslations();
  document.dispatchEvent(new CustomEvent('langchange', { detail: next }));
}

export const getLang = () => lang;

export function t(key, params = {}) {
  let s = dict[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)));
  document.title = t('app.title');
}
