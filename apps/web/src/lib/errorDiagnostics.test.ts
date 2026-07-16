import { describe, expect, it } from 'vitest';
import { getErrorDiagnostics, getErrorMessage, serializeError } from './errorDiagnostics';

describe('error diagnostics', () => {
  it('uses PostgREST plain object messages instead of [object Object]', () => {
    const error = {
      code: 'PGRST116',
      details: 'The result contains 0 rows',
      hint: null,
      message: 'JSON object requested, multiple (or no) rows returned'
    };

    expect(getErrorMessage(error)).toBe('JSON object requested, multiple (or no) rows returned');
    expect(getErrorMessage(error)).not.toBe('[object Object]');
    expect(serializeError(error)).toMatchObject({
      type: 'ObjectError:PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
      code: 'PGRST116',
      details: 'The result contains 0 rows'
    });
  });

  it('builds a readable message from object fields when message is missing', () => {
    const error = {
      code: '42501',
      details: 'permission denied for table device_bindings',
      hint: 'Check RLS policies',
      status: 403
    };

    const message = getErrorMessage(error);

    expect(message).toContain('42501');
    expect(message).toContain('permission denied for table device_bindings');
    expect(message).toContain('Check RLS policies');
    expect(message).not.toBe('[object Object]');
  });

  it('keeps the production missing token column error readable', () => {
    const error = {
      code: '42703',
      message: 'column "token" does not exist',
      details: null,
      hint: null
    };

    expect(getErrorMessage(error)).toBe('column "token" does not exist');
    expect(serializeError(error)).toMatchObject({
      type: 'ObjectError:42703',
      code: '42703',
      message: 'column "token" does not exist'
    });
  });

  it('keeps Error stack and custom diagnostic fields', () => {
    const error = new Error('Supabase client is unavailable') as Error & {
      code: string;
      details: string;
    };
    error.code = 'SUPABASE_UNAVAILABLE';
    error.details = 'Missing runtime config';

    const diagnostics = getErrorDiagnostics(error);

    expect(diagnostics.name).toBe('Error');
    expect(diagnostics.message).toBe('Supabase client is unavailable');
    expect(diagnostics.stack).toContain('Supabase client is unavailable');
    expect(diagnostics.code).toBe('SUPABASE_UNAVAILABLE');
    expect(diagnostics.details).toBe('Missing runtime config');
  });
});
