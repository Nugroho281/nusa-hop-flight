// The flight model: no drawing and no browser in it. A seaplane in a 2D world (x east,
// z north, both nautical miles; altitude in feet; heading in degrees, 0 = north).
// step() advances one fixed step and returns what happened as bit flags, so the caller
// can react — sounds, screens, scoring — without the model knowing about any of it.
//
// The discipline the game teaches: throttle sets speed, pitch trades speed for altitude,
// and turns cost both. Fly too slow and the wing stalls; fly too fast and the engine
// takes damage; fly too long and the tanks run dry. Rings, the runway, islands and ash
// are all read from the mission route handed to createFlight.

import { KT_TO_FPS, KT_TO_NMPS, PLANE, SCORE } from './config.js';

export const EVENT_RING = 1;
export const EVENT_STALL = 2;
export const EVENT_OVERSPEED = 4;
export const EVENT_LANDED = 8;
export const EVENT_CRASHED = 16;
export const EVENT_DITCHED = 32;
export const EVENT_FUEL_EMPTY = 64;
export const EVENT_TIME_UP = 128;
export const EVENT_RUNWAY_ARMED = 256;

const DEG = Math.PI / 180;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Is the plane over the runway rectangle (a short water strip marked by buoys)? */
function overRunway(plane, runway) {
  const dx = plane.x - runway.x;
  const dz = plane.z - runway.z;
  const h = runway.heading * DEG;
  const along = dx * Math.sin(h) + dz * Math.cos(h);
  const across = dx * Math.cos(h) - dz * Math.sin(h);
  return Math.abs(along) <= runway.length / 2 && Math.abs(across) <= runway.width / 2;
}

/** Distance in feet from the plane to a ring gate's centre. */
function ringDistance(plane, ring) {
  const dx = (plane.x - ring.x) * 6076;
  const dz = (plane.z - ring.z) * 6076;
  const dy = plane.alt - ring.alt;
  return Math.sqrt(dx * dx + dz * dz + dy * dy);
}

