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

  const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
  for (const s of sizes) {
    await writeIcon(`pwa-${s}.png`, appIconSvg(mark).replace(`width="${SIZE}" height="${SIZE}"`, `width="${s}" height="${s}"`), s);
  }
  await writeIcon('pwa-512-maskable.png', maskableSvg(differs ? LETTER_MARK : BOOKMARK_MARK), 512);

  // Screenshots placeholders (M10 manifest requirement)
  const screenshotsDir = path.join(OUT_DIR, 'screenshots');
  await mkdir(screenshotsDir, { recursive: true });
  async function writeScreenshot(file, w, h) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${GREEN}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w / 12)}" font-weight="700" fill="#ffffff">تذكرة الطالب</text></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    await writeFile(path.join(screenshotsDir, file), png);
    console.log(`wrote screenshots/${file} (${w}x${h})`);
  }
  await writeScreenshot('narrow.png', 1080, 1920);
  await writeScreenshot('wide.png', 1920, 1080);

  // Splash screens for iOS (minimal set)
  const splashDir = path.join(OUT_DIR, 'splash');
  await mkdir(splashDir, { recursive: true });
  const splashSizes = [
    [1125, 2436],
    [1170, 2532],
    [1284, 2778],
  ];
  for (const [w, h] of splashSizes) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${GREEN}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(w / 10)}" font-weight="700" fill="#ffffff">ت</text></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const name = `splash-${w}x${h}.png`;
    await writeFile(path.join(splashDir, name), png);
    console.log(`wrote splash/${name}`);
  }

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
