// Раздел «Пробники и ключи».
import { db, uid, getSetting, setSetting } from './db.js';
import { t, getLang } from './i18n.js';
import { $, el, readWorkbook, shareOrSave, today, fmtDate } from './util.js';
import { parseKeysWorkbook } from './excel.js';
import { openForm } from './form.js';
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';

let keysTarget = null;          // в какой пробник грузим ключи

export async function getActiveTestId() {
  const tests = await db.all('tests');
  const saved = await getSetting('activeTest');
  if (tests.some(x => x.id === saved)) return saved;
  const newest = tests.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt)[0];
  return newest?.id ?? null;
}

export function subjectLabel(code) {
  const lang = getLang();
  const s = SECTIONS.find(x => x.key === code) ?? DEFAULT_SUBJECTS.find(x => x.code === code);
  return s ? s[lang] : code;
}

export function initTests() {
  $('#testAdd').addEventListener('click', () => editTest(null));
  $('#keysTemplate').addEventListener('click', async () => {
    // готовый шаблон с инструкцией, выпадающими списками и проверкой заполнения (docs/keys-template.xlsx)
    const blob = await (await fetch('docs/keys-template.xlsx')).blob();
    await shareOrSave(blob, getLang() === 'kk' ? 'Кілттер-үлгі.xlsx' : 'Шаблон-ключи.xlsx');
  });
  $('#keysFile').addEventListener('change', e => importKeys(e.target));
  document.addEventListener('langchange', () => { if (!$('[data-screen=tests]').hidden) renderTests(); });
}

let renderToken = 0;
export async function renderTests() {
  const my = ++renderToken;
  const tests = (await db.all('tests')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const results = await db.all('results');
  const active = await getActiveTestId();
  if (my !== renderToken) return;
  const list = $('#testList');
  list.textContent = '';
  $('#testEmpty').hidden = tests.length > 0;
  for (const test of tests) {
    const variants = Object.keys(test.keys ?? {}).sort();
    const subjects = [...new Set(variants.flatMap(v => Object.keys(test.keys[v].subjects ?? {})))];
    const count = results.filter(r => r.testId === test.id).length;
    const keyLine = variants.length
      ? t('tests.keysLoaded', { variants: variants.join(', '), subjects: subjects.map(subjectLabel).join(', ') || '—' })
      : t('tests.noKeys');
    list.append(el('li', { class: `test-card${test.id === active ? ' is-active' : ''}` },
      el('div', { class: 'test-head' },
        el('div', {},
          el('div', { class: 'row-title', text: test.name }),
          el('div', { class: 'row-sub', text: `${fmtDate(test.date)} · ${t('tests.scanned', { n: count })}` })),
        test.id === active
          ? el('span', { class: 'badge badge-active', text: t('tests.active') })
          : el('button', { type: 'button', class: 'btn-link', text: t('tests.makeActive'), onclick: async () => { await setSetting('activeTest', test.id); renderTests(); } })),
      el('p', { class: `test-keys${variants.length ? '' : ' warn'}`, text: keyLine }),
      el('div', { class: 'test-actions' },
        el('button', { type: 'button', class: 'btn-secondary btn-small', text: variants.length ? t('tests.reloadKeys') : t('tests.loadKeys'),
          onclick: () => { keysTarget = test.id; $('#keysFile').click(); } }),
        el('button', { type: 'button', class: 'btn-link', text: t('tests.edit'), onclick: () => editTest(test, count) })),
    ));
  }
}

function editTest(test, resultsCount = 0) {
  const lang = getLang();
  const month = new Date().toLocaleString(lang === 'kk' ? 'kk-KZ' : 'ru-RU', { month: 'long', year: 'numeric' });
  openForm({
    title: test ? t('tests.edit') : t('tests.add'),
    fields: [
      { name: 'name', label: t('tests.name'), value: test?.name ?? `${t('tests.defaultName')} — ${month}`, required: true },
      { name: 'date', label: t('tests.date'), type: 'date', value: test?.date ?? today(), required: true },
    ],
    submit: test ? t('form.save') : t('tests.create'),
    danger: test && !resultsCount ? { label: t('tests.delete'), confirm: t('tests.deleteAsk', { name: test.name }), action: async () => { await db.del('tests', test.id); renderTests(); } } : null,
    onSubmit: async v => {
      if (!v.name.trim()) return t('tests.nameRequired');
      const rec = test ? { ...test, name: v.name.trim(), date: v.date } : { id: uid(), name: v.name.trim(), date: v.date, keys: {}, createdAt: Date.now() };
      await db.put('tests', rec);
      if (!test) await setSetting('activeTest', rec.id);
      renderTests();
      return null;
    },
  });
}

export function keyErrorText(e) {
  const sheet = e.sheet ? t('keys.sheet', { sheet: e.sheet }) : '';
  const row = e.row ? t('keys.row', { row: e.row }) : '';
  const where = [sheet, row].filter(Boolean).join(', ');
  const body = {
    missing: () => t('keys.err.missing', { subject: subjectLabel(e.subject), numbers: compactNumbers(e.numbers) }),
    badLetters: () => t('keys.err.badLetters', { value: e.value, allowed: e.allowed.length === 6 ? 'A–F' : 'A–E' }),
    oneLetter: () => t('keys.err.oneLetter', { value: e.value }),
    unknownSubject: () => t('keys.err.unknownSubject', { value: e.value }),
    badNumber: () => t('keys.err.badNumber', { value: e.value, max: e.max }),
    duplicate: () => t('keys.err.duplicate', { subject: subjectLabel(e.subject), n: e.n }),
    noHeader: () => t('keys.err.noHeader'),
    noVariants: () => t('keys.err.noVariants'),
  }[e.code]?.() ?? e.code;
  return where ? `${where}: ${body}` : body;
}

function compactNumbers(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(j > i + 1 ? `${nums[i]}–${nums[j]}` : j === i + 1 ? `${nums[i]}, ${nums[j]}` : `${nums[i]}`);
    i = j;
  }
  return out.join(', ');
}

async function importKeys(input) {
  const file = input.files[0];
  input.value = '';
  const test = keysTarget && await db.get('tests', keysTarget);
  if (!file || !test) return;
  let r;
  try {
    const { XLSX, wb } = await readWorkbook(file);
    r = parseKeysWorkbook(XLSX, wb);
  } catch (e) {
    openForm({ title: t('tests.loadKeys'), message: t('excel.cantRead', { error: e.message }), submit: t('form.ok'), onSubmit: () => null });
    return;
  }
  if (r.errors.length) {
    const lines = r.errors.slice(0, 15).map(keyErrorText);
    if (r.errors.length > 15) lines.push(t('keys.more', { n: r.errors.length - 15 }));
    openForm({ title: t('keys.errorsTitle', { n: r.errors.length }), message: `${t('keys.notSaved')}\n\n• ${lines.join('\n• ')}`, submit: t('form.ok'), onSubmit: () => null });
    return;
  }
  test.keys = r.keys;
  test.keysFile = file.name;
  test.keysAt = Date.now();
  await db.put('tests', test);
  const lines = Object.entries(r.summary).map(([v, s]) =>
    t('keys.variantLine', { v, subjects: s.subjects.map(subjectLabel).join(', ') || t('keys.onlyCompulsory') }));
  openForm({ title: t('keys.savedTitle'), message: lines.join('\n'), submit: t('form.ok'), onSubmit: () => null });
  renderTests();
}
