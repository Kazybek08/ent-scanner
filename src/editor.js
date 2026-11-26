// Проверка и исправление одного бланка: карточки сомнительных мест с вырезом из фото,
// исправление ID / варианта / предметов, все ответы списком, «Сохранить и следующий».
import { db } from './db.js';
import { t, getLang } from './i18n.js';
import { $, el } from './util.js';
import { effective, evaluate } from './results.js';
import { cropSheet, photoPixels } from './crop.js';
import { drawOverlay } from './overlay.js';
import { ANSWER_SECTIONS, STUDENT_ID, VARIANT } from './template.js';
import { DEFAULT_SUBJECTS, SECTIONS } from './subjects.js';
import { subjectLabel } from './tests-screen.js';
import { questionType } from './scoring.js';
import { optionsForAnswer } from './template.js';
import { getAppSettings } from './app-settings.js';

let S = null;   // состояние открытого бланка

export async function loadContext(testId) {
  const [test, students, results, settings] = await Promise.all([db.get('tests', testId), db.all('students'), db.byIndex('results', 'testId', testId), getAppSettings()]);
  return { test, students, results, combos: settings.combos };
}

/**
 * Открыть бланк.
 * @param {string} id
 * @param {{queue?: string[], onSaved?: Function}} opts  queue — порядок «следующих» бланков
 */
export async function openEditor(id, opts = {}) {
  const rec = await db.get('results', id);
  if (!rec) return;
  const ctx = await loadContext(rec.testId);
  S = { rec, ctx, draft: structuredClone(rec.edits ?? {}), dirty: false, queue: opts.queue ?? [], onSaved: opts.onSaved, crops: new Map(), photo: null, overlay: null, subjPick: null };
  const dlg = $('#editDialog');
  $('#editBody').textContent = '';
  $('#editBody').scrollTop = 0;
  if (!dlg.open) dlg.showModal();
  S.photo = await photoPixels(rec.photo);
  render();
}

function closeEditor(force = false) {
  if (!force && S?.dirty && !window.confirm(t('edit.discardAsk'))) return;
  $('#editDialog').close();
  S = null;
}

export function initEditor() {
  $('#editClose').addEventListener('click', () => closeEditor());
  $('#editDialog').addEventListener('cancel', e => { e.preventDefault(); closeEditor(); });
  $('#editSave').addEventListener('click', () => save(false));
  $('#editNext').addEventListener('click', () => save(true));
}

const withDraft = () => ({ ...S.rec, edits: S.draft });

function nextId() {
  const i = S.queue.indexOf(S.rec.id);
  const rest = i >= 0 ? S.queue.slice(i + 1) : S.queue.filter(x => x !== S.rec.id);
  return rest[0] ?? null;
}

async function save(goNext) {
  if (!S) return;
  const next = goNext ? nextId() : null;
  if (S.dirty) {
    const rec = { ...S.rec, edits: S.draft, reviewedAt: Date.now() };
    if (!Object.keys(S.draft).length) delete rec.edits;
    await db.put('results', rec);
  }
  const onSaved = S.onSaved;
  S.dirty = false;
  if (next) {
    await openEditor(next, { queue: S.queue, onSaved });
  } else {
    closeEditor(true);
  }
  onSaved?.();
}

// ---------- изменения ----------
function setAnswer(sec, n, marked) {
  S.draft.answers ??= {};
  S.draft.answers[sec] ??= {};
  S.draft.answers[sec][n] = marked;
  S.dirty = true;
  render();
}

function toggleLetter(sec, n, letter, item) {
  const cur = effective(withDraft()).answers[sec][n].marked;
  const type = questionType(sec, n);
  let next;
  if (type === 'match') {
    // сопоставление: у каждого пункта одна буква; повторное нажатие — снять
    const pair = [(cur || '--')[0] || '-', (cur || '--')[1] || '-'];
    pair[item - 1] = pair[item - 1] === letter ? '-' : letter;
    next = pair.join('') === '--' ? '' : pair.join('');
  } else if (type === 'multi') {
    const set = new Set(cur);
    set.has(letter) ? set.delete(letter) : set.add(letter);
    next = [...set].sort().join('');
  } else next = cur === letter ? '' : letter;
  setAnswer(sec, n, next);
}

// ---------- отрисовка ----------
function sectionName(key, profiles) {
  if (key === 'profile1' || key === 'profile2') {
    const code = profiles?.[key === 'profile1' ? 0 : 1];
    return code ? `${subjectLabel(code)} (${SECTIONS.find(s => s.key === key)[getLang()]})` : SECTIONS.find(s => s.key === key)[getLang()];
  }
  return SECTIONS.find(s => s.key === key)[getLang()];
}

