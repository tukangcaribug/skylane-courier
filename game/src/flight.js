// Model terbang + state misi. Satu langkah = STEP detik, fixed timestep,
// jadi autopilot screenshot dan pemain memakai fisika yang sama persis.
import { FLIGHT, SCORE, STEP } from './config.js';
import { buildCourse, centerAt, terrainAt } from './course.js';
import { clamp } from './random.js';

export const EVENT_RING = 'ring';
export const EVENT_TOUCHDOWN = 'touchdown';
export const EVENT_CRASH = 'crash';
export const EVENT_FUEL_EMPTY = 'fuel-empty';
export const EVENT_TIMEOUT = 'timeout';
export const EVENT_OFF_COURSE = 'off-course';

export function createWorld(mission) {
  const course = buildCourse(mission);
  const state = freshState(mission, course);
  return { course, state, mission };
}

function freshState(mission, course) {
  return {
    // Fase: 'ready' (di landasan) | 'fly' | 'done' | 'crashed'
    phase: 'ready',
    time: 0,
    dist: 0,
    x: 0, // meter lateral dari garis tengah kursus
    heading: 0, // radian relatif terhadap arah kursus
    alt: terrainAt(course, 0) + 2, // kaki di atas permukaan laut (di atas darat landasan)
    speed: 0, // knot
    throttle: 0,
    bank: 0,
    pitch: 0,
    vspeed: 0, // kaki/detik
    fuel: mission.fuel,
    damage: 0,
    ringsHit: 0,
    ringsTotal: mission.rings,
    score: 0,
    timeBonus: 0,
    landed: false,
    softLanding: false,
    crashReason: '',
    message: '',
    messageT: 0,
    stallWarn: false,
    fuelWarn: false,
    windGust: 0,
    gustT: 0,
    trail: [], // jejak asap tipis untuk screenshot dinamis
    best: 0,
    grade: '',
    breakdown: [],
  };
}

export function resetWorld(world, mission) {
  const course = buildCourse(mission);
  world.course = course;
  world.mission = mission;
  world.state = freshState(mission, course);
}

