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
    idleHint.textContent = tab.url.replace('https://meet.google.com/', '');
  }

  // Sync with background state (e.g. popup was closed and reopened during recording)
  const bgState = await chrome.runtime.sendMessage({ target: 'background', type: 'GET_STATE' });
  if (bgState.error) {
    errorText.textContent = bgState.error;
  }
  if (bgState.isRecording) {
    tabInfoEl.textContent = isMeetTab ? tab.url.replace('https://meet.google.com/', '') : '';
    show(recordingView);
    if (bgState.startTime) {
      timerEl.textContent = formatTime(Math.floor((Date.now() - bgState.startTime) / 1000));
    }
    startPoll();
  }

  startBtn.addEventListener('click', async () => {
    if (!isMeetTab) return;
    errorText.textContent = '';
    await chrome.runtime.sendMessage({ target: 'background', type: 'START_RECORDING', tabId: tab.id });
    tabInfoEl.textContent = tab.url.replace('https://meet.google.com/', '');
    show(recordingView);
    startPoll();
  });

  stopBtn.addEventListener('click', async () => {
    stopping = true;
    stopBtn.disabled = true;
    await chrome.runtime.sendMessage({ target: 'background', type: 'STOP_RECORDING' });
    // Poll detects isRecording → false and transitions to saved view
  });

  newBtn.addEventListener('click', () => {
    stopping = false;
    errorText.textContent = '';
    show(idleView);
  });

  function startPoll() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      const s = await chrome.runtime.sendMessage({ target: 'background', type: 'GET_STATE' });

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
