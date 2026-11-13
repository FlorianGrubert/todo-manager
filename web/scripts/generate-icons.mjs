// Generates the PWA icons (PNG) from the app logo geometry – no image libraries needed.
// Usage: node scripts/generate-icons.mjs  (writes into public/icons)
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BLUE = [0x25, 0x63, 0xeb];
const WHITE = [0xff, 0xff, 0xff];

function png(size, draw) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x + 0.5, y + 0.5);
      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rounded rectangle test in a 64×64 design space. */
const inRoundRect = (x, y, rx, ry, w, h, r) => {
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= rx && x <= rx + w && y >= ry && y <= ry + h;
};

// Same geometry as public/favicon.svg: three kanban columns.
const bars = [
  [12, 14, 11, 36],
  [27, 14, 11, 24],
  [42, 14, 11, 30],
];

/** maskable: full-bleed background and logo inside the 80 % safe zone. */
function icon(size, { maskable = false } = {}) {
  const scale = maskable ? 0.72 : 1;
  const offset = (64 - 64 * scale) / 2;
  return png(size, (px, py) => {
    const x = (px / size) * 64;
    const y = (py / size) * 64;
    const bg = maskable || inRoundRect(x, y, 0, 0, 64, 64, 14);
    if (!bg) return [0, 0, 0, 0];
    const lx = (x - offset) / scale;
    const ly = (y - offset) / scale;
    const onBar = bars.some(([bx, by, bw, bh]) => inRoundRect(lx, ly, bx, by, bw, bh, 3));
    return onBar ? [...WHITE, 255] : [...BLUE, 255];
  });
}

const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('icon-192.png', out), icon(192));
writeFileSync(new URL('icon-512.png', out), icon(512));
writeFileSync(new URL('icon-maskable-512.png', out), icon(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', out), icon(180, { maskable: true }));
console.log('icons written to', out.pathname);
