export function logVideoStorageDiagnostics(blob: Blob) {
  const estimatedBase64Length = Math.ceil(blob.size / 3) * 4;
  console.info('[child/share] video storage diagnostics', {
    'Blob.size': blob.size,
    'Base64 estimated length': estimatedBase64Length,
    'blob.type': blob.type,
    storage: 'IndexedDB Blob via MediaRepository, not localStorage Base64'
  });
}
