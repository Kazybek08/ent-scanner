// Excel: ключи пробника и список учеников. Библиотека SheetJS передаётся снаружи (XLSX),
// поэтому этот файл работает и в браузере, и в автотестах Node.
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';
import { questionType, LETTERS } from './template.js';

const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.()/\\:;,\-–—_]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Названия предметов → коды ----------
const SECTION_ALIASES = {
  history: ['история казахстана', 'история рк', 'қазақстан тарихы', 'казахстан тарихы', 'ист каз'],
  mathLit: ['математическая грамотность', 'мат грамотность', 'математикалық сауаттылық', 'мат сауаттылық', 'матграмотность'],
  reading: ['грамотность чтения', 'оқу сауаттылығы', 'читательская грамотность', 'оку сауаттылыгы'],
};

const SUBJECT_ALIASES = {
  law: ['чоп', 'человек общество право', 'адам қоғам құқық', 'адам қоғам құқық негіздері', 'основы права', 'құқық негіздері'],
};

export function subjectCode(name, subjects = DEFAULT_SUBJECTS) {
  const n = norm(name);
  if (!n) return null;
  for (const [code, list] of Object.entries(SECTION_ALIASES)) if (list.some(a => norm(a) === n)) return code;
  for (const s of SECTIONS) if (norm(s.kk) === n || norm(s.ru) === n) return s.key;
  for (const s of subjects) if (norm(s.kk) === n || norm(s.ru) === n || s.code.toLowerCase() === n) return s.code;
  for (const [code, list] of Object.entries(SUBJECT_ALIASES)) if (list.some(a => norm(a) === n) && subjects.some(s => s.code === code)) return code;
  return null;
}

// Русские буквы, похожие на латинские, заменяем: А→A, В→B, С→C, Е→E.
const LOOKALIKE = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'а': 'A', 'в': 'B', 'с': 'C', 'е': 'E' };
export function normalizeAnswer(v) {
  return String(v ?? '').replace(/[АВСЕавсе]/g, ch => LOOKALIKE[ch]).toUpperCase().replace(/[^A-Z]/g, '');
}

const COMPULSORY = { history: 20, mathLit: 10, reading: 10 };

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r].map(norm);
    const col = (...names) => cells.findIndex(c => names.some(x => c.startsWith(x)));
    const subject = col('предмет', 'пән', 'пан');
    const num = cells.findIndex(c => c === '№' || c === 'n' || c === 'номер' || c === 'нөмір' || c.startsWith('№'));
    const answer = col('ответ', 'жауап', 'ключ', 'кілт');
    const topic = col('тема', 'тақырып', 'такырып');
    if (subject >= 0 && num >= 0 && answer >= 0) return { row: r, subject, num, answer, topic };
  }
  return null;
}

/**
 * Читает ключи из книги Excel: один лист на вариант («01», «02»), столбцы Предмет / № / Ответ / Тема.
 * @returns {{keys: object, errors: Array, warnings: Array, summary: object}}
 */