// Satu langkah simulasi. Mengembalikan event (string) atau null.
export function stepWorld(world, axes, dt = STEP) {
  const s = world.state;
  const m = world.mission;
  const c = world.course;
  if (s.phase === 'done' || s.phase === 'crashed') return null;

  s.time += dt;
  const events = [];

  // --- Angin: hembusan sinusoidal dari seed misi + gust acak halus.
  s.gustT += dt;
  const gust = Math.sin(s.gustT * 0.9 + m.seed) * 0.5 + Math.sin(s.gustT * 2.3) * 0.5;
  s.windGust = gust * m.wind;

  if (s.phase === 'ready') {
    // Di landasan: throttle menggerakkan pesawat, lepas landas di 55 knot.
    s.throttle = clamp(s.throttle + axes.throttle * dt * 0.9, 0, 1);
    if (axes.pitch > 0.3) s.throttle = clamp(s.throttle + dt * 0.5, 0, 1);
    s.speed += FLIGHT.accel * s.throttle * dt;
    s.speed = Math.min(s.speed, FLIGHT.maxSpeed);
    s.dist += s.speed * 0.514444 * dt; // knot -> m/s
    // Tetap di atas darat landasan selama menggelinding.
    s.alt = terrainAt(c, s.dist) + 2;
    if (s.speed >= 55 && axes.pitch > 0.1) {
      s.phase = 'fly';
      s.alt = terrainAt(c, s.dist) + 6;
      s.vspeed = 8;
      s.message = 'Lepas landas! Ikuti ring oranye.';
      s.messageT = 3;
    }
    if (s.dist > 420 && s.phase === 'ready') {
      // Kehabisan landasan tanpa lepas landas.
      return crash(world, 'Kamu kehabisan landasan tanpa lepas landas.');
    }
    burnFuel(world, dt);
    return null;
  }

  // --- Terbang.
  s.throttle = clamp(s.throttle + axes.throttle * dt * 0.8, 0, 1);
  if (axes.throttle !== 0 && s.fuel <= 0) s.throttle = 0;

  // Bank mengejar input; heading berubah sebanding bank & kecepatan.
  const targetBank = axes.turn * FLIGHT.bankMax;
  s.bank += (targetBank - s.bank) * Math.min(1, dt * FLIGHT.bankSpeed);
  const turnAuthority = clamp(s.speed / FLIGHT.cruiseSpeed, 0.3, 1.4);
  s.heading += -s.bank * FLIGHT.turnRate * turnAuthority * dt;

  // Pitch: naik/turun; naik mengorbankan kecepatan, turun menambahnya.
  const targetPitch = axes.pitch * 1;
  s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 2.2);
  const climbPower = s.pitch * FLIGHT.climbRate;
  const speedTarget =
    FLIGHT.minSpeed + s.throttle * (FLIGHT.maxSpeed - FLIGHT.minSpeed) - climbPower * 0.9;
  s.speed += (clamp(speedTarget, 8, FLIGHT.maxSpeed) - s.speed) * Math.min(1, dt * 0.55);

  // Stall: terlalu pelan -> hidung jatuh.
  const stalled = s.speed < FLIGHT.stallSpeed;
  s.stallWarn = stalled;
  let vs = climbPower;
  if (stalled) vs -= FLIGHT.stallSink;
  if (s.fuel <= 0) vs -= 14; // mesin mati: meluncur turun
  // Efek tanah: di bawah 40 kaki, pesawat mengambang (flare).
  if (s.alt < FLIGHT.groundEffectAlt && vs < 0) vs *= 0.55;
  s.vspeed += (vs - s.vspeed) * Math.min(1, dt * 3);
  s.alt += s.vspeed * dt;

  // Maju + geser lateral; heading menggerakkan x.
  const forwardMs = s.speed * 0.514444;
  s.dist += forwardMs * dt;
  s.x += Math.sin(s.heading) * forwardMs * dt * -1;
  // Angin lateral mendorong pesawat.
  s.x += s.windGust * 14 * dt;
  // Kembali perlahan ke tengah bila tidak membelok (stabilitas).
  if (Math.abs(axes.turn) < 0.1) s.heading *= 1 - Math.min(1, dt * 0.25);

  burnFuel(world, dt);
  if (s.fuel <= 0 && !s.fuelWarn) {
    s.fuelWarn = true;
    s.message = 'BAHAN BAKAR HABIS — meluncur, cari landasan!';
    s.messageT = 4;
    events.push(EVENT_FUEL_EMPTY);
  }

  // Batas waktu misi time trial.
  if (m.timeLimit > 0 && s.time > m.timeLimit && s.phase === 'fly') {
    return crash(world, 'Waktu habis sebelum mencapai landasan.');
  }

  // --- Ring: lewati lingkaran saat jaraknya terlewati.
  for (const ring of c.rings) {
    if (ring.passed) continue;
    if (s.dist >= ring.d - 6 && s.dist <= ring.d + 14) {
      // dx meter lateral, dy kaki -> meter; lolos bila di dalam lingkaran ring.
      const dx = s.x - ring.x;
      const dyM = (s.alt - ring.alt) / 3.28084;
      if (Math.hypot(dx, dyM) <= ring.r) {
        ring.passed = true;
        ring.flash = 1;
        s.ringsHit += 1;
        const bonus = Math.round(SCORE.ring + Math.max(0, 60 - s.time * 0.2));
        s.score += bonus;
        s.message = `RING ${s.ringsHit}/${s.ringsTotal}  +${bonus}`;
        s.messageT = 2;
        events.push(EVENT_RING);
      }
    }
    if (s.dist > ring.d + 14 && !ring.passed) ring.passed = true; // terlewat, tandai
  }
  for (const ring of c.rings) if (ring.flash > 0) ring.flash = Math.max(0, ring.flash - dt * 1.4);

  // Jejak tipis di belakang pesawat saat bank keras (deterministik: dari waktu).
  if (Math.abs(s.bank) > 0.55 && Math.sin(s.time * 12.7) > 0) {
    s.trail.push({ x: s.x, alt: s.alt, d: s.dist, life: 0.7 });
  }
  s.trail = s.trail.filter((t) => (t.life -= dt) > 0 && s.dist - t.d < 400);

  // --- Tabrakan darat / laut.
  const ground = terrainAt(c, s.dist);
  if (s.alt <= ground + 2) {
    // Mendarat hanya di landasan akhir.
    const runway = c.runway;
    const nearRunway = Math.abs(s.dist - runway.d) < 260;
    // Posisi lateral dunia pesawat vs garis tengah landasan.
    const worldX = centerAt(c, s.dist) + s.x;
    const centered = Math.abs(worldX - centerAt(c, runway.d)) < runway.halfWidth;
    if (nearRunway && centered && s.alt <= ground + 2 && Math.abs(s.vspeed) <= FLIGHT.touchdownSinkMax + 14) {
      return land(world);
    }
    if (nearRunway && centered) {
      // Terlalu keras di landasan: hard landing, damage, tapi lanjut bila masih bisa.
      s.damage += FLIGHT.damageHardLanding;
      s.alt = ground + 2;
      s.vspeed = Math.abs(s.vspeed) * 0.3;
      s.speed *= 0.55;
      s.message = 'PENDARATAN KERAS! Kerusakan +' + FLIGHT.damageHardLanding + '%';
      s.messageT = 3;
      events.push(EVENT_TOUCHDOWN);
      if (s.damage >= 100) return crash(world, 'Pesawat rusak berat saat mendarat.');
      return events.length ? events[0] : null;
    }
    return crash(world, s.alt <= 2 && ground <= 2 ? 'Kamu menabrak laut.' : 'Kamu menabrak daratan.');
  }

  // Keluar jalur terlalu jauh.
  if (Math.abs(s.x) > 900) {
    return crash(world, 'Kamu terbang terlalu jauh dari kursus.');
  }

  // Pesan stall.
  if (stalled && s.messageT <= 0) {
    s.message = 'STALL! Turunkan hidung, tambah throttle!';
    s.messageT = 1.5;
  }
  if (s.messageT > 0) s.messageT -= dt;

  // Mencapai ujung kursus tanpa mendarat = terbang melewati landasan.
  if (s.dist > c.lengthM + 500) {
    return crash(world, 'Kamu melewati landasan tujuan.');
  }

  return events.length ? events[0] : null;
}

