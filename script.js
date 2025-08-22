(() => {
  // State
  const el = {
    bpmSlider: document.getElementById('bpm'),
    bpmNumber: document.getElementById('bpmNumber'),
    dec: document.getElementById('decrease'),
    inc: document.getElementById('increase'),
    accent: document.getElementById('accent'),
    modeButtons: Array.from(document.querySelectorAll('.mode-btn')),
    beatsNumber: document.getElementById('beatsNumber'),
    beatsDec: document.getElementById('beatsDec'),
    beatsInc: document.getElementById('beatsInc'),
    timerDec: document.getElementById('timerDec'),
    timerInc: document.getElementById('timerInc'),
    timerLabelEl: document.querySelector('.timer-label'),
    themeToggle: document.getElementById('themeToggle'),
    startStop: document.getElementById('startStop'),
    tap: document.getElementById('tap'),
    reset: document.getElementById('reset'),
    pips: document.getElementById('pips'),
    elapsed: document.getElementById('elapsed')
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // Persistence
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem('metronome-settings') || '{}');
      if (s.bpm) setBpm(s.bpm);
      if (typeof s.accent === 'boolean') el.accent.checked = s.accent;
      if (s.mode) setMode(s.mode);
      if (s.beats) setBeats(s.beats);
      if (typeof s.timerTargetMs === 'number') setTimerTarget(s.timerTargetMs);
    } catch {}
  };
  const save = () => {
    const s = {
      bpm: current.bpm,
      accent: el.accent.checked,
      mode: current.mode,
      beats: current.beats,
      timerTargetMs: timer.targetMs
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
    lastTapTimes: [],
    mode: 'quarter',
    beats: 4
  };

  // Timer state declared early so save() can reference it safely
  const timer = { running: false, baseMs: 0, startTs: 0, raf: 0, targetMs: 0 };

  function ensureAudio() {
    if (!audio.ctx) {
      audio.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
  }

  function secondsPerBeat() {
    // Base beat is a quarter note at the given BPM
    return 60 / current.bpm;
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

      // Subdivisions by mode
      scheduleSubdivisions(current.mode, audio.nextTick, sPerBeat);

      advanceBeat(sPerBeat);
    }
  }

  function scheduleSubdivisions(mode, baseTime, sPerBeat) {
    const add = (offset) => click(baseTime + offset, { sub: true });
    if (mode === 'eighths') {
      add(sPerBeat / 2);
    } else if (mode === 'sixteenths') {
      add(sPerBeat / 4);
      add(sPerBeat / 2);
      add((3 * sPerBeat) / 4);
    } else if (mode === 'triplets') {
      add(sPerBeat / 3);
      add((2 * sPerBeat) / 3);
    } else if (mode === 'swing') {
      // Swing eighths: off-beat at ~2/3 of the beat (triplet swing)
      add((2 * sPerBeat) / 3);
    }
  }

  function scheduleVisual(time, beatIndex) {
    const s = Math.max(0, time - audio.ctx.currentTime) * 1000;
    setTimeout(() => {
      updatePips(beatIndex);
    }, s);
  }

  function advanceBeat(sPerBeat) {
    const beatsInBar = current.beats;
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
    const beatsInBar = current.beats;
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
  el.accent.addEventListener('change', () => { rebuildPips(); save(); });
  // Mode buttons (radio-like behavior)
  function setMode(mode) {
    if (!mode) return;
    current.mode = mode;
    el.modeButtons.forEach(btn => {
      const on = btn.dataset.mode === mode;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    save();
  }
  el.modeButtons.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Beats per measure
  function setBeats(v) {
    const n = clamp(Math.round(Number(v) || 0), 1, 12);
    current.beats = n;
    if (el.beatsNumber) el.beatsNumber.value = String(n);
    rebuildPips();
    save();
  }
  if (el.beatsNumber) {
    el.beatsNumber.addEventListener('input', e => {
      // allow empty input temporarily
      if (e.target.value === '') return;
    });
    const commitBeats = () => {
      const v = el.beatsNumber.value.trim();
      if (v === '') { el.beatsNumber.value = String(current.beats); return; }
      setBeats(v);
    };
    el.beatsNumber.addEventListener('change', commitBeats);
    el.beatsNumber.addEventListener('blur', commitBeats);
    el.beatsNumber.addEventListener('keydown', e => { if (e.key === 'Enter') { commitBeats(); el.beatsNumber.blur(); } });
    if (el.beatsDec) el.beatsDec.addEventListener('click', () => setBeats(current.beats - 1));
    if (el.beatsInc) el.beatsInc.addEventListener('click', () => setBeats(current.beats + 1));
  }
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
    el.accent.checked = true;
    setMode('quarter');
    setBeats(4);
    if (el.themeToggle) el.themeToggle.setAttribute('aria-pressed', getPreferredTheme() === 'light' ? 'true' : 'false');
    timerReset();
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
    // Ensure one mode active even if no saved state
    setMode(current.mode || 'quarter');
    setBeats(current.beats || 4);
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

  // Timer (elapsed / countdown)
  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const z = n => String(n).padStart(2, '0');
    return h > 0 ? `${z(h)}:${z(m)}:${z(s)}` : `${z(m)}:${z(s)}`;
  }
  function setTimerTarget(ms) {
    timer.targetMs = Math.max(0, Math.floor(ms || 0));
    updateTimerLabel();
    timerUpdate();
  }
  function updateTimerLabel() {
    if (!el.timerLabelEl) return;
    el.timerLabelEl.textContent = timer.targetMs > 0 ? 'Remaining' : 'Elapsed';
  }
  function timerUpdate() {
    if (!el.elapsed) return;
    const now = performance.now();
    const progress = timer.baseMs + (timer.running ? (now - timer.startTs) : 0);
    if (timer.targetMs > 0) {
      const remaining = Math.max(0, timer.targetMs - progress);
      el.elapsed.textContent = formatTime(remaining);
      if (timer.running && remaining <= 0) {
        stop(); // stop metronome and timer when countdown finishes
        return;
      }
    } else {
      el.elapsed.textContent = formatTime(progress);
    }
    if (timer.running) timer.raf = requestAnimationFrame(timerUpdate);
  }
  function timerStart() {
    if (timer.running) return;
    timer.running = true;
    timer.startTs = performance.now();
    cancelAnimationFrame(timer.raf);
    timer.raf = requestAnimationFrame(timerUpdate);
  }
  function timerStop() {
    if (!timer.running) return;
    timer.running = false;
    timer.baseMs += performance.now() - timer.startTs;
    cancelAnimationFrame(timer.raf);
    timerUpdate();
  }
  function timerReset() {
    timer.running = false;
    timer.baseMs = 0;
    timer.startTs = 0;
    cancelAnimationFrame(timer.raf);
    timerUpdate();
  }

  // Integrate timer with transport
  const _start = start, _stop = stop;
  start = function() { _start(); timerStart(); };
  stop = function() { _stop(); timerStop(); };
  // Timer stepper interactions
  const TIMER_STEP_MS = 15000; // 15 seconds per step
  const TIMER_MAX_MS = 99 * 60 * 1000 + 59 * 1000; // 99:59
  function stepTimer(deltaMs) {
    const now = performance.now();
    // Calculate current progress (do not lose elapsed when running)
    const progress = timer.baseMs + (timer.running ? (now - timer.startTs) : 0);
    const nextTarget = Math.min(TIMER_MAX_MS, Math.max(0, (timer.targetMs || 0) + deltaMs));
    setTimerTarget(nextTarget);
    // Keep the display consistent after changing target
    timerUpdate();
    save();
  }
  if (el.timerDec) el.timerDec.addEventListener('click', () => stepTimer(-TIMER_STEP_MS));
  if (el.timerInc) el.timerInc.addEventListener('click', () => stepTimer(+TIMER_STEP_MS));
})();