export function parseKeysWorkbook(XLSX, wb, subjects = DEFAULT_SUBJECTS) {
  const keys = {}, errors = [], warnings = [], summary = {};
  for (const sheetName of wb.SheetNames) {
    const m = String(sheetName).match(/^\D*(\d{1,2})\D*$/);
    if (!m) continue;                                   // листы без номера (инструкция) пропускаем
    const variant = m[1].padStart(2, '0');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    const h = findHeader(rows);
    if (!h) { errors.push({ code: 'noHeader', sheet: sheetName }); continue; }
    const k = keys[variant] = { history: {}, mathLit: {}, reading: {}, subjects: {} };
    const rowErr = new Set();     // вопросы, по которым уже есть ошибка в строке — не дублируем «нет ответа»
    for (let r = h.row + 1; r < rows.length; r++) {
      const row = rows[r];
      const rawSubj = row[h.subject], rawNum = row[h.num], rawAns = row[h.answer];
      const topic = h.topic >= 0 ? String(row[h.topic] ?? '').trim() : '';
      if (!String(rawAns).trim()) continue;            // пустой ответ в шаблоне — просто не заполнено
      const at = { sheet: sheetName, row: r + 1 };
      const code = subjectCode(rawSubj, subjects);
      if (!code) { errors.push({ code: 'unknownSubject', ...at, value: String(rawSubj) }); continue; }
      const n = Number(String(rawNum).trim());
      const compulsory = code in COMPULSORY;
      const maxN = compulsory ? COMPULSORY[code] : 40;
      if (!Number.isInteger(n) || n < 1 || n > maxN) { errors.push({ code: 'badNumber', ...at, value: String(rawNum), max: maxN }); continue; }
      // цифры убираем: «1-C, 2-A» в сопоставлении → «CA»
      const a = normalizeAnswer(rawAns);
      const type = compulsory ? 'single5' : questionType('profile1', n);
      const allowed = LETTERS[type];
      const bad = e => { errors.push({ ...e, ...at, value: String(rawAns), allowed, type }); rowErr.add(`${code}:${n}`); };
      if (!a || [...a].some(ch => !allowed.includes(ch))) { bad({ code: 'badLetters' }); continue; }
      if (type === 'match') {
        if (a.length !== 2) { bad({ code: 'matchTwo' }); continue; }
      } else if (type === 'multi') {
        if (new Set(a).size !== a.length) { bad({ code: 'badLetters' }); continue; }
        if (a.length > 3) { bad({ code: 'tooMany' }); continue; }
      } else if (a.length !== 1) { bad({ code: 'oneLetter' }); continue; }
      const target = compulsory ? k[code] : (k.subjects[code] ??= {});
      if (target[n]) { errors.push({ code: 'duplicate', ...at, n, subject: code }); continue; }
      // сопоставление: порядок важен (пункт 1, пункт 2); несколько ответов — по алфавиту
      target[n] = { a: type === 'match' ? a : [...a].sort().join(''), topic };
    }
    // полнота
    for (const [code, count] of Object.entries(COMPULSORY)) {
      const missing = [];
      for (let n = 1; n <= count; n++) if (!k[code][n] && !rowErr.has(`${code}:${n}`)) missing.push(n);
      if (missing.length) errors.push({ code: 'missing', sheet: sheetName, subject: code, numbers: missing });
    }
    for (const [code, qs] of Object.entries(k.subjects)) {
      const missing = [];
      for (let n = 1; n <= 40; n++) if (!qs[n] && !rowErr.has(`${code}:${n}`)) missing.push(n);
      if (missing.length) errors.push({ code: 'missing', sheet: sheetName, subject: code, numbers: missing });
    }
    summary[variant] = { subjects: Object.keys(k.subjects) };
    if (!Object.keys(k.subjects).length) warnings.push({ code: 'noSubjects', sheet: sheetName });
  }
  if (!Object.keys(keys).length && !errors.length) errors.push({ code: 'noVariants' });
  return { keys, errors, warnings, summary };
}

/** Шаблон Excel для ключей: листы «01» и «02», все вопросы уже перечислены — осталось вписать ответы. */
export function keysTemplateWorkbook(XLSX, lang = 'ru', subjects = DEFAULT_SUBJECTS) {
  const wb = XLSX.utils.book_new();
  const head = lang === 'kk'
    ? ['Пән', '№', 'Жауап', 'Тақырып (міндетті емес)']
    : ['Предмет', '№', 'Ответ', 'Тема (необязательно)'];
  const help = lang === 'kk'
    ? [['Кілттерді толтыру'], [''],
       ['• Әр нұсқа — жеке парақ: «01», «02». Жаңа нұсқа үшін парақты көшіріп, атын өзгертіңіз.'],
       ['• «Жауап» бағанына латын әріптерін жазыңыз. Міндетті пәндер: A–E. Бейіндік пән 1–30: A–D.'],
       ['• Бейіндік пән 31–35 (сәйкестендіру): екі әріп ретімен — 1) және 2) үшін, мысалы CA.'],
       ['• Бейіндік пән 36–40: бір-үш әріп A–F, мысалы ACE.'],
       ['• Оқушылар тапсырмайтын пәндердің жолдарын бос қалдыруға болады.'],
       ['• «Тақырып» — міндетті емес, бірақ қиын тақырыптарды табуға көмектеседі.']]
    : [['Как заполнять ключи'], [''],
       ['• Каждый вариант — отдельный лист: «01», «02». Для нового варианта скопируйте лист и переименуйте.'],
       ['• В столбец «Ответ» пишите латинские буквы. Обязательные блоки: A–E. Профиль 1–30: A–D.'],
       ['• Профиль 31–35 (сопоставление): две буквы по порядку — для пункта 1) и для пункта 2), например CA.'],
       ['• Профиль 36–40: от одной до трёх букв A–F, например ACE.'],
       ['• Строки предметов, которые никто не сдаёт, можно оставить пустыми.'],
       ['• «Тема» — необязательно, но помогает находить трудные темы.']];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), lang === 'kk' ? 'Нұсқаулық' : 'Инструкция');
  for (const v of ['01', '02']) {
    const rows = [head];
    for (const s of SECTIONS.slice(0, 3)) for (let n = 1; n <= s.count; n++) rows.push([s[lang], n, '', '']);
    for (const s of subjects) for (let n = 1; n <= 40; n++) rows.push([s[lang], n, '', '']);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 5 }, { wch: 9 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, v);
  }
  return wb;
}

