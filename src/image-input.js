// Загрузка фото и PDF в пиксели для распознавания.
// Фото уменьшается до MAX_SIDE по длинной стороне: этого хватает (≈5 пикселей на мм) и это быстро.

export const MAX_SIDE = 1600;

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function drawScaled(source, sw, sh) {
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const w = Math.round(sw * k), h = Math.round(sh * k);
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return c;
}

/** Фото (JPEG/PNG/HEIC, который iPhone сам переводит в JPEG) → холст. Поворот по EXIF браузер учитывает сам. */
export async function imageFileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return drawScaled(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let pdfjsPromise;
function loadPdfjs() {
  return (pdfjsPromise ??= import('../vendor/pdfjs/pdf.min.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  }));
}

/** Многостраничный PDF (например, скан из «Заметок») → по холсту на страницу. */
export async function* pdfFileToCanvases(file) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = MAX_SIDE / Math.max(vp1.width, vp1.height);
      const vp = page.getViewport({ scale });
      const c = canvasOf(Math.round(vp.width), Math.round(vp.height));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();
      yield { canvas: c, page: i, pages: pdf.numPages };
    }
  } finally {
    pdf.destroy();
  }
}

export function canvasToImageData(c) {
  return c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);
}

/** Сжатая копия фото для хранения (~150 КБ). Возвращает blob и масштаб относительно исходного холста. */
export async function compressCanvas(c, maxSide = 1200, quality = 0.7) {
  const k = Math.min(1, maxSide / Math.max(c.width, c.height));
  const out = canvasOf(Math.round(c.width * k), Math.round(c.height * k));
  out.getContext('2d').drawImage(c, 0, 0, out.width, out.height);
  const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', quality));
  return { blob, scale: k, width: out.width, height: out.height };
}
