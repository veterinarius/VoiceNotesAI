class AITextProcessor {
  constructor() {
    this.fillerDE = /\b(äh+|ähm+|mh+|hm+|halt|sozusagen|irgendwie|quasi|also|naja|nein also|ja also|genau also)\b/gi;
    this.fillerEN = /\b(uh+|um+|like|you know|basically|literally|actually|so like|right so)\b/gi;
  }

  async process(rawText, lang = 'de-DE') {
    if (!rawText.trim()) return '';
    const apiKey = localStorage.getItem('vn_claude_key');
    if (apiKey) {
      return await this._processClaude(rawText, apiKey, lang);
      // Fehler wird nach oben weitergegeben und vom Aufrufer behandelt
    }
    return this._processRules(rawText, lang);
  }

  _processRules(text, lang) {
    const filler = lang.startsWith('de') ? this.fillerDE : this.fillerEN;
    let result = text
      .replace(filler, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    result = result.replace(/([.!?]\s+)([a-zäöüß])/g, (_, p, l) => p + l.toUpperCase());
    result = result.charAt(0).toUpperCase() + result.slice(1);

    if (result.length > 0 && !/[.!?]$/.test(result)) result += '.';
    return result;
  }

  async _processClaude(text, apiKey, lang) {
    const langLabel = lang.startsWith('de') ? 'Deutsch' : 'English';
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Du bearbeitest einen diktierten Sprachtext auf ${langLabel}. Führe folgende Schritte durch:

1. Entferne alle Füllwörter (äh, ähm, also, halt, sozusagen usw.)
2. Korrigiere Rechtschreibung, Grammatik und setze korrekte Satzzeichen
3. Gliedere den Text in sinnvolle Absätze
4. Stelle eine kurze Zusammenfassung (1–2 Sätze) ganz oben voran, abgetrennt durch eine Leerzeile

Ausgabeformat:
[Zusammenfassung]

[Verbesserter Text in Absätzen]

Gib NUR das Ergebnis zurück – keine Erklärungen, keine Überschriften, keine Kommentare.

Text: ${text}`
        }]
      })
    });
    if (!resp.ok) throw new Error('API error');
    const data = await resp.json();
    return data.content[0].text.trim();
  }

  generateTitle(text) {
    const words = text.replace(/[.!?,]/g, '').split(/\s+/).filter(Boolean);
    return words.slice(0, 6).join(' ') || 'Neue Notiz';
  }
}

window.AITextProcessor = AITextProcessor;
