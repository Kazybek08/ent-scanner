// Раздел «Ученики»: список, добавление, импорт из Excel, печать «ФИО — ID».
import { db, getSetting, setSetting } from './db.js';
import { t, getLang } from './i18n.js';
import { $, el, saveBlob, readWorkbook, saveWorkbook, loadXLSX, loadFonts, today } from './util.js';
import { parseStudentsWorkbook, studentsTemplateWorkbook, nextStudentId } from './excel.js';
import { openForm, closeForm } from './form.js';

let query = '';

// ID выдаются по возрастанию и никогда не повторяются, даже после удаления ученика:
// помним самый большой выданный номер.
async function issueIds(count, existing) {
  const last = await getSetting('lastStudentId', '0000');
  const ids = [...existing, last];
  const out = [];
  for (let i = 0; i < count; i++) { const id = nextStudentId(ids); ids.push(id); out.push(id); }
  await setSetting('lastStudentId', out.at(-1));
  return out;
}

const collator = new Intl.Collator(['kk', 'ru'], { sensitivity: 'base', numeric: true });
const sortStudents = list => list.sort((a, b) => collator.compare(a.group, b.group) || collator.compare(a.name, b.name));

export function initStudents() {
  $('#studentAdd').addEventListener('click', () => editStudent(null));
  $('#studentImport').addEventListener('change', e => importStudents(e.target));
  $('#studentTemplate').addEventListener('click', async () => {
    const XLSX = await loadXLSX();
    await saveWorkbook(studentsTemplateWorkbook(XLSX, getLang()), getLang() === 'kk' ? 'оқушылар-үлгі.xlsx' : 'ученики-шаблон.xlsx');
  });
  $('#studentPrint').addEventListener('click', printList);
  $('#studentSearch').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderStudents(); });
  document.addEventListener('langchange', () => { if (!$('[data-screen=students]').hidden) renderStudents(); });
}

let renderToken = 0;
export async function renderStudents() {
  const my = ++renderToken;
  const all = sortStudents(await db.all('students'));
  if (my !== renderToken) return;
  const list = $('#studentList');
  list.textContent = '';
  const shown = all.filter(s => !query || s.name.toLowerCase().includes(query) || s.id.includes(query) || s.group.toLowerCase().includes(query));
  const active = all.filter(s => s.status !== 'left').length;
  $('#studentCount').textContent = t('students.count', { n: active, left: all.length - active });
  $('#studentEmpty').hidden = all.length > 0;
  $('#studentPrint').disabled = !all.length;
  let group = null;
  for (const s of shown) {
    if (s.group !== group) {
      group = s.group;
      list.append(el('li', { class: 'list-group', text: group || t('students.noGroup') }));
    }
    list.append(el('li', {},
      el('button', { type: 'button', class: `row-item${s.status === 'left' ? ' is-left' : ''}`, onclick: () => editStudent(s) },
        el('span', { class: 'id-chip', text: s.id }),
        el('span', { class: 'row-main' },
          el('span', { class: 'row-title', text: s.name }),
          el('span', { class: 'row-sub', text: [s.lang === 'ru' ? t('lang.ru') : t('lang.kk'), s.status === 'left' ? t('students.left') : ''].filter(Boolean).join(' · ') })),
      )));
  }
}

async function editStudent(s) {
  const all = await db.all('students');
  const groups = [...new Set(all.map(x => x.group).filter(Boolean))].sort(collator.compare);
  const hasResults = s ? (await db.all('results')).some(r => r.studentId === s.id) : false;
  openForm({
    title: s ? `${t('students.edit')} · ID ${s.id}` : t('students.add'),
    fields: [
      { name: 'name', label: t('students.name'), value: s?.name ?? '', required: true, autocomplete: 'off' },
      { name: 'group', label: t('students.group'), value: s?.group ?? (groups.at(-1) ?? ''), list: groups },
      { name: 'lang', label: t('students.lang'), type: 'segmented', value: s?.lang ?? 'kk', options: [['kk', t('lang.kk')], ['ru', t('lang.ru')]] },
      ...(s ? [{ name: 'left', label: t('students.markLeft'), type: 'checkbox', value: s.status === 'left' }] : []),
    ],
    submit: s ? t('form.save') : t('students.addBtn'),
    danger: s && !hasResults ? { label: t('students.delete'), confirm: t('students.deleteAsk', { name: s.name }), action: async () => { await db.del('students', s.id); renderStudents(); } } : null,
    onSubmit: async v => {
      const name = v.name.replace(/\s+/g, ' ').trim();
      if (!name) return t('students.nameRequired');
      const rec = s
        ? { ...s, name, group: v.group.trim(), lang: v.lang, status: v.left ? 'left' : 'active' }
        : { id: (await issueIds(1, all.map(x => x.id)))[0], name, group: v.group.trim(), lang: v.lang, status: 'active', createdAt: Date.now() };
      await db.put('students', rec);
      renderStudents();
      return null;
    },
  });
}

