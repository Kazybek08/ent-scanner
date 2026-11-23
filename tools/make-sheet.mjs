// Собирает PDF бланка на ноутбуке: node tools/make-sheet.mjs
// Результат: out/blank-v2.pdf
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { buildSheetPdf } from '../src/sheet-pdf.js';

const root = new URL('..', import.meta.url);
const b64 = async p => (await readFile(new URL(p, root))).toString('base64');

const fonts = {
  regular: await b64('vendor/fonts/DejaVuSans.ttf'),
  bold: await b64('vendor/fonts/DejaVuSans-Bold.ttf'),
};

let logo;
const logoUrl = new URL('docs/logo.png', root);
if (existsSync(logoUrl)) {
  const buf = await readFile(logoUrl);
  // размеры PNG лежат в заголовке IHDR
  logo = { data: 'data:image/png;base64,' + buf.toString('base64'), format: 'PNG',
           w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const doc = buildSheetPdf({ jsPDF, fonts, logo });
await mkdir(new URL('out/', root), { recursive: true });
await writeFile(new URL('out/blank-v2.pdf', root), Buffer.from(doc.output('arraybuffer')));
console.log('Готово: out/blank-v2.pdf', logo ? '(с логотипом)' : '(логотип-заглушка)');
