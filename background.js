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
      handleStart(msg.tabId).catch((err) => {
        state.error = err.message;
      });
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
      // Download is triggered directly by offscreen.js (avoids IPC size limits).
      // Background only updates state here.
      state.isRecording = false;
      state.startTime = null;
      state.lastFilename = msg.filename;
      return true;

    case 'RECORDING_ERROR':
      state.isRecording = false;
      state.startTime = null;
      state.error = msg.error;
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

  // Tell offscreen to start recording
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_RECORDING', streamId });
}