async function importStudents(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  let parsed;
  try {
    const { XLSX, wb } = await readWorkbook(file);
    parsed = parseStudentsWorkbook(XLSX, wb);
  } catch (e) {
    openForm({ title: t('students.import'), message: t('excel.cantRead', { error: e.message }), submit: t('form.ok'), onSubmit: () => null });
    return;
  }
  const all = await db.all('students');
  const key = s => `${s.name.toLowerCase()}|${s.group.toLowerCase()}`;
  const existing = new Set(all.map(key));
  // пропускаем тех, кто уже есть, и повторы внутри самого файла
  const fresh = parsed.students.filter(s => { const k = key(s); if (existing.has(k)) return false; existing.add(k); return true; });
  const skipped = parsed.students.length - fresh.length;
  const lines = [];
  if (parsed.errors.some(e => e.code === 'noHeader')) lines.push(t('students.import.noHeader'));
  lines.push(t('students.import.found', { n: parsed.students.length }));
  if (skipped) lines.push(t('students.import.skipped', { n: skipped }));
  for (const e of parsed.errors.filter(e => e.code === 'badLang')) lines.push(t('students.import.badLang', { row: e.row, value: e.value }));
  openForm({
    title: t('students.import'),
    message: lines.join('\n'),
    submit: fresh.length ? t('students.import.add', { n: fresh.length }) : t('form.ok'),
    onSubmit: async () => {
      if (!fresh.length) return null;
      const ids = await issueIds(fresh.length, all.map(x => x.id));
      const recs = fresh.map((s, i) => ({ id: ids[i], ...s, status: 'active', createdAt: Date.now() }));
      await db.putMany('students', recs);
      renderStudents();
      return null;
    },
  });
}

async function printList() {
  const list = sortStudents((await db.all('students')).filter(s => s.status !== 'left'));
  if (!list.length) return;
  const fonts = await loadFonts();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular); doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold); doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  const title = 'Оқушылар тізімі және ID / Список учеников и ID';
  let y = 0, page = 0;
  const header = () => {
    page++;
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(13); doc.setTextColor(0);
    doc.text(title, 15, 16);
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(8); doc.setTextColor(110);
    doc.text(`${today().split('-').reverse().join('.')} · ${page}`, 195, 16, { align: 'right' });
    doc.text('Бланктағы «Оқушы ID» бөлігіне осы 4 цифрды жазып, бояңыз. / Впишите и закрасьте эти 4 цифры в поле «ID ученика».', 15, 21);
    y = 28;
  };
  header();
  let group = null;
  for (const s of list) {
    if (y > 282) { doc.addPage(); header(); group = null; }
    if (s.group !== group) {
      group = s.group;
      doc.setFont('DejaVu', 'bold'); doc.setFontSize(10); doc.setTextColor(15, 118, 110);
      doc.text(group || '—', 15, y + 4);
      y += 7;
    }
    doc.setDrawColor(190); doc.setLineDashPattern([1, 1], 0); doc.line(15, y + 6.2, 195, y + 6.2); doc.setLineDashPattern([], 0);
    doc.setFont('DejaVu', 'bold'); doc.setFontSize(14); doc.setTextColor(0);
    doc.text(s.id, 18, y + 4.5);
    doc.setFont('DejaVu', 'normal'); doc.setFontSize(11);
    doc.text(s.name, 38, y + 4.3);
    doc.setFontSize(9); doc.setTextColor(110);
    doc.text(s.group || '', 195, y + 4.3, { align: 'right' });
    y += 7;
  }
  saveBlob(doc.output('blob'), getLang() === 'kk' ? 'оқушылар-ID.pdf' : 'ученики-ID.pdf');
}

export { closeForm };
