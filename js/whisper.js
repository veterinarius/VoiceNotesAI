class WhisperRecorder {
  constructor() {
    this.supported = !!(navigator.mediaDevices && window.MediaRecorder);
    this._recorder = null;
    this._chunks = [];
    this.onLevelChange = () => {};
    this._analyser = null;
    this._audioCtx = null;
    this._animFrame = null;
  }

  async start(stream) {
    this._chunks = [];
    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) || '';

    this._recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    this._recorder.ondataavailable = (e) => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.onerror = (e) => { console.error('MediaRecorder error:', e.error); };
    this._recorder.start(100);

    // Waveform-Analyse über denselben Stream
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = this._audioCtx.createMediaStreamSource(stream);
    this._analyser = this._audioCtx.createAnalyser();
    this._analyser.fftSize = 256;
    source.connect(this._analyser);
    this._drawLevel();
  }

  stop() {
    this._stopVisual();
    return new Promise((resolve) => {
      if (!this._recorder || this._recorder.state === 'inactive') {
        resolve(new Blob(this._chunks, { type: (this._recorder?.mimeType) || 'audio/webm' }));
        return;
      }
      this._recorder.onstop = () => {
        const mimeType = this._recorder.mimeType || 'audio/webm';
        resolve(new Blob(this._chunks, { type: mimeType }));
      };
      try {
        this._recorder.stop();
      } catch {
        resolve(new Blob(this._chunks, { type: 'audio/webm' }));
      }
    });
  }

  async transcribe(blob, apiKey, lang, provider = 'groq') {
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm';
    const formData = new FormData();
    formData.append('file', blob, `recording.${ext}`);
    formData.append('language', lang.split('-')[0]);

    let url, model;
    if (provider === 'groq') {
      url = 'https://api.groq.com/openai/v1/audio/transcriptions';
      model = 'whisper-large-v3-turbo';
    } else {
      url = 'https://api.openai.com/v1/audio/transcriptions';
      model = 'whisper-1';
    }
    formData.append('model', model);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || `Fehler ${resp.status}`);
    }
    return (await resp.json()).text || '';
  }

  _drawLevel() {
    if (!this._analyser) return;
    const buf = new Uint8Array(this._analyser.frequencyBinCount);
    const bars = document.querySelectorAll('#waveform-bars span');
    const draw = () => {
      this._animFrame = requestAnimationFrame(draw);
      this._analyser.getByteFrequencyData(buf);
      const step = Math.floor(buf.length / bars.length);
      bars.forEach((bar, i) => {
        const val = buf[i * step] / 255;
        bar.style.height = `${8 + val * 52}px`;
      });
    };
    draw();
  }

  _stopVisual() {
    cancelAnimationFrame(this._animFrame);
    if (this._audioCtx) { this._audioCtx.close(); this._audioCtx = null; }
    document.querySelectorAll('#waveform-bars span').forEach(b => b.style.height = '8px');
  }
}

window.WhisperRecorder = WhisperRecorder;
