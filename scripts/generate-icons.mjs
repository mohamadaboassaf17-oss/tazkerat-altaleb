// Generates PWA icons from an inline SVG master.
// Tries an Arabic «ت» glyph first; if the local renderer has no Arabic font
// (detects tofu by comparing against a private-use codepoint), falls back to
// a geometric bookmark mark so the output is never blank/broken.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SIZE = 512;
const GREEN = '#1e6f50';
const OUT_DIR = path.resolve('public');
const ICONS_DIR = path.join(OUT_DIR, 'icons');

function appIconSvg(mark) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="96" fill="${GREEN}"/>
  ${mark}
</svg>`;
}

function maskableSvg(markInner80) {
  // Full-bleed square (no rounded corners — the OS applies its own mask),
  // mark confined to the inner 80% safe zone.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" fill="${GREEN}"/>
  <g transform="translate(51.2 51.2) scale(0.8)">
    ${markInner80}
  </g>
</svg>`;
}

const LETTER_MARK = `<text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="320" font-weight="700" fill="#ffffff">ت</text>`;

const BOOKMARK_MARK = `<path d="M186 136 H326 V376 L256 308 L186 376 Z" fill="#ffffff" stroke="#ffffff" stroke-width="32" stroke-linejoin="round"/>`;

async function rasterize(svg) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { png, data, info };
}

async function hasArabicGlyph() {
  const real = await rasterize(appIconSvg(LETTER_MARK));
  const tofuProbe = await rasterize(appIconSvg(`<text x="50%" y="52%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="320" font-weight="700" fill="#ffffff">\uE001</text>`));
  const differs = !real.data.equals(tofuProbe.data);
  console.log(`Arabic glyph probe: ${differs ? 'rendered «ت» OK' : 'tofu detected — falling back to bookmark mark'}`);
  return { differs, probe: real };
}

async function writeIcon(file, svg, expectSize) {
  const { png, info } = await rasterize(svg);
  if (info.width !== expectSize || info.height !== expectSize) {
    throw new Error(`${file}: expected ${expectSize}px, got ${info.width}x${info.height}`);
  }
  const dest = path.join(ICONS_DIR, file);
  await writeFile(dest, png);
  console.log(`wrote ${dest} (${info.width}x${info.height}, ${(png.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });

  const { differs, probe } = await hasArabicGlyph();
  const mark = differs ? LETTER_MARK : BOOKMARK_MARK;

  await writeFile(path.join(OUT_DIR, 'favicon.svg'), appIconSvg(mark));
  console.log(`wrote ${path.join(OUT_DIR, 'favicon.svg')}`);

  await writeIcon('pwa-192.png', appIconSvg(mark).replace(`width="${SIZE}" height="${SIZE}"`, `width="192" height="192"`).replace(`viewBox="0 0 ${SIZE} ${SIZE}"`, `viewBox="0 0 ${SIZE} ${SIZE}"`), 192);
  await writeIcon('pwa-512.png', appIconSvg(mark), 512);
  await writeIcon('pwa-512-maskable.png', maskableSvg(differs ? LETTER_MARK : BOOKMARK_MARK), 512);

  // Sanity: confirm the 512 icon actually contains light (white) pixels.
  const { data } = probe;
  let whitePixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) whitePixels++;
  }
  if (whitePixels === 0) throw new Error('icon appears blank (no white mark pixels found)');
  console.log(`sanity: ${whitePixels} white-mark pixels present`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
