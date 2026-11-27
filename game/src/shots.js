// Scene ?shot=... untuk screenshot: autopilot memainkan aturan sungguhan
// dari state fresh dengan seed tetap — frame yang dihasilkan adalah game
// sungguhan, bukan mockup.
import { STEP } from './config.js';
import { centerAt, terrainAt } from './course.js';
import { nextRing, stepWorld } from './flight.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

// Autopilot: kejar ring berikutnya, jaga ketinggian di atas darat,
// flare di landasan. Memakai stepWorld yang sama dengan pemain.
// Kontroler heading: arahkan hidung ke titik target 150 m di depan,
// bukan bank mentah dari error lateral — jauh lebih stabil.
export function makeAutopilot(world) {
  return {
    axes() {
      const s = world.state;
      const axes = { turn: 0, pitch: 0, throttle: 0 };
      if (s.phase === 'ready') {
        axes.throttle = 1;
        axes.pitch = s.speed >= 55 ? 1 : 0;
        return axes;
      }
      if (s.phase !== 'fly') return axes;
      const rwD = world.course.lengthM - s.dist;
      const ring = nextRing(world);
      // Target: ring berikutnya, atau landasan bila sudah dekat.
      let tx;
      let talt;
      if (ring && rwD > 700) {
        tx = ring.x;
        talt = ring.alt;
      } else {
        // Landasan: turun bertahap ke permukaan landasan (ground+2).
        // Kemiringan 0.10 = glide slope ~6 derajat: cukup curam untuk
        // mengejar landasan, cukup landai untuk pendaratan mulus.
        const groundRw = terrainAt(world.course, world.course.lengthM);
        tx = 0;
        talt = groundRw + 2 + Math.max(0, rwD) * 0.1;
      }
      // Heading yang diinginkan: kejar target 150 m di depan.
      const dx = tx - s.x;
      const desiredHeading = -Math.atan2(dx, 150);
      let dH = s.heading - desiredHeading;
      while (dH > Math.PI) dH -= Math.PI * 2;
      while (dH < -Math.PI) dH += Math.PI * 2;
      axes.turn = Math.max(-0.8, Math.min(0.8, dH * 2.0));
      // Pitch: jaga ketinggian target, tapi jangan menabrak darat.
      // Margin aman menyempit saat sudah di final approach (rwD < 400)
      // supaya pesawat bisa turun ke landasan.
      const ground = terrainAt(world.course, s.dist + 120);
      const margin = rwD < 400 ? Math.max(0, rwD * 0.02) : 90;
      const safeAlt = Math.max(talt, ground + margin);
      const errAlt = safeAlt - s.alt;
      axes.pitch = Math.max(-1, Math.min(1, errAlt / 70 - s.vspeed * 0.015));
      // Final 150 m, dan hanya bila sudah di atas glide slope: kontrol
      // langsung ke vertical speed -6 ft/detik — cukup pelan untuk
      // pendaratan mulus, cukup tegas untuk menembus efek tanah.
      // Bila masih ada bukit di depan, jangan turun paksa.
      if (rwD < 150 && s.alt <= talt + 12 && terrainAt(world.course, s.dist + 120) < 40) {
        axes.pitch = Math.max(-1, Math.min(0.5, (-6 - s.vspeed) * 0.2));
      }
      // Throttle: cepat di tengah kursus, pelan saat mendekati landasan.
      if (rwD < 500) axes.throttle = s.speed > 88 ? -0.8 : s.speed < 72 ? 0.5 : 0;
      else axes.throttle = s.speed < 120 ? 0.6 : s.speed > 150 ? -0.4 : 0;
      return axes;
    },
  };
}

// Menjalankan autopilot sebanyak `steps` langkah.
function flySteps(world, pilot, steps) {
  for (let i = 0; i < steps; i++) {
    stepWorld(world, pilot.axes(), STEP);
    if (world.state.phase === 'done' || world.state.phase === 'crashed') break;
  }
}

export function stageShot(name, world) {
  const pilot = makeAutopilot(world);
  if (name === 'start') {
    // Menu di atas landasan saat fajar: pesawat diam, dunia terlihat.
    return { screen: SCREEN_TITLE, best: world.state.best };
  }
  if (name === 'flight') {
    // Tengah kursus, melewati ring: terbang ~45% jarak misi 1.
    flySteps(world, pilot, Math.floor(42 / STEP));
    return { screen: SCREEN_PLAY, best: world.state.best };
  }
  if (name === 'canyon') {
    // Low pass di antara pulau, misi 3 (sunset): terbang ~55% jarak.
    flySteps(world, pilot, Math.floor(55 / STEP));
    return { screen: SCREEN_PLAY, best: world.state.best };
  }
  if (name === 'land') {
    // Pendekatan akhir + pendaratan: terbang sampai selesai / crash.
    flySteps(world, pilot, Math.floor(400 / STEP));
    return { screen: SCREEN_OVER, best: world.state.best };
  }
  // --- Scene v3: semuanya in-flight (menu/debrief tidak lagi jadi screenshot).
  if (name === 'final') {
    // Pendekatan akhir: terbang sampai 700 m sebelum landasan tujuan —
    // landasan 27 + lampu tepi + PAPI terlihat di depan, HUD "LANDASAN".
    let guard = 0;
    while (world.state.phase !== 'done' && world.state.phase !== 'crashed'
      && world.course.lengthM - world.state.dist > 700 && guard < 60000) {
      stepWorld(world, pilot.axes(), STEP);
      guard += 1;
    }
    return { screen: SCREEN_PLAY, best: world.state.best };
  }
  if (name === 'chase') {
    // Kejar ring di tengah kursus senja (misi 3): mercusuar + desa terlihat.
    flySteps(world, pilot, Math.floor(72 / STEP));
    return { screen: SCREEN_PLAY, best: world.state.best };
  }
  if (name === 'night') {
    // Kurir malam (misi 4): ring menyala + sorot mercusuar + jendela desa.
    // v3: 66 detik agar ring terakhir lebih di tengah frame saat dijepret.
    flySteps(world, pilot, Math.floor(66 / STEP));
    return { screen: SCREEN_PLAY, best: world.state.best };
  }
  if (name === 'storm') {
    // Badai beruntun (misi 5): hujan + ring di depan.
    flySteps(world, pilot, Math.floor(70 / STEP));
    return { screen: SCREEN_PLAY, best: world.state.best };
  }
  return { screen: SCREEN_TITLE, best: world.state.best };
}