function burnFuel(world, dt) {
  const s = world.state;
  if (s.phase === 'done' || s.phase === 'crashed') return;
  const burn = (FLIGHT.fuelBurnBase + FLIGHT.fuelBurnThrottle * s.throttle * s.throttle) * dt;
  s.fuel = Math.max(0, s.fuel - burn);
}

function land(world) {
  const s = world.state;
  const c = world.course;
  s.phase = 'done';
  s.landed = true;
  const soft = Math.abs(s.vspeed) <= FLIGHT.touchdownSinkMax && s.speed <= FLIGHT.touchdownSpeedMax;
  s.softLanding = soft;
  const centerErr = Math.abs(centerAt(c, s.dist) + s.x - centerAt(c, c.runway.d));
  const centerBonus = Math.max(0, Math.round(SCORE.centerBonus * (1 - centerErr / c.runway.halfWidth)));
  const softBonus = soft ? SCORE.landingSoftBonus : 0;
  const fuelBonus = Math.round(s.fuel * SCORE.fuelBonusPerUnit);
  const smoothBonus = s.damage === 0 ? SCORE.smoothBonus : 0;
  s.score += SCORE.landingBase + softBonus + centerBonus + fuelBonus + smoothBonus;
  s.breakdown = [
    { label: 'Ring', value: s.ringsHit * SCORE.ring },
    { label: 'Pendaratan', value: SCORE.landingBase },
    { label: soft ? 'Pendaratan mulus' : 'Pendaratan keras', value: softBonus },
    { label: 'Tengah landasan', value: centerBonus },
    { label: 'Sisa bahan bakar', value: fuelBonus },
    { label: 'Terbang tanpa kerusakan', value: smoothBonus },
  ];
  const pct = s.score / (s.ringsTotal * (SCORE.ring + 60) + SCORE.landingBase + SCORE.landingSoftBonus + SCORE.centerBonus + 600 + SCORE.smoothBonus);
  s.grade = pct >= 0.85 ? 'S' : pct >= 0.7 ? 'A' : pct >= 0.5 ? 'B' : 'C';
  s.message = soft ? 'Mendarat mulus di Pulau Senja!' : 'Mendarat — pesawat selamat.';
  s.messageT = 5;
  return EVENT_TOUCHDOWN;
}

function crash(world, reason) {
  const s = world.state;
  s.phase = 'crashed';
  s.crashReason = reason;
  s.damage = 100;
  s.message = reason;
  s.messageT = 6;
  return EVENT_CRASH;
}

// Ring berikutnya yang belum dilewati — target autopilot & panah HUD.
export function nextRing(world) {
  const s = world.state;
  for (const r of world.course.rings) {
    if (!r.passed && s.dist < r.d + 14) return r;
  }
  return null;
}

export function missionComplete(world) {
  return world.state.phase === 'done' || world.state.phase === 'crashed';
}
