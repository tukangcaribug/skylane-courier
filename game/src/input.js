// Input: keyboard + mouse. Keyboard utama (panah/WASD), mouse mengarahkan
// pesawat ke arah kursor dan roda mouse mengatur throttle. Semua aksi
// diekspos sebagai nilai -1..1 supaya autopilot screenshot bisa memakai
// antarmuka yang sama dengan pemain.
export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_MUTE = 'mute';
export const ACTION_RESTART = 'restart';
export const ACTION_DIFFICULTY = 'difficulty';
export const ACTION_NEXT = 'next';

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'brake',
  Enter: ACTION_CONFIRM,
  KeyP: ACTION_PAUSE, Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_RESTART,
  Digit1: 'mission1', Digit2: 'mission2', Digit3: 'mission3',
  Digit4: 'mission4', Digit5: 'mission5',
  KeyT: ACTION_DIFFICULTY,
  KeyN: ACTION_NEXT,
};

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0.5, y: 0.5, active: false, down: false };

  function onKeyDown(e) {
    const action = KEYMAP[e.code];
    if (!action) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (!held.has(action)) pressed.add(action);
    held.add(action);
  }
  function onKeyUp(e) {
    const action = KEYMAP[e.code];
    if (action) held.delete(action);
  }
  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / Math.max(1, rect.width);
    mouse.y = (e.clientY - rect.top) / Math.max(1, rect.height);
    mouse.active = true;
  }
  function onPointerDown(e) {
    mouse.down = true;
    onPointerMove(e);
  }
  function onPointerUp() {
    mouse.down = false;
  }
  function onWheel(e) {
    e.preventDefault();
    mouse.wheel = (mouse.wheel ?? 0) + (e.deltaY < 0 ? 1 : -1);
  }
  function onBlur() {
    held.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    // -1..1: belok (kiri/kanan), pitch (naik/turun), throttle delta.
    axes() {
      let turn = 0;
      let pitch = 0;
      let throttle = 0;
      if (held.has('left')) turn -= 1;
      if (held.has('right')) turn += 1;
      if (held.has('up')) pitch += 1;
      if (held.has('down')) pitch -= 1;
      if (held.has('brake')) throttle -= 1;
      // Mouse: arahkan pesawat ke kursor saat tombol ditekan.
      if (mouse.down && mouse.active) {
        turn = (mouse.x - 0.5) * 2.4;
        pitch = (0.5 - mouse.y) * 1.6;
      }
      if (mouse.wheel) {
        throttle += mouse.wheel * 0.12;
        mouse.wheel = 0;
      }
      return {
        turn: Math.max(-1, Math.min(1, turn)),
        pitch: Math.max(-1, Math.min(1, pitch)),
        throttle,
      };
    },
    // Aksi sekali-tekan (Enter, P, M, R, 1/2/3). Konsumsi setelah dibaca.
    take(action) {
      if (!pressed.has(action)) return false;
      pressed.delete(action);
      return true;
    },
    held(action) {
      return held.has(action);
    },
    endFrame() {
      pressed.clear();
    },
  };
}
