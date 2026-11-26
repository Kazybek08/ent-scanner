// Генератор PDF бланка ответов (версия — SHEET_VERSION из template.js).
// Рисует бланк строго по координатам из template.js.
// Работает и в браузере, и в Node (для проверки): jsPDF и шрифты передаются снаружи.

import {
  PAGE, BUBBLE_R, MARKERS, STUDENT_ID, VARIANT, SUBJECTS_AREA, SUBJECT_ROWS, CREATIVE_BUBBLE,
  INSTRUCTION_BOX, ANSWER_HEADERS, ANSWER_SECTIONS, VERSION_CODE, SHEET_VERSION, LOWER_PARTS, LOWER_BAND, ROW_PITCH,
} from './template.js';
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';

const INK = 0;          // чёрный
const LINE = 70;        // контур кружков
const HINT = 165;       // светло-серые буквы внутри кружков
const SOFT = 190;       // разделители

export const SHEET_TEXT = {
  titleKk: 'СЫНАҚ ҰБТ — ЖАУАП ПАРАҒЫ',
  titleRu: 'ПРОБНОЕ ЕНТ — БЛАНК ОТВЕТОВ',
  name: 'Аты-жөні / ФИО',
  group: 'Тобы / Группа',
  date: 'Күні / Дата',
  sign: 'Қолы / Подпись',
  idKk: 'Оқушы ID', idRu: 'ID ученика',
  varKk: 'Нұсқа', varRu: 'Вариант',
  subjKk: 'Бейіндік пәндер: «1» — бірінші, «2» — екінші',
  subjRu: 'Профильные предметы: «1» — первый, «2» — второй',
  instrTitle: 'Нұсқаулық / Инструкция',
  instrKk: 'Дөңгелекті қара немесе көк қаламмен толық бояңыз. Бір сұраққа — бір жауап. Бейіндік пән: 31–35 сәйкестендіру — 1) және 2) жолдарының әрқайсысында бір дөңгелек; 36–40 — бір, екі немесе үш жауап. Түзетуге болмайды: қателессеңіз, жаңа бланк сұраңыз.',
  instrRu: 'Закрашивайте кружок полностью чёрной или синей ручкой. Один ответ на вопрос. Профильный предмет: 31–35 сопоставление — в строке 1) и в строке 2) по одному кружку; 36–40 — один, два или три ответа. Исправлять нельзя: при ошибке попросите новый бланк.',
  creative: 'Шығармашылық / Творчество',
  creativeHint: 'тек тарих + оқу / только история + чтение',
  partMatch: '31–35 · Сәйкестендіру / Сопоставление',
  partMulti: '36–40 · 1–3 жауап / ответа',
  right: 'Дұрыс / Правильно:',
  wrong: 'Қате / Неправильно:',
  footer: `ҰБТ-сканер · бланк v${SHEET_VERSION} · 120 сұрақ / вопросов · 140 балл / баллов`,
};

/**
 * @param {object} o
 * @param {Function} o.jsPDF        конструктор jsPDF
 * @param {{regular:string, bold:string}} o.fonts  TTF-шрифты в base64
 * @param {{data:string, format:string, w:number, h:number}} [o.logo]  логотип (dataURL/base64 и размеры в px)
 * @param {Array} [o.subjects]      список предметов (порядок = места на бланке)
 */
