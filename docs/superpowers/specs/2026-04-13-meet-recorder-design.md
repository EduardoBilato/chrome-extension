# Google Meet Recorder — Design Spec

**Date:** 2026-04-13  
**Status:** Approved

## Context

The user needs to record Google Meet calls capturing both their own microphone and the remote participants' audio (computer sound) into a single file. macOS's native audio routing makes this hard without tools like Loopback. This Chrome extension solves it simply: click record in a popup, get a `.webm` file in Downloads when done.

---

## What We're Building

A Manifest V3 Chrome extension with:
- A **popup** for start/stop control and status display
- A **background service worker** that coordinates capture
- An **offscreen document** that performs audio mixing and recording
- Auto-download of the merged recording as a WebM file

---

## Architecture

```
User clicks Start
      │
      ▼
popup.js  ──sendMessage──▶  background.js
                                  │
                          tabCapture.getMediaStreamId(tabId)
                                  │
                          create offscreen document (if needed)
                                  │
                          send { streamId } to offscreen.js
                                  │
                                  ▼
                            offscreen.js
                          ┌─────────────────────────────────────┐
                          │  getUserMedia(tab stream ID)         │
                          │  getUserMedia(mic)                   │
                          │  AudioContext → mix both streams     │
                          │  MediaRecorder → record as WebM      │
                          └─────────────────────────────────────┘
                                  │
                          User clicks Stop
                                  │
                          MediaRecorder.stop() → Blob
                          send blob (base64) to background.js
                                  │
                          chrome.downloads.download(dataURL)
                          filename: meet-recording-YYYY-MM-DD-HH-MM.webm
```

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, permissions |
| `popup.html` | Popup markup |
| `popup.js` | Start/stop UI logic, live timer, status |
| `background.js` | Service worker: tab capture coordination, offscreen management, download trigger |
| `offscreen.html` | Minimal HTML page to host offscreen document |
| `offscreen.js` | Audio capture, Web Audio mixing, MediaRecorder |
| `icons/icon-16.png`, `icon-48.png`, `icon-128.png` | Extension icons |

---

## Permissions (manifest.json)

```json
{
  "permissions": ["tabCapture", "offscreen", "downloads", "activeTab"],
  "host_permissions": ["https://meet.google.com/*"]
}
```

- `tabCapture` — capture tab audio stream
- `offscreen` — create the hidden offscreen document
- `downloads` — trigger auto-download
- `activeTab` — access the current tab's ID

---

## Key Technical Details

### Tab Audio Capture (MV3 pattern)
`chrome.tabCapture.capture()` cannot be called from a service worker. Instead:
1. Background calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` → gets a `streamId`
2. Offscreen document calls `navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } })` → gets the tab's MediaStream

### Audio Mixing (Web Audio API)
```
TabStream ──► MediaStreamSource ──┐
                                   ├──► MediaStreamDestination ──► MediaRecorder
MicStream ──► MediaStreamSource ──┘
```
Both sources connect to a single `MediaStreamDestination`. No gain adjustments needed for MVP.

### Recording Format
- MediaRecorder with `{ mimeType: 'audio/webm;codecs=opus' }`
- Collect chunks in array, combine into Blob on stop
- Convert to base64 data URL, send to background, trigger download

### Popup States
1. **Idle** — "Start Recording" button, note to open a Meet tab
2. **Recording** — live timer (popup receives `startTime` from background on open, runs its own `setInterval` to compute elapsed time locally), "Stop & Save" button, confirms mic + tab audio active
3. **Saved** — filename shown, "Start New Recording" available

### State Persistence
Background service worker tracks recording state in memory (`isRecording`, `startTime`, `tabId`). Popup queries state on open via `chrome.runtime.sendMessage({ type: 'GET_STATE' })`.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Not on a Meet tab | Start button disabled with hint text |
| Mic permission denied | Show error in popup: "Microphone access denied" |
| Tab closed mid-recording | Offscreen detects stream end → auto-stops and downloads |

---

## Verification

1. Load extension via `chrome://extensions` → "Load unpacked" → select project folder
2. Open `meet.google.com` (any call or preview page)
3. Click extension icon → popup shows idle state
4. Click "Start Recording" → browser prompts for mic permission → popup switches to recording state with timer
5. Speak and play audio from another participant (or a test video in the Meet tab)
6. Click "Stop & Save" → file `meet-recording-*.webm` downloads automatically
7. Open the file in VLC or QuickTime → confirm both mic voice and remote audio are audible
