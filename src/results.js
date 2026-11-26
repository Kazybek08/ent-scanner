// Итоговые значения бланка с учётом ручных исправлений и оценка (баллы + предупреждения).
// Чистые функции — без экрана, покрыты автотестами.
import { scoreSheet, orderProfiles } from './scoring.js';
import { DEFAULT_SUBJECTS } from './subjects.js';

/**
 * Применяет исправления оператора (rec.edits) к распознанному бланку.
 * edits: { studentId?, variant?, subjects?: [code, code], answers?: { section: { n: 'AC' } } }
 */
export function effective(rec) {
  const e = rec.edits ?? {};
  const answers = {};
  for (const [sec, qs] of Object.entries(rec.answers ?? {})) {
    answers[sec] = {};
    for (const [n, a] of Object.entries(qs)) {
      const edited = e.answers?.[sec]?.[n];
      answers[sec][n] = edited !== undefined
        ? { marked: edited, status: edited ? 'ok' : 'empty', edited: true, scores: a.scores, weak: '' }
        : { ...a, edited: false };
    }
  }
  const flags = (rec.flags ?? []).filter(f => {
    if (f.kind === 'answer') return e.answers?.[f.section]?.[f.n] === undefined;
    if (f.kind === 'id') return e.studentId === undefined;
    if (f.kind === 'variant') return e.variant === undefined;
    if (f.kind === 'subjects') return e.subjects === undefined && e.creative === undefined;
    return true;
  });
  return {
    studentId: e.studentId !== undefined ? e.studentId : rec.studentId,
    studentIdRaw: e.studentId !== undefined ? e.studentId : rec.studentIdRaw,
    variant: e.variant !== undefined ? e.variant : rec.variant,
    variantRaw: e.variant !== undefined ? e.variant : rec.variantRaw,
    subjects: e.subjects !== undefined ? e.subjects : rec.subjects,
    // «Творчество»: только история Казахстана и грамотность чтения
    creative: e.creative !== undefined ? !!e.creative : !!rec.creative,
    // порядок [профиль 1, профиль 2] известен: с бланка v4 или выбран оператором в редакторе
    subjectsOrdered: e.subjects !== undefined ? e.subjectsOrdered !== false : !!rec.subjectsOrdered,
    answers, flags,
    edited: !!rec.edits && Object.keys(rec.edits).length > 0,
  };
}

/**
 * Оценка бланка: итоговые значения, профили, баллы и все предупреждения.
 * @param {object} rec        запись из хранилища
 * @param {object} ctx        { test, students, results } — пробник, ученики, все бланки пробника
 */
export function evaluate(rec, { test, students, results, combos = [] }) {
  const out = { state: 'fail', flags: [], score: null, student: null, profiles: null, creative: false, eff: null };
  if (!rec.ok) return out;
  const eff = out.eff = effective(rec);
  out.flags = [...eff.flags];
  out.student = eff.studentId ? students.find(s => s.id === eff.studentId) ?? null : null;
  if (eff.studentId && !out.student) out.flags.push({ kind: 'unknownStudent', id: eff.studentId });
  if (eff.studentId) {
    const others = results.filter(r => r.id !== rec.id && r.ok && effective(r).studentId === eff.studentId);
    if (others.length) out.flags.push({ kind: 'duplicate', id: eff.studentId, others: others.map(r => r.id) });
  }
  out.creative = eff.creative;
  out.profiles = eff.creative || eff.subjects?.length !== 2 ? null
    : eff.subjectsOrdered ? [...eff.subjects] : orderProfiles(eff.subjects, combos, DEFAULT_SUBJECTS);
  const key = eff.variant ? test?.keys?.[eff.variant] : null;
  if (eff.variant && !key && Object.keys(test?.keys ?? {}).length) out.flags.push({ kind: 'noKeyVariant', variant: eff.variant });
  if (key) {
    const answers = Object.fromEntries(Object.entries(eff.answers).map(([s, qs]) =>
      [s, Object.fromEntries(Object.entries(qs).map(([n, a]) => [n, a.marked]))]));
    out.score = scoreSheet({ answers, profiles: out.profiles, key, creative: eff.creative });
    for (const m of out.score.missing) if (m.includes(':')) out.flags.push({ kind: 'noKeySubject', subject: m.split(':')[1] });
  }
  out.state = out.flags.length ? 'check' : 'ok';
  return out;
}

/** Слить новые исправления с уже сохранёнными; правка, совпадающая с распознанным, тоже сохраняется (это «подтверждено»). */
export function mergeEdits(old = {}, add = {}) {
  const out = { ...old, ...add };
  if (old.answers || add.answers) {
    out.answers = {};
    for (const src of [old.answers ?? {}, add.answers ?? {}]) {
      for (const [sec, qs] of Object.entries(src)) out.answers[sec] = { ...(out.answers[sec] ?? {}), ...qs };
    }
  }
  return out;
}
