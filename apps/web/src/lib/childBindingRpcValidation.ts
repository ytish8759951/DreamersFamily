import { LocalDataError } from './localData';
import type { UUID } from './localTypes';

export type ChildBindingRpcValidationRow = {
  id: UUID;
  family_id: UUID;
};

export function requireBackendVerifiedChildBindingRow<T extends ChildBindingRpcValidationRow>(
  row: T | null,
  expectedChildId: UUID
): T {
  if (!row) throw new LocalDataError('QR binding record not found', 'QR_BINDING_NOT_FOUND');
  if (row.id !== expectedChildId) {
    throw new LocalDataError('QR token does not match the requested child', 'QR_CHILD_MISMATCH');
  }
  return row;
}
