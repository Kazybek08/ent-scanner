// Рисует иконки приложения в PNG без сторонних библиотек: node tools/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TEAL = [15, 118, 110];
const WHITE = [255, 255, 255];
const INK = [19, 78, 74];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const S = 4; // сглаживание 4×4
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const [pr, pg, pb] = pixel((x + (sx + .5) / S) / size, (y + (sy + .5) / S) / size);
        r += pr; g += pg; b += pb;
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r / S / S; raw[o + 1] = g / S / S; raw[o + 2] = b / S / S;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Рисунок в координатах 0…1: белый лист с сеткой кружков, один закрашен.
function pixel(u, v) {
  const sheet = { x0: .27, y0: .18, x1: .73, y1: .82, r: .04 };
  const inRound = (() => {
    const cx = Math.min(Math.max(u, sheet.x0 + sheet.r), sheet.x1 - sheet.r);
    const cy = Math.min(Math.max(v, sheet.y0 + sheet.r), sheet.y1 - sheet.r);
    return Math.hypot(u - cx, v - cy) <= sheet.r;
  })();
  if (!inRound) return TEAL;
  // угловые метки листа
  const m = .045;
  for (const [mx, my] of [[sheet.x0 + .03, sheet.y0 + .03], [sheet.x1 - .03 - m, sheet.y0 + .03],
                          [sheet.x0 + .03, sheet.y1 - .03 - m], [sheet.x1 - .03 - m, sheet.y1 - .03 - m]]) {
    if (u >= mx && u <= mx + m && v >= my && v <= my + m) return INK;
  }
  // сетка кружков 3×4
  const cols = [.39, .5, .61], rows = [.33, .44, .55, .66], R = .038, W = .011;
  const filled = new Set(['1,0', '0,1', '2,2', '1,3']);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
    const d = Math.hypot(u - cols[i], v - rows[j]);
    if (filled.has(`${i},${j}`) && d <= R) return TEAL;
    if (Math.abs(d - R) <= W / 2) return INK;
  }
  return WHITE;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), png(size, pixel));
  console.log('icons/' + name);
}
