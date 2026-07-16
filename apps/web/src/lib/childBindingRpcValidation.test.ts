import { describe, expect, it } from 'vitest';
import { requireBackendVerifiedChildBindingRow } from './childBindingRpcValidation';
import { LocalDataError } from './localData';

describe('child binding RPC validation', () => {
  it('accepts a backend-verified child row without relying on an anonymous tablet family id', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      family_id: '22222222-2222-4222-8222-222222222222'
    };

    expect(requireBackendVerifiedChildBindingRow(row, row.id)).toBe(row);
  });

  it('rejects a token whose payload child id differs from the RPC child id', () => {
    expect(() => requireBackendVerifiedChildBindingRow(
      {
        id: '11111111-1111-4111-8111-111111111111',
        family_id: '22222222-2222-4222-8222-222222222222'
      },
      '33333333-3333-4333-8333-333333333333'
    )).toThrowError(LocalDataError);
  });
});
