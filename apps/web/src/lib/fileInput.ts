type FileInputLike = {
  files: { length: number; item(index: number): File | null } | null;
  value: string;
};

export function captureFirstSelectedFile(input: FileInputLike) {
  const file = input.files?.item(0) ?? null;
  input.value = '';
  return file;
}

export function captureSelectedFiles(input: FileInputLike, limit = Number.POSITIVE_INFINITY) {
  const files = input.files;
  const captured: File[] = [];
  if (files) {
    for (let index = 0; index < Math.min(files.length ?? 0, limit); index += 1) {
      const file = files.item(index);
      if (file) captured.push(file);
    }
  }
  input.value = '';
  return captured;
}
