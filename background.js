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
      state.lastFilename = null; // clear previous recording on new start
      handleStart(msg.tabId).catch((err) => {
        state.error = String(err.message ?? err);
        state.isRecording = false;
        state.startTime = null;
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
      return;

    case 'RECORDING_COMPLETE':
      state.isRecording = false;
      state.startTime = null;
      state.lastFilename = msg.filename;
      // Trigger download from the service worker (offscreen docs lack chrome.downloads)
      chrome.downloads.download({ url: msg.data, filename: msg.filename, saveAs: false });
      return;

    case 'RECORDING_ERROR':
      state.isRecording = false;
      state.startTime = null;
      state.error = String(msg.error ?? 'Unknown error');
      return;
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
      reasons: ['DISPLAY_MEDIA'],
      justification: 'Capture Google Meet tab audio and microphone for recording',
    });
  }

  // Small delay to let offscreen document initialize its message listener
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Tell offscreen to start recording — await to catch "no receiver" errors
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_RECORDING', streamId });
  } catch (err) {
    // "Could not establish connection" means offscreen isn't ready — rethrow to trigger RECORDING_ERROR
    throw new Error(`Failed to reach offscreen document: ${err.message}`);
  }
}
