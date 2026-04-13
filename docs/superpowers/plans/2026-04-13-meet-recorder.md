# Meet Recorder Chrome Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that records Google Meet calls with both microphone and tab audio mixed into a single WebM file, downloaded automatically on stop.

**Architecture:** Popup triggers recording → background service worker calls `chrome.tabCapture.getMediaStreamId()` and creates an offscreen document → offscreen document captures both audio sources, mixes them via Web Audio API, records with MediaRecorder, and sends the blob back → background triggers auto-download.

**Tech Stack:** Manifest V3 Chrome Extension APIs (`tabCapture`, `offscreen`, `downloads`), Web Audio API, MediaRecorder API, Jest (unit tests), pngjs (icon generation)

---

## File Map

| File | Responsibility |
|------|---------------|
| `manifest.json` | Extension config, permissions, entry points |
| `utils.js` | Pure functions: `formatTime`, `generateFilename` |
| `utils.test.js` | Jest unit tests for utils.js |
| `background.js` | Service worker: state, tab capture, offscreen lifecycle, download trigger |
| `offscreen.html` | Minimal HTML host for offscreen document |
| `offscreen.js` | Audio capture (tab + mic), Web Audio mixing, MediaRecorder |
| `popup.html` | Extension popup markup (3 views: idle, recording, saved) |
| `popup.js` | Popup logic: start/stop, polling, timer display |
| `icons/icon-16.png` | Toolbar icon |
| `icons/icon-48.png` | Extension management icon |
| `icons/icon-128.png` | Chrome Web Store / install icon |
| `create-icons.js` | Dev script to generate PNG icons (run once) |
| `package.json` | Dev dependencies: jest, pngjs |

---

## Message Protocol

All inter-context messages carry a `target` field so each context only processes its own messages.

| From | To | Message |
|------|----|---------|
| popup | background | `{ target:'background', type:'GET_STATE' }` |
| popup | background | `{ target:'background', type:'START_RECORDING', tabId }` |
| popup | background | `{ target:'background', type:'STOP_RECORDING' }` |
| background | offscreen | `{ target:'offscreen', type:'START_RECORDING', streamId }` |
| background | offscreen | `{ target:'offscreen', type:'STOP_RECORDING' }` |
| offscreen | background | `{ target:'background', type:'RECORDING_STARTED' }` |
| offscreen | background | `{ target:'background', type:'RECORDING_COMPLETE', data: dataURL }` |

---

