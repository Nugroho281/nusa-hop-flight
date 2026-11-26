// The mission route: islands, ring gates, the water runway, clouds and ash, all grown
// from the mission's seed so the same mission always builds the same archipelago.
// The route runs roughly north from the takeoff point (0, 0); the runway waits at the
// far island, and the rings snake between the islands on the way there.

import { MISSIONS } from './config.js';
import { createRandom } from './random.js';

const ISLAND_NAMES = [
  'Rinca', 'Komodo', 'Flores', 'Sumbawa', 'Lombok', 'Bali', 'Sumba', 'Timor',
  'Alor', 'Solor', 'Adonara', 'Lembata', 'Pantar', 'Wetar', 'Banda', 'Seram',
];
const VOLCANO_NAMES = ['Tambora', 'Rinjani', 'Agung', 'Kelimutu', 'Bromo', 'Semeru'];

const RING_ALT_MIN = 600;
const RING_ALT_MAX = 1500;
const RING_RADIUS = 550;

/** Pick a value in [low, high) from the seeded random. */
function range(random, low, high) {
  return low + random() * (high - low);
}

function buildIslands(random, mission, routeLength, rings, runway) {
  const islands = [];
  const count = 5 + Math.floor(random() * 3);
  // Islands are scenery and hazard, never a wall across the route: a candidate is
  // rejected when it covers a ring gate or the runway approach corridor, so the
  // autopilot (and a fair player) can always fly gate to gate without terrain in the way.
  function clearOfRoute(x, z, radius) {
    for (const ring of rings) {
      if (Math.hypot(x - ring.x, z - ring.z) < radius + 0.5) return false;
    }
    if (Math.hypot(x - runway.x, z - runway.z) < radius + 0.8) return false;
    return true;
  }
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < 60) {
    tries += 1;
    const along = routeLength * (0.15 + 0.75 * (placed / Math.max(1, count - 1)));
    const side = (placed % 2 === 0 ? -1 : 1) * range(random, 1.7, 2.6);
    const x = side + range(random, -0.3, 0.3);
    const z = along + range(random, -0.4, 0.4);
    const radius = range(random, 0.45, 0.85);
    if (!clearOfRoute(x, z, radius)) continue;
    const volcano = mission.ash ? placed === Math.floor(count / 2) : random() < 0.3;
    islands.push({
      name: volcano
        ? VOLCANO_NAMES[Math.floor(random() * VOLCANO_NAMES.length)]
        : ISLAND_NAMES[Math.floor(random() * ISLAND_NAMES.length)],
      x,
      z,
      radius,
      peak: volcano ? range(random, 2600, 4200) : range(random, 600, 1100),
      volcano,
    });
    placed += 1;
  }
  return islands;
}

function buildRings(random, mission, routeLength) {
  const rings = [];
  const spread = mission.ringSpread;
  for (let index = 0; index < mission.rings; index += 1) {
    const along = routeLength * ((index + 1) / (mission.rings + 1));
    const side = Math.sin(index * 1.7 + mission.seed) * spread;
    rings.push({
      x: side,
      z: along,
      alt: range(random, RING_ALT_MIN, RING_ALT_MAX),
      radius: RING_RADIUS,
      passed: false,
    });
  }
  return rings;
}

function buildClouds(random, routeLength) {
  const clouds = [];
  const count = 14;
  for (let index = 0; index < count; index += 1) {
    clouds.push({
      x: range(random, -4, 4),
      z: range(random, 0, routeLength + 1),
      alt: range(random, 1800, 3200),
      size: range(random, 0.5, 1.4),
      drift: range(random, 0.02, 0.08),
    });
  }
  return clouds;
}

function buildAshClouds(random, islands, mission) {
  if (!mission.ash) return [];
  const volcano = islands.find((island) => island.volcano) ?? islands[0];
  return [{
    x: volcano.x + 0.8,
    z: volcano.z + 0.6,
    radius: 1.6,
    base: 400,
    top: 3200,
  }];
}

/**
 * Build one mission's whole world. `missionIndex` is 0-based; the runway sits on the
 * far island, aligned with the route so a straight final approach works.
 */
export function buildRoute(missionIndex) {
  const mission = MISSIONS[missionIndex];
  const random = createRandom(mission.seed * 7919 + 13);
  const routeLength = mission.routeLength;
  const rings = buildRings(random, mission, routeLength);
  const runway = {
    x: 0,
    z: routeLength + 0.4,
    heading: 0,
    length: 0.7,
    width: 0.18,
  };
  const islands = buildIslands(random, mission, routeLength, rings, runway);
  const clouds = buildClouds(random, routeLength);
  const ashClouds = buildAshClouds(random, islands, mission);
  return { mission, missionIndex, islands, rings, clouds, ashClouds, runway, routeLength };
}

export function missionById(id) {
  return MISSIONS.findIndex((mission) => mission.id === id);
}
