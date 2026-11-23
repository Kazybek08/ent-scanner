// Резервная копия: всё содержимое приложения (ученики, пробники с ключами, бланки с фото, настройки) в одном файле.
// Формат — JSON; фото внутри в base64. Чистые функции — покрыты автотестами.

export const BACKUP_FORMAT = 1;
const STORES = ['students', 'tests', 'results', 'settings'];

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encode(v) {
  if (v instanceof Blob) return { $blob: v.type || 'application/octet-stream', b64: toBase64(new Uint8Array(await v.arrayBuffer())) };
  if (Array.isArray(v)) return Promise.all(v.map(encode));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = await encode(x);
    return o;
  }
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (typeof v.$blob === 'string' && typeof v.b64 === 'string') return new Blob([fromBase64(v.b64)], { type: v.$blob });
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = decode(x);
    return o;
  }
  return v;
}

/** dump = { students: [...], tests: [...], results: [...], settings: [...] } → текст файла копии */
export async function makeBackup(dump, now = new Date()) {
  const data = {};
  for (const s of STORES) data[s] = await encode(dump[s] ?? []);
  return JSON.stringify({
    app: 'ent-scanner', format: BACKUP_FORMAT, createdAt: now.toISOString(),
    counts: Object.fromEntries(STORES.map(s => [s, (dump[s] ?? []).length])),
    data,
  });
}

/** Текст файла копии → dump. Бросает понятную ошибку, если файл не тот. */
export function readBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('notBackup'); }
  if (!j || j.app !== 'ent-scanner' || !j.data) throw new Error('notBackup');
  if (j.format > BACKUP_FORMAT) throw new Error('newerFormat');
  const dump = {};
  for (const s of STORES) {
    if (!Array.isArray(j.data[s])) throw new Error('broken');
    dump[s] = decode(j.data[s]);
  }
  return { dump, createdAt: j.createdAt, counts: j.counts };
}

export const backupFileName = (now = new Date()) =>
  `ent-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;
