// SKYLANE COURIER — konfigurasi: tiga misi kurir di Kepulauan Senja.
// Semua angka tuning di satu tempat supaya grade-local dan play-test
// bisa mengubah feel tanpa menyentuh model terbang atau renderer.
export const STEP = 1 / 60;
export const BEST_KEY = 'skylane-courier-best-v3';

// Dunia: kursus diukur dalam meter; satu segmen = 25 m ke depan.
export const SEG_LEN = 25;
export const DRAW_SEGS = 56;
export const GROUND_HALF = 3200;

// Model terbang (satuan: knot, kaki, meter).
export const FLIGHT = {
  minSpeed: 38, // di bawah ini pesawat stall
  maxSpeed: 178,
  cruiseSpeed: 96,
  accel: 26, // knot per detik menuju target throttle
  climbRate: 26, // kaki per detik pada pitch penuh
  sinkRate: 34,
  turnRate: 0.62, // radian heading per detik pada bank penuh
  bankMax: 0.9, // radian kemiringan visual
  bankSpeed: 2.6, // seberapa cepat bank mengejar input
  stallSpeed: 55,
  stallSink: 55,
  fuelBurnBase: 0.4, // unit per detik
  fuelBurnThrottle: 0.9, // dikali throttle^2
  fuelStart: 100,
  damageRingMiss: 0,
  damageHardLanding: 34,
  damageCrash: 100,
  groundEffectAlt: 40, // kaki: di bawah ini flare terasa
  touchdownSinkMax: 9, // kaki/detik: lebih dari ini = hard landing
  touchdownSpeedMax: 150, // knot: lebih dari ini = hard landing
  runwayHalfWidth: 26, // meter dari garis tengah
};

// Skor.
export const SCORE = {
  ring: 250,
  ringTimeBonus: 120, // detik bonus dikali ini bila ring dilewati cepat
  landingBase: 600,
  landingSoftBonus: 400,
  centerBonus: 150,
  fuelBonusPerUnit: 6,
  smoothBonus: 200, // tanpa damage sepanjang misi
};

// Misi: nama, palet langit, panjang kursus, jumlah ring, bahan bakar,
// angin, dan batas waktu (0 = tanpa batas waktu).
export const MISSIONS = [
  {
    id: 'island-hop',
    name: 'Pagi di Kepulauan',
    sub: 'Misi 1 · 6 ring · santai',
    seed: 101,
    lengthM: 4200,
    rings: 6,
    fuel: 100,
    wind: 0.1,
    timeLimit: 0,
    palette: 'dawn',
    brief:
      'Terbang dari landasan Tanjung Biru, lewati semua ring penanda, lalu mendarat mulus di Pulau Senja. Jaga throttle tetap hemat.',
  },
  {
    id: 'storm-courier',
    name: 'Kurir Badai',
    sub: 'Misi 2 · 8 ring · fuel ketat',
    seed: 207,
    lengthM: 5600,
    rings: 8,
    fuel: 88,
    wind: 0.55,
    timeLimit: 0,
    palette: 'storm',
    brief:
      'Paket obat harus sampai sebelum badai menutup pulau. Angin kencang menggoyang pesawat — terbang halus, jangan buang bahan bakar.',
  },
  {
    id: 'sunset-trial',
    name: 'Senja Time Trial',
    sub: 'Misi 3 · 10 ring · 240 detik',
    seed: 313,
    lengthM: 6000,
    rings: 10,
    fuel: 100,
    wind: 0.25,
    timeLimit: 240,
    palette: 'sunset',
    brief:
      'Balapan melawan matahari terbenam: 10 ring, 240 detik. Setiap ring memberi bonus waktu — terbang cepat, tapi jangan sampai crash.',
  },
  {
    id: 'night-courier',
    name: 'Kurir Malam',
    sub: 'Misi 4 · 8 ring · gelap',
    seed: 419,
    lengthM: 5200,
    rings: 8,
    fuel: 92,
    wind: 0.3,
    timeLimit: 0,
    palette: 'night',
    brief:
      'Paket darurat di tengah malam: terbang dalam gelap, ikuti cahaya ring dan lampu landasan. Jangan sampai kehilangan arah.',
  },
  {
    id: 'storm-gauntlet',
    name: 'Badai Beruntun',
    sub: 'Misi 5 · 12 ring · 300 detik',
    seed: 523,
    lengthM: 6400,
    rings: 12,
    fuel: 102,
    wind: 0.65,
    timeLimit: 300,
    palette: 'storm',
    brief:
      'Ujian terakhir kurir Senja: 12 ring menembus badai terkuat, 300 detik. Angin mengguncang dari segala arah — hanya pilot paling tenang yang lolos.',
  },
];

