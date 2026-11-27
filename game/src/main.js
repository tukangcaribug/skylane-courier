// Boot + loop utama: input dibaca tiap frame, dunia maju dalam langkah
// 1/60 detik yang tetap, renderer melukis hasilnya. Layar: title, play,
// paused, over. ?seed=N menetapkan seed; ?shot=final|chase|night|storm
// (dengan &mission=... &seed=N) menggelar scene itu untuk screenshot dan
// menyetel window.__shotReady sesudah dua kali lukis.
import { BEST_KEY, DIFFICULTIES, MISSIONS, STEP, applyDifficulty, missionById } from './config.js';
import { createRandom } from './random.js';
import { createWorld, resetWorld, stepWorld } from './flight.js';
import {
  ACTION_CONFIRM, ACTION_DIFFICULTY, ACTION_MUTE, ACTION_NEXT, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const missionParam = params.get('mission');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
void seed;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const input = createInput(canvas);
const renderer = createRenderer(canvas);

function readBests() {
  try {
    return JSON.parse(window.localStorage.getItem(BEST_KEY) ?? '{}');
  } catch {
    return {};
  }
}
function saveBest(missionId, value) {
  try {
    const bests = readBests();
    if (value > (bests[missionId] ?? 0)) {
      bests[missionId] = value;
      window.localStorage.setItem(BEST_KEY, JSON.stringify(bests));
    }
    return readBests();
  } catch {
    return readBests();
  }
}

let bests = readBests();
let selected = 0;
let diffIndex = 1; // Normal
let difficulty = DIFFICULTIES[diffIndex];
let screen = SCREEN_TITLE;
let world = createWorld(applyDifficulty(MISSIONS[0], difficulty));
let time = 0;
let lastEvent = null;
let muted = false;

function missionVariant(index) {
  return applyDifficulty(MISSIONS[index], difficulty);
}

function nextMissionIndex() {
  return (selected + 1) % MISSIONS.length;
}

function setStatus(text) {
  if (status) status.textContent = text;
}

function startMission(index) {
  selected = index;
  resetWorld(world, missionVariant(index));
  screen = SCREEN_PLAY;
  lastEvent = null;
  audio.unlock();
  audio.click();
  setStatus(`${MISSIONS[index].name} (${difficulty.name}): terbang lewati ring, lalu mendarat.`);
}

function cycleDifficulty() {
  diffIndex = (diffIndex + 1) % DIFFICULTIES.length;
  difficulty = DIFFICULTIES[diffIndex];
  audio.click();
  setStatus(`Tingkat kesulitan: ${difficulty.name}.`);
}

function backToTitle() {
  resetWorld(world, missionVariant(selected));
  screen = SCREEN_TITLE;
  setStatus('Skylane Courier: pilih misi, tekan Enter untuk terbang.');
}

function runShot(name) {
  // Misi per scene: final = misi 1 (fajar), chase = misi 3 (senja),
  // night = misi 4 (malam), storm = misi 5 (badai); flight/canyon/land
  // warisan v1/v2. &mission=... mengesampingkan itu.
  const shotMission = {
    final: 'island-hop',
    chase: 'sunset-trial',
    night: 'night-courier',
    storm: 'storm-gauntlet',
    canyon: 'sunset-trial',
  };
  let missionId = shotMission[name] ?? 'island-hop';
  if (missionParam) {
    const idx = MISSIONS.findIndex((m) => m.id === missionParam);
    if (idx >= 0) missionId = missionParam;
  }
  const mission = applyDifficulty(missionById(missionId), difficulty);
  resetWorld(world, mission);
  world.state.best = bests[missionId] ?? 0;
  const scene = stageShot(name, world);
  screen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(world, screen, bests, selected, time, difficulty);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) {
  if (missionParam) {
    const idx = MISSIONS.findIndex((m) => m.id === missionParam);
    if (idx >= 0) selected = idx;
  }
  runShot(shot);
} else {
  setStatus('Skylane Courier: pilih misi, tekan Enter untuk terbang.');
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dtMs = Math.min(MAX_FRAME * 1000, now - last);
    last = now;
    acc += dtMs / 1000;
    time += dtMs / 1000;
    // Aksi sekali-tekan.
    if (input.take(ACTION_MUTE)) {
      muted = !muted;
      audio.setMuted(muted);
    }
    if (screen === SCREEN_TITLE) {
      if (input.take('mission1')) startMission(0);
      else if (input.take('mission2')) startMission(1);
      else if (input.take('mission3')) startMission(2);
      else if (input.take('mission4')) startMission(3);
      else if (input.take('mission5')) startMission(4);
      else if (input.take(ACTION_DIFFICULTY)) cycleDifficulty();
      else if (input.take(ACTION_CONFIRM)) startMission(selected);
      else if (input.take(ACTION_RESTART)) backToTitle();
    } else if (screen === SCREEN_PLAY) {
      if (input.take(ACTION_PAUSE)) {
        screen = SCREEN_PAUSED;
        setStatus('Jeda.');
      } else if (input.take(ACTION_RESTART)) {
        backToTitle();
      }
    } else if (screen === SCREEN_PAUSED) {
      if (input.take(ACTION_PAUSE)) screen = SCREEN_PLAY;
      else if (input.take(ACTION_RESTART)) backToTitle();
      else if (input.take('mission1')) startMission(0);
      else if (input.take('mission2')) startMission(1);
      else if (input.take('mission3')) startMission(2);
      else if (input.take('mission4')) startMission(3);
      else if (input.take('mission5')) startMission(4);
    } else if (screen === SCREEN_OVER) {
      if (input.take(ACTION_CONFIRM)) startMission(selected);
      else if (input.take(ACTION_NEXT)) startMission(nextMissionIndex());
      else if (input.take('mission1')) startMission(0);
      else if (input.take('mission2')) startMission(1);
      else if (input.take('mission3')) startMission(2);
      else if (input.take('mission4')) startMission(3);
      else if (input.take('mission5')) startMission(4);
      else if (input.take(ACTION_RESTART)) backToTitle();
    }
    // Simulasi langkah tetap.
    if (screen === SCREEN_PLAY) {
      const axes = input.axes();
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        const ev = stepWorld(world, axes, STEP);
        if (ev === 'ring') audio.ring();
        else if (ev === 'touchdown') audio.touchdown(world.state.softLanding);
        else if (ev === 'crash') audio.crash();
        if (ev) lastEvent = ev;
        acc -= STEP;
        steps += 1;
      }
      if (steps >= 8) acc = 0;
      const s = world.state;
      audio.update(s.throttle, s.speed, s.phase === 'fly');
      if (s.phase === 'done' || s.phase === 'crashed') {
        if (s.phase === 'done') bests = saveBest(world.mission.id, s.score);
        screen = SCREEN_OVER;
        setStatus(s.phase === 'done' ? `Misi selesai, skor ${s.score}.` : s.crashReason);
      }
    } else {
      acc = 0;
      audio.update(0, 0, false);
    }
    renderer.draw(world, screen, bests, selected, time, difficulty);
    input.endFrame();
  }
  requestAnimationFrame(frame);
}
