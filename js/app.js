document.addEventListener('DOMContentLoaded', () => {
  const store = new NoteStore();
  const speech = new SpeechRecognizer();
  const whisper = new WhisperRecorder();
  const processor = new AITextProcessor();
  const ui = new UI();

  const isArc = /Arc\//.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  let recordingStart = null;
  let timerInterval = null;
  let currentStream = null;
  let useWhisper = false;

  ui.show('home');
  renderHome();
  updateModeIndicator();

  function renderHome() { ui.renderNotes(store.getAll()); }

  function useWhisperMode() {
    return isArc || !speech.supported || !!localStorage.getItem('vn_openai_key') && localStorage.getItem('vn_force_whisper') === '1';
  }

  function needsWhisper() {
    return isArc || isIOS || localStorage.getItem('vn_force_whisper') === '1';
  }

  function updateModeIndicator() {
    const el = document.getElementById('mode-indicator');
    if (!el) return;
    const hasKey = localStorage.getItem('vn_groq_key') || localStorage.getItem('vn_openai_key');
    const provider = localStorage.getItem('vn_groq_key') ? 'Groq (kostenlos)' : 'OpenAI';
    if (isIOS && !hasKey) {
      el.textContent = '⚠️ iPhone erkannt – bitte Groq API-Key in den Einstellungen hinterlegen (kostenlos).';
      el.className = 'mode-warning';
    } else if (isArc && !hasKey) {
      el.textContent = '⚠️ Arc erkannt – bitte Groq API-Key in den Einstellungen hinterlegen.';
      el.className = 'mode-warning';
    } else if (needsWhisper() && hasKey) {
      el.textContent = `🤖 Transkription via Whisper · ${provider}`;
      el.className = 'mode-info';
    } else {
      el.textContent = '';
      el.className = '';
    }
  }

  // --- Record Button ---
  document.getElementById('btn-record')?.addEventListener('click', startRecording);

  async function startRecording() {
    useWhisper = needsWhisper();

    if (useWhisper) {
      const key = localStorage.getItem('vn_groq_key') || localStorage.getItem('vn_openai_key');
      if (!key) {
        const msg = isIOS
          ? 'iPhone erkannt: Bitte zuerst einen kostenlosen Groq API-Key in den Einstellungen eintragen.'
          : 'Bitte zuerst einen API-Key (Groq oder OpenAI) in den Einstellungen eintragen.';
        ui.showToast(msg, 'error');
        ui.show('settings');
        return;
      }
      await startWhisperRecording();
    } else {
      if (!speech.supported) {
        ui.showToast('Spracherkennung nicht unterstützt. Bitte OpenAI-Key für Whisper eintragen.', 'error');
        ui.show('settings');
        return;
      }
      await startSpeechRecording();
    }
  }

  // --- Mikrofon-Stream ---
  // In Arc: Basis-Stream einmalig halten (kein wiederholter Permission-Dialog).
  // Für jede Aufnahme wird ein frischer Klon verwendet, damit MediaRecorder
  // keine veralteten Tracks bekommt.
  let recordingStream = null;

  function streamActive() {
    return currentStream && currentStream.getTracks().some(t => t.readyState === 'live');
  }

  async function acquireStream() {
    if (streamActive()) return true;
    try {
      currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      ui.showToast('Mikrofon-Zugriff verweigert', 'error');
      return false;
    }
  }

  function releaseStream() {
    if (recordingStream) {
      recordingStream.getTracks().forEach(t => t.stop());
      recordingStream = null;
    }
    if (!isArc && currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }
  }

  window.addEventListener('beforeunload', () => {
    if (recordingStream) recordingStream.getTracks().forEach(t => t.stop());
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
  });

  // --- Whisper Aufnahme ---
  async function startWhisperRecording() {
    if (!await acquireStream()) return;

    recordingStream = currentStream;

    ui.show('recording');
    ui.setTranscript('🎙 Aufnahme läuft – nach dem Stoppen wird Text erkannt…');
    ui.startWaveform();

    recordingStart = Date.now();
    timerInterval = setInterval(() => {
      ui.setRecordingTime(Math.floor((Date.now() - recordingStart) / 1000));
    }, 1000);

    try {
      await whisper.start(recordingStream);
    } catch (e) {
      clearInterval(timerInterval);
      ui.stopWaveform();
      releaseStream();
      ui.show('home');
      ui.showToast('Aufnahme fehlgeschlagen: ' + (e.message || e), 'error');
    }
  }

  // --- Web Speech Aufnahme ---
  async function startSpeechRecording() {
    if (!await acquireStream()) return;

    ui.show('recording');
    ui.setTranscript('🎙 Mikrofon aktiv – bitte sprechen…');
    ui.startWaveform();

    recordingStart = Date.now();
    timerInterval = setInterval(() => {
      ui.setRecordingTime(Math.floor((Date.now() - recordingStart) / 1000));
    }, 1000);

    speech.onInterim = (t) => ui.setTranscript(t || '🎙 Ich höre zu…');
    speech.onFinal = (t) => ui.setTranscript(t);
    speech.onError = (msg) => { ui.showToast(msg, 'error'); doStop(); };
    speech.start();
  }

  // --- Stop Button ---
  document.getElementById('btn-stop')?.addEventListener('click', doStop);

  async function doStop() {
    clearInterval(timerInterval);
    const duration = Math.floor((Date.now() - recordingStart) / 1000);
    ui.stopWaveform();

    if (useWhisper) {
      ui.setTranscript('⏳ Wird transkribiert…');
      let rawText = '';
      try {
        const blob = await whisper.stop();
        const lang = localStorage.getItem('vn_lang') || 'de-DE';
        const groqKey = localStorage.getItem('vn_groq_key');
        const openaiKey = localStorage.getItem('vn_openai_key');
        if (groqKey) {
          rawText = await whisper.transcribe(blob, groqKey, lang, 'groq');
        } else if (openaiKey) {
          rawText = await whisper.transcribe(blob, openaiKey, lang, 'openai');
        } else {
          ui.showToast('Kein API-Key hinterlegt. Bitte in den Einstellungen eintragen.', 'error');
        }
      } catch (e) {
        ui.showToast('Transkription fehlgeschlagen: ' + e.message, 'error');
      }
      releaseStream();
      await finishRecording(rawText, duration);
    } else {
      const rawText = await speech.stop();
      releaseStream();
      await finishRecording(rawText, duration);
    }
  }

  async function finishRecording(rawText, duration) {
    if (!rawText.trim()) {
      ui.showToast('Kein Text erkannt', 'info');
      ui.show('home');
      return;
    }

    ui.setTranscript('✨ Text wird verarbeitet…');

    const lang = localStorage.getItem('vn_lang') || 'de-DE';
    const body = await processor.process(rawText, lang);
    const note = {
      id: Date.now().toString(),
      title: processor.generateTitle(body),
      body,
      rawTranscript: rawText,
      date: new Date().toISOString(),
      duration
    };

    store.save(note);
    renderHome();
    ui.show('home');
    ui.showToast('Notiz gespeichert', 'success');
  }

  // --- Note List ---
  document.getElementById('note-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.note-item');
    if (!item) return;
    const note = store.getById(item.dataset.id);
    if (note) ui.showDetail(note);
  });

  // --- Detail Screen ---
  document.getElementById('btn-back')?.addEventListener('click', () => { ui.show('home'); renderHome(); });

  document.getElementById('btn-share')?.addEventListener('click', () => {
    const id = document.getElementById('detail-id')?.value;
    const note = id ? store.getById(id) : null;
    if (!note) return;
    navigator.clipboard.writeText(note.body)
      .then(() => ui.showToast('Text kopiert', 'success'))
      .catch(() => ui.showToast('Kopieren fehlgeschlagen', 'error'));
  });

  // Button-Label je nach Plattform anpassen
  const btnDownload = document.getElementById('btn-download');
  if (btnDownload && navigator.share) btnDownload.textContent = 'Teilen';

  btnDownload?.addEventListener('click', async () => {
    const id = document.getElementById('detail-id')?.value;
    const note = id ? store.getById(id) : null;
    if (!note) return;

    // iOS / Web Share API
    if (navigator.share) {
      try {
        const file = new File([note.body], note.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '.txt', { type: 'text/plain' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ title: note.title, files: [file] });
        } else {
          await navigator.share({ title: note.title, text: note.body });
        }
        ui.showToast('Geteilt', 'success');
      } catch (e) {
        if (e.name !== 'AbortError') ui.showToast('Teilen fehlgeschlagen', 'error');
      }
      return;
    }

    // Desktop: Datei-Download
    const blob = new Blob([note.body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = note.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    ui.showToast('Datei gespeichert', 'success');
  });

  document.getElementById('btn-delete')?.addEventListener('click', () => {
    const id = document.getElementById('detail-id')?.value;
    if (!id) return;
    if (confirm('Notiz löschen?')) {
      store.delete(id);
      ui.show('home');
      renderHome();
      ui.showToast('Notiz gelöscht', 'info');
    }
  });

  document.getElementById('btn-ai-improve')?.addEventListener('click', async () => {
    const id = document.getElementById('detail-id')?.value;
    const note = id ? store.getById(id) : null;
    if (!note) return;

    const apiKey = localStorage.getItem('vn_claude_key');
    if (!apiKey) {
      ui.showToast('Bitte zuerst Anthropic API-Key in den Einstellungen eintragen.', 'error');
      ui.show('settings');
      return;
    }

    const btn = document.getElementById('btn-ai-improve');
    btn.textContent = '⏳';
    btn.disabled = true;

    const lang = localStorage.getItem('vn_lang') || 'de-DE';
    try {
      const improved = await processor.process(note.body, lang);
      store.update(id, { body: improved, title: processor.generateTitle(improved) });
      document.getElementById('detail-body').textContent = improved;
      document.getElementById('detail-title').textContent = processor.generateTitle(improved);
      ui.showToast('Text verbessert ✨', 'success');
    } catch {
      ui.showToast('KI-Verbesserung fehlgeschlagen', 'error');
    } finally {
      btn.textContent = '✨ KI';
      btn.disabled = false;
    }
  });

  document.getElementById('btn-edit-save')?.addEventListener('click', () => {
    const id = document.getElementById('detail-id')?.value;
    const bodyEl = document.getElementById('detail-body');
    if (!id || !bodyEl) return;
    if (bodyEl.contentEditable === 'true') {
      const newBody = bodyEl.textContent.trim();
      store.update(id, { body: newBody, title: processor.generateTitle(newBody) });
      bodyEl.contentEditable = 'false';
      bodyEl.classList.remove('editing');
      document.getElementById('btn-edit-save').textContent = 'Bearbeiten';
      ui.showToast('Gespeichert', 'success');
    } else {
      bodyEl.contentEditable = 'true';
      bodyEl.classList.add('editing');
      bodyEl.focus();
      document.getElementById('btn-edit-save').textContent = 'Speichern';
    }
  });

  // --- Settings ---
  document.getElementById('btn-settings')?.addEventListener('click', () => ui.show('settings'));
  document.getElementById('btn-settings-back')?.addEventListener('click', () => { updateModeIndicator(); ui.show('home'); });

  const langEl = document.getElementById('settings-lang');
  if (langEl) langEl.value = localStorage.getItem('vn_lang') || 'de-DE';
  langEl?.addEventListener('change', (e) => localStorage.setItem('vn_lang', e.target.value));

  const apiKeyEl = document.getElementById('settings-apikey');
  if (apiKeyEl) apiKeyEl.value = localStorage.getItem('vn_claude_key') || '';
  document.getElementById('btn-save-apikey')?.addEventListener('click', () => {
    const key = apiKeyEl?.value.trim();
    key ? localStorage.setItem('vn_claude_key', key) : localStorage.removeItem('vn_claude_key');
    ui.showToast(key ? 'Claude API-Key gespeichert' : 'Claude API-Key entfernt', key ? 'success' : 'info');
  });

  const groqKeyEl = document.getElementById('settings-groq-key');
  if (groqKeyEl) groqKeyEl.value = localStorage.getItem('vn_groq_key') || '';
  document.getElementById('btn-save-groq-key')?.addEventListener('click', () => {
    const key = groqKeyEl?.value.trim();
    key ? localStorage.setItem('vn_groq_key', key) : localStorage.removeItem('vn_groq_key');
    ui.showToast(key ? 'Groq API-Key gespeichert' : 'Groq API-Key entfernt', key ? 'success' : 'info');
    updateModeIndicator();
  });

  const openaiKeyEl = document.getElementById('settings-openai-key');
  if (openaiKeyEl) openaiKeyEl.value = localStorage.getItem('vn_openai_key') || '';
  document.getElementById('btn-save-openai-key')?.addEventListener('click', () => {
    const key = openaiKeyEl?.value.trim();
    key ? localStorage.setItem('vn_openai_key', key) : localStorage.removeItem('vn_openai_key');
    ui.showToast(key ? 'OpenAI API-Key gespeichert' : 'OpenAI API-Key entfernt', key ? 'success' : 'info');
    updateModeIndicator();
  });

  const forceWhisperEl = document.getElementById('settings-force-whisper');
  if (forceWhisperEl) forceWhisperEl.checked = localStorage.getItem('vn_force_whisper') === '1';
  forceWhisperEl?.addEventListener('change', (e) => {
    e.target.checked ? localStorage.setItem('vn_force_whisper', '1') : localStorage.removeItem('vn_force_whisper');
    updateModeIndicator();
  });
});
