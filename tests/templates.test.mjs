// Готовые шаблоны из папки docs: заполненный шаблон должен загружаться без ошибок,
// пример из инструкции не должен попасть в учеников, защита от ошибок на месте.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { parseKeysWorkbook, parseStudentsWorkbook } from '../src/excel.js';

const file = p => readFileSync(new URL(`../docs/${p}`, import.meta.url));
const roundTrip = wb => XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });

test('шаблон учеников: пустой — 0 учеников, пример из инструкции не загружается', () => {
  const r = parseStudentsWorkbook(XLSX, XLSX.read(file('students-template.xlsx')));
  assert.deepEqual(r, { students: [], errors: [] });
});

test('шаблон учеников: заполненный читается', () => {
  const wb = XLSX.read(file('students-template.xlsx'));
  XLSX.utils.sheet_add_aoa(wb.Sheets['Ученики'], [['Әлібеков Нұрлан', '11А', 'қаз'], ['Иванова Анна', '11А', 'рус'], ['Ким Виктория', '11Б', '']], { origin: 'A2' });
  const r = parseStudentsWorkbook(XLSX, roundTrip(wb));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.students, [
    { name: 'Әлібеков Нұрлан', group: '11А', lang: 'kk' },
    { name: 'Иванова Анна', group: '11А', lang: 'ru' },
    { name: 'Ким Виктория', group: '11Б', lang: 'kk' },
  ]);
});

function fillKeys(wb, pick) {
  for (const v of ['01', '02']) {
    const ws = wb.Sheets[v];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    for (let r = 1; r < rows.length; r++) {
      const [subj, n] = rows[r];
      if (!subj || !n) continue;
      const a = pick(subj, n, v);
      if (a !== undefined) XLSX.utils.sheet_add_aoa(ws, [[a]], { origin: `C${r + 1}` });
    }
  }
  return roundTrip(wb);
}

test('шаблон ключей: заполненный (обязательные + 2 профиля) загружается без ошибок', () => {
  const wb = fillKeys(XLSX.read(file('keys-template.xlsx')), (subj, n) => {
    if (['История Казахстана', 'Математическая грамотность', 'Грамотность чтения'].includes(subj)) return 'ABCDE'[n % 5];
    if (subj === 'Математика' || subj === 'Физика') return n >= 36 ? 'ACE' : n >= 31 ? 'CA' : 'D';
    return undefined;
  });
  const r = parseKeysWorkbook(XLSX, wb);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(Object.keys(r.keys).sort(), ['01', '02']);
  assert.deepEqual(r.summary['01'].subjects.sort(), ['math', 'physics']);
  assert.equal(r.keys['02'].subjects.math[35].a, 'CA');
  assert.equal(r.keys['02'].subjects.math[40].a, 'ACE');
});

test('шаблон ключей: пустой — понятные ошибки только по обязательным блокам', () => {
  const r = parseKeysWorkbook(XLSX, XLSX.read(file('keys-template.xlsx')));
  const codes = [...new Set(r.errors.map(e => `${e.sheet}:${e.code}:${e.subject}`))].sort();
  assert.deepEqual(codes, ['01:missing:history', '01:missing:mathLit', '01:missing:reading', '02:missing:history', '02:missing:mathLit', '02:missing:reading']);
});

test('шаблон ключей: выпадающие списки, подсказки и защита столбцов на месте', async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file('keys-template.xlsx'));
  assert.deepEqual(wb.worksheets.map(w => w.name), ['Инструкция', '01', '02']);
  const ws = wb.getWorksheet('01');
  assert.equal(ws.getCell('A2').value, 'История Казахстана');
  assert.equal(ws.getCell('C2').dataValidation.type, 'list');
  assert.equal(ws.getCell('C2').protection?.locked, false, 'ответ можно вводить');
  assert.notEqual(ws.getCell('A2').protection?.locked, false, 'предмет защищён');
  const rowOf = (subj, n) => { let x; ws.eachRow((r, i) => { if (r.getCell(1).value === subj && r.getCell(2).value === n) x = i; }); return x; };
  // профиль 1–30: список A–D; сопоставление: список из 16 пар; 36–40: 1–3 буквы
  assert.deepEqual(ws.getCell(`C${rowOf('Математика', 12)}`).dataValidation.formulae, ['"A,B,C,D"']);
  const m = ws.getCell(`C${rowOf('Математика', 33)}`).dataValidation;
  assert.equal(m.type, 'list');
  assert.equal(m.formulae[0].split(',').length, 16);
  assert.ok(m.formulae[0].includes('CA'));
  const v = ws.getCell(`C${rowOf('Математика', 38)}`).dataValidation;
  assert.equal(v.type, 'textLength');
  assert.deepEqual(v.formulae, [1, 3]);
  assert.deepEqual(ws.getCell(`C${rowOf('История Казахстана', 3)}`).dataValidation.formulae, ['"A,B,C,D,E"']);
  assert.ok(String(ws.getCell('I2').value.formula).includes('готово'));
});
