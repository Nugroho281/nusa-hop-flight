// Keyboard and mouse input. Held keys give a flight control; one-shot presses (start,
// restart, pause, view, mission keys) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
// Controls: W/S or Up/Down throttle, A/D or Left/Right turn, I/K climb/descend,
// mouse up/down steers pitch too, V swaps chase/cockpit view, P pauses, M mutes.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_MUTE = 8;
export const ACTION_BACK = 16;

const THROTTLE_UP = new Set(['KeyW', 'ArrowUp']);
const THROTTLE_DOWN = new Set(['KeyS', 'ArrowDown']);
const TURN_LEFT = new Set(['KeyA', 'ArrowLeft']);
const TURN_RIGHT = new Set(['KeyD', 'ArrowRight']);
const PITCH_UP = new Set(['KeyI', 'PageUp']);
const PITCH_DOWN = new Set(['KeyK', 'PageDown']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const VIEW = new Set(['KeyV']);
const MUTE = new Set(['KeyM']);
const BACK = new Set(['Backspace']);
const MISSION_KEYS = new Set(['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);

export function createInput(target) {
  let throttleUp = false;
  let throttleDown = false;
  let turnLeft = false;
  let turnRight = false;
  let pitchUp = false;
  let pitchDown = false;
  let mousePitch = 0;
  let actions = 0;
  let missionKey = 0;

  window.addEventListener('keydown', (event) => {
    if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (TURN_LEFT.has(event.code)) turnLeft = true;
    else if (TURN_RIGHT.has(event.code)) turnRight = true;
    else if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (VIEW.has(event.code)) {
      if (!event.repeat) actions |= ACTION_VIEW;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (BACK.has(event.code)) {
      if (!event.repeat) actions |= ACTION_BACK;
    } else if (MISSION_KEYS.has(event.code)) {
      missionKey = Number(event.code.slice(-1));
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
    else if (TURN_LEFT.has(event.code)) turnLeft = false;
    else if (TURN_RIGHT.has(event.code)) turnRight = false;
    else if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything.
  window.addEventListener('blur', () => {
    throttleUp = false;
    throttleDown = false;
    turnLeft = false;
    turnRight = false;
    pitchUp = false;
    pitchDown = false;
    mousePitch = 0;
  });
  // Mouse: hold and drag up to climb, down to descend; a click confirms on menus.
  let dragging = false;
  target.addEventListener('pointerdown', (event) => {
    dragging = true;
    mousePitch = 0;
    actions |= ACTION_CONFIRM;
    event.preventDefault();
  });
  target.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    mousePitch = Math.max(-1, Math.min(1, (window.innerHeight / 2 - event.clientY) / 180));
  });
  target.addEventListener('pointerup', () => {
    dragging = false;
    mousePitch = 0;
  });

  return {
    /** The flight control for this frame: throttle, turn and pitch, each -1, 0 or 1. */
    control() {
      const pitch = pitchUp ? 1 : pitchDown ? -1 : mousePitch;
      return {
        throttle: (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0),
        turn: (turnRight ? 1 : 0) - (turnLeft ? 1 : 0),
        pitch: Math.max(-1, Math.min(1, pitch)),
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** A mission number key (1-6) pressed since the last call, or 0. */
    takeMissionKey() {
      const key = missionKey;
      missionKey = 0;
      return key;
    },
  };
}
