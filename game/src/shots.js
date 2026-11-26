// The screenshot scenes behind ?shot=start|play|action|end (with &seed=N and
// &view=chase|cockpit). Each one plays the real rules forward from a fresh flight for
// a fixed number of steps, steered by a simple autopilot — throttle to hold cruise
// speed, pitch to hold the next gate's altitude, bank toward the next gate or the
// runway — so the frame is what a real sortie looks like and the same seed always
// gives the same frame. The end scene's pilot is deliberately clumsy (it chases the
// runway too fast and too low), so it shows the mission-failed screen a hurried
// player earns.

import { STEP } from './config.js';
import { buildRoute } from './world.js';
import { createFlight, EVENT_LANDED } from './flight.js';
import { createRandom } from './random.js';
import { SCREEN_COMPLETE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 30;
const ACTION_SECONDS = 48;
const END_LIMIT_SECONDS = 600;
const SAMPLE = 1 / 30;

/** Steer toward a target: bank by heading error, pitch by altitude error (proportional). */
function autopilot(plane, targetX, targetZ, targetAlt, throttle, pitchDivisor = 300) {
  const dx = targetX - plane.x;
  const dz = targetZ - plane.z;
  const wanted = (Math.atan2(dx, dz) * 180) / Math.PI;
  let error = wanted - plane.heading;
  while (error > 180) error -= 360;
  while (error < -180) error += 360;
  const turn = Math.max(-1, Math.min(1, error / 20));
  const altError = targetAlt - plane.alt;
  const pitch = Math.max(-1, Math.min(1, altError / pitchDivisor));
  const speedTarget = throttle === 'fast' ? 135 : throttle === 'slow' ? 72 : 125;
  const throttleCmd = plane.speed < speedTarget - 4 ? 1 : plane.speed > speedTarget + 4 ? -1 : 0;
  return { throttle: throttleCmd, turn, pitch };
}

/** Run the flight forward with the autopilot until it lands, crashes or times out. */
function flyMission(missionIndex, seconds, clumsy) {
  const route = buildRoute(missionIndex);
  const flight = createFlight(route, createRandom(missionIndex * 101 + 7));
  const limit = Math.min(seconds, END_LIMIT_SECONDS);
  for (let index = 0; index < limit / STEP; index += 1) {
    const plane = flight.state;
    let control;
    if (clumsy) {
      // The clumsy pilot: full throttle, dives at the runway, never slows down.
      control = { throttle: 1, turn: 0, pitch: plane.alt > 120 ? -1 : 0 };
      const dx = route.runway.x - plane.x;
      const dz = route.runway.z - plane.z;
      const wanted = (Math.atan2(dx, dz) * 180) / Math.PI;
      let error = wanted - plane.heading;
      while (error > 180) error -= 360;
      while (error < -180) error += 360;
      control.turn = error > 5 ? 1 : error < -5 ? -1 : 0;
    } else if (plane.runwayArmed) {
      // Final approach: aim at a point on the runway's extended centreline, 0.6 nm
      // ahead of the plane's own along-track position. Aiming at a fixed point
      // beyond the strip flies a diagonal and lands beside the buoys; the centreline
      // aim converges the cross-track error and the heading onto the strip.
      const h = route.runway.heading * (Math.PI / 180);
      const sinH = Math.sin(h);
      const cosH = Math.cos(h);
      const relX = plane.x - route.runway.x;
      const relZ = plane.z - route.runway.z;
      const alongPlane = relX * sinH + relZ * cosH;
      const aimAlong = alongPlane + 0.6;
      const aimX = route.runway.x + sinH * aimAlong;
      const aimZ = route.runway.z + cosH * aimAlong;
      control = autopilot(plane, aimX, aimZ, 250, 'cruise');
      // Along-track distance to the threshold (positive while approaching, negative
      // once past it): it keeps shrinking through the strip.
      const along = -alongPlane - route.runway.length / 2;
      if (along < 1.2) {
        const approach = autopilot(plane, aimX, aimZ, Math.max(0, along * 300), 'slow', 60);
        control = { throttle: approach.throttle, turn: approach.turn, pitch: approach.pitch };
      }
      // Over the strip and low: keep a gentle sink so the plane settles onto the
      // buoys instead of skimming the sea at a foot of altitude forever.
      if (along < 0.05 && plane.alt < 80) control.pitch = Math.min(control.pitch, -0.25);
    } else {
      const ring = route.rings[plane.ringsPassed];
      control = autopilot(plane, ring.x, ring.z, ring.alt, 'cruise');
    }
    const events = flight.step(STEP, control);
    if (events & EVENT_LANDED || plane.crashed || plane.ditched || plane.timeUp) break;
  }
  return { route, flight };
}

/**
 * Stage the named scene and return the route, the flight, the screen to draw over it
 * and the best scores to show.
 */
export function stageShot(name, missionIndex = 0) {
  if (name === 'play') {
    const { route, flight } = flyMission(missionIndex, PLAY_SECONDS, false);
    return { route, flight, screen: SCREEN_PLAY, bests: [flight.state.score] };
  }
  if (name === 'action') {
    // Mission 4, mid-storm: the plane is deep in the weather, gates half cleared.
    const { route, flight } = flyMission(3, ACTION_SECONDS, false);
    return { route, flight, screen: SCREEN_PLAY, bests: [flight.state.score] };
  }
  if (name === 'end') {
    const { route, flight } = flyMission(2, END_LIMIT_SECONDS, true);
    const over = flight.state.crashed || flight.state.ditched || flight.state.timeUp;
    return { route, flight, screen: over ? SCREEN_OVER : SCREEN_COMPLETE, bests: [flight.state.score] };
  }
  const { route, flight } = flyMission(missionIndex, START_SECONDS, false);
  return { route, flight, screen: SCREEN_TITLE, bests: [0] };
}
