// Шаблоны Excel в папку docs: node tools/make-templates.mjs
import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { keysTemplateWorkbook, studentsTemplateWorkbook } from '../src/excel.js';

const save = (wb, path) => { writeFileSync(path, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); console.log(path); };
for (const lang of ['ru', 'kk']) {
  save(keysTemplateWorkbook(XLSX, lang), `docs/keys-template-${lang}.xlsx`);
  save(studentsTemplateWorkbook(XLSX, lang), `docs/students-template-${lang}.xlsx`);
}
