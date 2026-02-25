export function createAudioController() {
  const audio = {
    ctx: null,
    enabled: true,
  };

  function init() {
    if (audio.ctx) return;
    audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function setEnabled(value) {
    audio.enabled = Boolean(value);
  }

  function playTone(freq, duration, type, gainValue) {
    if (!audio.enabled || !audio.ctx) return;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain).connect(audio.ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + duration);
    osc.stop(audio.ctx.currentTime + duration);
  }

  return {
    init,
    playTone,
    setEnabled,
    get enabled() {
      return audio.enabled;
    },
  };
}
