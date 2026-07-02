import { dataRepository } from './dataRepository';
import type { LocalDataRepository } from './localData';
import type { AnnualParentNote } from './localTypes';

export type { AnnualParentNote };

export class MemoryBookRepository {
  constructor(private readonly repository: LocalDataRepository = dataRepository) {}

  getAnnualParentNote(childId: string, year: number) {
    return this.repository.getAnnualParentNote(childId, year);
  }

  saveAnnualParentNote(childId: string, year: number, note: string) {
    return this.repository.saveAnnualParentNote(childId, year, note);
  }

  listAnnualParentNotes() {
    return this.repository.listAnnualParentNotes();
  }
}

export const memoryBookRepository = new MemoryBookRepository();
