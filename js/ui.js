class UI {
  constructor() {
    this.screens = {
      home: document.getElementById('screen-home'),
      recording: document.getElementById('screen-recording'),
      detail: document.getElementById('screen-detail'),
      settings: document.getElementById('screen-settings')
    };
    this.canvas = document.getElementById('waveform');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this._animFrame = null;
    this._audioCtx = null;
    this._analyser = null;
  }

  show(name) {
    Object.values(this.screens).forEach(s => { if (s) s.classList.add('hidden'); });
    if (this.screens[name]) this.screens[name].classList.remove('hidden');
  }

  renderNotes(notes) {
    const list = document.getElementById('note-list');
    if (!list) return;
    if (notes.length === 0) {
      list.innerHTML = '<li class="empty-state">Noch keine Notizen.<br>Tippe auf den Mikrofon-Button.</li>';
      return;
    }
    list.innerHTML = notes.map(n => `
      <li class="note-item" data-id="${n.id}">
        <div class="note-title">${this._esc(n.title)}</div>
        <div class="note-meta">${this._formatDate(n.date)} · ${this._formatDur(n.duration)}</div>
        <div class="note-preview">${this._esc(n.body.slice(0, 80))}${n.body.length > 80 ? '…' : ''}</div>
      </li>`).join('');
  }

  showDetail(note) {
    document.getElementById('detail-title').textContent = note.title;
    document.getElementById('detail-body').textContent = note.body;
    document.getElementById('detail-meta').textContent =
      this._formatDate(note.date) + ' · ' + this._formatDur(note.duration);
    document.getElementById('detail-id').value = note.id;
    this.show('detail');
  }

  setTranscript(text) {
    const el = document.getElementById('live-transcript');
    if (el) el.textContent = text || 'Ich höre zu…';
  }

  setRecordingTime(seconds) {
    const el = document.getElementById('recording-time');
    if (el) el.textContent = this._formatDur(seconds);
  }

  startWaveform() {
    const waveEl = document.getElementById('waveform-bars');
    if (waveEl) waveEl.classList.add('active');
  }

  stopWaveform() {
    const waveEl = document.getElementById('waveform-bars');
    if (waveEl) waveEl.classList.remove('active');
  }

  showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
  }

  showInstallBanner() {
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('hidden');
  }

  _esc(s) { return s.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
  _formatDate(iso) {
    return new Date(iso).toLocaleDateString('de-DE', { day:'2-digit', month:'short', year:'numeric' });
  }
  _formatDur(s) {
    if (!s) return '0s';
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }
}

window.UI = UI;
