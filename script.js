(() => {
  // State
  const el = {
    bpmSlider: document.getElementById('bpm'),
    bpmNumber: document.getElementById('bpmNumber'),
    dec: document.getElementById('decrease'),
    inc: document.getElementById('increase'),
    beats: document.getElementById('beats'),
    note: document.getElementById('note'),
    accent: document.getElementById('accent'),
    subdiv: document.getElementById('subdivision'),
    themeToggle: document.getElementById('themeToggle'),
    startStop: document.getElementById('startStop'),
    tap: document.getElementById('tap'),
    reset: document.getElementById('reset'),
    pips: document.getElementById('pips')
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // Persistence
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem('metronome-settings') || '{}');
      if (s.bpm) setBpm(s.bpm);
      if (s.beats) el.beats.value = String(s.beats);
      if (s.note) el.note.value = String(s.note);
      if (typeof s.accent === 'boolean') el.accent.checked = s.accent;
      if (typeof s.subdiv === 'boolean') el.subdiv.checked = s.subdiv;
    } catch {}
  };
  const save = () => {
    const s = {
      bpm: current.bpm,
      beats: parseInt(el.beats.value, 10),
      note: parseInt(el.note.value, 10),
      accent: el.accent.checked,
      subdiv: el.subdiv.checked
    };
    localStorage.setItem('metronome-settings', JSON.stringify(s));
  };

  // Theme
  function getPreferredTheme() {
    const saved = localStorage.getItem('metronome-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (el.themeToggle) el.themeToggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    if (el.themeToggle) {
      const title = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
      el.themeToggle.title = title;
      el.themeToggle.setAttribute('aria-label', title);
    }
    localStorage.setItem('metronome-theme', theme);
  }

  // Audio engine
  const audio = {
    ctx: null,
    nextTick: 0,
    lookaheadMs: 25,
    scheduleHorizon: 0.15, // seconds
    timer: null
  };

  const current = {
    bpm: 100,
    running: false,
    beatInBar: 0,
    lastTapTimes: []
  };

  function ensureAudio() {
    if (!audio.ctx) {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
  }

  function secondsPerBeat() {
    // Convert note value (e.g., quarter=4, eighth=8) into beat duration
    const base = 60 / current.bpm; // quarter note duration
    const noteVal = parseInt(el.note.value, 10);
    return base * (4 / noteVal);
  }

  function click(time, { accent = false, sub = false } = {}) {
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Frequencies: accent > main > sub
    const freq = accent ? 2000 : sub ? 1200 : 1600;
    osc.frequency.value = freq;
    osc.type = 'square';

    // Short envelope
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.6, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  function schedule() {
    const ctx = audio.ctx;
    const sPerBeat = secondsPerBeat();
    while (audio.nextTick < ctx.currentTime + audio.scheduleHorizon) {
      const isFirst = current.beatInBar === 0;
      const doAccent = el.accent.checked && isFirst;
      click(audio.nextTick, { accent: doAccent });

      // Visual pulse synced to main beats
      scheduleVisual(audio.nextTick, current.beatInBar);

      // Subdivision (eighth notes)
      if (el.subdiv.checked) {
        const subTime = audio.nextTick + sPerBeat / 2;
        click(subTime, { sub: true });
      }

      advanceBeat(sPerBeat);
    }
  }

  function scheduleVisual(time, beatIndex) {
    const s = Math.max(0, time - audio.ctx.currentTime) * 1000;
    setTimeout(() => {
      updatePips(beatIndex);
    }, s);
  }

  function advanceBeat(sPerBeat) {
    const beatsInBar = parseInt(el.beats.value, 10);
    current.beatInBar = (current.beatInBar + 1) % beatsInBar;
    audio.nextTick += sPerBeat;
  }

  function start() {
    ensureAudio();
    if (current.running) return;
    current.running = true;

    // Align nextTick to the future
    const sPerBeat = secondsPerBeat();
    audio.nextTick = audio.ctx.currentTime + 0.05;
    current.beatInBar = 0;

    audio.timer = setInterval(() => {
      schedule();
    }, audio.lookaheadMs);

    updateStartStop(true);
  }

  function stop() {
    if (!current.running) return;
    current.running = false;
    clearInterval(audio.timer);
    audio.timer = null;
    updateStartStop(false);
  }

  function toggle() { current.running ? stop() : start(); }

  function setBpm(v) {
    const bpm = clamp(Math.round(Number(v) || 0), Number(el.bpmSlider.min), Number(el.bpmSlider.max));
    current.bpm = bpm;
    el.bpmSlider.value = String(bpm);
    el.bpmNumber.value = String(bpm);
    el.bpmSlider.setAttribute('aria-valuenow', String(bpm));
    if (current.running) {
      // Recompute schedule base without stopping
      audio.nextTick = Math.max(audio.nextTick, audio.ctx.currentTime + 0.05);
    }
    save();
  }

  function updateStartStop(on) {
    el.startStop.textContent = on ? 'Stop' : 'Start';
    el.startStop.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function rebuildPips() {
    const beatsInBar = parseInt(el.beats.value, 10);
    el.pips.innerHTML = '';
    for (let i = 0; i < beatsInBar; i++) {
      const d = document.createElement('div');
      d.className = 'pip' + (i === 0 && el.accent.checked ? ' active' : '');
      el.pips.appendChild(d);
    }
  }

  function updatePips(activeIndex) {
    const nodes = el.pips.querySelectorAll('.pip');
    nodes.forEach((n, i) => {
      n.classList.toggle('active', i === activeIndex);
    });
  }

  // Tap tempo: average last 4 intervals within 2s
  function handleTap() {
    const now = performance.now();
    const t = current.lastTapTimes;
    t.push(now);
    // Keep only recent taps
    while (t.length > 1 && now - t[0] > 2000) t.shift();
    if (t.length >= 2) {
      const intervals = [];
      for (let i = 1; i < t.length; i++) intervals.push(t[i] - t[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = clamp(Math.round(60000 / avg), 20, 240);
      setBpm(bpm);
    }
  }

  // Events
  el.bpmSlider.addEventListener('input', e => setBpm(e.target.value));
  function commitBpmNumber() {
    const v = el.bpmNumber.value.trim();
    if (v === '') {
      // Revert to current BPM if left empty
      el.bpmNumber.value = String(current.bpm);
      return;
    }
    setBpm(v);
  }
  // Allow clearing while typing without immediate coercion
  el.bpmNumber.addEventListener('input', e => {
    if (e.target.value === '') return; // allow blank state
    // Do not call setBpm here to avoid fighting user input
  });
  el.bpmNumber.addEventListener('change', commitBpmNumber);
  el.bpmNumber.addEventListener('blur', commitBpmNumber);
  el.bpmNumber.addEventListener('keydown', e => {
    if (e.key === 'Enter') { commitBpmNumber(); el.bpmNumber.blur(); }
  });
  el.inc.addEventListener('click', () => setBpm(current.bpm + 1));
  el.dec.addEventListener('click', () => setBpm(current.bpm - 1));
  el.beats.addEventListener('change', () => { rebuildPips(); save(); });
  el.note.addEventListener('change', () => save());
  el.accent.addEventListener('change', () => { rebuildPips(); save(); });
  el.subdiv.addEventListener('change', () => save());
  if (el.themeToggle) {
    el.themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
      setTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
  }
  el.startStop.addEventListener('click', toggle);
  el.tap.addEventListener('click', handleTap);
  el.reset.addEventListener('click', () => {
    setBpm(100);
    el.beats.value = '4';
    el.note.value = '4';
    el.accent.checked = true;
    el.subdiv.checked = false;
    if (el.themeToggle) el.themeToggle.setAttribute('aria-pressed', getPreferredTheme() === 'light' ? 'true' : 'false');
    rebuildPips();
    save();
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key.toLowerCase() === 't') { handleTap(); }
    else if (e.key === 'ArrowUp') { setBpm(current.bpm + 1); }
    else if (e.key === 'ArrowDown') { setBpm(current.bpm - 1); }
    else if (e.key === 'ArrowRight') { setBpm(current.bpm + 0.1); }
    else if (e.key === 'ArrowLeft') { setBpm(current.bpm - 0.1); }
  });

  // Init
  function init() {
    // Theme first
    setTheme(getPreferredTheme());
    setBpm(Number(el.bpmSlider.value));
    load();
    rebuildPips();
    // Prepare AudioContext on first user gesture (start/click) automatically
    ['click','keydown','touchstart'].forEach(evt => {
      window.addEventListener(evt, ensureAudio, { once: true, passive: true });
    });
    // Pause audio when tab hidden, resume timing on visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Don't auto-stop; browsers may throttle timers
        // We simply let scheduling realign upon visibility
      } else if (current.running && audio.ctx) {
        audio.nextTick = Math.max(audio.ctx.currentTime + 0.05, audio.nextTick);
      }
    });
  }

  init();
})();