## Task 1: Scaffold

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `icons/` (empty directory, filled in Task 3)

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Meet Recorder",
  "version": "1.0.0",
  "description": "Record Google Meet calls with mic and computer audio merged into one file",
  "permissions": ["tabCapture", "offscreen", "downloads", "activeTab"],
  "host_permissions": ["https://meet.google.com/*"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "background.js"
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "meet-recorder",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "jest",
    "create-icons": "node create-icons.js"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "pngjs": "^7.0.0"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Install dev dependencies**

```bash
cd /Users/eduardobilato/dev/edu/chrome-extension
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 4: Create icons directory**

```bash
mkdir -p icons
```

- [ ] **Step 5: Commit**

```bash
git init
git add manifest.json package.json package-lock.json
git commit -m "chore: scaffold manifest and dev dependencies"
```

---

## Task 2: Utility Functions (TDD)

**Files:**
- Create: `utils.js`
- Create: `utils.test.js`

- [ ] **Step 1: Write failing tests**

Create `utils.test.js`:

```javascript
const { formatTime, generateFilename } = require('./utils');

describe('formatTime', () => {
  test('formats zero seconds', () => {
    expect(formatTime(0)).toBe('00:00');
  });
  test('formats seconds under a minute', () => {
    expect(formatTime(45)).toBe('00:45');
  });
  test('formats minutes and seconds', () => {
    expect(formatTime(272)).toBe('04:32');
  });
  test('formats hours when >= 3600 seconds', () => {
    expect(formatTime(3661)).toBe('01:01:01');
  });
  test('pads all segments to 2 digits', () => {
    expect(formatTime(3600)).toBe('01:00:00');
  });
});

describe('generateFilename', () => {
  test('generates correct filename with zero-padded parts', () => {
    const date = new Date(2026, 3, 13, 14, 30); // April 13 2026, 14:30
    expect(generateFilename(date)).toBe('meet-recording-2026-04-13-14-30.webm');
  });
  test('pads single-digit month, day, hour, minute', () => {
    const date = new Date(2026, 0, 5, 9, 7); // Jan 5 2026, 09:07
    expect(generateFilename(date)).toBe('meet-recording-2026-01-05-09-07.webm');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx jest utils.test.js
```

Expected: FAIL — "Cannot find module './utils'"

- [ ] **Step 3: Implement `utils.js`**

```javascript
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function generateFilename(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `meet-recording-${year}-${month}-${day}-${hours}-${minutes}.webm`;
}

// Node.js export for Jest; no-op in browser (service worker uses importScripts)
if (typeof module !== 'undefined') {
  module.exports = { formatTime, generateFilename };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest utils.test.js
```

Expected: PASS — 7 tests passing.

- [ ] **Step 5: Commit**

```bash
git add utils.js utils.test.js
git commit -m "feat: add formatTime and generateFilename utilities with tests"
```

---

## Task 3: Icons

**Files:**
- Create: `create-icons.js`
- Create: `icons/icon-16.png`, `icons/icon-48.png`, `icons/icon-128.png`

- [ ] **Step 1: Create `create-icons.js`**

```javascript
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// Purple circle (#6366f1) on dark background (#1e1e2e)
function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        png.data[idx]     = 0x63; // R
        png.data[idx + 1] = 0x66; // G
        png.data[idx + 2] = 0xf1; // B
        png.data[idx + 3] = 0xff; // A
      } else {
        png.data[idx]     = 0x1e;
        png.data[idx + 1] = 0x1e;
        png.data[idx + 2] = 0x2e;
        png.data[idx + 3] = 0xff;
      }
    }
  }

  const buf = PNG.sync.write(png);
  const outPath = path.join(__dirname, 'icons', `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Created ${outPath}`);
}

[16, 48, 128].forEach(createIcon);
```

- [ ] **Step 2: Generate icons**

```bash
node create-icons.js
```

Expected output:
```
Created .../icons/icon-16.png
Created .../icons/icon-48.png
Created .../icons/icon-128.png
```

- [ ] **Step 3: Commit**

```bash
git add icons/ create-icons.js
git commit -m "chore: add extension icons"
```

---

## Task 4: Offscreen Document

**Files:**
- Create: `offscreen.html`
- Create: `offscreen.js`

- [ ] **Step 1: Create `offscreen.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>offscreen</title></head>
<body><script src="offscreen.js"></script></body>
</html>
```

- [ ] **Step 2: Create `offscreen.js`**

```javascript
let mediaRecorder = null;
let chunks = [];
let audioCtx = null;

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'START_RECORDING') {
    await startRecording(msg.streamId);
  } else if (msg.type === 'STOP_RECORDING') {
    stopRecording();
  }
});

async function startRecording(streamId) {
  // Capture tab audio using the stream ID obtained by tabCapture in background
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Capture microphone
  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false,
  });

  // Mix both streams: tab + mic → single destination
  audioCtx = new AudioContext();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  const micSource = audioCtx.createMediaStreamSource(micStream);
  const destination = audioCtx.createMediaStreamDestination();
  tabSource.connect(destination);
  micSource.connect(destination);

  // Record the merged stream
  chunks = [];
  mediaRecorder = new MediaRecorder(destination.stream, {
    mimeType: 'audio/webm;codecs=opus',
  });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const reader = new FileReader();
    reader.onloadend = () => {
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'RECORDING_COMPLETE',
        data: reader.result, // base64 data URL
      });
    };
    reader.readAsDataURL(blob);
    audioCtx.close();
    audioCtx = null;
    mediaRecorder = null;
    chunks = [];
  };

  // Auto-stop if the Meet tab is closed or navigated away mid-recording
  tabStream.getTracks().forEach(track => {
    track.onended = () => stopRecording();
  });

  mediaRecorder.start();

  chrome.runtime.sendMessage({ target: 'background', type: 'RECORDING_STARTED' });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add offscreen.html offscreen.js
git commit -m "feat: add offscreen document for audio capture and mixing"
```

---

## Task 5: Background Service Worker

**Files:**
- Create: `background.js`

- [ ] **Step 1: Create `background.js`**

```javascript
importScripts('utils.js');

