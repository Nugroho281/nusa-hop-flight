// Drawing only: the flight state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred. Two views of the same flight:
//  - chase: the seaplane seen from behind and above, sea and islands ahead, the plane's
//    shadow on the water marking its altitude, ring gates growing as they are approached.
//  - cockpit: the same sky through the windshield above a big lit instrument panel.
// Everything is drawn in code — sea, islands, volcano, clouds, rings, runway, plane.
// A gauge is "lit" when its needle and numbers glow against a dark face.

import { FIELD, FONT, PALETTE, PLANE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_SELECT = 'select';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

export const VIEW_CHASE = 'chase';
export const VIEW_COCKPIT = 'cockpit';

const DEG = Math.PI / 180;
const NM_FT = 6076;

function clamp(value, low, high) {
  return value < low ? low : value < high ? value : high;
}

function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
  const b = Math.min(255, Math.round((n & 255) * factor));
  return `rgb(${r},${g},${b})`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align = 'left', weight = '') {
    const key = `${size}${weight}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function skyColors(mission) {
    if (mission.night) return [PALETTE.skyNightTop, PALETTE.skyNightBottom, PALETTE.seaNight];
    if (mission.storm) return [PALETTE.skyStormTop, PALETTE.skyStormBottom, PALETTE.seaStorm];
    return [PALETTE.skyDayTop, PALETTE.skyDayBottom, PALETTE.seaDay];
  }

  /**
   * Project a world point into screen space from the plane's nose. Returns null when
   * the point is behind the plane. `focal` is the perspective strength in pixels.
   */
  function project(plane, wx, wz, altFt, horizonY, focal) {
    const dx = wx - plane.x;
    const dz = wz - plane.z;
    const h = plane.heading * DEG;
    const forward = dx * Math.sin(h) + dz * Math.cos(h);
    if (forward < 0.04) return null;
    const lateral = dx * Math.cos(h) - dz * Math.sin(h);
    const x = FIELD.width / 2 + (lateral / forward) * focal;
    const y = horizonY + ((plane.alt - altFt) / NM_FT / forward) * focal * 1.15;
    const scale = focal / forward;
    return { x, y, scale, forward };
  }

  function drawSkyAndSea(mission, horizonY, time) {
    const [top, bottom, sea] = skyColors(mission);
    const gradient = context.createLinearGradient(0, 0, 0, horizonY);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, horizonY + 1);
    // Sun or moon, low over the sea.
    context.fillStyle = mission.night ? '#f2ead0' : '#fff3c4';
    context.beginPath();
    context.arc(mission.night ? 1020 : 250, horizonY - 70, mission.night ? 26 : 34, 0, Math.PI * 2);
    context.fill();
    // The sea: a deep gradient with wave lines that slide past with speed.
    const seaGrad = context.createLinearGradient(0, horizonY, 0, FIELD.height);
    seaGrad.addColorStop(0, sea);
    seaGrad.addColorStop(1, shade(sea, 0.55));
    context.fillStyle = seaGrad;
    context.fillRect(0, horizonY, FIELD.width, FIELD.height - horizonY);
    context.strokeStyle = mission.night ? 'rgba(160,200,230,0.12)' : 'rgba(255,255,255,0.20)';
    context.lineWidth = 2;
    for (let row = 0; row < 7; row += 1) {
      const y = horizonY + 26 + row * row * 6 + row * 18;
      if (y > FIELD.height) break;
      context.beginPath();
      for (let x = 0; x <= FIELD.width; x += 32) {
        const wave = Math.sin((x + time * 90 + row * 140) * 0.02) * 3;
        if (x === 0) context.moveTo(x, y + wave);
        else context.lineTo(x, y + wave);
      }
      context.stroke();
    }
  }

  function drawIsland(plane, island, horizonY, focal, night) {
    const base = project(plane, island.x, island.z, 0, horizonY, focal);
    if (!base || base.x < -260 || base.x > FIELD.width + 260) return;
    const widthPx = (island.radius / base.forward) * focal * 1.15;
    if (widthPx < 4) return;
    const peakPx = (island.peak / NM_FT / base.forward) * focal * 1.15;
    const topY = base.y - peakPx;
    const dark = night ? 0.45 : 1;
    // Sand rim, then the green mound, then the peak (a volcano cone when it is one).
    context.fillStyle = shade(PALETTE.islandSand, dark);
    context.beginPath();
    context.ellipse(base.x, base.y, widthPx * 0.85, widthPx * 0.13, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = shade(PALETTE.island, dark);
    context.beginPath();
    context.moveTo(base.x - widthPx * 0.92, base.y);
    context.quadraticCurveTo(base.x - widthPx * 0.4, topY + peakPx * 0.45, base.x, topY);
    context.quadraticCurveTo(base.x + widthPx * 0.4, topY + peakPx * 0.45, base.x + widthPx * 0.92, base.y);
    context.closePath();
    context.fill();
    if (island.volcano) {
      context.fillStyle = shade(PALETTE.volcanoRock, dark);
      context.beginPath();
      context.moveTo(base.x - widthPx * 0.34, base.y - peakPx * 0.55);
      context.lineTo(base.x, topY);
      context.lineTo(base.x + widthPx * 0.34, base.y - peakPx * 0.55);
      context.closePath();
      context.fill();
      // Smoke drifting from the crater, lit orange at the rim when it is ash night.
      context.fillStyle = missionSmoke(night);
      for (let puff = 0; puff < 3; puff += 1) {
        const py = topY - 12 - puff * 16;
        const px = base.x + puff * 10 + Math.sin(puff * 2.1) * 6;
        context.beginPath();
        context.arc(px, py, 9 + puff * 5, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = night ? '#ff7a2a' : '#ff9a3c';
      context.beginPath();
      context.arc(base.x, topY + 2, 4, 0, Math.PI * 2);
      context.fill();
    }
    // The island's name, once it is close enough to read.
    if (base.forward < 3.5) {
      text(island.name.toUpperCase(), base.x, topY - 14, 15, night ? '#cfe0ee' : '#12303f', 'center', '700');
    }
  }

  function missionSmoke(night) {
    return night ? 'rgba(180,175,165,0.55)' : 'rgba(207,200,189,0.75)';
  }

  function drawClouds(route, plane, horizonY, focal, time) {
    context.fillStyle = 'rgba(255,255,255,0.85)';
    for (const cloud of route.clouds) {
      const driftedX = cloud.x + Math.sin(time * cloud.drift) * 0.2;
      const p = project(plane, driftedX, cloud.z, cloud.alt, horizonY, focal);
      if (!p || p.x < -200 || p.x > FIELD.width + 200) continue;
      const size = (cloud.size / p.forward) * focal * 0.5;
      if (size < 3 || size > 420) continue;
      context.beginPath();
      context.ellipse(p.x, p.y, size, size * 0.32, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(p.x - size * 0.4, p.y + size * 0.06, size * 0.55, size * 0.26, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(p.x + size * 0.4, p.y + size * 0.06, size * 0.55, size * 0.26, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawAshClouds(route, plane, horizonY, focal) {
    for (const cloud of route.ashClouds) {
      const p = project(plane, cloud.x, cloud.z, (cloud.base + cloud.top) / 2, horizonY, focal);
      if (!p) continue;
      const size = (cloud.radius / p.forward) * focal * 0.9;
      if (size < 6) continue;
      context.fillStyle = 'rgba(90,80,70,0.5)';
      context.beginPath();
      context.ellipse(p.x, p.y, size, size * 0.5, 0, 0, Math.PI * 2);
      context.fill();
      text('ASH — KEEP CLEAR', p.x, p.y - size * 0.5 - 8, 16, '#ffb020', 'center', '700');
    }
  }

  function drawRing(plane, ring, horizonY, focal, index, total) {
    const p = project(plane, ring.x, ring.z, ring.alt, horizonY, focal);
    if (!p || p.x < -160 || p.x > FIELD.width + 160) return;
    const r = (ring.radius / NM_FT / p.forward) * focal * 1.15;
    if (r < 2) return;
    const passed = ring.passed;
    const colour = passed ? PALETTE.ringPassed : PALETTE.ring;
    context.save();
    context.shadowColor = colour;
    context.shadowBlur = passed ? 4 : 16;
    context.strokeStyle = colour;
    context.lineWidth = Math.max(3, r * 0.14);
    context.beginPath();
    context.ellipse(p.x, p.y, r, r * 0.86, 0, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    context.lineWidth = Math.max(1.5, r * 0.05);
    context.strokeStyle = 'rgba(255,255,255,0.85)';
    context.beginPath();
    context.ellipse(p.x, p.y, r * 0.82, r * 0.7, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    if (!passed && p.forward < 2.5) {
      text(`GATE ${index + 1}/${total} · ${p.forward.toFixed(1)} NM`, p.x, p.y - r - 12, 16, '#ffffff', 'center', '700');
    }
  }

  function drawRunway(route, plane, horizonY, focal, armed, time) {
    const runway = route.runway;
    const h = runway.heading * DEG;
    const half = runway.length / 2;
    const p1 = project(plane, runway.x - Math.sin(h) * half, runway.z - Math.cos(h) * half, 0, horizonY, focal);
    const p2 = project(plane, runway.x + Math.sin(h) * half, runway.z + Math.cos(h) * half, 0, horizonY, focal);
    if (!p1 || !p2) return;
    const widthPx = Math.max(4, (runway.width / p1.forward) * focal * 1.15);
    const pulse = armed ? 0.65 + 0.35 * Math.sin(time * 5) : 0.4;
    context.save();
    context.strokeStyle = `rgba(255,217,77,${pulse})`;
    context.lineWidth = widthPx;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(p1.x, p1.y);
    context.lineTo(p2.x, p2.y);
    context.stroke();
    context.strokeStyle = 'rgba(20,40,60,0.85)';
    context.lineWidth = 2;
    context.setLineDash([10, 8]);
    context.beginPath();
    context.moveTo(p1.x, p1.y);
    context.lineTo(p2.x, p2.y);
    context.stroke();
    context.setLineDash([]);
    // Buoys at the strip's corners.
    context.fillStyle = PALETTE.buoy;
    for (const p of [p1, p2]) {
      context.beginPath();
      context.arc(p.x - widthPx / 2 - 4, p.y, 5, 0, Math.PI * 2);
      context.arc(p.x + widthPx / 2 + 4, p.y, 5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    if (p1.forward < 3) {
      text(armed ? 'RUNWAY — LAND HERE' : 'RUNWAY (clear the gates first)', (p1.x + p2.x) / 2, Math.min(p1.y, p2.y) - 16, 16, '#ffd94d', 'center', '700');
    }
  }

  /** The seaplane from behind and above, banking with the turn, prop a blur. */
  function drawPlane(plane, time, viewMode) {
    const cx = FIELD.width / 2;
    const cy = viewMode === VIEW_COCKPIT ? FIELD.height - 150 : 468;
    const bank = plane.bank;
    const size = viewMode === VIEW_COCKPIT ? 0 : 1;
    if (size === 0) return;
    // The shadow on the water: its distance below the plane reads the altitude.
    const shadowY = Math.min(700, cy + 60 + plane.alt / 14);
    const shadowScale = clamp(1 - plane.alt / 4200, 0.25, 1);
    context.save();
    context.globalAlpha = 0.28 * shadowScale;
    context.fillStyle = '#06222f';
    context.beginPath();
    context.ellipse(cx + bank * 1.2, shadowY, 66 * shadowScale + 14, 10 * shadowScale + 3, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    context.save();
    context.translate(cx, cy);
    context.rotate(bank * DEG * 0.35);
    // Floats.
    context.fillStyle = PALETTE.planeDark;
    context.fillRect(-58, 26, 116, 10);
    context.fillRect(-46, 40, 26, 8);
    context.fillRect(20, 40, 26, 8);
    // Wings.
    context.fillStyle = PALETTE.planeWhite;
    context.beginPath();
    context.roundRect(-118, -6, 236, 22, 10);
    context.fill();
    context.fillStyle = PALETTE.planeRed;
    context.fillRect(-118, 2, 236, 5);
    // Fuselage, tapering to the tail.
    context.fillStyle = PALETTE.planeWhite;
    context.beginPath();
    context.moveTo(-16, -58);
    context.quadraticCurveTo(0, -66, 16, -58);
    context.lineTo(12, 26);
    context.lineTo(-12, 26);
    context.closePath();
    context.fill();
    // Red cheatline and windows.
    context.fillStyle = PALETTE.planeRed;
    context.fillRect(-14, -30, 28, 6);
    context.fillStyle = '#9fd8ef';
    context.fillRect(-11, -48, 22, 12);
    // Tail fin and stabiliser.
    context.fillStyle = PALETTE.planeRed;
    context.beginPath();
    context.moveTo(-4, -58);
    context.lineTo(0, -86);
    context.lineTo(8, -58);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeWhite;
    context.fillRect(-34, -52, 68, 8);
    // Spinning prop: a translucent disc behind the tail.
    context.fillStyle = `rgba(200,220,235,${0.25 + 0.15 * Math.sin(time * 40)})`;
    context.beginPath();
    context.ellipse(0, -62, 26, 5, 0, 0, Math.PI * 2);
    context.fill();
    // Navigation lights.
    context.fillStyle = '#ff5347';
    context.beginPath();
    context.arc(-118, 5, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#37d67a';
    context.beginPath();
    context.arc(118, 5, 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  /** A lit gauge: dark face, glowing ticks, a needle and a digital read under it. */
  function drawDial(cx, cy, radius, label, value, min, max, unit, warn) {
    context.save();
    context.shadowColor = warn ? PALETTE.red : PALETTE.instrumentGlow;
    context.shadowBlur = warn ? 14 : 8;
    context.fillStyle = PALETTE.instrumentFace;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    // Ticks.
    for (let tick = 0; tick <= 10; tick += 1) {
      const a = (-225 + tick * 27) * DEG;
      const major = tick % 5 === 0;
      context.strokeStyle = major ? '#eef4f8' : '#5a6b78';
      context.lineWidth = major ? 3 : 1.5;
      context.beginPath();
      context.moveTo(cx + Math.cos(a) * (radius - (major ? 12 : 8)), cy + Math.sin(a) * (radius - (major ? 12 : 8)));
      context.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      context.stroke();
    }
    // Needle.
    const frac = clamp((value - min) / (max - min), 0, 1);
    const angle = (-225 + frac * 270) * DEG;
    context.strokeStyle = warn ? PALETTE.red : '#ffd94d';
    context.lineWidth = 3.5;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle) * (radius - 10), cy + Math.sin(angle) * (radius - 10));
    context.stroke();
    context.fillStyle = '#eef4f8';
    context.beginPath();
    context.arc(cx, cy, 5, 0, Math.PI * 2);
    context.fill();
    text(label, cx, cy + radius + 18, 13, PALETTE.muted, 'center', '700');
    text(`${Math.round(value)} ${unit}`, cx, cy + radius + 36, 13, warn ? PALETTE.red : PALETTE.text, 'center', '700');
  }

  function drawCompassTape(cx, cy, width, heading) {
    context.fillStyle = PALETTE.instrumentFace;
    context.fillRect(cx - width / 2, cy - 20, width, 40);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(cx - width / 2, cy - 20, width, 40);
    const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let deg = -60; deg <= 60; deg += 10) {
      const h = ((Math.round(heading) + deg) % 360 + 360) % 360;
      const x = cx + deg * (width / 130);
      const major = h % 45 === 0;
      context.strokeStyle = major ? '#eef4f8' : '#5a6b78';
      context.beginPath();
      context.moveTo(x, cy + (major ? -14 : -8));
      context.lineTo(x, cy + 8);
      context.stroke();
      if (major) text(labels[Math.round(h / 45) % 8], x, cy - 20, 12, '#eef4f8', 'center', '700');
    }
    context.fillStyle = PALETTE.amber;
    context.beginPath();
    context.moveTo(cx - 7, cy - 22);
    context.lineTo(cx + 7, cy - 22);
    context.lineTo(cx, cy - 12);
    context.closePath();
    context.fill();
    text('HDG', cx, cy + 34, 12, PALETTE.muted, 'center', '700');
    text(`${String(Math.round(heading)).padStart(3, '0')}°`, cx, cy + 52, 15, PALETTE.text, 'center', '700');
  }

  function drawBar(x, y, width, height, frac, colour, label) {
    context.fillStyle = '#0a1218';
    context.fillRect(x, y, width, height);
    context.fillStyle = colour;
    context.fillRect(x + 2, y + 2, (width - 4) * clamp(frac, 0, 1), height - 4);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(x, y, width, height);
    text(label, x, y - 6, 12, PALETTE.muted, 'left', '700');
  }

  /** The top HUD strip: altitude, speed, heading, fuel, damage, mission and clock. */
  function drawHud(route, plane, timeLeft, viewMode, time) {
    const mission = route.mission;
    context.fillStyle = 'rgba(8,16,24,0.72)';
    context.fillRect(0, 0, FIELD.width, 64);
    text(`ALT ${Math.round(plane.alt)} FT`, 20, 30, 22, plane.alt < 120 ? PALETTE.red : PALETTE.text, 'left', '700');
    text(`SPD ${Math.round(plane.speed)} KT`, 210, 30, 22, plane.speed < PLANE.stallSpeed + 8 ? PALETTE.red : PALETTE.text, 'left', '700');
    text(`HDG ${String(Math.round(plane.heading)).padStart(3, '0')}°`, 390, 30, 22, PALETTE.text, 'left', '700');
    text(mission.name.toUpperCase(), FIELD.width / 2, 26, 18, PALETTE.amber, 'center', '700');
    const clock = timeLeft === null ? '' : `  ·  ${Math.floor(timeLeft / 60)}:${String(Math.floor(timeLeft % 60)).padStart(2, '0')}`;
    text(`GATES ${plane.ringsPassed}/${route.rings.length}${clock}`, FIELD.width / 2, 52, 16, PALETTE.text, 'center');
    drawBar(FIELD.width - 320, 14, 130, 16, plane.fuel / 100, plane.fuel < 20 ? PALETTE.red : PALETTE.green, `FUEL ${Math.round(plane.fuel)}%`);
    drawBar(FIELD.width - 160, 14, 130, 16, 1 - plane.damage / 100, plane.damage > 60 ? PALETTE.red : PALETTE.amber, `DMG ${Math.round(plane.damage)}%`);
    text(`SCORE ${plane.score}`, FIELD.width - 30, 52, 16, PALETTE.text, 'right', '700');
    // Warning lights, flashing twice a second.
    const blink = Math.floor(time * 2) % 2 === 0;
    let warnX = 24;
    const warnings = [];
    if (plane.stalled) warnings.push(['STALL', PALETTE.red]);
    if (plane.overspeed) warnings.push(['OVERSPEED', PALETTE.red]);
    if (plane.inAsh) warnings.push(['ASH', PALETTE.amber]);
    if (plane.fuel < 20 && plane.fuel > 0) warnings.push(['LOW FUEL', PALETTE.amber]);
    if (plane.outOfFuel) warnings.push(['NO FUEL', PALETTE.red]);
    for (const [label, colour] of warnings) {
      if (!blink && colour === PALETTE.red) continue;
      context.fillStyle = colour;
      context.beginPath();
      context.roundRect(warnX, 72, 110, 26, 6);
      context.fill();
      text(label, warnX + 55, 90, 14, '#101820', 'center', '700');
      warnX += 122;
    }
    if (plane.messageTimer > 0 && plane.message) {
      context.fillStyle = 'rgba(8,16,24,0.78)';
      const width = context.measureText(plane.message).width + 40;
      context.beginPath();
      context.roundRect(FIELD.width / 2 - width / 2, 108, width, 36, 8);
      context.fill();
      text(plane.message, FIELD.width / 2, 132, 17, '#ffe9a8', 'center', '700');
    }
  }

  /** The chase view's bottom instrument strip: three lit dials, compass tape, throttle. */
  function drawInstrumentStrip(route, plane) {
    const y = FIELD.height - 118;
    context.fillStyle = 'rgba(10,18,26,0.9)';
    context.fillRect(0, y, FIELD.width, 118);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, y, FIELD.width, 2);
    drawDial(110, y + 52, 42, 'ALTITUDE', plane.alt, 0, 4000, 'FT', plane.alt < 120);
    drawDial(280, y + 52, 42, 'AIRSPEED', plane.speed, 0, 180, 'KT', plane.stalled || plane.overspeed);
    drawCompassTape(560, y + 52, 300, plane.heading);
    drawBar(790, y + 30, 150, 18, plane.fuel / 100, plane.fuel < 20 ? PALETTE.red : PALETTE.green, 'FUEL');
    drawBar(790, y + 72, 150, 18, 1 - plane.damage / 100, plane.damage > 60 ? PALETTE.red : PALETTE.amber, 'ENGINE');
    // Throttle lever.
    context.fillStyle = PALETTE.instrumentFace;
    context.fillRect(990, y + 18, 26, 84);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(990, y + 18, 26, 84);
    const leverY = y + 18 + 84 * (1 - plane.throttle);
    context.fillStyle = PALETTE.amber;
    context.fillRect(984, leverY - 6, 38, 12);
    text('THR', 1003, y + 116, 11, PALETTE.muted, 'center', '700');
    text(`${Math.round(plane.throttle * 100)}%`, 1035, y + 44, 15, PALETTE.text, 'left', '700');
    text('W/S throttle · A/D turn · I/K climb · P pause', FIELD.width - 24, y + 56, 13, PALETTE.muted, 'right');
    text('V — cockpit view · M — mute', FIELD.width - 24, y + 84, 13, PALETTE.muted, 'right');
  }

  /** The cockpit view: the world through the windshield, a big panel under it. */
  function drawCockpitPanel(route, plane) {
    const panelTop = 470;
    // The nose cone, seen over the panel's top edge.
    context.fillStyle = PALETTE.planeWhite;
    context.beginPath();
    context.moveTo(FIELD.width / 2 - 90, panelTop + 6);
    context.quadraticCurveTo(FIELD.width / 2, panelTop - 70, FIELD.width / 2 + 90, panelTop + 6);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.planeRed;
    context.fillRect(FIELD.width / 2 - 90, panelTop + 2, 180, 5);
    context.fillStyle = '#0d141b';
    context.beginPath();
    context.ellipse(FIELD.width / 2, panelTop - 18, 26, 12, 0, 0, Math.PI * 2);
    context.fill();
    // The panel itself: dark, riveted, with six lit dials.
    context.fillStyle = '#141d26';
    context.fillRect(0, panelTop, FIELD.width, FIELD.height - panelTop);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, panelTop, FIELD.width, 3);
    drawDial(120, 566, 62, 'ALTITUDE', plane.alt, 0, 4000, 'FT', plane.alt < 120);
    drawDial(300, 566, 62, 'AIRSPEED', plane.speed, 0, 180, 'KT', plane.stalled || plane.overspeed);
    drawCompassTape(560, 566, 260, plane.heading);
    drawDial(800, 566, 62, 'FUEL', plane.fuel, 0, 100, '%', plane.fuel < 20);
    drawDial(980, 566, 62, 'ENGINE', 100 - plane.damage, 0, 100, '%', plane.damage > 60);
    // Throttle quadrant on the right.
    context.fillStyle = PALETTE.instrumentFace;
    context.fillRect(1100, 510, 30, 120);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(1100, 510, 30, 120);
    const leverY = 510 + 120 * (1 - plane.throttle);
    context.fillStyle = PALETTE.amber;
    context.fillRect(1092, leverY - 7, 46, 14);
    text('THROTTLE', 1115, 660, 12, PALETTE.muted, 'center', '700');
    text(`${Math.round(plane.throttle * 100)}%`, 1115, 680, 14, PALETTE.text, 'center', '700');
    text('V — chase view · M — mute', FIELD.width - 24, 700, 13, PALETTE.muted, 'right');
    // Warning lamps on the panel.
    const lamps = [
      ['STALL', plane.stalled, PALETTE.red],
      ['OVERSPEED', plane.overspeed, PALETTE.red],
      ['ASH', plane.inAsh, PALETTE.amber],
      ['LOW FUEL', plane.fuel < 20, PALETTE.amber],
    ];
    let lampX = 60;
    for (const [label, on, colour] of lamps) {
      context.save();
      if (on) {
        context.shadowColor = colour;
        context.shadowBlur = 14;
      }
      context.fillStyle = on ? colour : '#1d2833';
      context.beginPath();
      context.roundRect(lampX, 486, 96, 20, 5);
      context.fill();
      context.restore();
      text(label, lampX + 48, 501, 11, on ? '#101820' : '#5a6b78', 'center', '700');
      lampX += 108;
    }
  }

  function drawPanel(title, lines, prompt, accent = PALETTE.amber) {
    const height = 150 + lines.length * 34 + 70;
    const width = 680;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(8,14,20,0.82)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.stroke();
    text(title, FIELD.width / 2, y + 72, 44, accent, 'center', '800');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 128 + index * 34, 20, PALETTE.text, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 20, PALETTE.cyan, 'center', '700');
  }

  function drawTitle(time) {
    drawSkyAndSea({ night: false, storm: 0 }, 300, time);
    // A hero seaplane, big, banking gently over the sea.
    context.save();
    context.translate(FIELD.width / 2, 400);
    context.rotate(Math.sin(time * 0.5) * 0.06);
    context.scale(1.6, 1.6);
    context.fillStyle = PALETTE.planeWhite;
    context.beginPath();
    context.roundRect(-118, -6, 236, 22, 10);
    context.fill();
    context.fillStyle = PALETTE.planeRed;
    context.fillRect(-118, 2, 236, 5);
    context.fillStyle = PALETTE.planeWhite;
    context.beginPath();
    context.moveTo(-16, -58);
    context.quadraticCurveTo(0, -66, 16, -58);
    context.lineTo(12, 26);
    context.lineTo(-12, 26);
    context.closePath();
    context.fill();
    context.fillStyle = '#9fd8ef';
    context.fillRect(-11, -48, 22, 12);
    context.fillStyle = PALETTE.planeRed;
    context.beginPath();
    context.moveTo(-4, -58);
    context.lineTo(0, -86);
    context.lineTo(8, -58);
    context.closePath();
    context.fill();
    context.restore();
    drawPanel('NUSA HOP', [
      'Island courier seaplane — six missions across the Indonesian archipelago.',
      'Fly the ring gates, mind the fuel, land on the water. Stall low,',
      'overspeed high, and the sea is always waiting underneath.',
      'W/S throttle · A/D turn · I/K climb & descend · V cockpit view · P pause',
    ], 'Press Space or click — then pick a mission (1–6)', PALETTE.amber);
  }

  function drawSelect(missions, bests) {
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PICK A SORTIE', FIELD.width / 2, 84, 40, PALETTE.amber, 'center', '800');
    text('Six jobs for one seaplane. Fuel and damage turn every sortie into a decision.', FIELD.width / 2, 122, 18, PALETTE.muted, 'center');
    missions.forEach((mission, index) => {
      const y = 160 + index * 84;
      const best = bests[index] || 0;
      context.fillStyle = index % 2 === 0 ? '#131e29' : '#0f1822';
      context.beginPath();
      context.roundRect(180, y, 920, 72, 10);
      context.fill();
      context.strokeStyle = PALETTE.panelEdge;
      context.stroke();
      text(`${mission.id}`, 210, y + 46, 28, PALETTE.amber, 'left', '800');
      text(mission.name, 260, y + 34, 22, PALETTE.text, 'left', '700');
      text(mission.brief, 260, y + 58, 14, PALETTE.muted, 'left');
      text(best > 0 ? `BEST ${best}` : '—', 1060, y + 46, 16, PALETTE.cyan, 'right', '700');
    });
    text('Press 1–6 or click a row · Backspace returns to the title', FIELD.width / 2, 684, 16, PALETTE.muted, 'center');
  }

  /** Paint one frame: world, plane, HUD, instruments, then the screen's panel. */
  function draw(route, plane, screen, bests, viewMode, time, timeLeft) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    if (screen === SCREEN_TITLE) {
      drawTitle(time);
      return;
    }
    if (screen === SCREEN_SELECT) {
      drawSelect(route.missions, bests);
      return;
    }

    const mission = route.mission;
    const horizonY = viewMode === VIEW_COCKPIT ? 250 : 300 + plane.pitch * 6;
    const focal = viewMode === VIEW_COCKPIT ? 780 : 620;

    context.save();
    // The whole world rolls a little with the bank, the way a horizon does.
    context.translate(FIELD.width / 2, horizonY);
    context.rotate(-plane.bank * DEG * 0.25);
    context.translate(-FIELD.width / 2, -horizonY);
    drawSkyAndSea(mission, horizonY, time);
    // Far to near: clouds, ash, islands, runway, rings, then the plane.
    drawClouds(route, plane, horizonY, focal, time);
    drawAshClouds(route, plane, horizonY, focal);
    const islands = [...route.islands].sort((a, b) => {
      const da = (a.x - plane.x) ** 2 + (a.z - plane.z) ** 2;
      const db = (b.x - plane.x) ** 2 + (b.z - plane.z) ** 2;
      return db - da;
    });
    for (const island of islands) drawIsland(plane, island, horizonY, focal, mission.night);
    drawRunway(route, plane, horizonY, focal, plane.runwayArmed, time);
    route.rings.forEach((ring, index) => drawRing(plane, ring, horizonY, focal, index, route.rings.length));
    context.restore();

    if (viewMode === VIEW_CHASE) drawPlane(plane, time, viewMode);
    drawHud(route, plane, timeLeft, viewMode, time);
    if (viewMode === VIEW_CHASE) drawInstrumentStrip(route, plane);
    else drawCockpitPanel(route, plane);

    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The islands will wait. The fuel will not.'], 'Press P to keep flying', PALETTE.cyan);
    } else if (screen === SCREEN_OVER) {
      const reason = plane.crashed ? 'The seaplane is gone.' : plane.ditched ? 'Ditched in the sea — the boat picks you up.' : plane.timeUp ? 'The clock ran out.' : 'Out of fuel over open water.';
      drawPanel('MISSION FAILED', [reason, `Score ${plane.score} · Gates ${plane.ringsPassed}/${route.rings.length}`, 'Throttle discipline is the whole game: too slow stalls, too fast breaks the engine.'], 'Press Space to fly again · Backspace for missions', PALETTE.red);
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel('MISSION COMPLETE', [
        `${mission.name} — delivered.`,
        `Score ${plane.score} · Gates ${plane.ringsPassed}/${route.rings.length} · Fuel left ${Math.round(plane.fuel)}%`,
        `Best for this mission: ${bests[route.missionIndex] || plane.score}`,
      ], 'Press Space to fly again · Backspace for missions', PALETTE.green);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
