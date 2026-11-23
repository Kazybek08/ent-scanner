// Главный экран: напоминание о резервной копии, если есть бланки, не попавшие в копию.
import { $ } from './util.js';
import { t } from './i18n.js';
import { saveBackup, backupStatus, backupStatusText } from './backup-ui.js';

export function initHomeBackup() {
  $('#homeBackupBtn').addEventListener('click', async () => { await saveBackup(); renderHomeBackup(); });
  window.addEventListener('hashchange', renderHomeBackup);
  document.addEventListener('langchange', renderHomeBackup);
  document.addEventListener('datachange', renderHomeBackup);
  renderHomeBackup();
}

export async function renderHomeBackup() {
  if (location.hash.slice(1)) return;
  const st = await backupStatus();
  const box = $('#homeBackup');
  box.hidden = !st.newSince;
  if (st.newSince) $('#homeBackupText').textContent = `${t('backup.remind')} ${backupStatusText(st)}`;
}