// In-memory state (service worker may restart; popup always re-queries on open)
let state = {
  isRecording: false,
  startTime: null,
  lastFilename: null,
  error: null,
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== 'background') return;

  switch (msg.type) {
    case 'GET_STATE':
      sendResponse({ ...state });
      return true;

    case 'START_RECORDING':
      handleStart(msg.tabId)
        .catch(err => { state.error = err.message; });
      sendResponse({ ok: true });
      return true;

    case 'STOP_RECORDING':
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
      sendResponse({ ok: true });
      return true;

    case 'RECORDING_STARTED':
      state.isRecording = true;
      state.startTime = Date.now();
      state.error = null;
      return true;

    case 'RECORDING_COMPLETE':
      state.isRecording = false;
      state.startTime = null;
      state.lastFilename = generateFilename();
      chrome.downloads.download({
        url: msg.data,
        filename: state.lastFilename,
        saveAs: false,
      });
      return true;
  }
});

async function handleStart(tabId) {
  // Get a stream ID that the offscreen document can use with getUserMedia
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

  // Create offscreen document if it doesn't exist yet
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Capture Google Meet tab audio and microphone for recording',
    });
  }

  // Tell offscreen to start
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_RECORDING', streamId });
}
```

- [ ] **Step 2: Commit**

```bash
git add background.js
git commit -m "feat: add background service worker for recording coordination"
```

---

## Task 6: Popup

**Files:**
- Create: `popup.html`
- Create: `popup.js`

- [ ] **Step 1: Create `popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Meet Recorder</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      width: 280px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      padding: 20px;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-idle     { background: #585b70; }
    .dot-recording { background: #f38ba8; animation: pulse 1.2s infinite; }
    .dot-saved    { background: #a6e3a1; }

    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }

    .header-label { font-size: 13px; color: #a6adc8; }
    .header-timer { margin-left: auto; font-variant-numeric: tabular-nums; color: #cdd6f4; }

    .subtitle {
      font-size: 12px;
      color: #6c7086;
      text-align: center;
      margin-bottom: 16px;
      min-height: 16px;
    }

    button {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s;
    }
    button:disabled { opacity: .4; cursor: not-allowed; }
    button:not(:disabled):hover { opacity: .88; }

    .btn-start { background: #6366f1; color: #fff; }
    .btn-stop  { background: #f38ba8; color: #1e1e2e; }
    .btn-new   { background: #6366f1; color: #fff; }

    .audio-row {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      font-size: 11px;
      color: #585b70;
    }
    .audio-row.active { color: #a6e3a1; }
  </style>
</head>
<body>

  <!-- Idle view -->
  <div id="idle-view">
    <div class="header">
      <div class="dot dot-idle"></div>
      <span class="header-label">Meet Recorder</span>
    </div>
    <p class="subtitle" id="idle-hint">Open a Google Meet tab to record</p>
    <button class="btn-start" id="start-btn" disabled>⏺ Start Recording</button>
    <div class="audio-row">
      <span>🎙 Microphone</span>
      <span>🔊 Tab Audio</span>
    </div>
  </div>

  <!-- Recording view -->
  <div id="recording-view" style="display:none">
    <div class="header">
      <div class="dot dot-recording"></div>
      <span class="header-label" style="color:#f38ba8">Recording…</span>
      <span class="header-timer" id="timer">00:00</span>
    </div>
    <p class="subtitle" id="tab-info"></p>
    <button class="btn-stop" id="stop-btn">⏹ Stop &amp; Save</button>
    <div class="audio-row active">
      <span>✓ Microphone active</span>
      <span>✓ Tab audio active</span>
    </div>
  </div>

  <!-- Saved view -->
  <div id="saved-view" style="display:none">
    <div class="header">
      <div class="dot dot-saved"></div>
      <span class="header-label" style="color:#a6e3a1">Saved!</span>
    </div>
    <p class="subtitle" id="saved-filename">Downloading to Downloads…</p>
    <button class="btn-new" id="new-btn">⏺ Start New Recording</button>
  </div>

  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup.js`**

```javascript
// formatTime defined here (popup can't use importScripts; avoids a second <script> tag)
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = n => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

let pollInterval = null;
let stopping = false;

document.addEventListener('DOMContentLoaded', async () => {
  const idleView     = document.getElementById('idle-view');
  const recordingView = document.getElementById('recording-view');
  const savedView    = document.getElementById('saved-view');
  const startBtn     = document.getElementById('start-btn');
  const stopBtn      = document.getElementById('stop-btn');
  const newBtn       = document.getElementById('new-btn');
  const idleHint     = document.getElementById('idle-hint');
  const timerEl      = document.getElementById('timer');
  const tabInfoEl    = document.getElementById('tab-info');
  const savedFilename = document.getElementById('saved-filename');

  // Detect if on a Meet tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isMeetTab = tab?.url?.startsWith('https://meet.google.com/');

  if (isMeetTab) {
    startBtn.disabled = false;
    idleHint.textContent = tab.url.replace('https://meet.google.com/', '');
  }

  // Sync with existing background state (e.g. popup was closed during recording)
  const bgState = await chrome.runtime.sendMessage({ target: 'background', type: 'GET_STATE' });
  if (bgState.isRecording) {
    show(recordingView);
    if (bgState.startTime) {
      const elapsed = Math.floor((Date.now() - bgState.startTime) / 1000);
      timerEl.textContent = formatTime(elapsed);
    }
    startPoll();
  }

  startBtn.addEventListener('click', async () => {
    if (!isMeetTab) return;
    await chrome.runtime.sendMessage({ target: 'background', type: 'START_RECORDING', tabId: tab.id });
    tabInfoEl.textContent = tab.url.replace('https://meet.google.com/', '');
    show(recordingView);
    startPoll();
  });

  stopBtn.addEventListener('click', async () => {
    stopping = true;
    stopBtn.disabled = true;
    await chrome.runtime.sendMessage({ target: 'background', type: 'STOP_RECORDING' });
    // Poll will detect isRecording → false and show saved view
  });

  newBtn.addEventListener('click', () => {
    stopping = false;
    show(idleView);
  });

  function startPoll() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      const s = await chrome.runtime.sendMessage({ target: 'background', type: 'GET_STATE' });
      if (stopping && !s.isRecording) {
        clearInterval(pollInterval);
        pollInterval = null;
        savedFilename.textContent = s.lastFilename
          ? `${s.lastFilename} — downloading…`
          : 'Downloading to Downloads…';
        show(savedView);
        return;
      }
      if (s.startTime) {
        timerEl.textContent = formatTime(Math.floor((Date.now() - s.startTime) / 1000));
      }
    }, 1000);
  }

  function show(view) {
    [idleView, recordingView, savedView].forEach(v => (v.style.display = 'none'));
    view.style.display = '';
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add popup.html popup.js
git commit -m "feat: add popup UI with idle, recording, and saved states"
```

---

## Task 7: End-to-End Verification

- [ ] **Step 1: Load the extension**

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `/Users/eduardobilato/dev/edu/chrome-extension`
4. Confirm "Meet Recorder" appears with the purple circle icon

- [ ] **Step 2: Test idle state — non-Meet tab**

1. Open any non-Meet tab (e.g. `chrome://newtab`)
2. Click the extension icon
3. Expected: popup shows idle view, "Start Recording" button is **disabled**, hint text says "Open a Google Meet tab to record"

- [ ] **Step 3: Test idle state — Meet tab**

1. Open `https://meet.google.com` (or join/create a call)
2. Click the extension icon
3. Expected: "Start Recording" button is **enabled**, subtitle shows the Meet path

- [ ] **Step 4: Test recording start**

1. On the Meet tab, click the extension icon → click **Start Recording**
2. Chrome will prompt for microphone permission — click **Allow**
3. Expected: popup switches to recording view, timer starts counting up, dots animate red

- [ ] **Step 5: Test popup resilience**

1. While recording, close the popup
2. Reopen the popup
3. Expected: popup reopens in recording view with the timer already counting (not reset to 00:00)

- [ ] **Step 6: Test stop and download**

1. Click **Stop & Save**
2. Expected: popup switches to saved view showing the filename
3. Check your Downloads folder for `meet-recording-YYYY-MM-DD-HH-MM.webm`

- [ ] **Step 7: Verify audio content**

1. Open the `.webm` file in VLC (`open -a VLC meet-recording-*.webm`)
2. Speak into your mic during the recording and play audio in the Meet tab
3. Expected: both your voice (mic) and remote audio (tab) are audible in the recording
