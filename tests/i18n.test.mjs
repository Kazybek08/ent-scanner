import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const kk = JSON.parse(readFileSync(new URL('../i18n/kk.json', import.meta.url)));
const ru = JSON.parse(readFileSync(new URL('../i18n/ru.json', import.meta.url)));

test('в kk.json и ru.json одинаковые ключи', () => {
  const a = Object.keys(kk).sort(), b = Object.keys(ru).sort();
  assert.deepEqual(a.filter(k => !b.includes(k)), [], 'есть в kk, нет в ru');
  assert.deepEqual(b.filter(k => !a.includes(k)), [], 'есть в ru, нет в kk');
});

test('все ключи из кода и HTML есть в переводах', () => {
  const used = new Set();
  const srcDir = new URL('../src/', import.meta.url);
  const texts = readdirSync(srcDir).map(f => readFileSync(new URL(f, srcDir), 'utf8'));
  texts.push(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  for (const s of texts) {
    for (const m of s.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
    for (const m of s.matchAll(/data-i18n(?:-aria|-placeholder)?="([a-zA-Z0-9_.]+)"/g)) used.add(m[1]);
  }
  // ключи, собираемые из частей: проверяем все известные варианты
  for (const p of ['edit.reason.multiple', 'edit.reason.weak', 'scan.err.markers', 'scan.err.orientation', 'scan.warn.small', 'flag.answer.weak', 'flag.answer.multiple',
    'flag.id', 'flag.variant', 'reason.empty', 'reason.multiple', 'reason.weak', 'nav.students', 'nav.tests', 'nav.print', 'nav.scan', 'nav.review', 'nav.settings']) used.add(p);
  const missing = [...used].filter(k => !(k in kk) || !(k in ru));
  assert.deepEqual(missing, []);
});
