// Шаблоны Excel с инструкцией и защитой от ошибок: node tools/make-templates.mjs
// docs/students-template.xlsx — ученики; docs/keys-template.xlsx — ключи пробника.
import ExcelJS from 'exceljs';
import { DEFAULT_SUBJECTS, SECTIONS } from '../src/subjects.js';

const TEAL = 'FF0F766E', TEAL_LIGHT = 'FFD1FAE5', YELLOW = 'FFFEF9C3', GREY = 'FFF1F5F9', RED = 'FFFEE2E2', WHITE = 'FFFFFFFF';
const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

function instructionSheet(wb, name, title, blocks) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: TEAL } } });
  ws.columns = [{ width: 4 }, { width: 110 }];
  const t = ws.addRow(['', title]);
  t.font = { bold: true, size: 16, color: { argb: TEAL } };
  t.height = 26;
  ws.addRow([]);
  for (const b of blocks) {
    if (b.h) {
      const r = ws.addRow(['', b.h]);
      r.font = { bold: true, size: 12 };
      r.getCell(2).fill = fill(TEAL_LIGHT);
      continue;
    }
    if (b.table) {
      const start = ws.rowCount + 1;
      b.table.forEach((cells, i) => {
        const r = ws.addRow(['', ...cells]);
        r.eachCell((c, col) => { if (col > 1) { c.border = box; if (i === 0) { c.font = { bold: true }; c.fill = fill(GREY); } } });
      });
      ws.addRow([]);
      continue;
    }
    const r = ws.addRow(['', b.text ?? b]);
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (b.warn) { r.getCell(2).fill = fill(YELLOW); r.font = { bold: true }; }
    if (b.bad) r.getCell(2).font = { color: { argb: 'FFB91C1C' } };
  }
  return ws;
}

