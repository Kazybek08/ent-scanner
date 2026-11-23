// Работа без интернета: все файлы приложения должны быть в списке service worker и существовать.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const sw = read('sw.js');
const FILES = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

test('все файлы из списка офлайн-режима существуют', () => {
  for (const f of FILES) {
    if (f === './') continue;
    assert.ok(existsSync(new URL(f, root)), `нет файла ${f}`);
  }
});

test('каждый модуль приложения и перевод — в списке офлайн-режима', () => {
  const src = readdirSync(new URL('src/', root)).filter(f => f.endsWith('.js')).map(f => `src/${f}`);
  const need = [...src, 'i18n/kk.json', 'i18n/ru.json', 'index.html', 'css/app.css', 'manifest.webmanifest'];
  assert.deepEqual(need.filter(f => !FILES.includes(f)), []);
});

test('все библиотеки и шрифты, на которые ссылается код, — в списке офлайн-режима', () => {
  const texts = readdirSync(new URL('src/', root)).map(f => read(`src/${f}`)).concat(read('index.html'));
  const refs = new Set();
  for (const s of texts) for (const m of s.matchAll(/['"(](?:\.\.\/)?((?:vendor|icons)\/[^'")\s]+)['")]/g)) refs.add(m[1]);
  assert.ok(refs.size >= 5, `нашли ссылок: ${[...refs]}`);
  assert.deepEqual([...refs].filter(f => !FILES.includes(f)), []);
});

test('версия кэша указана', () => {
  assert.match(sw, /const VERSION = 'ent-scanner-v\d+\.\d+\.\d+'/);
});
