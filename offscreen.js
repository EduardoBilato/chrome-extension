let mediaRecorder = null;
let chunks = [];
let audioCtx = null;
let tabStream = null;
let micStream = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;

  if (msg.type === 'START_RECORDING') {
    // Re-entrancy guard: ignore if already recording
    if (mediaRecorder && mediaRecorder.state !== 'inactive') return;
    startRecording(msg.streamId).catch((err) => {
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'RECORDING_ERROR',
        error: err.message,
      });
    });
  } else if (msg.type === 'STOP_RECORDING') {
    stopRecording();
  }
});

async function startRecording(streamId) {
  // Acquire streams — release tabStream if mic acquisition fails
  try {
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  } catch (err) {
    if (tabStream) {
      tabStream.getTracks().forEach((t) => t.stop());
      tabStream = null;
    }
    throw err; // bubbles to .catch() in listener → sends RECORDING_ERROR
  }

  // Mix tab + mic into a single stream
  audioCtx = new AudioContext();
  const tabSource = audioCtx.createMediaStreamSource(tabStream);
  const micSource = audioCtx.createMediaStreamSource(micStream);
  const destination = audioCtx.createMediaStreamDestination();
  tabSource.connect(destination);
  tabSource.connect(audioCtx.destination); // keep tab audio audible during recording
  micSource.connect(destination);

  // Set up recorder
  chunks = [];
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  mediaRecorder = new MediaRecorder(destination.stream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    try {
      const blob = new Blob(chunks, { type: 'audio/webm' });

      // Stop all tracks to release mic indicator and hardware
      tabStream.getTracks().forEach((t) => t.stop());
      micStream.getTracks().forEach((t) => t.stop());
      tabStream = null;
      micStream = null;

      // Close audio context and clear state
      audioCtx.close();
      audioCtx = null;
      mediaRecorder = null;
      chunks = [];

      // chrome.downloads is not available in offscreen documents — send the blob
      // to background as a base64 data URL and let the service worker download it.
      // generateFilename() is loaded from utils.js via offscreen.html
      const filename = generateFilename();
      const reader = new FileReader();
      reader.onloadend = () => {
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'RECORDING_COMPLETE',
          data: reader.result, // base64 data URL
          filename,
        });
      };
      reader.onerror = () => {
        chrome.runtime.sendMessage({
          target: 'background',
          type: 'RECORDING_ERROR',
          error: 'Failed to read recording data',
        });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      // Ensure background always learns recording stopped, even if download fails
      mediaRecorder = null;
      chunks = [];
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'RECORDING_ERROR',
        error: 'Failed to save recording: ' + err.message,
      });
    }
  };

  // Auto-stop if the Meet tab is closed or navigated away
  tabStream.getTracks().forEach((track) => {
    track.onended = () => stopRecording();
  });

  // 1-second timeslice: releases data incrementally AND keeps the stop-to-save
  // delay under 1 second (stop() waits for the current slice to flush before onstop fires)
  mediaRecorder.start(1000);

  chrome.runtime.sendMessage({ target: 'background', type: 'RECORDING_STARTED' });
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
