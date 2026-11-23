// Настройки, которые влияют на подсчёт: пары предметов (кто «Профиль 1») и пороговые баллы.
import { getSetting } from './db.js';
import { DEFAULT_THRESHOLDS } from './report.js';

export async function getAppSettings() {
  const [combos, thresholds] = await Promise.all([getSetting('combos', []), getSetting('thresholds', null)]);
  return {
    combos: Array.isArray(combos) ? combos : [],
    thresholds: thresholds ? { total: thresholds.total ?? DEFAULT_THRESHOLDS.total, min: { ...DEFAULT_THRESHOLDS.min, ...(thresholds.min ?? {}) } } : DEFAULT_THRESHOLDS,
  };
}