// ---------------- УЧЕНИКИ ----------------
async function studentsTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ENT scanner';
  const ins = instructionSheet(wb, 'Инструкция', 'Как заполнить список учеников / Оқушылар тізімін толтыру', [
    { h: 'Шаги' },
    '1. Откройте лист «Ученики» (вкладка внизу). Первую строку с заголовками не меняйте.',
    '2. Одна строка — один ученик. Заполняйте подряд, без пустых строк в середине.',
    '3. «ФИО / Аты-жөні» — фамилия и имя, как ученик их пишет (на казахском или русском, с ә, ғ, қ, ң, ө, ұ, ү, і).',
    '4. «Группа / Тобы» — как называется группа в центре, например 11А, 11-Б, Вечерняя. Пишите одинаково у всех учеников одной группы.',
    '5. «Язык обучения / Оқу тілі» — выберите из списка (стрелка справа от ячейки): қаз или рус. Пусто = қаз.',
    '6. Сохраните файл и в приложении откройте «Ученики» → «Загрузить из Excel».',
    { h: 'Что сделает приложение' },
    '• Каждому ученику автоматически даст постоянный ID из 4 цифр (0001, 0002, …). ID в файл писать НЕ нужно.',
    '• Если ученик с тем же ФИО и группой уже есть в приложении — пропустит его (повторно можно загружать тот же файл с новыми учениками).',
    '• После загрузки нажмите «Печать списка „ФИО — ID“» и раздайте ученикам их номера: ID закрашивают на бланке.',
    { h: 'Пример заполнения' },
    { table: [['ФИО / Аты-жөні', 'Группа / Тобы', 'Язык обучения / Оқу тілі'], ['Әлібеков Нұрлан', '11А', 'қаз'], ['Иванова Анна', '11А', 'рус'], ['Сейтқали Аружан', '11Б', 'қаз']] },
    { h: 'Частые ошибки' },
    { text: '✗ ФИО и группа в одной ячейке («Иванова Анна 11А») — группа должна быть в своём столбце.', bad: true },
    { text: '✗ Пустые строки или строки «Итого» внизу списка — удалите их.', bad: true },
    { text: '✗ Одна группа записана по-разному: «11А», «11 А», «11a» — приложение покажет их как три разные группы.', bad: true },
    { text: 'Учеников, которые ушли, не удаляйте из файла — в приложении отметьте «Выбыл»: их ID и результаты сохранятся.', warn: true },
  ]);
  ins.columns = [{ width: 4 }, { width: 40 }, { width: 22 }, { width: 30 }];
  ins.getColumn(2).alignment = { wrapText: true };

  const ws = wb.addWorksheet('Ученики', { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: 'FF16A34A' } } });
  ws.columns = [
    { header: 'ФИО / Аты-жөні', key: 'name', width: 38 },
    { header: 'Группа / Тобы', key: 'group', width: 16 },
    { header: 'Язык обучения / Оқу тілі', key: 'lang', width: 26 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: WHITE } };
  head.height = 22;
  head.eachCell(c => { c.fill = fill(TEAL); c.alignment = { vertical: 'middle' }; c.border = box; });
  for (let r = 2; r <= 301; r++) {
    ws.getCell(`C${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"қаз,рус"'],
      showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Язык обучения', error: 'Выберите из списка: қаз или рус',
      showInputMessage: true, promptTitle: 'Язык обучения', prompt: 'қаз или рус (стрелка справа)',
    };
    ws.getCell(`B${r}`).dataValidation = {
      type: 'textLength', operator: 'lessThanOrEqual', allowBlank: true, formulae: [20],
      showErrorMessage: true, errorTitle: 'Группа', error: 'Слишком длинное название группы (до 20 символов)',
    };
    for (const col of ['A', 'B', 'C']) ws.getCell(`${col}${r}`).border = box;
  }
  wb.views = [{ activeTab: 1 }];
  await wb.xlsx.writeFile('docs/students-template.xlsx');
}

// ---------------- КЛЮЧИ ----------------
async function keysTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ENT scanner';
  const subjects = [...SECTIONS.slice(0, 3).map(s => ({ name: s.ru, count: s.count, compulsory: true })),
                    ...DEFAULT_SUBJECTS.map(s => ({ name: s.ru, count: 40, compulsory: false }))];

  instructionSheet(wb, 'Инструкция', 'Как заполнить ключи пробника / Кілттерді толтыру', [
    { h: 'Шаги' },
    '1. Один лист — один вариант. Листы «01» и «02» уже готовы. Нужен вариант 03 — правой кнопкой по листу «02» → «Переместить или скопировать» → «Создать копию», и переименуйте копию в «03».',
    '2. На листе уже перечислены ВСЕ вопросы всех предметов. Столбцы «Предмет» и «№» менять нельзя (они защищены) — заполняйте только «Ответ» и, по желанию, «Тема».',
    '3. Обязательные блоки заполняются целиком: История Казахстана 1–20, Математическая грамотность 1–10, Грамотность чтения 1–10.',
    '4. Профильные предметы: заполните полностью (1–40) те, которые сдают ваши ученики. Предметы, которые никто не сдаёт, оставьте полностью пустыми.',
    '5. Справа на каждом листе — таблица «Проверка»: у каждого предмета должно быть «✓ готово» или «не сдают». «⚠ не хватает …» — значит, есть пропуски.',
    '6. Сохраните файл. В приложении: «Пробники и ключи» → нужный пробник → «Загрузить ключи».',
    { h: 'Как писать ответ' },
    { table: [['Вопрос', 'Сколько верных', 'Как писать', 'Пример'],
              ['Обязательные блоки и вопросы 1–30 профиля', 'ровно один', 'одна буква A, B, C, D или E — выбирается из списка (стрелка справа)', 'C'],
              ['Вопросы 31–40 профиля', 'один или несколько', 'латинские буквы A–F подряд, без пробелов и запятых', 'ACE  или  B  или  BDF']] },
    { text: 'Буквы — ЛАТИНСКИЕ. Русские А, В, С, Е выглядят так же, но это другие символы. Приложение их исправит само, но лучше сразу писать латиницей (английская раскладка).', warn: true },
    { h: 'Тема (необязательно)' },
    'Короткое название темы вопроса: «Казахское ханство», «Логарифмы». По темам приложение найдёт, какие темы трудные месяц за месяцем. Можно оставить пустым.',
    { h: 'Частые ошибки' },
    { text: '✗ У профильного предмета заполнена только часть вопросов (например, 1–30 без 31–40) — приложение не примет файл.', bad: true },
    { text: '✗ В обычном вопросе два ответа («AB») — так можно только в 31–40 профиля.', bad: true },
    { text: '✗ Буква F в обычном вопросе или G, H — допустимы только A–E (и F в 31–40).', bad: true },
    { text: '✗ Переименованы листы («Вариант первый») — название листа должно содержать номер: «01», «02».', bad: true },
    { text: 'Если в файле ошибка, приложение ключи НЕ сохранит и покажет список: лист, строка и что не так. Исправьте и загрузите снова.', warn: true },
  ]).columns = [{ width: 4 }, { width: 42 }, { width: 20 }, { width: 60 }, { width: 22 }];

  for (const variant of ['01', '02']) {
    const ws = wb.addWorksheet(variant, { views: [{ state: 'frozen', ySplit: 1 }], properties: { tabColor: { argb: variant === '01' ? 'FF2563EB' : 'FF7C3AED' } } });
    ws.columns = [{ width: 30 }, { width: 6 }, { width: 10 }, { width: 32 }, { width: 3 }, { width: 30 }, { width: 11 }, { width: 8 }, { width: 22 }];
    const head = ws.getRow(1);
    ['Предмет / Пән', '№', 'Ответ / Жауап', 'Тема / Тақырып (необязательно)'].forEach((v, i) => { head.getCell(i + 1).value = v; });
    ['', 'Проверка: предмет', 'Заполнено', 'Нужно', 'Статус'].forEach((v, i) => { if (v) head.getCell(i + 5).value = v; });
    head.font = { bold: true, color: { argb: WHITE } };
    head.height = 30;
    head.eachCell((c, col) => { if (col !== 5) { c.fill = fill(TEAL); c.alignment = { vertical: 'middle', wrapText: true }; c.border = box; } });

    let r = 2;
    const firstRow = {};
    subjects.forEach((s, si) => {
      firstRow[s.name] = r;
      const band = si % 2 ? WHITE : GREY;
      for (let n = 1; n <= s.count; n++, r++) {
        const row = ws.getRow(r);
        row.getCell(1).value = s.name;
        row.getCell(2).value = n;
        for (let c = 1; c <= 4; c++) {
          const cell = row.getCell(c);
          cell.border = box;
          cell.fill = fill(c === 3 ? (s.compulsory ? YELLOW : 'FFFFFFFF') : band);
        }
        row.getCell(1).font = { bold: n === 1, color: { argb: n === 1 ? 'FF0F172A' : 'FF64748B' } };
        row.getCell(2).alignment = { horizontal: 'center' };
        const ans = row.getCell(3);
        ans.alignment = { horizontal: 'center' };
        ans.font = { bold: true, size: 12 };
        ans.protection = { locked: false };
        row.getCell(4).protection = { locked: false };
        const multi = !s.compulsory && n >= 31;
        ans.dataValidation = multi
          ? { type: 'textLength', operator: 'between', allowBlank: true, formulae: [1, 6],
              showInputMessage: true, promptTitle: `${s.name}, №${n}`, prompt: 'Один или несколько верных: латинские A–F подряд, например ACE',
              showErrorMessage: true, errorTitle: 'Ответ', error: 'От 1 до 6 латинских букв A–F, без пробелов: например ACE' }
          : { type: 'list', allowBlank: true, formulae: ['"A,B,C,D,E"'],
              showInputMessage: true, promptTitle: `${s.name}, №${n}`, prompt: 'Один верный ответ: выберите A, B, C, D или E',
              showErrorMessage: true, errorTitle: 'Ответ', error: 'Только одна буква: A, B, C, D или E (латиница)' };
        if (n === s.count) row.getCell(1).border = { ...box, bottom: { style: 'medium', color: { argb: TEAL } } };
      }
    });
    const last = r - 1;

    // таблица проверки справа
    subjects.forEach((s, i) => {
      const row = ws.getRow(2 + i);
      const from = firstRow[s.name], to = from + s.count - 1;
      row.getCell(6).value = s.name;
      row.getCell(7).value = { formula: `COUNTA(C${from}:C${to})` };
      row.getCell(8).value = s.count;
      row.getCell(9).value = s.compulsory
        ? { formula: `IF(G${2 + i}=H${2 + i},"✓ готово","⚠ не хватает "&(H${2 + i}-G${2 + i}))` }
        : { formula: `IF(G${2 + i}=0,"не сдают",IF(G${2 + i}=H${2 + i},"✓ готово","⚠ не хватает "&(H${2 + i}-G${2 + i})))` };
      for (let c = 6; c <= 9; c++) { row.getCell(c).border = box; row.getCell(c).fill = fill(s.compulsory ? YELLOW : WHITE); }
      row.getCell(9).font = { bold: true };
    });
    const note = ws.getRow(2 + subjects.length + 1);
    note.getCell(6).value = 'Жёлтые — обязательные, заполнить все.';
    note.getCell(6).font = { italic: true, color: { argb: 'FF64748B' } };
    ws.mergeCells(2 + subjects.length + 1, 6, 2 + subjects.length + 1, 9);
    // статус: зелёный / красный
    ws.addConditionalFormatting({
      ref: `I2:I${1 + subjects.length}`,
      rules: [
        { type: 'containsText', operator: 'containsText', text: '✓', style: { fill: fill('FFDCFCE7'), font: { color: { argb: 'FF166534' }, bold: true } }, priority: 1 },
        { type: 'containsText', operator: 'containsText', text: '⚠', style: { fill: fill(RED), font: { color: { argb: 'FF991B1B' }, bold: true } }, priority: 2 },
      ],
    });
    ws.autoFilter = { from: 'A1', to: `D${last}` };
    await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, autoFilter: true, sort: false });
  }
  wb.views = [{ activeTab: 1 }];
  await wb.xlsx.writeFile('docs/keys-template.xlsx');
}

await studentsTemplate();
await keysTemplate();
console.log('docs/students-template.xlsx\ndocs/keys-template.xlsx');
