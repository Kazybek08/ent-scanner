// Список профильных предметов по умолчанию (раздел 2 ТЗ).
// Порядок важен: он задаёт место кружка предмета на бланке.
// Позже список будет редактироваться в «Настройках».
export const DEFAULT_SUBJECTS = [
  { code: 'math',         kk: 'Математика',        ru: 'Математика' },
  { code: 'physics',      kk: 'Физика',            ru: 'Физика' },
  { code: 'chemistry',    kk: 'Химия',             ru: 'Химия' },
  { code: 'biology',      kk: 'Биология',          ru: 'Биология' },
  { code: 'geography',    kk: 'География',         ru: 'География' },
  { code: 'worldHistory', kk: 'Дүниежүзі тарихы',  ru: 'Всемирная история' },
  { code: 'informatics',  kk: 'Информатика',       ru: 'Информатика' },
  { code: 'foreignLang',  kk: 'Шет тілі',          ru: 'Иностранный язык' },
  { code: 'kazLang',      kk: 'Қазақ тілі',        ru: 'Казахский язык' },
  { code: 'kazLit',       kk: 'Қазақ әдебиеті',    ru: 'Казахская литература' },
  { code: 'rusLang',      kk: 'Орыс тілі',         ru: 'Русский язык' },
  { code: 'rusLit',       kk: 'Орыс әдебиеті',     ru: 'Русская литература' },
  // добавлен в бланке v5 (на бланках v3/v4 его нет — там первые 12 предметов)
  { code: 'law',          kk: 'Адам. Қоғам. Құқық', ru: 'Человек. Общество. Право' },
];

// Бланк v5: ученик закрашивает ОДНУ строку — комбинацию предметов.
// Порядок внутри пары закреплён: первый предмет — «Бейіндік пән 1» (колонка профиля 1 на бланке),
// второй — «Бейіндік пән 2». Порядок строк = места кружков на бланке, менять только вместе с версией бланка.
export const COMBOS = [
  { subjects: ['biology', 'chemistry'] },
  { subjects: ['biology', 'geography'] },
  { subjects: ['geography', 'foreignLang'] },
  { subjects: ['geography', 'math'] },
  { subjects: ['informatics', 'math'] },
  { subjects: ['physics', 'math'] },
  { subjects: ['physics', 'chemistry'] },
  { subjects: ['kazLang', 'kazLit'] },
  { subjects: ['rusLang', 'rusLit'] },
  { subjects: ['worldHistory', 'foreignLang'] },
  { subjects: ['worldHistory', 'law'] },
  { subjects: ['worldHistory', 'geography'] },
  { creative: true },
];

// Обязательные блоки теста (одинаковые для всех).
export const SECTIONS = [
  { key: 'history',  kk: 'Қазақстан тарихы',        ru: 'История Казахстана',          count: 20 },
  { key: 'mathLit',  kk: 'Математикалық сауаттылық', ru: 'Математическая грамотность', count: 10 },
  { key: 'reading',  kk: 'Оқу сауаттылығы',          ru: 'Грамотность чтения',         count: 10 },
  { key: 'profile1', kk: 'Бейіндік пән 1',           ru: 'Профильный предмет 1',       count: 40 },
  { key: 'profile2', kk: 'Бейіндік пән 2',           ru: 'Профильный предмет 2',       count: 40 },
];