// ---------- Ученики ----------
export function normalizeLang(v) {
  const n = norm(v);
  if (!n) return null;
  if (/^(kk|kz|қаз|каз|қазақ|казах|kaz)/.test(n)) return 'kk';
  if (/^(ru|рус|орыс|russ)/.test(n)) return 'ru';
  return null;
}

/** Читает список учеников: столбцы ФИО / Группа / Язык обучения (на любом из двух языков). */
const INSTRUCTION_SHEET = /инструкц|нұсқаул|нускаул|пример|үлгі|help|readme/i;

function findStudentsHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const cells = rows[r].map(norm);
    const cName = cells.findIndex(c => /^(фио|ф и о|аты жөні|аты жони|таж|имя|оқушы|ученик)/.test(c));
    if (cName < 0) continue;
    return {
      hr: r, cName,
      cGroup: cells.findIndex(c => /^(группа|тобы|топ|класс|сынып)/.test(c)),
      cLang: cells.findIndex(c => /^(язык|тіл|тил|оқу тілі|язык обучения)/.test(c)),
    };
  }
  return null;
}

export function parseStudentsWorkbook(XLSX, wb) {
  // лист со столбцом «ФИО»; листы-инструкции (с примером!) пропускаем
  let rows = null, h = null;
  for (const name of wb.SheetNames) {
    if (INSTRUCTION_SHEET.test(name)) continue;
    const rs = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: '' });
    const found = findStudentsHeader(rs);
    if (found) { rows = rs; h = found; break; }
  }
  const students = [], errors = [];
  if (!h) { errors.push({ code: 'noHeader' }); return { students, errors }; }
  const { hr, cName, cGroup, cLang } = h;
  for (let r = hr + 1; r < rows.length; r++) {
    const name = String(rows[r][cName] ?? '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const group = cGroup >= 0 ? String(rows[r][cGroup] ?? '').trim() : '';
    const rawLang = cLang >= 0 ? rows[r][cLang] : '';
    const lang = normalizeLang(rawLang);
    if (rawLang !== '' && !lang) errors.push({ code: 'badLang', row: r + 1, value: String(rawLang) });
    students.push({ name, group, lang: lang ?? 'kk' });
  }
  return { students, errors };
}

export function studentsTemplateWorkbook(XLSX, lang = 'ru') {
  const head = lang === 'kk' ? ['Аты-жөні', 'Тобы', 'Оқу тілі (қаз/орыс)'] : ['ФИО', 'Группа', 'Язык обучения (қаз/рус)'];
  const ws = XLSX.utils.aoa_to_sheet([head]);
  ws['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, lang === 'kk' ? 'Оқушылар' : 'Ученики');
  return wb;
}

/** Следующий свободный ID ученика: 4 цифры, без повторов, ID выбывших тоже не переиспользуем. */
export function nextStudentId(existingIds) {
  let max = 0;
  for (const id of existingIds) { const n = parseInt(id, 10); if (n > max) max = n; }
  if (max >= 9999) throw new Error('ID закончились');
  return String(max + 1).padStart(4, '0');
}
