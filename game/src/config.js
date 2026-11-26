// Every tuning number, colour and mission definition in one place. The playfield is a
// fixed 1280x720 logical area; the renderer scales it to the window, so no rule below
// depends on the screen size. Distances in the world are nautical miles, altitudes in
// feet, speeds in knots — the units a real seaplane pilot reads.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Feet per second in one knot; nautical miles per second in one knot. */
export const KT_TO_FPS = 1.68781;
export const KT_TO_NMPS = 1 / 3600;

/** The seaplane's flight envelope: stall below this, the engine takes damage above VNE. */
export const PLANE = {
  stallSpeed: 55,
  cruiseSpeed: 110,
  maxSpeed: 160,
  vne: 150,
  maxThrottle: 1,
  throttleRate: 0.5,
  pitchRate: 7,
  maxPitchUp: 14,
  maxPitchDown: -10,
  bankMax: 32,
  /** Degrees of heading per second at a full bank at cruise speed. */
  turnRate: 30,
  fuelBurn: 0.18,
  damageOverspeed: 6,
  damageAsh: 4,
  /** Altitude below which the sea is right there: landing and ditching live here. */
  groundEffect: 60,
};

export const MISSION_COUNT = 6;

/**
 * The six sorties. Each one is a different job for the same seaplane, so the player
 * re-learns the throttle/turn discipline instead of repeating one route:
 *  - rings: how many ring gates guard the route (the last ring arms the runway).
 *  - fuel: percent in the tanks at takeoff; tight fuel makes the go/no-go call real.
 *  - timeLimit: seconds on the mission clock; 0 means no clock.
 *  - storm: turbulence shakes the plane; night: lantern-lit dark flying; ash: the
 *    volcano's cloud damages the engine, so the rings route around it.
 */
export const MISSIONS = [
  {
    id: 1,
    name: 'Obat untuk Rinca',
    brief: 'Medicine for Rinca island — beat the clock. Fuel is tight: fly clean or turn back.',
    seed: 11,
    rings: 5,
    fuel: 85,
    timeLimit: 420,
    storm: 0,
    night: false,
    ash: false,
    routeLength: 9,
    ringSpread: 0.9,
  },
  {
    id: 2,
    name: 'Slalom Selat',
    brief: 'Ring-gate slalom through the strait. No clock — precision is the whole job.',
    seed: 23,
    rings: 8,
    fuel: 100,
    timeLimit: 0,
    storm: 0,
    night: false,
    ash: false,
    routeLength: 11,
    ringSpread: 1.6,
  },
  {
    id: 3,
    name: 'Strip Pendek',
    brief: 'Three gates, then a short water strip. Land slow, land straight, land on the buoys.',
    seed: 37,
    rings: 3,
    fuel: 90,
    timeLimit: 0,
    storm: 0,
    night: false,
    ash: false,
    routeLength: 7,
    ringSpread: 0.7,
  },
  {
    id: 4,
    name: 'Lintasi Badai',
    brief: 'Cross the storm front. Turbulence throws the nose around — throttle discipline saves you.',
    seed: 41,
    rings: 6,
    fuel: 95,
    timeLimit: 420,
    storm: 1,
    night: false,
    ash: false,
    routeLength: 10,
    ringSpread: 1.2,
  },
  {
    id: 5,
    name: 'Lentera Malam',
    brief: 'A night run by lantern light. The rings glow; the sea does not. Trust the instruments.',
    seed: 53,
    rings: 5,
    fuel: 90,
    timeLimit: 0,
    storm: 0,
    night: true,
    ash: false,
    routeLength: 9,
    ringSpread: 1.0,
  },
  {
    id: 6,
    name: 'Abu Vulkanik',
    brief: 'The volcano is blowing ash across the route. The rings detour around the cloud — follow them.',
    seed: 67,
    rings: 6,
    fuel: 90,
    timeLimit: 0,
    storm: 0,
    night: false,
    ash: true,
    routeLength: 10,
    ringSpread: 1.3,
  },
];

export const SCORE = {
  ring: 100,
  landing: 500,
  /** Bonus per percent of fuel left on a completed mission. */
  fuelPerPercent: 4,
  /** Bonus per second left on the clock on a completed timed mission. */
  timePerSecond: 2,
};

export const PALETTE = {
  backdrop: '#0a1220',
  skyDayTop: '#3f7fc1',
  skyDayBottom: '#bfe0f2',
  skyNightTop: '#060a18',
  skyNightBottom: '#16233d',
  skyStormTop: '#3a4152',
  skyStormBottom: '#7c8494',
  seaDay: '#1e6f8e',
  seaDeep: '#0d4a68',
  seaNight: '#0a2036',
  seaStorm: '#274b5e',
  island: '#2f7a4a',
  islandSand: '#e8d9a0',
  volcanoRock: '#5a4a42',
  volcanoSmoke: '#cfc8bd',
  cloud: '#ffffff',
  ring: '#ffb020',
  ringPassed: '#37d67a',
  runway: '#ffd94d',
  buoy: '#ff5a3c',
  planeWhite: '#f4f6f8',
  planeRed: '#d9392b',
  planeDark: '#22303c',
  panel: '#101820',
  panelEdge: '#2c3a46',
  text: '#eef4f8',
  muted: '#9fb2c0',
  amber: '#ffb020',
  green: '#37d67a',
  red: '#ff5347',
  cyan: '#4fd2ff',
  instrumentFace: '#0d141b',
  instrumentGlow: '#ffe9a8',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score per mission is kept between visits (this browser only). */
export const BEST_KEY = 'nusa-hop.best';
