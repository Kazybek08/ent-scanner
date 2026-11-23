// Отладка поиска угловых меток: node tools/debug-markers.mjs [seed]
import { writeFileSync } from 'node:fs';
import { synthPhoto, buildMarks } from '../tests/synth.mjs';
import { __debug } from '../src/omr.js';

const seed = +(process.argv[2] || 3);
const img = synthPhoto({ marks: buildMarks({}), seed });
const { norm, comps, cands } = __debug(img);
const near = comps.filter(c => c.cx > img.width * 0.6 && c.cy < img.height * 0.25 && c.area > 150);
console.log('крупные тёмные пятна справа сверху:', near.map(c => ({ x: Math.round(c.cx), y: Math.round(c.cy), w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1, area: c.area, why: c.why })));
console.log('кандидаты:', cands.map(c => [Math.round(c.x), Math.round(c.y), Math.round(c.side)]));
// сохраним нормализованную картинку для просмотра (PGM)
writeFileSync('out/debug-norm.pgm', Buffer.concat([Buffer.from(`P5 ${img.width} ${img.height} 255\n`), Buffer.from(norm)]));
writeFileSync('out/debug-photo.pgm', Buffer.concat([Buffer.from(`P5 ${img.width} ${img.height} 255\n`), Buffer.from(img.gray)]));
