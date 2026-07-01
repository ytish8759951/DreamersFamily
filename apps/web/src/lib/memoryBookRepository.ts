import { getLocalStorage, readJson, writeJson, type KeyValueStorage } from './storage';

const MEMORY_BOOK_STORAGE_KEY = 'little-dreamers-family:memory-book:v1';

export interface AnnualParentNote {
  childId: string;
  year: number;
  note: string;
  updatedAt: string;
}

export class MemoryBookRepository {
  constructor(
    private readonly storage: KeyValueStorage = getLocalStorage(),
    private readonly storageKey = MEMORY_BOOK_STORAGE_KEY
  ) {}

  getAnnualParentNote(childId: string, year: number) {
    return this.readNotes().find((note) => note.childId === childId && note.year === year) ?? null;
  }

  saveAnnualParentNote(childId: string, year: number, note: string) {
    const notes = this.readNotes();
    const normalized = note.trim();
    const timestamp = new Date().toISOString();
    const existing = notes.find((item) => item.childId === childId && item.year === year);

    if (existing) {
      existing.note = normalized;
      existing.updatedAt = timestamp;
      this.writeNotes(notes);
      return existing;
    }

    const next: AnnualParentNote = {
      childId,
      year,
      note: normalized,
      updatedAt: timestamp
    };
    notes.push(next);
    this.writeNotes(notes);
    return next;
  }

  listAnnualParentNotes() {
    return this.readNotes().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private readNotes() {
    return readJson<AnnualParentNote[]>(this.storage, this.storageKey) ?? [];
  }

  private writeNotes(notes: AnnualParentNote[]) {
    writeJson(this.storage, this.storageKey, notes);
  }
}

export const memoryBookRepository = new MemoryBookRepository();
