// Excel: ключи пробника и список учеников. Библиотека SheetJS передаётся снаружи (XLSX),
// поэтому этот файл работает и в браузере, и в автотестах Node.
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';

const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"'.()/\\:;,\-–—_]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- Названия предметов → коды ----------
const SECTION_ALIASES = {
  history: ['история казахстана', 'история рк', 'қазақстан тарихы', 'казахстан тарихы', 'ист каз'],
  mathLit: ['математическая грамотность', 'мат грамотность', 'математикалық сауаттылық', 'мат сауаттылық', 'матграмотность'],
  reading: ['грамотность чтения', 'оқу сауаттылығы', 'читательская грамотность', 'оку сауаттылыгы'],
};

export function subjectCode(name, subjects = DEFAULT_SUBJECTS) {
  const n = norm(name);
  if (!n) return null;
  for (const [code, list] of Object.entries(SECTION_ALIASES)) if (list.some(a => norm(a) === n)) return code;
  for (const s of SECTIONS) if (norm(s.kk) === n || norm(s.ru) === n) return s.key;
  for (const s of subjects) if (norm(s.kk) === n || norm(s.ru) === n || s.code.toLowerCase() === n) return s.code;
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
      const a = normalizeAnswer(rawAns);
      const multi = !compulsory && n >= 31;
      const allowed = multi ? 'ABCDEF' : 'ABCDE';
      if (!a || [...a].some(ch => !allowed.includes(ch)) || new Set(a).size !== a.length) {
        errors.push({ code: 'badLetters', ...at, value: String(rawAns), allowed }); rowErr.add(`${code}:${n}`); continue;
      }
      if (!multi && a.length !== 1) { errors.push({ code: 'oneLetter', ...at, value: String(rawAns) }); rowErr.add(`${code}:${n}`); continue; }
      const target = compulsory ? k[code] : (k.subjects[code] ??= {});
      if (target[n]) { errors.push({ code: 'duplicate', ...at, n, subject: code }); continue; }
      target[n] = { a: [...a].sort().join(''), topic };
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
       ['• «Жауап» бағанына латын әріптерін жазыңыз: A, B, C, D, E.'],
       ['• Бейіндік пәндердің 31–40 сұрақтарында бірнеше әріп болуы мүмкін: ACE. F әрпі де бар.'],
       ['• Оқушылар тапсырмайтын пәндердің жолдарын бос қалдыруға болады.'],
       ['• «Тақырып» — міндетті емес, бірақ қиын тақырыптарды табуға көмектеседі.']]
    : [['Как заполнять ключи'], [''],
       ['• Каждый вариант — отдельный лист: «01», «02». Для нового варианта скопируйте лист и переименуйте.'],
       ['• В столбец «Ответ» пишите латинские буквы: A, B, C, D, E.'],
       ['• В вопросах 31–40 профильных предметов может быть несколько букв: ACE. Есть буква F.'],
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
export function parseStudentsWorkbook(XLSX, wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  let hr = -1, cName = -1, cGroup = -1, cLang = -1;
  for (let r = 0; r < Math.min(rows.length, 10) && hr < 0; r++) {
    const cells = rows[r].map(norm);
    cName = cells.findIndex(c => /^(фио|ф и о|аты жөні|аты жони|таж|имя|оқушы|ученик)/.test(c));
    cGroup = cells.findIndex(c => /^(группа|тобы|топ|класс|сынып)/.test(c));
    cLang = cells.findIndex(c => /^(язык|тіл|тил|оқу тілі|язык обучения)/.test(c));
    if (cName >= 0) hr = r;
  }
  const students = [], errors = [];
  if (hr < 0) { errors.push({ code: 'noHeader' }); return { students, errors }; }
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
