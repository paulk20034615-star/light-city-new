/**
 * audio.js
 * Lightweight WebAudio-based sound engine. All sound effects are
 * synthesized at runtime (no external audio files), so the game has
 * zero external asset dependencies. Background music is a simple
 * generated ambient pad loop.
 */
(function () {
  'use strict';

  let ctx = null;
  let musicNodes = null;
  let musicTimer = null;

  function ensureContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // Short synthesized tones per sound effect: [frequency(Hz), duration(s), type, gain]
  const SFX = {
    click: [660, 0.06, 'sine', 0.15],
    purchase: [440, 0.12, 'triangle', 0.2],
    upgrade: [520, 0.15, 'square', 0.15],
    collect: [880, 0.08, 'sine', 0.18],
    unlock: [330, 0.3, 'sawtooth', 0.15],
    prestige: [220, 0.5, 'triangle', 0.25],
    achievement: [660, 0.25, 'square', 0.2],
  };

  const Audio = {
    init() {
      // AudioContext must be created/resumed from a user gesture on most browsers.
      const resume = () => {
        ensureContext();
        document.removeEventListener('pointerdown', resume);
      };
      document.addEventListener('pointerdown', resume);
    },

    play(name) {
      if (!Game.state.settings.sound) return;
      const spec = SFX[name];
      if (!spec) return;
      const audioCtx = ensureContext();
      if (!audioCtx) return;

      const [freq, duration, type, gain] = spec;
      const now = audioCtx.currentTime;

      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      // A short pitch glide makes "collect"/"unlock"/"prestige" feel more alive.
      osc.frequency.exponentialRampToValueAtTime(freq * (name === 'collect' ? 1.5 : 1.15), now + duration);

      gainNode.gain.setValueAtTime(gain, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    },

    /** Generates one slow ambient pad chord and schedules the next; loops while music is enabled. */
    startMusic() {
      const audioCtx = ensureContext();
      if (!audioCtx || musicTimer) return;

      const chordFrequencies = [130.81, 164.81, 196.0, 246.94]; // soft C major-ish pad
      let chordIndex = 0;

      const playChord = () => {
        if (!Game.state.settings.music) return;
        const freq = chordFrequencies[chordIndex % chordFrequencies.length];
        chordIndex++;

        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.05, now + 1.5);
        gainNode.gain.linearRampToValueAtTime(0, now + 4.5);
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 4.6);

        musicTimer = setTimeout(playChord, 3800);
      };
      playChord();
    },

    stopMusic() {
      if (musicTimer) {
        clearTimeout(musicTimer);
        musicTimer = null;
      }
    },

    setMusicEnabled(enabled) {
      Game.state.settings.music = enabled;
      if (enabled) {
        ensureContext();
        Audio.startMusic();
      } else {
        Audio.stopMusic();
      }
    },
  };

  window.Game.Audio = Audio;
})();