function crop(key, box, ppm) {
  let c = S.crops.get(key);
  if (!c) {
    c = cropSheet(S.photo.data, S.rec.H, S.rec.photoScale, box, ppm);
    c.className = 'crop';
    S.crops.set(key, c);
  }
  return c;
}

function letterButtons(sec, n, eff) {
  const q = ANSWER_SECTIONS.find(s => s.key === sec).questions.find(q => q.n === +n);
  const a = eff.answers[sec][n];
  const on = new Set(optionsForAnswer(q, a.marked || ''));
  const btn = o => el('button', {
    type: 'button', class: 'letter', 'aria-pressed': String(on.has(o)), text: o.letter,
    'aria-label': `${n} ${o.item ? o.item + ') ' : ''}${o.letter}`, onclick: () => toggleLetter(sec, n, o.letter, o.item),
  });
  if (q.type === 'match') {
    // две строки: «1) A B C D» и «2) A B C D»
    return el('div', { class: `match-rows${a.edited ? ' is-edited' : ''}` }, [1, 2].map(item =>
      el('div', { class: `letters match-row${a.edited ? ' is-edited' : ''}`, role: 'group' },
        el('span', { class: 'match-label', text: `${item})` }), q.options.filter(o => o.item === item).map(btn))));
  }
  return el('div', { class: `letters${a.edited ? ' is-edited' : ''}`, role: 'group' }, q.options.map(btn));
}

function flagTitle(f) {
  const sec = key => SECTIONS.find(s => s.key === key)?.[getLang()] ?? key;
  switch (f.kind) {
    case 'answer': return t(`flag.answer.${f.reason}`, { section: sec(f.section), n: f.n, letters: f.letters });
    case 'id': case 'variant': return t(`flag.${f.kind}`, { col: f.column + 1, reason: t(`reason.${f.reason}`) });
    case 'subjects':
      if (f.reason === 'weak') return t('flag.subjects.weak');
      if (f.reason === 'same') return t('flag.subjects.same');
      if (f.reason === 'slots') return t('flag.subjects.slots', { p1: f.p1, p2: f.p2 });
      return t('flag.subjects', { count: f.count });
    case 'unknownStudent': return t('flag.unknownStudent', { id: f.id });
    case 'duplicate': return t('flag.duplicate', { id: f.id });
    case 'noKeyVariant': return t('flag.noKeyVariant', { variant: f.variant });
    case 'noKeySubject': return t('flag.noKeySubject', { subject: subjectLabel(f.subject) });
    default: return f.kind;
  }
}

