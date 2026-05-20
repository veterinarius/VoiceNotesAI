class SpeechRecognizer {
  constructor() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SpeechAPI;
    this._SpeechAPI = SpeechAPI;
    this.onInterim = () => {};
    this.onFinal = () => {};
    this.onError = () => {};
    this._finalText = '';
    this._interimText = '';   // Fallback für iOS Safari
    this._running = false;
    this._session = null;
    this._stopResolve = null;
  }

  _newSession() {
    const r = new this._SpeechAPI();
    r.continuous = true;
    r.interimResults = true;
    r.lang = localStorage.getItem('vn_lang') || 'de-DE';

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          this._finalText += t + ' ';
          this._interimText = '';
          this.onFinal(this._finalText.trim());
        } else {
          interim += t;
        }
      }
      if (interim) this._interimText = interim;
      this.onInterim(this._finalText + interim);
    };

    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this._running = false;
        this.onError('Mikrofon-Zugriff verweigert.');
      }
      // no-speech, network, audio-capture → onend kümmert sich um Neustart
    };

    r.onend = () => {
      if (this._stopResolve) {
        const resolve = this._stopResolve;
        this._stopResolve = null;
        // iOS Safari liefert manchmal nur interim → als Fallback verwenden
        resolve((this._finalText + this._interimText).trim());
        return;
      }
      if (!this._running) return;
      setTimeout(() => {
        if (!this._running) return;
        try {
          this._session = this._newSession();
          this._session.start();
        } catch {}
      }, 100);
    };

    return r;
  }

  start() {
    if (!this.supported) return;
    this._finalText = '';
    this._interimText = '';
    this._running = true;
    this._stopResolve = null;
    this._session = this._newSession();
    this._session.start();
  }

  stop() {
    this._running = false;
    return new Promise((resolve) => {
      if (!this._session) {
        resolve((this._finalText + this._interimText).trim());
        return;
      }
      this._stopResolve = resolve;
      try { this._session.stop(); } catch {
        resolve((this._finalText + this._interimText).trim());
      }
      this._session = null;
      // Fallback: falls onend nicht feuert (z.B. iOS Safari)
      setTimeout(() => {
        if (this._stopResolve) {
          this._stopResolve = null;
          resolve((this._finalText + this._interimText).trim());
        }
      }, 1500);
    });
  }

  getText() {
    return (this._finalText + this._interimText).trim();
  }
}

window.SpeechRecognizer = SpeechRecognizer;
