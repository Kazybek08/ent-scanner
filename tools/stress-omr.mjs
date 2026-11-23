// Нагрузочная проверка распознавания: node tools/stress-omr.mjs [кол-во]
import { recognize } from '../src/omr.js';
import { synthPhoto, buildMarks, randomAnswers, rng } from '../tests/synth.mjs';

const N = +(process.argv[2] || 60);
let ok = 0, failed = 0, wrongSilent = 0, flagged = 0;
const fails = [];
for (let seed = 100; seed < 100 + N; seed++) {
  const R = rng(seed);
  const answers = randomAnswers(R);
  const orient = ['portrait', 'portrait', 'landscape', 'upside'][seed % 4];
  const img = synthPhoto({
    marks: buildMarks({ id: '1234', variant: '02', answers }), seed, orient,
    tilt: 1.6, lighting: 1.4, noise: 10,
  });
  const res = recognize(img);
  if (!res.ok) { failed++; fails.push(`${seed}:${res.error}`); continue; }
  let silent = 0;
  for (const [sec, qs] of Object.entries(res.answers)) for (const [n, a] of Object.entries(qs)) {
    const want = answers[sec]?.[n] ?? '';
    if (a.status !== 'check' && a.marked !== want) silent++;
  }
  if (res.studentId !== '1234' && !res.flags.some(f => f.kind === 'id')) silent++;
  wrongSilent += silent;
  flagged += res.flags.length;
  if (!silent) ok++; else fails.push(`${seed}:молча неверно ${silent}`);
}
console.log({ всего: N, безОшибок: ok, неНайденБланк: failed, молчаОшибок: wrongSilent, подсветок: flagged });
if (fails.length) console.log(fails.join('\n'));
