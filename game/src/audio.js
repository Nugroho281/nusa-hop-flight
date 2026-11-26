// Synthesised sound only (WebAudio, no files): a propeller engine hum whose pitch
// follows the throttle, wind that rises with speed, and short chimes for rings,
// warnings and landings. Nothing plays until the player first interacts — browsers
// demand that — and M mutes everything.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter).connect(engineGain).connect(context.destination);
      engineOsc.start();

      // Wind: a looped noise buffer through a bandpass, quiet until the plane is fast.
      const length = context.sampleRate * 2;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
      const noise = context.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 500;
      windGain = context.createGain();
      windGain.gain.value = 0;
      noise.connect(band).connect(windGain).connect(context.destination);
      noise.start();
    } catch {
      context = null;
    }
  }

  function tone(freq, seconds, type, volume, when = 0) {
    if (!context || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(context.destination);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  return {
    ensure,
    /** Continuous engine + wind levels for this frame, from throttle and speed. */
    update(throttle, speed, stalled) {
      if (!context || muted) return;
      const now = context.currentTime;
      engineGain.gain.setTargetAtTime(0.05 + throttle * 0.06, now, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + throttle * 75 + (stalled ? 12 : 0), now, 0.1);
      windGain.gain.setTargetAtTime(Math.max(0, (speed - 70) / 160) * 0.05, now, 0.2);
    },
    ring(combo) {
      tone(660 + combo * 60, 0.18, 'sine', 0.16);
      tone(990 + combo * 60, 0.3, 'sine', 0.14, 0.08);
    },
    stallWarning() {
      tone(220, 0.16, 'square', 0.1);
      tone(220, 0.16, 'square', 0.1, 0.22);
    },
    landed() {
      tone(523, 0.22, 'sine', 0.16);
      tone(659, 0.22, 'sine', 0.16, 0.16);
      tone(784, 0.4, 'sine', 0.16, 0.32);
    },
    crashed() {
      tone(160, 0.7, 'sawtooth', 0.16);
      tone(90, 0.9, 'sawtooth', 0.14, 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (context) {
        const now = context.currentTime;
        engineGain.gain.setTargetAtTime(muted ? 0 : 0.08, now, 0.05);
        windGain.gain.setTargetAtTime(0, now, 0.05);
      }
      return muted;
    },
  };
}