export function buildSheetPdf({ jsPDF, fonts, logo, subjects = DEFAULT_SUBJECTS }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  doc.setProperties({ title: 'ҰБТ бланк / Бланк ЕНТ v' + SHEET_VERSION });

  const font = (size, style = 'normal', gray = INK) => {
    doc.setFont('DejaVu', style);
    doc.setFontSize(size);
    doc.setTextColor(gray);
  };

  // --- Угловые метки ---
  doc.setFillColor(0);
  for (const m of MARKERS) doc.rect(m.x, m.y, m.size, m.size, 'F');

  // --- Шапка ---
  drawLogo(doc, logo, { x: 17, y: 10, w: 22, h: 15 });
  font(12.5, 'bold');
  doc.text(SHEET_TEXT.titleKk, 117, 16, { align: 'center' });
  font(11, 'bold');
  doc.text(SHEET_TEXT.titleRu, 117, 22.5, { align: 'center' });

  // --- Поля для руки ---
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.2);
  font(7.5);
  const field = (label, x, y, x1, x2) => { doc.text(label, x, y); doc.line(x1, y + 0.6, x2, y + 0.6); };
  field(SHEET_TEXT.name, 17, 32, 39, 193);
  field(SHEET_TEXT.group, 17, 39.5, 37, 80);
  field(SHEET_TEXT.date, 86, 39.5, 102, 136);
  field(SHEET_TEXT.sign, 142, 39.5, 163, 193);

  hline(doc, 43);

  // --- ID ученика и вариант ---
  const digitsBlock = (block, kk, ru) => {
    font(6.5, 'bold');
    doc.text(kk, block.x, block.labelY);
    font(6.5);
    doc.text(ru, block.x, block.labelY + 2.6);
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.25);
    for (const col of block.columns) {
      doc.rect(col.box.x, col.box.y, col.box.w, col.box.h);
      for (const b of col.bubbles) bubble(doc, b.x, b.y, String(b.value));
    }
  };
  digitsBlock(STUDENT_ID, SHEET_TEXT.idKk, SHEET_TEXT.idRu);
  digitsBlock(VARIANT, SHEET_TEXT.varKk, SHEET_TEXT.varRu);

  // --- Профильные предметы ---
  font(6.5, 'bold');
  doc.text(SHEET_TEXT.subjKk, SUBJECTS_AREA.x, SUBJECTS_AREA.labelY);
  font(6.5);
  doc.text(SHEET_TEXT.subjRu, SUBJECTS_AREA.x, SUBJECTS_AREA.labelY + 2.6);
  for (const r of SUBJECT_ROWS) {
    const s = subjects[r.index];
    for (const o of r.options) bubble(doc, o.x, o.y, String(o.slot));
    font(6.8);
    const label = !s ? '' : s.kk === s.ru ? s.kk : `${s.kk} / ${s.ru}`;
    // длинное название — шрифт поменьше, чтобы не залезть на соседнюю колонку
    const room = (r.index < 6 ? SUBJECT_ROWS[6].options[0].x - BUBBLE_R - 1.5 : SUBJECTS_AREA.right) - r.labelX;
    if (doc.getTextWidth(label) > room) doc.setFontSize(6.8 * room / doc.getTextWidth(label));
    doc.text(label, r.labelX, r.y, { baseline: 'middle' });
  }

  // «Творчество»: вместо профильных предметов
  bubble(doc, CREATIVE_BUBBLE.x, CREATIVE_BUBBLE.y, '');
  font(6.5, 'bold');
  doc.text(SHEET_TEXT.creative, CREATIVE_BUBBLE.labelX, CREATIVE_BUBBLE.y, { baseline: 'middle' });
  font(5, 'normal', 90);
  doc.text(SHEET_TEXT.creativeHint, CREATIVE_BUBBLE.x - BUBBLE_R, CREATIVE_BUBBLE.hintY, { baseline: 'middle' });

  // --- Инструкция ---
  drawInstruction(doc, font);

  hline(doc, 105.4);

  // --- Ответы ---
  const sectionName = key => SECTIONS.find(s => s.key === key);
  for (const h of ANSWER_HEADERS) {
    const s = sectionName(h.section);
    const range = h.range ? `  (${h.range})` : '';
    font(6.4, 'bold');
    doc.text(s.kk + range, h.x + 1, h.y);
    font(6.2);
    doc.text(s.ru, h.x + 1, h.y + 2.8);
  }
  // тонкие разделители колонок: в верхней полосе — 4 колонки, в нижней — только между профилями
  doc.setDrawColor(SOFT);
  doc.setLineWidth(0.15);
  for (const x of [61, 105, 149]) doc.line(x - 0.5, 106.5, x - 0.5, 213.5);
  doc.line(104.5, 215.5, 104.5, LOWER_BAND.firstRow + 9.6 * ROW_PITCH);
  hline(doc, 214.6);

  // подписи частей нижней полосы: сопоставление и 1–3 ответа
  for (const p of LOWER_PARTS) {
    font(5.6, 'bold', 60);
    doc.text(p.kind === 'match' ? SHEET_TEXT.partMatch : SHEET_TEXT.partMulti, p.x, p.y);
  }

  for (const s of ANSWER_SECTIONS) {
    for (const q of s.questions) {
      font(6.8, 'bold');
      doc.text(String(q.n), q.numberX, q.y, { align: 'right', baseline: 'middle' });
      for (const l of q.labels ?? []) {
        font(6, 'bold', 90);
        doc.text(l.text, l.x, l.y, { align: 'right', baseline: 'middle' });
      }
      for (const o of q.options) bubble(doc, o.x, o.y, o.letter);
    }
  }

  // --- Низ: подпись версии и код версии ---
  font(5.5, 'normal', 120);
  doc.text(SHEET_TEXT.footer, PAGE.w / 2, VERSION_CODE.textY, { align: 'center' });
  doc.setDrawColor(0);
  doc.setFillColor(0);
  doc.setLineWidth(0.2);
  for (const c of VERSION_CODE.cells) doc.rect(c.x, c.y, c.size, c.size, c.filled ? 'FD' : 'S');

  return doc;
}

