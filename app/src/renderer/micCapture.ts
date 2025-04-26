// src/renderer/micCapture.ts
const SAMPLE_RATE = 16_000;

export async function startMic(): Promise<void> {

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
      sampleRate: SAMPLE_RATE
    }
  });

  const ctx  = new AudioContext({ sampleRate: SAMPLE_RATE });
  const src  = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);

  proc.onaudioprocess = (e) => {
    
    const f32 = e.inputBuffer.getChannelData(0);
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; ++i) {
      i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32768));
    }
    if (i16[0] !== 0) console.log('🎤 mic chunk', i16.length);

    window.Electron.ipcRenderer.send('audio-data', i16);
  };

  src.connect(proc);
  proc.connect(ctx.destination);
}
