# Metronome (HTML/CSS/JS)

[![GitHub Pages – Live](https://img.shields.io/badge/GitHub%20Pages-Live-7c3aed?logo=github)](https://nieldakarla.github.io/metronome/)


A lightweight, precise metronome that runs entirely in the browser using the Web Audio API. No dependencies.

## Features

- Precise Web Audio ticks with short envelopes
- Tempo: 20–240 BPM with slider and number input
- Subdivision modes: quarter, eighths, sixteenths, triplets, swing triplet
- Adjustable beats per measure (1–12)
- Elapsed timer that runs with playback
- Accent first beat (toggle)
- Optional eighth-note subdivision
- Tap tempo (averages recent taps)
- Per-beat pips indicator
- Keyboard shortcuts for quick control
- Remembers your last settings via `localStorage`

## Run

- Option 1: Just open `index.html` in your browser.
- Option 2: Serve the folder using any static server, e.g. Python:
  - `python3 -m http.server 8000` then visit `http://localhost:8000/`

## Live Site

- https://nieldakarla.github.io/metronome/

Most browsers require a user interaction to start audio. Click Start or press Space once if you see no sound initially.

## Keyboard Shortcuts

- Space: Start/Stop
- T: Tap tempo
- Up/Down: +1 / -1 BPM
- Left/Right: ±0.1 BPM fine adjust

## Files

- `index.html` — UI structure
- `styles.css` — Layout and visual design
- `script.js` — Metronome engine and interactions

## Notes

- Timing: Uses a scheduler with a short lookahead to queue clicks precisely into the audio timeline.
- Subdivision: Adds an eighth-note click at half the beat duration.
- Accessibility: Uses `aria-pressed`, labels, and clear focus outlines.
