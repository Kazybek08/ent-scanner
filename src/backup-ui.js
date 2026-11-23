// Резервная копия: сохранить в «Поделиться» → Google Диск / Файлы, восстановить из файла, напоминание.
import { dumpAll, replaceAll, getSetting, setSetting, db } from './db.js';
import { makeBackup, readBackup, backupFileName } from './backup.js';
import { shareOrSave, fmtDate } from './util.js';
import { openForm } from './form.js';
import { t } from './i18n.js';

export async function saveBackup() {
  const dump = await dumpAll();
  const text = await makeBackup(dump);
  const blob = new Blob([text], { type: 'application/json' });
  const how = await shareOrSave(blob, backupFileName());
  if (how !== 'cancelled') await setSetting('lastBackupAt', Date.now());
  document.dispatchEvent(new CustomEvent('datachange'));
  return { how, size: blob.size, counts: Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length])) };
}

/** Сколько бланков сохранено после последней копии. */
export async function backupStatus() {
  const lastAt = await getSetting('lastBackupAt', 0);
  const results = await db.all('results');
  return { lastAt, total: results.length, newSince: results.filter(r => r.createdAt > lastAt || (r.reviewedAt ?? 0) > lastAt).length };
}

export function backupStatusText(st) {
  const when = st.lastAt ? fmtDate(new Date(st.lastAt).toISOString().slice(0, 10)) : null;
  if (!st.total) return when ? t('backup.last', { date: when }) : t('backup.never');
  if (!st.newSince) return t('backup.upToDate', { date: when });
  return when ? t('backup.newSince', { n: st.newSince, date: when }) : t('backup.neverWithData', { n: st.newSince });
}

export async function restoreFromFile(file, onDone) {
  let parsed;
  try { parsed = readBackup(await file.text()); }
  catch (e) {
    const code = ['notBackup', 'newerFormat', 'broken'].includes(e.message) ? e.message : 'notBackup';
    openForm({ title: t('backup.restore'), message: t(`backup.err.${code}`), submit: t('form.ok'), onSubmit: () => null });
    return;
  }
  const c = parsed.counts ?? {};
  openForm({
    title: t('backup.restore'),
    message: t('backup.restoreAsk', {
      date: parsed.createdAt ? new Date(parsed.createdAt).toLocaleString() : '—',
      students: c.students ?? 0, tests: c.tests ?? 0, results: c.results ?? 0,
    }),
    submit: t('backup.restoreBtn'),
    onSubmit: async () => {
      await replaceAll(parsed.dump);
      await setSetting('lastBackupAt', Date.now());
      document.dispatchEvent(new CustomEvent('datachange'));
      onDone?.();
      return null;
    },
  });
}
