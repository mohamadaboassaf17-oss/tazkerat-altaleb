import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fontkit = require('fontkit');

const FONT_DIR = path.join(
  process.cwd(),
  'node_modules',
  '@fontsource',
  'ibm-plex-sans-arabic',
  'files'
);

const TARGETS = [
  { cp: 0x0671, char: '\u0671', name: 'ALEF WASLA' },
  { cp: 0xfdf2, char: '\ufdf2', name: 'ALLAH LIGATURE' },
  { cp: 0x0649, char: '\u0649', name: 'ALEF MAKSURA' },
  { cp: 0x0651, char: '\u0651', name: 'ARABIC SHADDA' },
];

// ibm-plex-sans-arabic-<subset>-<weight>-normal.woff2
const FILE_RE =
  /^ibm-plex-sans-arabic-(?<subset>[a-z]+(?:-ext)?)-(?<weight>\d{3})-normal\.woff2$/;

const padEnd = (s, n) => String(s).padEnd(n);
const padStart = (s, n) => String(s).padStart(n);

function main() {
  if (!fs.existsSync(FONT_DIR)) {
    console.error(`Font directory not found: ${FONT_DIR}`);
    console.error('Run: npm i @fontsource/ibm-plex-sans-arabic');
    process.exit(1);
  }

  const allWoff2 = fs
    .readdirSync(FONT_DIR)
    .filter((f) => f.endsWith('.woff2') && f.includes('arabic'));

  const parsed = [];
  for (const file of allWoff2) {
    const m = FILE_RE.exec(file);
    if (!m) continue;
    parsed.push({ file, subset: m.groups.subset, weight: m.groups.weight });
  }
  parsed.sort((a, b) =>
    a.subset.localeCompare(b.subset) || a.weight.localeCompare(b.weight)
  );

  const bySubset = new Map();
  for (const p of parsed) {
    if (!bySubset.has(p.subset)) bySubset.set(p.subset, []);
    bySubset.get(p.subset).push(p);
  }

  console.log(`Font dir : ${path.relative(process.cwd(), FONT_DIR)}`);
  console.log(`Scanned  : ${allWoff2.length} woff2 files`);
  console.log(`Subsets  : ${[...bySubset.keys()].join(', ')}`);

  // Load fonts once per subset, cache characterSet per file
  const sets = new Map();
  function charSetOf(entry) {
    if (!sets.has(entry.file)) {
      try {
        const font = fontkit.openSync(path.join(FONT_DIR, entry.file));
        sets.set(entry.file, new Set(font.characterSet));
      } catch (err) {
        console.error(`ERROR loading ${entry.file}: ${err.message}`);
        sets.set(entry.file, null);
      }
    }
    return sets.get(entry.file);
  }

  const arabic = bySubset.get('arabic') ?? [];

  function printTable(subsetName, entries) {
    const cols = entries.map((e) => e.weight);
    console.log('');
    console.log(`=== Subset "${subsetName}" (${entries.length} files) ===`);
    console.log(
      `${padEnd('CODEPOINT', 11)}${padEnd('CHAR', 6)}${padEnd('NAME', 16)}${cols.join('  ')}`
    );
    console.log('-'.repeat(33 + cols.length * 6));
    for (const t of TARGETS) {
      const cells = entries.map((e) => {
        const cs = charSetOf(e);
        if (cs === null) return 'ERR ';
        return cs.has(t.cp) ? 'YES  ' : '.    ';
      });
      console.log(
        `${padEnd(`U+${t.cp.toString(16).toUpperCase().padStart(4, '0')}`, 11)}${padEnd(t.char, 6)}${padEnd(t.name, 16)}${cells.join('')}`
      );
    }
  }

  printTable('arabic', arabic);

  // Coverage summary across all subsets
  const coverage = new Map(TARGETS.map((t) => [t.cp, []]));
  for (const [subset, entries] of bySubset) {
    for (const t of TARGETS) {
      for (const e of entries) {
        const cs = charSetOf(e);
        if (cs && cs.has(t.cp) && !coverage.get(t.cp).includes(subset)) {
          coverage.get(t.cp).push(subset);
        }
      }
    }
  }

  console.log('\n=== SUMMARY: which subsets cover what ===');
  let missingEverywhere = false;
  let missingFromArabic = false;
  for (const t of TARGETS) {
    const subs = coverage.get(t.cp);
    const hex = `U+${t.cp.toString(16).toUpperCase().padStart(4, '0')}`;
    if (subs.length === 0) {
      missingEverywhere = true;
      console.log(`${hex} ${t.char.padEnd(3)} ${t.name.padEnd(16)} MISSING EVERYWHERE`);
    } else if (!subs.includes('arabic')) {
      missingFromArabic = true;
      console.log(`${hex} ${t.char.padEnd(3)} ${t.name.padEnd(16)} NOT in arabic subset; covered by: ${subs.join(', ')}`);
    } else {
      console.log(`${hex} ${t.char.padEnd(3)} ${t.name.padEnd(16)} OK (arabic subset)`);
    }
  }

  // Per the AGENTS.md rule, show extended detail for other subsets when
  // something is missing from the arabic subset.
  if (missingFromArabic) {
    for (const [subset, entries] of bySubset) {
      if (subset !== 'arabic') printTable(subset, entries);
    }
  }

  if (missingEverywhere) {
    console.log('\nRESULT: FAIL — at least one mandated glyph is absent from the entire font.');
    process.exit(1);
  }
  if (missingFromArabic) {
    console.log('\nRESULT: WARN — coverage exists only outside the arabic subset (see tables above).');
    process.exit(2);
  }
  console.log('\nRESULT: PASS — all mandated glyphs present in the arabic subset.');
}

main();
