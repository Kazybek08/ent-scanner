import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  parseKeysWorkbook, keysTemplateWorkbook, subjectCode, normalizeAnswer,
  parseStudentsWorkbook, studentsTemplateWorkbook, nextStudentId, normalizeLang,
} from '../src/excel.js';

const roundTrip = wb => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });

function fillTemplate(lang, fill) {
  const wb = keysTemplateWorkbook(XLSX, lang);
  for (const name of ['01', '02']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    for (let r = 1; r < rows.length; r++) {
      const v = fill(rows[r][0], rows[r][1], name);
      if (v !== undefined) rows[r][2] = v;
    }
    wb.Sheets[name] = XLSX.utils.aoa_to_sheet(rows);
  }
  return roundTrip(wb);
}

test('названия предметов на обоих языках', () => {
  assert.equal(subjectCode('История Казахстана'), 'history');
  assert.equal(subjectCode('Қазақстан тарихы'), 'history');
  assert.equal(subjectCode('Мат. грамотность'), 'mathLit');
  assert.equal(subjectCode('оқу сауаттылығы'), 'reading');
  assert.equal(subjectCode('Математика'), 'math');
  assert.equal(subjectCode('Дүниежүзі тарихы'), 'worldHistory');
  assert.equal(subjectCode('Русская литература'), 'rusLit');
  assert.equal(subjectCode('Астрономия'), null);
});

test('ответы: русские А, В, С, Е превращаются в латинские', () => {
  assert.equal(normalizeAnswer('С'), 'C');           // русская С
  assert.equal(normalizeAnswer('а, с, е'), 'ACE');
  assert.equal(normalizeAnswer(' b '), 'B');
});

test('заполненный шаблон читается: обязательные блоки и два профиля', () => {
  const wb = fillTemplate('ru', (subj, n) => {
    if (['Математика', 'Физика'].includes(subj)) return n >= 36 ? 'eca' : n >= 31 ? '1-C, 2-a' : 'D';
    if (['История Казахстана', 'Математическая грамотность', 'Грамотность чтения'].includes(subj)) return 'С';
    return undefined;
  });
  const r = parseKeysWorkbook(XLSX, wb);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(Object.keys(r.keys).sort(), ['01', '02']);
  assert.equal(r.keys['01'].history[20].a, 'C');
  assert.equal(r.keys['01'].subjects.math[33].a, 'CA', 'сопоставление: порядок пунктов сохраняется');
  assert.equal(r.keys['01'].subjects.math[38].a, 'ACE', 'несколько ответов — по алфавиту');
  assert.deepEqual(r.summary['02'].subjects.sort(), ['math', 'physics']);
});

test('ключи v3: в профиле 1–30 только A–D, сопоставление — ровно 2 буквы, 36–40 — не больше трёх', () => {
  const wb = fillTemplate('ru', (subj, n) => {
    if (['История Казахстана', 'Математическая грамотность', 'Грамотность чтения'].includes(subj)) return 'E';
    if (subj === 'Химия') {
      if (n === 5) return 'E';           // в профиле 1–30 буквы E нет
      if (n === 31) return 'C';          // сопоставление: одна буква
      if (n === 32) return 'ACB';        // сопоставление: три буквы
      if (n === 33) return 'AE';         // E нет в сопоставлении
      if (n === 37) return 'ABCD';       // больше трёх верных
      return n >= 36 ? 'AB' : n >= 31 ? 'DD' : 'B';
    }
    return undefined;
  });
  const r = parseKeysWorkbook(XLSX, wb);
  const got = r.errors.filter(e => e.sheet === '01').map(e => `${e.code}:${e.row}`);
  const rowOf = n => 1 + 40 + 2 * 40 + n;   // строка Excel: заголовок + обязательные 40 + математика и физика + n
  assert.deepEqual(got.sort(), [`badLetters:${rowOf(33)}`, `badLetters:${rowOf(5)}`, `matchTwo:${rowOf(31)}`, `matchTwo:${rowOf(32)}`, `tooMany:${rowOf(37)}`].sort());
  assert.equal(r.keys['01'].subjects.chemistry[34].a, 'DD', 'один вариант может подходить обоим пунктам');
});

test('ошибки в ключах находятся с номером строки', () => {
  const wb = fillTemplate('kk', (subj, n) => {
    if (subj === 'Қазақстан тарихы') return n === 7 ? '' : n === 8 ? 'AB' : n === 9 ? 'G' : 'A';
    if (subj === 'Математикалық сауаттылық' || subj === 'Оқу сауаттылығы') return 'B';
    if (subj === 'Математика') return n === 40 ? undefined : n >= 36 ? 'F' : n >= 31 ? 'AB' : 'D';
    return undefined;
  });
  const r = parseKeysWorkbook(XLSX, wb);
  const codes = r.errors.filter(e => e.sheet === '01').map(e => e.code).sort();
  assert.deepEqual(codes, ['badLetters', 'missing', 'missing', 'oneLetter']);
  const miss = r.errors.find(e => e.sheet === '01' && e.code === 'missing' && e.subject === 'history');
  assert.deepEqual(miss.numbers, [7], 'строки 8 и 9 уже указаны как ошибочные');
  const missMath = r.errors.find(e => e.sheet === '01' && e.code === 'missing' && e.subject === 'math');
  assert.deepEqual(missMath.numbers, [40]);
  const bad = r.errors.find(e => e.code === 'oneLetter');
  assert.ok(bad.row > 1);
});

test('свой файл: другой порядок столбцов и лишние строки', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Ключи ноябрь'], [],
    ['Тема', 'Ответ', '№', 'Предмет'],
    ['Казахское ханство', 'C', 1, 'История Казахстана'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Вариант 1');
  const r = parseKeysWorkbook(XLSX, roundTrip(wb));
  assert.equal(r.keys['01'].history[1].a, 'C');
  assert.equal(r.keys['01'].history[1].topic, 'Казахское ханство');
  assert.ok(r.errors.some(e => e.code === 'missing' && e.subject === 'history'));
});

test('список учеников: столбцы на казахском, язык обучения', () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Аты-жөні', 'Тобы', 'Оқу тілі'],
    ['Әлібек  Нұрлан', '11А', 'қаз'],
    ['Иванова Анна', '11Б', 'рус'],
    ['', '', ''],
    ['Сериков Ерлан', '11А', 'неизвестно'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Лист1');
  const r = parseStudentsWorkbook(XLSX, roundTrip(wb));
  assert.equal(r.students.length, 3);
  assert.deepEqual(r.students[0], { name: 'Әлібек Нұрлан', group: '11А', lang: 'kk' });
  assert.equal(r.students[1].lang, 'ru');
  assert.equal(r.errors[0].code, 'badLang');
});

test('шаблон учеников читается обратно', () => {
  const r = parseStudentsWorkbook(XLSX, roundTrip(studentsTemplateWorkbook(XLSX, 'ru')));
  assert.deepEqual(r, { students: [], errors: [] });
});

test('ID учеников: следующий свободный, 4 цифры', () => {
  assert.equal(nextStudentId([]), '0001');
  assert.equal(nextStudentId(['0001', '0042', '0007']), '0043');
  assert.equal(normalizeLang('Қазақ'), 'kk');
  assert.equal(normalizeLang('Русский'), 'ru');
});
