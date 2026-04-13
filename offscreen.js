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
