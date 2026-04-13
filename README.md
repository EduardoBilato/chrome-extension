# Meet Recorder

A Chrome extension that records Google Meet calls with both your **microphone** and **computer audio** (remote participants) merged into a single `.webm` file — no virtual audio drivers required.

---

## How It Works

- Click the extension icon on a Google Meet tab
- Click **Start Recording** — Chrome asks for mic permission once
- Both your mic and the Meet tab audio are captured and mixed in real time
- Click **Stop & Save** — the recording downloads automatically to your Downloads folder

---

## Installation

### Prerequisites

- Google Chrome (version 116 or later)
- Node.js (only needed to run tests or regenerate icons)

### Load the extension in Chrome

1. Clone or download this repository to your machine
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** using the toggle in the top-right corner
4. Click **Load unpacked**
5. Select the project folder (`chrome-extension/`)
6. The **Meet Recorder** icon (purple circle) will appear in your Chrome toolbar

> If you don't see the icon, click the puzzle piece icon in the toolbar and pin Meet Recorder.

---

## Usage

1. Open a Google Meet call at `https://meet.google.com`
2. Click the **Meet Recorder** icon in the toolbar
3. Click **⏺ Start Recording**
4. Grant microphone access when Chrome prompts (first time only)
5. The popup switches to the recording view with a live timer
6. When done, click **⏹ Stop & Save**
7. The file `meet-recording-YYYY-MM-DD-HH-MM.webm` downloads automatically to your Downloads folder
8. Open the file in VLC, QuickTime, or any media player — both your voice and remote participants will be audible

---

## Development

### Install dependencies

```bash
npm install
```

### Run tests

```bash
npm test
```

10 unit tests covering `formatTime` and `generateFilename`.

### Regenerate icons

```bash
node create-icons.js
```

Recreates `icons/icon-16.png`, `icons/icon-48.png`, and `icons/icon-128.png` (purple circle on dark background).

---

## File Structure

```
manifest.json       Extension config and permissions (Manifest V3)
background.js       Service worker — coordinates recording, manages offscreen document
offscreen.html      Hidden document host for audio processing
offscreen.js        Captures tab + mic audio, mixes via Web Audio API, records as WebM
popup.html          Extension popup UI (3 states: idle, recording, saved)
popup.js            Popup logic — start/stop, live timer, state sync
utils.js            Pure utilities: formatTime, generateFilename
utils.test.js       Jest unit tests
create-icons.js     Dev script to generate PNG icons
icons/              Extension icons (16×16, 48×48, 128×128)
```

---

## Known Limitations

- Recording quality depends on the browser's Opus encoder (~64 kbps by default)
- The extension only activates on `meet.google.com` tabs
- Very long recordings (> 1 hour) may produce large files; disk space is the only constraint
- If the Meet tab is closed mid-recording, the recording stops automatically and saves whatever was captured
