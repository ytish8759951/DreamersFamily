export async function compressImageFile(
  file: File,
  options: {
    maxSide?: number;
    quality?: number;
    webpType?: string;
    fallbackType?: string;
  } = {}
) {
  const maxSide = options.maxSide ?? 1280;
  const quality = options.quality ?? 0.75;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('無法壓縮圖片');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const preferred = await canvasToBlob(canvas, options.webpType ?? 'image/webp', quality);
  if (preferred) return preferred;

  const fallback = await canvasToBlob(canvas, options.fallbackType ?? 'image/jpeg', quality);
  if (!fallback) throw new Error('無法壓縮圖片');
  return fallback;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, quality);
  });
}
