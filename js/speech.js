class SpeechRecognizer {
  constructor() {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SpeechAPI;
    this._SpeechAPI = SpeechAPI;
    this.onInterim = () => {};
    this.onFinal = () => {};
    this.onError = () => {};
    this._finalText = '';
    this._running = false;
    this._session = null;
  }

  _newSession() {
    const r = new this._SpeechAPI();
    r.continuous = false;
    r.interimResults = true;
    r.lang = localStorage.getItem('vn_lang') || 'de-DE';

    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          this._finalText += t + ' ';
          this.onFinal(this._finalText.trim());
        } else {
          interim += t;
        }
      }
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
    this._running = true;
    this._session = this._newSession();
    this._session.start();
  }

  stop() {
    this._running = false;
    if (this._session) {
      try { this._session.abort(); } catch {}
      this._session = null;
    }
  }

  getText() {
    return this._finalText.trim();
  }
}

window.SpeechRecognizer = SpeechRecognizer;
