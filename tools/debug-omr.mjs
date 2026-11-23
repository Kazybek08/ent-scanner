// Отладка распознавания на искусственном бланке: node tools/debug-omr.mjs [seed]
import { recognize, project } from '../src/omr.js';
import { synthPhoto, buildMarks } from '../tests/synth.mjs';
import { ANSWER_SECTIONS } from '../src/template.js';

const seed = +(process.argv[2] || 3);
const answers = { history: { 1: 'A', 2: 'B', 20: 'E' }, reading: { 1: 'C' }, profile2: { 40: 'F' } };
const img = synthPhoto({ marks: buildMarks({ answers }), seed });
const res = recognize(img);
console.log({ ok: res.ok, error: res.error, base: res.base, pxPerMm: res.pxPerMm, ms: res.ms, flags: res.flags.length,
  corners: JSON.stringify(res.corners), orientation: res.orientation, score: res.orientationScore });
// где метки на самом деле (центры в мм → пиксели по «истинной» перспективе неизвестны, поэтому смотрим, что рядом)
for (const [sec, n] of [['history', 1], ['history', 2], ['history', 20], ['reading', 1], ['profile2', 40]]) {
  console.log(sec, n, res.answers[sec][n]);
}
const q = ANSWER_SECTIONS[0].questions[0].options[0];
console.log('history1A в мм', q, '→ пиксели', project(res.H, q.x, q.y));