// Tingkat kesulitan: mengubah jumlah ring, bahan bakar, batas waktu,
// dan kekuatan angin dari misi dasar. Normal = angka misi apa adanya.
export const DIFFICULTIES = [
  { id: 'easy', name: 'Mudah', ringDelta: -2, fuelDelta: 20, timeMul: 1.5, windMul: 0.6 },
  { id: 'normal', name: 'Normal', ringDelta: 0, fuelDelta: 0, timeMul: 1, windMul: 1 },
  { id: 'hard', name: 'Sulit', ringDelta: 2, fuelDelta: -10, timeMul: 0.8, windMul: 1.2 },
];

// Varian misi pada satu tingkat kesulitan (objek baru; misi dasar tak berubah).
export function applyDifficulty(mission, diff) {
  return {
    ...mission,
    rings: Math.max(4, mission.rings + diff.ringDelta),
    fuel: mission.fuel + diff.fuelDelta,
    timeLimit: mission.timeLimit > 0 ? Math.round(mission.timeLimit * diff.timeMul) : 0,
    wind: mission.wind * diff.windMul,
    diffId: diff.id,
    diffName: diff.name,
  };
}

export const PALETTES = {
  dawn: {
    skyTop: '#7fb2e5', skyMid: '#bcd8ef', skyLow: '#f6d9a8',
    sun: '#fff3c4', sunCore: '#ffffff', haze: '#e8d9b0',
    seaFar: '#5f93b8', seaNear: '#2f6d8f', seaGlint: '#bfe3f2',
    landFar: '#6d8a6a', landMid: '#4c7a4e', landNear: '#2f5d33',
    beach: '#e8d9a8', mountain: '#5d6f8a', mountainSnow: '#eef3f7',
    cloud: '#ffffff', cloudShade: '#d9e4ee',
  },
  storm: {
    skyTop: '#4a5568', skyMid: '#6b7a8d', skyLow: '#9aa5a8',
    sun: '#d8dee2', sunCore: '#f2f4f5', haze: '#8b98a0',
    seaFar: '#3d5a6b', seaNear: '#223f4d', seaGlint: '#7fa3b0',
    landFar: '#4d5c4a', landMid: '#3a4a38', landNear: '#24382a',
    beach: '#b8ab8a', mountain: '#3f4a58', mountainSnow: '#c9d4dc',
    cloud: '#aab4bc', cloudShade: '#7d8894',
    rain: true, // v3: hujan diagonal saat badai
  },
  sunset: {
    skyTop: '#3d3a6e', skyMid: '#b85c7a', skyLow: '#f2a35e',
    sun: '#ffd98a', sunCore: '#fff6d8', haze: '#e08a5a',
    seaFar: '#7a4a72', seaNear: '#4a2f56', seaGlint: '#f2b27a',
    landFar: '#5d4a68', landMid: '#463452', landNear: '#2e2138',
    beach: '#d9a878', mountain: '#453a5e', mountainSnow: '#e8c9a8',
    cloud: '#f2b98a', cloudShade: '#b87a8a',
  },
  night: {
    skyTop: '#070d1d', skyMid: '#16233f', skyLow: '#33456b',
    sun: '#dfe6f2', sunCore: '#ffffff', haze: '#232f4d',
    seaFar: '#0d1828', seaNear: '#081120', seaGlint: '#6f93b8',
    landFar: '#1a2620', landMid: '#131e19', landNear: '#0c1510',
    beach: '#5d5644', mountain: '#161f30', mountainSnow: '#7d8aa0',
    cloud: '#26334d', cloudShade: '#161f31',
    stars: true,
  },
};

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}