function render() {
  if (!S) return;
  const body = $('#editBody');
  const scroll = body.scrollTop;
  const rec = withDraft();
  const ev = evaluate(rec, S.ctx);
  const eff = ev.eff;
  body.textContent = '';

  // шапка
  $('#editTitle').textContent = ev.student?.name ?? `ID ${eff.studentIdRaw ?? '????'}`;
  const pos = S.queue.indexOf(S.rec.id);
  $('#editPos').textContent = pos >= 0 && S.queue.length > 1 ? `${pos + 1} / ${S.queue.length}` : '';
  $('#editNext').hidden = !nextId();
  $('#editSave').textContent = S.dirty ? t('form.save') : t('edit.done');

  const profiles = ev.profiles;
  body.append(el('section', { class: 'edit-summary' },
    el('div', { class: 'edit-score' },
      el('b', { text: ev.score ? String(ev.score.total) : '—' }),
      el('span', { text: ev.score ? `/ 140${ev.score.complete ? '' : ' · ' + t('scan.incomplete')}` : t('edit.noScore') })),
    el('div', { class: 'row-sub', text: `ID ${eff.studentIdRaw ?? '—'} · ${t('scan.variant')} ${eff.variantRaw ?? '—'} · ${profiles ? profiles.map(subjectLabel).join(' + ') : '—'}` }),
    ev.score ? el('div', { class: 'row-sub', text: ['history', 'mathLit', 'reading', 'profile1', 'profile2'].map(k => `${k.startsWith('profile') && profiles ? subjectLabel(profiles[k === 'profile1' ? 0 : 1]) : subjectLabel(k)} ${ev.score.parts[k].points ?? '—'}`).join(' · ') }) : null,
    el('p', { class: `edit-state ${ev.flags.length ? 'warn' : 'ok'}`, text: ev.flags.length ? t('edit.left', { n: ev.flags.length }) : t('edit.allChecked') }),
    eff.edited ? el('p', { class: 'row-sub edited-note', text: t('edit.editedNote') }) : null,
  ));

  // карточки «нужно проверить»: и открытые, и уже исправленные в этом сеансе/ранее
  const cards = el('section', { class: 'fix-list' });
  const recFlags = S.rec.flags ?? [];
  const shownAnswer = new Set();
  for (const f of recFlags) {
    if (f.kind === 'answer') {
      shownAnswer.add(`${f.section}:${f.n}`);
      const q = ANSWER_SECTIONS.find(s => s.key === f.section).questions.find(q => q.n === f.n);
      const first = q.options[0], last = q.options.at(-1);
      const done = eff.answers[f.section][f.n].edited;
      cards.append(el('div', { class: `fix-card${done ? ' done' : ''}` },
        el('div', { class: 'fix-title', text: `${sectionName(f.section, profiles)}, №${f.n}` }),
        el('div', { class: 'fix-sub', text: done ? t('edit.fixed') : t(`edit.reason.${f.reason}`, { letters: f.letters }) }),
        crop(`a:${f.section}:${f.n}`, { x0: first.x - 9.5, y0: q.y - 3.2, x1: last.x + 3.2, y1: q.y + 3.2 }, 9),
        letterButtons(f.section, f.n, eff),
        el('div', { class: 'fix-actions' },
          el('button', { type: 'button', class: 'btn-link', text: t('edit.empty'), onclick: () => setAnswer(f.section, f.n, '') }),
          S.rec.answers[f.section][f.n].marked
            ? el('button', { type: 'button', class: 'btn-link', text: t('edit.asRead', { letters: S.rec.answers[f.section][f.n].marked }), onclick: () => setAnswer(f.section, f.n, S.rec.answers[f.section][f.n].marked) })
            : null)));
    }
  }
  // ID ученика
  const dupFlag = ev.flags.find(f => f.kind === 'duplicate');
  const idFlag = ev.flags.find(f => f.kind === 'id' || f.kind === 'unknownStudent') || dupFlag || recFlags.find(f => f.kind === 'id');
  if (idFlag || S.draft.studentId !== undefined) {
    const input = el('input', { class: 'id-input', inputmode: 'numeric', maxlength: 4, pattern: '[0-9]*', value: (eff.studentIdRaw ?? '').replace(/\?/g, ''), 'aria-label': t('edit.idLabel') });
    const hint = el('div', { class: 'fix-sub' });
    const showHint = () => {
      const v = input.value;
      const st = S.ctx.students.find(s => s.id === v);
      hint.textContent = /^\d{4}$/.test(v) ? (st ? `${st.name} · ${st.group}` : t('edit.idUnknown')) : t('edit.idType');
    };
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 4);
      showHint();
      if (/^\d{4}$/.test(input.value)) { S.draft.studentId = input.value; S.dirty = true; }
    });
    input.addEventListener('change', () => { if (/^\d{4}$/.test(input.value)) render(); });
    showHint();
    const done = S.draft.studentId !== undefined && !ev.flags.some(f => f.kind === 'id' || f.kind === 'unknownStudent' || f.kind === 'duplicate');
    cards.append(el('div', { class: `fix-card${done ? ' done' : ''}` },
      el('div', { class: 'fix-title', text: t('edit.idTitle') }),
      el('div', { class: 'fix-sub', text: done ? t('edit.fixed') : idFlag ? flagTitle(idFlag) : t('edit.fixed') }),
      el('div', { class: 'fix-row' },
        crop('id', { x0: STUDENT_ID.x - 2, y0: 45, x1: STUDENT_ID.x + 25, y1: 104 }, 5),
        el('div', { class: 'fix-col' }, input, hint,
          dupFlag ? el('p', { class: 'fix-sub', text: t('edit.dupHint') }) : null,
          dupFlag ? el('div', { class: 'fix-actions' }, dupFlag.others.map((oid, i) => el('button', { type: 'button', class: 'btn-link', text: t('edit.openOther', { n: i + 1 }),
            onclick: async () => { if (S.dirty && !window.confirm(t('edit.discardAsk'))) return; await openEditor(oid, { queue: S.queue, onSaved: S.onSaved }); } }))) : null))));
  }
  // вариант
  const varFlag = ev.flags.find(f => f.kind === 'variant' || f.kind === 'noKeyVariant') || recFlags.find(f => f.kind === 'variant');
  if (varFlag || S.draft.variant !== undefined) {
    const variants = Object.keys(S.ctx.test?.keys ?? {}).sort();
    const opts = variants.length ? variants : ['01', '02'];
    cards.append(el('div', { class: `fix-card${S.draft.variant !== undefined && !ev.flags.some(f => f.kind === 'variant' || f.kind === 'noKeyVariant') ? ' done' : ''}` },
      el('div', { class: 'fix-title', text: t('edit.variantTitle') }),
      el('div', { class: 'fix-sub', text: varFlag ? flagTitle(varFlag) : t('edit.fixed') }),
      el('div', { class: 'fix-row' },
        crop('var', { x0: VARIANT.x - 2, y0: 45, x1: VARIANT.x + 13, y1: 104 }, 5),
        el('div', { class: 'letters wrap' }, opts.map(v => el('button', { type: 'button', class: 'letter wide', 'aria-pressed': String(eff.variant === v), text: v,
          onclick: () => { S.draft.variant = v; S.dirty = true; render(); } }))))));
  }
  // предметы
  const subjFlag = ev.flags.find(f => f.kind === 'subjects') || recFlags.find(f => f.kind === 'subjects');
  if (subjFlag || S.draft.subjects !== undefined) {
    // порядок нажатия = порядок профилей: первый выбранный — «Профиль 1», второй — «Профиль 2»
    const picked = S.subjPick ?? [...(ev.profiles ?? eff.subjects ?? [])];
    const ok = picked.length === 2;
    const pick = p => { S.subjPick = p; if (p.length === 2) { S.draft.subjects = p; S.dirty = true; } render(); };
    cards.append(el('div', { class: `fix-card${S.draft.subjects !== undefined && !ev.flags.some(f => f.kind === 'subjects') ? ' done' : ''}` },
      el('div', { class: 'fix-title', text: t('edit.subjectsTitle') }),
      el('div', { class: 'fix-sub', text: ok ? (S.draft.subjects !== undefined ? t('edit.fixed') : subjFlag ? flagTitle(subjFlag) : t('edit.fixed')) : t('edit.pickTwo') }),
      crop('subj', { x0: 64, y0: 51.5, x1: 193, y1: 79 }, 5),
      el('div', { class: 'chips' }, DEFAULT_SUBJECTS.map(s => {
        const i = picked.indexOf(s.code);
        return el('button', { type: 'button', class: 'chip', 'aria-pressed': String(i >= 0), text: i >= 0 ? `${i + 1} · ${s[getLang()]}` : s[getLang()],
          onclick: () => { const p = [...picked]; if (i >= 0) p.splice(i, 1); else if (p.length < 2) p.push(s.code); else return; pick(p); } });
      })),
      ok ? el('div', { class: 'fix-actions' },
        el('div', { class: 'fix-sub', text: t('edit.profileOrder', { p1: subjectLabel(picked[0]), p2: subjectLabel(picked[1]) }) }),
        el('button', { type: 'button', class: 'btn-link', text: t('edit.swapProfiles'), onclick: () => pick([picked[1], picked[0]]) })) : null,
    ));
  }
  // информационные: нет ключа
  for (const f of ev.flags.filter(f => f.kind === 'noKeySubject' || (f.kind === 'noKeyVariant' && !varFlag))) {
    cards.append(el('div', { class: 'fix-card info' },
      el('div', { class: 'fix-title', text: flagTitle(f) }),
      el('div', { class: 'fix-sub', text: t('edit.keyHint') })));
  }
  if (cards.childElementCount) body.append(el('h3', { class: 'edit-h', text: t('edit.toCheck') }), cards);

  // фото с отметками
  if (!S.overlay) {
    S.overlay = el('canvas', { class: 'edit-photo' });
  }
  body.append(el('h3', { class: 'edit-h', text: t('edit.photo') }), S.overlay);
  requestAnimationFrame(() => drawPhoto(rec, eff));

  // все ответы
  const details = el('details', { class: 'all-answers', open: S.allOpen || null, ontoggle: e => { S.allOpen = e.target.open; if (S.allOpen && !e.target.querySelector('.answers-grid')) render(); } },
    el('summary', { text: t('edit.allAnswers') }));
  if (S.allOpen) {
    for (const s of ANSWER_SECTIONS) {
      const grid = el('div', { class: 'answers-grid' });
      for (const q of s.questions) {
        const a = eff.answers[s.key][q.n];
        grid.append(el('div', { class: `ans-row${a.edited ? ' edited' : a.status === 'check' ? ' check' : ''}` },
          el('span', { class: 'ans-n', text: String(q.n) }), letterButtons(s.key, q.n, eff)));
      }
      details.append(el('h4', { text: sectionName(s.key, profiles) }), grid);
    }
  }
  body.append(details);

  body.append(el('button', { type: 'button', class: 'btn-danger', text: t('scan.delete'), onclick: async () => {
    if (!window.confirm(t('scan.deleteAsk'))) return;
    const next = nextId();
    await db.del('results', S.rec.id);
    const { queue, onSaved } = S;
    S.dirty = false;
    if (next) await openEditor(next, { queue: queue.filter(x => x !== S.rec.id), onSaved }); else closeEditor(true);
    onSaved?.();
  } }));
  body.scrollTop = scroll;
}

function drawPhoto(rec, eff) {
  if (!S) return;
  const canvas = S.overlay;
  const img = S.photo.img;
  const cssW = Math.max(200, canvas.parentElement?.clientWidth ?? 340);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const k = (cssW * dpr) / img.naturalWidth;
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  canvas.style.width = '100%';
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  drawOverlay(ctx, rec, rec.photoScale * k, eff);
}
