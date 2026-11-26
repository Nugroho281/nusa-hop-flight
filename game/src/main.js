// Boot and the one loop: input is read every frame, the flight advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer paints
// what is there. The game moves between six screens: title, mission select, play,
// paused, mission failed and mission complete. V swaps chase and cockpit view mid-flight.
//
// ?seed=N fixes the mission's weather jitter. ?shot=start|play|action|end (with
// &seed=N and &view=chase|cockpit) stages that scene instead of running the loop,
// paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, MISSIONS, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildRoute } from './world.js';
import { createFlight, EVENT_CRASHED, EVENT_DITCHED, EVENT_LANDED, EVENT_RING, EVENT_STALL, EVENT_TIME_UP } from './flight.js';
import { ACTION_BACK, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_VIEW, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SELECT, SCREEN_TITLE, VIEW_CHASE, VIEW_COCKPIT } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const viewParam = params.get('view');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();
const selectRoute = { missions: MISSIONS };

function readBests() {
  try {
    return JSON.parse(window.localStorage.getItem(BEST_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveBests(bests) {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(bests));
  } catch {
    // Storage can be off (private windows): best scores then last this visit only.
  }
}

function runShot(name) {
  const missionParam = Number.parseInt(params.get('mission') ?? '0', 10);
  const missionIndex = Number.isInteger(missionParam) && missionParam >= 0 && missionParam < MISSIONS.length ? missionParam : 0;
  const staged = stageShot(name, missionIndex);
  const viewMode = viewParam === 'cockpit' ? VIEW_COCKPIT : VIEW_CHASE;
  const timeLeft = staged.route.mission.timeLimit > 0
    ? Math.max(0, staged.route.mission.timeLimit - staged.flight.state.elapsed)
    : null;
  let painted = 0;
  function paint() {
    renderer.draw(staged.route, staged.flight.state, staged.screen, staged.bests, viewMode, 12.4, timeLeft);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let bests = readBests();
  let missionIndex = 0;
  let route = buildRoute(0);
  let flight = createFlight(route, createRandom(seed));
  let viewMode = VIEW_CHASE;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;
  let stallBeepAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startMission(index) {
    missionIndex = index;
    route = buildRoute(index);
    flight = createFlight(route, createRandom(seed + index));
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.ensure();
    announce(`Flying ${route.mission.name}. ${route.mission.brief}`);
  }

  function endMission(landed) {
    screen = landed ? SCREEN_COMPLETE : SCREEN_OVER;
    const best = bests[missionIndex] || 0;
    if (flight.state.score > best) {
      bests[missionIndex] = flight.state.score;
      saveBests(bests);
    }
    if (landed) {
      audio.landed();
      announce(`Mission complete. Score ${flight.state.score}. Best ${bests[missionIndex]}.`);
    } else {
      audio.crashed();
      announce(`Mission failed. Score ${flight.state.score}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const missionKey = input.takeMissionKey();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_VIEW && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      viewMode = viewMode === VIEW_CHASE ? VIEW_COCKPIT : VIEW_CHASE;
      announce(viewMode === VIEW_CHASE ? 'Chase view.' : 'Cockpit view.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_SELECT;
        announce('Pick a mission, keys 1 to 6.');
      }
      return;
    }
    if (screen === SCREEN_SELECT) {
      if (missionKey >= 1 && missionKey <= MISSIONS.length) startMission(missionKey - 1);
      else if (actions & ACTION_BACK) {
        screen = SCREEN_TITLE;
        announce('NUSA HOP. Press Space or click to start.');
      }
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      } else if (actions & ACTION_BACK) {
        screen = SCREEN_SELECT;
        announce('Pick a mission, keys 1 to 6.');
      }
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_COMPLETE) {
      if (actions & ACTION_CONFIRM) startMission(missionIndex);
      else if (actions & ACTION_BACK) {
        screen = SCREEN_SELECT;
        announce('Pick a mission, keys 1 to 6.');
      }
    }
  }

  function step() {
    if (screen !== SCREEN_PLAY) return;
    const events = flight.step(STEP, input.control());
    const plane = flight.state;
    audio.update(plane.throttle, plane.speed, plane.stalled);
    if (events & EVENT_RING) audio.ring(plane.combo);
    if (events & EVENT_STALL && time - stallBeepAt > 1.5) {
      stallBeepAt = time;
      audio.stallWarning();
    }
    if (events & EVENT_LANDED) endMission(true);
    else if (events & (EVENT_CRASHED | EVENT_DITCHED | EVENT_TIME_UP)) endMission(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    time += dt;
    handleActions();
    if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const timeLeft = route.mission.timeLimit > 0
      ? Math.max(0, route.mission.timeLimit - flight.state.elapsed)
      : null;
    const drawRoute = screen === SCREEN_SELECT ? selectRoute : route;
    renderer.draw(drawRoute, flight.state, screen, bests, viewMode, time, timeLeft);
  }

  // Leaving the tab pauses a running game rather than letting the fuel burn unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('NUSA HOP. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
