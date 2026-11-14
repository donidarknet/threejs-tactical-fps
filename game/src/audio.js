// Every sound is synthesized with WebAudio: no audio files, no network, no assets.
// The context is created lazily on the first user gesture; in screenshot mode it
// stays silent. A tiny helper builds each sound from an oscillator or a noise burst.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ensure() || context.state === 'suspended') return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(now, Math.random() * 0.3);
    source.stop(now + duration);
  }

  function tone(freqStart, freqEnd, duration, gainValue, type = 'square') {
    if (!ensure() || context.state === 'suspended') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freqStart, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  return {
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume();
    },
    shot(id) {
      if (id === 'dmr') {
        noise(0.22, 900, 0.9);
        tone(160, 50, 0.18, 0.5, 'sawtooth');
      } else if (id === 'smg') {
        noise(0.08, 1600, 0.5);
        tone(220, 90, 0.06, 0.25, 'square');
      } else if (id === 'sidearm') {
        noise(0.1, 1400, 0.6);
        tone(200, 80, 0.08, 0.3, 'square');
      } else {
        noise(0.12, 1200, 0.65);
        tone(180, 70, 0.1, 0.35, 'sawtooth');
      }
    },
    botShot(distance) {
      const volume = Math.max(0.08, 0.55 - distance * 0.012);
      noise(0.1, 1000, volume);
      tone(170, 80, 0.08, volume * 0.5, 'square');
    },
    dryFire() {
      tone(900, 700, 0.04, 0.2, 'square');
    },
    reload() {
      tone(500, 500, 0.05, 0.25, 'square');
      setTimeout(() => tone(650, 650, 0.05, 0.25, 'square'), 350);
    },
    hit() {
      tone(1400, 1400, 0.05, 0.3, 'sine');
    },
    kill() {
      tone(1200, 1200, 0.06, 0.35, 'sine');
      setTimeout(() => tone(1800, 1800, 0.08, 0.3, 'sine'), 70);
    },
    hurt() {
      tone(140, 60, 0.18, 0.5, 'sawtooth');
    },
    plantBeep() {
      tone(1000, 1000, 0.09, 0.3, 'sine');
    },
    throwGrenade() {
      noise(0.15, 700, 0.3);
    },
    explosion() {
      noise(0.7, 300, 1.0);
      tone(90, 30, 0.6, 0.8, 'sine');
    },
    buy() {
      tone(700, 700, 0.06, 0.25, 'sine');
      setTimeout(() => tone(1050, 1050, 0.08, 0.25, 'sine'), 80);
    },
    roundWin() {
      tone(523, 523, 0.14, 0.3, 'sine');
      setTimeout(() => tone(659, 659, 0.14, 0.3, 'sine'), 140);
      setTimeout(() => tone(784, 784, 0.22, 0.3, 'sine'), 280);
    },
    roundLoss() {
      tone(392, 392, 0.16, 0.3, 'sine');
      setTimeout(() => tone(311, 311, 0.24, 0.3, 'sine'), 160);
    },
  };
}