export function createFlight(route, random) {
  const state = {
    x: 0,
    z: 0,
    alt: 400,
    speed: 95,
    heading: 0,
    pitch: 0,
    bank: 0,
    throttle: 0.55,
    fuel: route.mission.fuel,
    damage: 0,
    verticalSpeed: 0,
    elapsed: 0,
    ringsPassed: 0,
    combo: 0,
    score: 0,
    stalled: false,
    overspeed: false,
    inAsh: false,
    runwayArmed: false,
    landed: false,
    crashed: false,
    ditched: false,
    timeUp: false,
    outOfFuel: false,
    message: '',
    messageTimer: 0,
  };

  function reset() {
    state.x = 0;
    state.z = 0;
    state.alt = 400;
    state.speed = 95;
    state.heading = route.runway.heading;
    state.pitch = 0;
    state.bank = 0;
    state.throttle = 0.55;
    state.fuel = route.mission.fuel;
    state.damage = 0;
    state.verticalSpeed = 0;
    state.elapsed = 0;
    state.ringsPassed = 0;
    state.combo = 0;
    state.score = 0;
    state.stalled = false;
    state.overspeed = false;
    state.inAsh = false;
    state.runwayArmed = false;
    state.landed = false;
    state.crashed = false;
    state.ditched = false;
    state.timeUp = false;
    state.outOfFuel = false;
    state.message = '';
    state.messageTimer = 0;
    for (const ring of route.rings) ring.passed = false;
  }

  function say(text, seconds = 2.5) {
    state.message = text;
    state.messageTimer = seconds;
  }

  /**
   * One fixed step. `control` is { throttle: -1|0|1, turn: -1|0|1, pitch: -1|0|1 }
   * (throttle up/down, bank left/right, climb/descend). Storm turbulence is applied
   * here too, from the route's own seeded random, so a mission replays identically.
   */
  function step(dt, control) {
    let events = 0;
    state.elapsed += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    // Throttle: the lever moves at a fixed rate, and an empty tank forces it shut.
    state.throttle = clamp(state.throttle + control.throttle * PLANE.throttleRate * dt, 0, PLANE.maxThrottle);
    if (state.fuel <= 0) {
      if (!state.outOfFuel) {
        state.outOfFuel = true;
        events |= EVENT_FUEL_EMPTY;
        say('FUEL EMPTY — gliding. Pick a spot to ditch.', 4);
      }
      state.throttle = 0;
    }

    // Pitch: the stick moves the nose; the nose trades speed for altitude.
    const pitchTarget = control.pitch * (control.pitch > 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown);
    state.pitch += clamp(pitchTarget - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
    const bankTarget = control.turn * PLANE.bankMax;
    state.bank += clamp(bankTarget - state.bank, -90 * dt, 90 * dt);

    // Storm turbulence: the nose and the heading get knocked around.
    if (route.mission.storm) {
      state.pitch += (random() - 0.5) * 14 * dt * route.mission.storm;
      state.heading += (random() - 0.5) * 10 * dt * route.mission.storm;
    }

    // Speed: throttle pulls toward its speed, climbing bleeds speed, diving gains it.
    const targetSpeed = state.throttle * PLANE.maxSpeed;
    const climbBleed = Math.sin(state.pitch * DEG) * 22;
    state.speed += clamp(targetSpeed - climbBleed - state.speed, -14 * dt, 9 * dt);
    state.speed = Math.max(0, state.speed);

    // Stall: below stall speed the wing quits and the nose drops hard.
    state.stalled = state.speed < PLANE.stallSpeed;
    if (state.stalled) {
      state.pitch = Math.max(state.pitch - 30 * dt, PLANE.maxPitchDown);
      if ((events & EVENT_STALL) === 0) events |= EVENT_STALL;
    }

    // Overspeed: past VNE the engine shakes itself apart.
    state.overspeed = state.speed > PLANE.vne;
    if (state.overspeed) {
      state.damage += PLANE.damageOverspeed * dt;
      events |= EVENT_OVERSPEED;
    }

    // Heading: a banked turn, slower to bite when the wing is barely flying.
    const authority = clamp(state.speed / PLANE.cruiseSpeed, 0.35, 1.2);
    state.heading += (state.bank / PLANE.bankMax) * PLANE.turnRate * authority * dt;
    state.heading = ((state.heading % 360) + 360) % 360;

    // Position and altitude.
    const speedNm = state.speed * KT_TO_NMPS;
    state.x += Math.sin(state.heading * DEG) * speedNm * dt;
    state.z += Math.cos(state.heading * DEG) * speedNm * dt;
    state.verticalSpeed = state.speed * KT_TO_FPS * Math.sin(state.pitch * DEG)
      - (state.stalled ? 260 : 0);
    state.alt += state.verticalSpeed * dt;

    // Fuel burn: full throttle drinks roughly three times idle.
    if (state.fuel > 0) {
      state.fuel = Math.max(0, state.fuel - (0.2 + 0.8 * state.throttle) * PLANE.fuelBurn * dt);
      if (state.fuel < 15 && state.fuel > 0 && Math.floor(state.elapsed * 2) !== Math.floor((state.elapsed - dt) * 2)) {
        say('LOW FUEL — decide: push on or turn back.', 1);
      }
    }

    // Ash: inside the volcano's cloud the engine takes damage.
    state.inAsh = false;
    for (const cloud of route.ashClouds) {
      const dx = state.x - cloud.x;
      const dz = state.z - cloud.z;
      if (dx * dx + dz * dz < cloud.radius * cloud.radius && state.alt > cloud.base && state.alt < cloud.top) {
        state.inAsh = true;
        state.damage += PLANE.damageAsh * dt;
        break;
      }
    }

    // Engine destroyed: the flight is over, wherever the sea is.
    if (state.damage >= 100) {
      state.damage = 100;
      state.crashed = true;
      events |= EVENT_CRASHED;
      say('ENGINE DESTROYED', 4);
      return events;
    }

    // Ring gates: fly through the hoop and the combo grows.
    const nextRing = route.rings[state.ringsPassed];
    if (nextRing && !state.runwayArmed) {
      if (ringDistance(state, nextRing) < nextRing.radius) {
        nextRing.passed = true;
        state.ringsPassed += 1;
        state.combo += 1;
        state.score += SCORE.ring * state.combo;
        events |= EVENT_RING;
        say(state.combo > 1 ? `GATE ${state.ringsPassed} — combo x${state.combo}!` : `GATE ${state.ringsPassed} — clean!`, 2);
        if (state.ringsPassed === route.rings.length) {
          state.runwayArmed = true;
          events |= EVENT_RUNWAY_ARMED;
          say('ALL GATES — runway armed. Line up and land.', 4);
        }
      } else if (ringDistance(state, nextRing) < nextRing.radius * 3 && state.combo > 0) {
        // A gate flown past without going through breaks the combo.
        const past = (state.z - nextRing.z) * Math.cos(state.heading * DEG)
          + (state.x - nextRing.x) * Math.sin(state.heading * DEG) > nextRing.radius / 6076;
        if (past) state.combo = 0;
      }
    }

    // Terrain: an island peak is a wall. The sea is a runway only where the buoys say so.
    for (const island of route.islands) {
      const dx = state.x - island.x;
      const dz = state.z - island.z;
      if (dx * dx + dz * dz < island.radius * island.radius && state.alt < island.peak) {
        state.crashed = true;
        events |= EVENT_CRASHED;
        say(`HIT ${island.name.toUpperCase()} — terrain!`, 4);
        return events;
      }
    }

    // The sea: touching down decides the mission.
    if (state.alt <= 0) {
      state.alt = 0;
      const aligned = Math.abs(angleDiff(state.heading, route.runway.heading)) <= 25;
      const gentle = state.verticalSpeed > -900;
      const slowEnough = state.speed >= 50 && state.speed <= 105;
      if (overRunway(state, route.runway) && state.runwayArmed && aligned && gentle && slowEnough) {
        state.landed = true;
        state.score += SCORE.landing + Math.round(state.fuel) * SCORE.fuelPerPercent;
        if (route.mission.timeLimit > 0) {
          state.score += Math.max(0, Math.round(route.mission.timeLimit - state.elapsed)) * SCORE.timePerSecond;
        }
        events |= EVENT_LANDED;
        say('LANDED — welcome to the island!', 4);
      } else if (overRunway(state, route.runway) && !state.runwayArmed) {
        state.crashed = true;
        events |= EVENT_CRASHED;
        say('LANDED EARLY — the gates were not cleared!', 4);
      } else if (slowEnough && gentle) {
        state.ditched = true;
        events |= EVENT_DITCHED;
        say('DITCHED — the boat picks you up. Mission failed.', 4);
      } else {
        state.crashed = true;
        events |= EVENT_CRASHED;
        say('CRASHED INTO THE SEA', 4);
      }
      return events;
    }

    // The clock: a timed mission ends when it runs out, landed or not.
    if (route.mission.timeLimit > 0 && state.elapsed >= route.mission.timeLimit && !state.landed) {
      state.timeUp = true;
      events |= EVENT_TIME_UP;
      say('TIME UP — the medicine is late.', 4);
    }

    return events;
  }

  reset();
  return { state, reset, step, overRunway, ringDistance };
}