function bubble(doc, x, y, label) {
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.25);
  doc.circle(x, y, BUBBLE_R, 'S');
  if (label) {
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(5.2);
    doc.setTextColor(HINT);
    doc.text(label, x, y + 0.05, { align: 'center', baseline: 'middle' });
  }
}

function hline(doc, y) {
  doc.setDrawColor(SOFT);
  doc.setLineWidth(0.2);
  doc.line(17, y, 193, y);
}

function drawLogo(doc, logo, box) {
  if (logo && logo.data) {
    const k = Math.min(box.w / logo.w, box.h / logo.h);
    const w = logo.w * k, h = logo.h * k;
    doc.addImage(logo.data, logo.format || 'PNG', box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    return;
  }
  // Заглушка, пока нет файла логотипа
  doc.setDrawColor(SOFT);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(box.x, box.y, box.w, box.h);
  doc.setLineDashPattern([], 0);
  doc.setFont('DejaVu', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(SOFT);
  doc.text('ЛОГОТИП', box.x + box.w / 2, box.y + box.h / 2, { align: 'center', baseline: 'middle' });
}

function drawInstruction(doc, font) {
  const b = INSTRUCTION_BOX;
  doc.setDrawColor(SOFT);
  doc.setLineWidth(0.25);
  doc.roundedRect(b.x, b.y, b.w, b.h, 1.2, 1.2);

  font(6.5, 'bold');
  doc.text(SHEET_TEXT.instrTitle, b.x + 2, b.y + 3.3);

  font(5.6);
  const lh = 2.25;
  let y = b.y + 6;
  for (const para of [SHEET_TEXT.instrKk, SHEET_TEXT.instrRu]) {
    for (const line of doc.splitTextToSize(para, b.w - 4)) { doc.text(line, b.x + 2, y); y += lh; }
    y += 0.4;
  }

  // Примеры закрашивания
  const ey = b.y + b.h - 2.6;
  const r = BUBBLE_R;
  font(6, 'bold');
  doc.text(SHEET_TEXT.right, b.x + 2, ey, { baseline: 'middle' });
  let x = b.x + 2 + doc.getTextWidth(SHEET_TEXT.right) + 3;
  doc.setFillColor(0);
  doc.setDrawColor(0);
  doc.circle(x, ey, r, 'FD');

  x += 12;
  doc.text(SHEET_TEXT.wrong, x, ey, { baseline: 'middle' });
  x += doc.getTextWidth(SHEET_TEXT.wrong) + 3;
  doc.setLineWidth(0.35);
  // галочка
  doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.circle(x, ey, r, 'S');
  doc.setDrawColor(0); doc.setLineWidth(0.4);
  doc.line(x - 1.1, ey, x - 0.3, ey + 0.9); doc.line(x - 0.3, ey + 0.9, x + 1.3, ey - 1.1);
  // крестик
  x += 6;
  doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.circle(x, ey, r, 'S');
  doc.setDrawColor(0); doc.setLineWidth(0.4);
  doc.line(x - 1.1, ey - 1.1, x + 1.1, ey + 1.1); doc.line(x - 1.1, ey + 1.1, x + 1.1, ey - 1.1);
  // закрашен наполовину
  x += 6;
  doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.circle(x, ey, r, 'S');
  doc.setFillColor(0);
  doc.rect(x - 1.2, ey - 0.2, 2.4, 1.2, 'F');
  // точка
  x += 6;
  doc.setDrawColor(LINE); doc.setLineWidth(0.25); doc.circle(x, ey, r, 'S');
  doc.circle(x, ey, 0.45, 'F');
}
