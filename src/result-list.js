// Список отсканированных бланков (общий для «Сканирования» и «Проверки»).
import { t } from './i18n.js';
import { el } from './util.js';
import { evaluate } from './results.js';
import { db } from './db.js';
import { subjectLabel } from './tests-screen.js';

const ICON = {
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/></svg>',
  fail: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
};

/**
 * @param {HTMLElement} list
 * @param {Array} recs       записи для показа (в нужном порядке)
 * @param {object} ctx       { test, students, results }
 * @param {Function} onOpen  (id) => void
 * @param {Function} [onDeleted]  после удаления скана (перерисовать экран)
 * @returns {string[]} объектные ссылки на фото — их нужно освободить при следующем показе
 */
export function renderResultList(list, recs, ctx, onOpen, onDeleted) {
  list.textContent = '';
  const urls = [];
  for (const rec of recs) {
    const ev = evaluate(rec, ctx);
    const url = URL.createObjectURL(rec.photo);
    urls.push(url);
    const badge = el('span', { class: 'result-badge' });
    badge.innerHTML = ICON[ev.state];
    let title, sub;
    if (rec.ok) {
      const eff = ev.eff;
      title = ev.student ? ev.student.name : `ID ${eff.studentIdRaw}`;
      sub = `ID ${eff.studentIdRaw} · ${t('scan.variant')} ${eff.variantRaw} · ${ev.creative ? t('res.creative') : ev.profiles ? ev.profiles.map(subjectLabel).join(' + ') : '—'}`;
      badge.append(ev.flags.length ? t('scan.check', { n: ev.flags.length }) : eff.edited ? t('edit.checkedManually') : t('scan.ok'));
    } else {
      title = rec.label;
      sub = t(`scan.err.${rec.error}`);
      badge.append(t('scan.fail'));
    }
    const score = ev.score
      ? el('span', { class: 'result-score' }, el('b', { text: String(ev.score.total) }), el('small', { text: ev.score.complete ? `/${ev.score.fullMax}` : '/…' }))
      : null;
    // корзина: быстро убрать неудачный кадр или нераспознанный бланк
    const del = el('button', { type: 'button', class: 'result-del', 'aria-label': t('scan.delete'), title: t('scan.delete'),
      onclick: async () => {
        if (!window.confirm(t('scan.deleteAskNamed', { name: title }))) return;
        await db.del('results', rec.id);
        onDeleted?.();
      } });
    del.innerHTML = ICON.trash;
    list.append(el('li', { class: 'result-row' },
      el('button', { type: 'button', class: `result result-${ev.state}`, onclick: () => onOpen(rec.id) },
        el('img', { src: url, alt: '', width: 48, height: 68 }),
        el('span', { class: 'result-body' },
          el('span', { class: 'result-title', text: title }),
          el('span', { class: 'result-sub', text: sub }),
          badge),
        score), del));
  }
  return urls;
}
