// Выпрямленный вырез участка бланка с фото (по координатам в мм), как будто снято сканером.
import { project } from './omr.js';

/**
 * @param {ImageData} photo     пиксели сохранённого (сжатого) фото
 * @param {number[]} H          гомография мм → пиксели исходного изображения распознавания
 * @param {number} scale        во сколько раз сохранённое фото меньше изображения распознавания
 * @param {{x0,y0,x1,y1}} box   участок в мм
 * @param {number} pxPerMm      чёткость выреза
 * @returns {HTMLCanvasElement}
 */
export function cropSheet(photo, H, scale, box, pxPerMm = 8) {
  const w = Math.round((box.x1 - box.x0) * pxPerMm), h = Math.round((box.y1 - box.y0) * pxPerMm);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(w, h);
  const src = photo.data, sw = photo.width, sh = photo.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [px, py] = project(H, box.x0 + (x + 0.5) / pxPerMm, box.y0 + (y + 0.5) / pxPerMm);
      const fx = px * scale - 0.5, fy = py * scale - 0.5;
      const o = (y * w + x) * 4;
      if (fx < 0 || fy < 0 || fx >= sw - 1 || fy >= sh - 1) { out.data[o] = out.data[o + 1] = out.data[o + 2] = 235; out.data[o + 3] = 255; continue; }
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
      const i = (y0 * sw + x0) * 4, j = i + sw * 4;
      for (let ch = 0; ch < 3; ch++) {
        out.data[o + ch] = (src[i + ch] * (1 - tx) + src[i + 4 + ch] * tx) * (1 - ty) + (src[j + ch] * (1 - tx) + src[j + 4 + ch] * tx) * ty;
      }
      out.data[o + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Фото из хранилища → ImageData (один раз на открытие бланка). */
export async function photoPixels(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { img, data: ctx.getImageData(0, 0, c.width, c.height) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
