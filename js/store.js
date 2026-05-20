class NoteStore {
  constructor() {
    this.key = 'voicenotes_data';
  }

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch {
      return [];
    }
  }

  save(note) {
    const notes = this.getAll();
    notes.unshift(note);
    localStorage.setItem(this.key, JSON.stringify(notes));
    return note;
  }

  update(id, data) {
    const notes = this.getAll();
    const idx = notes.findIndex(n => n.id === id);
    if (idx !== -1) {
      notes[idx] = { ...notes[idx], ...data };
      localStorage.setItem(this.key, JSON.stringify(notes));
      return notes[idx];
    }
    return null;
  }

  delete(id) {
    const notes = this.getAll().filter(n => n.id !== id);
    localStorage.setItem(this.key, JSON.stringify(notes));
  }

  getById(id) {
    return this.getAll().find(n => n.id === id) || null;
  }
}

window.NoteStore = NoteStore;
