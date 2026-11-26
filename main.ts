// SKYLANE COURIER — program penyerahan (Node 22, standard library only).
// Menyalin game/ dan screenshots/ dari samping file ini ke /output (atau
// $MAKEFUN_OUTPUT_DIR di luar grader) lalu menulis /output/dossier.json
// dengan buildDossier dari vendor/makefun-game.ts. Output deterministik:
// dua run dari repo yang sama menulis byte dossier.json yang identik.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Gagal cepat dengan pesan jelas bila game belum lengkap, sebelum menulis apa pun.
const indexHtml = join(here, 'game', 'index.html');
if (!existsSync(indexHtml) || !statSync(indexHtml).isFile()) {
  throw new Error('main.ts: game/index.html tidak ditemukan — game belum lengkap');
}
const shotsDir = join(here, 'screenshots');
if (!existsSync(shotsDir)) {
  throw new Error('main.ts: screenshots/ tidak ditemukan — ambil 3-4 screenshot dulu');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// Batas scorer (reference/gate.json): hanya text_max_bytes membentuk byte dossier;
// yang lain menolak entry yang memang akan ditolak scorer (lebih dari 4 screenshot
// atau satu di atas 256 KiB; lebih dari 993 file di game/ atau 48 MiB total, atau
// path di bawah game/ di atas 1000 byte).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
