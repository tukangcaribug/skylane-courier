// Kursus: dibangun dari seed misi — lekuk jalur, pulau, ring, landasan.
// Deterministik: seed sama selalu melahirkan kursus yang sama.
import { SEG_LEN } from './config.js';
import { createRandom, smooth } from './random.js';

const FT_PER_M = 3.28084;

// Satu pulau: hamparan darat dengan puncak dan pantai.
function makeIslands(rng, lengthM) {
  const islands = [];
  // Pulau awal (landasan berangkat) dan pulau akhir (landasan tujuan).
  islands.push({ d0: -400, d1: 500, peak: 26 });
  const count = 3 + Math.floor(rng.next() * 2);
  for (let i = 0; i < count; i++) {
    const center = 900 + (i + rng.next() * 0.7) * ((lengthM - 1600) / count);
    const half = 260 + rng.next() * 260;
    islands.push({ d0: center - half, d1: center + half, peak: 30 + rng.next() * 90 });
  }
  islands.push({ d0: lengthM - 500, d1: lengthM + 600, peak: 24 });
  return islands;
}

// Ketinggian darat (kaki) pada jarak d.
export function terrainAt(course, d) {
  let h = 0;
  for (const isl of course.islands) {
    if (d < isl.d0 || d > isl.d1) continue;
    const t = (d - isl.d0) / (isl.d1 - isl.d0);
    // Profil: naik halus, datar di tengah, turun halus; pantai rendah.
    const prof = smooth(Math.min(t * 3, (1 - t) * 3));
    h = Math.max(h, isl.peak * prof);
  }
  return h;
}

// Garis tengah kursus (meter lateral) pada jarak d — lekuk halus.
// Diratakan di awal (lepas landas lurus) dan di akhir (final lurus ke
// landasan) supaya landasan sejajar dengan arah pendekatan.
export function centerAt(course, d) {
  const raw =
    course.curveA * Math.sin(d * course.curveF1 + course.curveP1) +
    course.curveB * Math.sin(d * course.curveF2 + course.curveP2);
  const startTaper = smooth(d / 500);
  const endTaper = smooth((course.lengthM - d) / 700);
  return raw * Math.min(startTaper, endTaper);
}

export function buildCourse(mission) {
  const rng = createRandom(mission.seed);
  const islands = makeIslands(rng, mission.lengthM);
  const course = {
    mission,
    lengthM: mission.lengthM,
    islands,
    curveA: 260 + rng.next() * 160,
    curveF1: (Math.PI * 2) / (2600 + rng.next() * 1400),
    curveP1: rng.next() * Math.PI * 2,
    curveB: 120 + rng.next() * 120,
    curveF2: (Math.PI * 2) / (1100 + rng.next() * 700),
    curveP2: rng.next() * Math.PI * 2,
    rings: [],
    runway: { d: mission.lengthM, halfWidth: 26, heading: 0 },
    clouds: [],
    birds: [],
  };
  // Ring: tersebar merata, ketinggian 120–420 kaki di atas darat/laut,
  // lateral mengikuti lekuk kursus supaya jalur terasa mengalir.
  const n = mission.rings;
  for (let i = 0; i < n; i++) {
    const d = 500 + ((i + 0.5) / n) * (mission.lengthM - 1300);
    const ground = terrainAt(course, d);
    const alt = Math.max(150, ground + 130 + rng.next() * 190);
    course.rings.push({
      d,
      x: (rng.next() - 0.5) * 220,
      alt,
      r: 42 + rng.next() * 14,
      passed: false,
      flash: 0,
    });
  }
  // Awan: posisi tetap dari seed, tiga lapis kedalaman.
  for (let i = 0; i < 26; i++) {
    course.clouds.push({
      d: rng.next() * (mission.lengthM + 800),
      x: (rng.next() - 0.5) * 5200,
      alt: 700 + rng.next() * 900,
      s: 60 + rng.next() * 110,
      layer: i % 3,
      drift: rng.next() * Math.PI * 2,
    });
  }
  // Burung camar di dekat pulau awal — detail hidup.
  for (let i = 0; i < 7; i++) {
    course.birds.push({
      d: 500 + rng.next() * 1400,
      x: (rng.next() - 0.5) * 500,
      alt: 160 + rng.next() * 120,
      phase: rng.next() * Math.PI * 2,
      speed: 0.7 + rng.next() * 0.5,
    });
  }
  // Landmark: mercusuar + desa + palem — aliran RNG SENDIRI (seed ^ konstanta)
  // supaya pulau/ring/awan/burung tetap identik dengan v2: fisika dan jalur
  // autopilot tidak berubah, hanya dunia yang kini punya tempat dikenali.
  const lrng = createRandom((mission.seed ^ 0x9e3779b9) >>> 0);
  const midIslands = islands.slice(1, -1);
  const light = midIslands.length > 0
    ? midIslands[Math.floor(lrng.next() * midIslands.length)]
    : islands[1];
  const lightD = (light.d0 + light.d1) / 2;
  const dest = islands[islands.length - 1];
  const palms = [];
  for (let i = 0; i < 9; i++) {
    const isl = islands[1 + Math.floor(lrng.next() * (islands.length - 1))];
    palms.push({
      d: isl.d0 + lrng.next() * (isl.d1 - isl.d0),
      x: (lrng.next() - 0.5) * 560,
      lean: (lrng.next() - 0.5) * 0.9,
      h: 30 + lrng.next() * 14,
    });
  }
  course.landmarks = {
    // Mercusuar Tanjung Biru: menara di tengah pulau, x = offset lateral
    // dari garis tengah kursus (meter). Tinggi ~90 kaki.
    lighthouse: { d: lightD, x: (lrng.next() - 0.5) * 120, h: 90 },
    // Desa Senja: deret rumah di pulau tujuan, dekat landasan.
    village: { d: dest.d0 + (dest.d1 - dest.d0) * 0.45, x: 150 + lrng.next() * 60 },
    palms,
  };
  return course;
}

// Lebar setengah pulau (meter) pada jarak d — 0 bila di laut lepas.
// Pulau melebar di tengah, menyempit di ujung, seperti daratan sungguhan.
export function islandHalfWidth(course, d) {
  for (const isl of course.islands) {
    if (d < isl.d0 || d > isl.d1) continue;
    const t = (d - isl.d0) / (isl.d1 - isl.d0);
    const shape = Math.pow(Math.sin(Math.PI * t), 0.7);
    return (300 + isl.peak * 4) * (0.35 + 0.65 * shape);
  }
  return 0;
}
export function visibleSegments(course, camD, count) {
  const segs = [];
  const start = Math.max(0, Math.floor(camD / SEG_LEN));
  for (let i = 0; i < count; i++) {
    const idx = start + i;
    const d = idx * SEG_LEN;
    segs.push({
      d,
      center: centerAt(course, d),
      ground: terrainAt(course, d),
    });
  }
  return segs;
}

export { FT_PER_M };
