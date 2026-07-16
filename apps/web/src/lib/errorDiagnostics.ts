type ErrorRecord = Record<string, unknown>;

export type ErrorDiagnostics = {
  type: string;
  name: string | null;
  message: string;
  stack: string | null;
  code: string | number | null;
  status: string | number | null;
  details: unknown;
  hint: unknown;
  raw: unknown;
};

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === 'object' && value !== null;
}

function valueToString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return null;
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function getObjectMessage(error: ErrorRecord): string | null {
  const directMessage = valueToString(error.message);
  if (directMessage?.trim()) return directMessage;

  const description = valueToString(error.error_description);
  if (description?.trim()) return description;

  const errorText = valueToString(error.error);
  if (errorText?.trim()) return errorText;

  const parts = [
    valueToString(error.code),
    valueToString(error.status),
    valueToString(error.details),
    valueToString(error.hint)
  ].filter((part): part is string => Boolean(part?.trim()));
  if (parts.length > 0) return parts.join(' - ');

  const json = safeStringify(error);
  if (json && json !== '{}' && json !== '[]') return json;

  return null;
}

function getErrorType(error: unknown): string {
  if (error instanceof Error) return error.name;
  if (isRecord(error)) {
    const name = valueToString(error.name);
    if (name?.trim()) return name;
    const code = valueToString(error.code);
    if (code?.trim()) return `ObjectError:${code}`;
    return 'ObjectError';
  }
  return typeof error;
}

export function getErrorDiagnostics(error: unknown, fallbackMessage = 'Unknown error'): ErrorDiagnostics {
  if (error instanceof Error) {
    const record = error as Error & ErrorRecord;
    return {
      type: getErrorType(error),
      name: error.name,
      message: error.message || fallbackMessage,
      stack: error.stack ?? null,
      code: valueToString(record.code),
      status: valueToString(record.status),
      details: record.details ?? null,
      hint: record.hint ?? null,
      raw: error
    };
  }

  if (isRecord(error)) {
    const message = getObjectMessage(error) ?? fallbackMessage;
    return {
      type: getErrorType(error),
      name: valueToString(error.name),
      message,
      stack: valueToString(error.stack),
      code: valueToString(error.code),
      status: valueToString(error.status),
      details: error.details ?? null,
      hint: error.hint ?? null,
      raw: error
    };
  }

  const message = valueToString(error) ?? fallbackMessage;
  return {
    type: getErrorType(error),
    name: null,
    message,
    stack: null,
    code: null,
    status: null,
    details: null,
    hint: null,
    raw: error
  };
}

export function getErrorMessage(error: unknown, fallbackMessage = 'Unknown error') {
  const message = getErrorDiagnostics(error, fallbackMessage).message;
  return message === '[object Object]' ? fallbackMessage : message;
}

export function getErrorStack(error: unknown) {
  return getErrorDiagnostics(error).stack;
}

export function serializeError(error: unknown) {
  const diagnostics = getErrorDiagnostics(error);
  return {
    type: diagnostics.type,
    name: diagnostics.name,
    message: diagnostics.message,
    stack: diagnostics.stack,
    code: diagnostics.code,
    status: diagnostics.status,
    details: diagnostics.details,
    hint: diagnostics.hint,
    raw: diagnostics.raw
  };
}
