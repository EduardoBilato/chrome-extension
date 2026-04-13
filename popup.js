// formatTime defined here — popup.js can't use importScripts (service-worker-only API)
function formatTime(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const pad = n => String(n).padStart(2, '0');
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// Helper to safely send messages to background; returns null if unavailable
async function sendMsg(msg) {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch {
    return null; // background unavailable (service worker restarting)
  }
}

let pollInterval = null;
let stopping = false;

document.addEventListener('DOMContentLoaded', async () => {
  const idleView      = document.getElementById('idle-view');
  const recordingView = document.getElementById('recording-view');
  const savedView     = document.getElementById('saved-view');
  const startBtn      = document.getElementById('start-btn');
  const stopBtn       = document.getElementById('stop-btn');
  const newBtn        = document.getElementById('new-btn');
  const idleHint      = document.getElementById('idle-hint');
  const timerEl       = document.getElementById('timer');
  const tabInfoEl     = document.getElementById('tab-info');
  const savedFilename = document.getElementById('saved-filename');
  const errorText     = document.getElementById('error-text');

  // Detect if on a Meet tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isMeetTab = tab?.url?.startsWith('https://meet.google.com/');

  if (isMeetTab) {
    startBtn.disabled = false;
    idleHint.textContent = tab.url.replace('https://meet.google.com/', '').split('?')[0];
  }

  // Sync with background state (e.g. popup was closed and reopened during recording)
  const bgState = await sendMsg({ target: 'background', type: 'GET_STATE' });
  if (!bgState) return;

  if (bgState.error) {
    errorText.textContent = bgState.error;
  }
  if (bgState.isRecording) {
    tabInfoEl.textContent = isMeetTab ? tab.url.replace('https://meet.google.com/', '').split('?')[0] : '';
    show(recordingView);
    if (bgState.startTime) {
      timerEl.textContent = formatTime(Math.floor((Date.now() - bgState.startTime) / 1000));
    }
    startPoll();
  } else if (!bgState.isRecording && bgState.lastFilename) {
    savedFilename.textContent = `${bgState.lastFilename} — downloading…`;
    show(savedView);
  }

  startBtn.addEventListener('click', async () => {
    if (!isMeetTab) return;
    startBtn.disabled = true;
    errorText.textContent = '';

    // Check mic permission state before doing anything.
    // On macOS, calling getUserMedia() directly from an extension popup causes the
    // popup to close (it loses focus when Chrome shows the permission sheet), which
    // rejects the promise with "Permission dismissed". Instead we check the state:
    //  - granted: proceed directly, no dialog needed
    //  - prompt:  open a real tab (stays open during the dialog) for the one-time grant
    //  - denied:  show a friendly error
    let micState = 'prompt';
    try {
      const perm = await navigator.permissions.query({ name: 'microphone' });
      micState = perm.state;
    } catch {
      // permissions API unavailable — fall through and attempt recording anyway
      micState = 'granted';
    }

    if (micState === 'denied') {
      errorText.textContent = 'Microphone blocked. Open chrome://settings/content/microphone to allow access.';
      startBtn.disabled = false;
      return;
    }

    if (micState === 'prompt') {
      // Open a dedicated tab — unlike a popup, a tab stays open when the
      // permission dialog appears, so the user can actually click Allow.
      await chrome.tabs.create({ url: chrome.runtime.getURL('permissions.html') });
      window.close();
      return;
    }

    // Permission already granted — start recording immediately
    await sendMsg({ target: 'background', type: 'START_RECORDING', tabId: tab.id });
    tabInfoEl.textContent = tab.url.replace('https://meet.google.com/', '').split('?')[0];
    show(recordingView);
    startPoll();
  });

  stopBtn.addEventListener('click', async () => {
    stopping = true;
    stopBtn.disabled = true;
    await sendMsg({ target: 'background', type: 'STOP_RECORDING' });
    // Poll detects isRecording → false and transitions to saved view
  });

  newBtn.addEventListener('click', () => {
    stopping = false;
    errorText.textContent = '';
    show(idleView);
  });

  window.addEventListener('pagehide', () => {
    if (pollInterval) clearInterval(pollInterval);
  });

  function startPoll() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      const s = await sendMsg({ target: 'background', type: 'GET_STATE' });
      if (!s) return;

      // Show error if background reported one
      if (s.error && !s.isRecording) {
        clearInterval(pollInterval);
        pollInterval = null;
        stopping = false;
        errorText.textContent = s.error;
        show(idleView);
        return;
      }

      // Transition to saved view when stop completes
      if (stopping && !s.isRecording) {
        clearInterval(pollInterval);
        pollInterval = null;
        savedFilename.textContent = s.lastFilename
          ? `${s.lastFilename} — downloading…`
          : 'Downloading to Downloads…';
        show(savedView);
        return;
      }

      // Update live timer
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
