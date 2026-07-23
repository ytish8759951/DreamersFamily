import { getErrorDiagnostics, getErrorMessage } from './errorDiagnostics';

const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const;
const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export type ImageUploadStage = 'prepare' | 'storage-upload' | 'media-assets' | 'owner-rpc';

export type PreparedImageUpload = {
  originalFileName: string;
  originalMimeType: string;
  originalBytes: number;
  normalizedFileName: string;
  mimeType: 'image/jpeg';
  blob: Blob;
  bytes: number;
  extension: 'jpg';
};

export type SafeImageUploadDiagnostics = {
  stage: ImageUploadStage;
  ownerType: string;
  familyId?: string | null;
  childId?: string | null;
  ownerId?: string | null;
  originalFileName?: string | null;
  originalMimeType?: string | null;
  originalBytes?: number | null;
  normalizedFileName?: string | null;
  normalizedMimeType?: string | null;
  normalizedBytes?: number | null;
  storagePath?: string | null;
  uploadStatus?: string | number | null;
  uploadCode?: string | number | null;
  uploadMessage?: string | null;
  mediaAssetId?: string | null;
  rpcStatus?: string | number | null;
  rpcCode?: string | number | null;
  rpcMessage?: string | null;
};

export class ImageUploadPipelineError extends Error {
  readonly stage: ImageUploadStage;
  readonly userMessage: string;
  readonly diagnostics: SafeImageUploadDiagnostics;

  constructor(stage: ImageUploadStage, userMessage: string, diagnostics: SafeImageUploadDiagnostics, cause?: unknown) {
    super(userMessage);
    this.name = 'ImageUploadPipelineError';
    this.stage = stage;
    this.userMessage = userMessage;
    this.diagnostics = withErrorDiagnostics(diagnostics, cause, stage);
  }
}

export async function prepareImageFileForUpload(
  file: File,
  options: {
    fallbackBaseName: string;
    maxSide?: number;
    quality?: number;
    ownerType: string;
    familyId?: string | null;
    childId?: string | null;
    ownerId?: string | null;
  }
): Promise<PreparedImageUpload> {
  const diagnostics = baseDiagnostics('prepare', options, file);
  const validationError = getImageFileValidationError(file);
  if (validationError) {
    throw new ImageUploadPipelineError('prepare', validationError, diagnostics);
  }

  try {
    const blob = await convertImageFileToJpeg(file, {
      maxSide: options.maxSide ?? 1600,
      quality: options.quality ?? 0.86
    });
    if (blob.size <= 0) {
      throw new Error('normalized image has zero bytes');
    }
    const normalizedFileName = normalizeImageFileName(file.name || options.fallbackBaseName, 'jpg');
    return {
      originalFileName: file.name || '',
      originalMimeType: file.type || '',
      originalBytes: file.size,
      normalizedFileName,
      mimeType: 'image/jpeg',
      blob,
      bytes: blob.size,
      extension: 'jpg'
    };
  } catch (error) {
    const isHeic = isHeicImageFile(file);
    throw new ImageUploadPipelineError(
      'prepare',
      isHeic
        ? 'HEIC/HEIF 照片轉換失敗，請在照片 App 匯出為 JPEG 後再上傳。'
        : '照片格式處理失敗，請重新選擇照片後再試。',
      diagnostics,
      error
    );
  }
}

export function getImageFileValidationError(file: File | null, maxBytes = 10 * 1024 * 1024) {
  if (!file) return '請先選擇照片。';
  if (file.size <= 0) return '照片檔案沒有內容，請重新拍照或選擇照片。';
  if (file.size > maxBytes) return `照片檔案太大，目前大小 ${formatBytes(file.size)}，請選擇較小的照片。`;
  if (isSupportedImageFile(file)) return '';
  return '目前只支援 JPG、PNG、WebP、HEIC 或 HEIF 照片，請重新選擇照片。';
}

export function isSupportedImageFile(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  if ((SUPPORTED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return true;
  if (!mimeType && (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(extension)) return true;
  return (SUPPORTED_IMAGE_EXTENSIONS as readonly string[]).includes(extension);
}

export function isHeicImageFile(file: File) {
  const mimeType = file.type.toLowerCase();
  const extension = getFileExtension(file.name);
  return mimeType === 'image/heic' || mimeType === 'image/heif' || extension === 'heic' || extension === 'heif';
}

export function normalizeImageFileName(fileName: string, extension = 'jpg') {
  const stem = (fileName.replace(/\.[^.]+$/, '') || 'photo')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'photo';
  return `${stem}.${extension}`;
}

export function logImageUploadDiagnostics(label: string, diagnostics: SafeImageUploadDiagnostics) {
  console.info(label, {
    stage: diagnostics.stage,
    ownerType: diagnostics.ownerType,
    familyId: diagnostics.familyId ?? null,
    childId: diagnostics.childId ?? null,
    ownerId: diagnostics.ownerId ?? null,
    originalFileName: diagnostics.originalFileName ?? null,
    originalMimeType: diagnostics.originalMimeType ?? null,
    originalBytes: diagnostics.originalBytes ?? null,
    normalizedFileName: diagnostics.normalizedFileName ?? null,
    normalizedMimeType: diagnostics.normalizedMimeType ?? null,
    normalizedBytes: diagnostics.normalizedBytes ?? null,
    storagePath: diagnostics.storagePath ?? null,
    uploadStatus: diagnostics.uploadStatus ?? null,
    uploadCode: diagnostics.uploadCode ?? null,
    uploadMessage: diagnostics.uploadMessage ?? null,
    mediaAssetId: diagnostics.mediaAssetId ?? null,
    rpcStatus: diagnostics.rpcStatus ?? null,
    rpcCode: diagnostics.rpcCode ?? null,
    rpcMessage: diagnostics.rpcMessage ?? null
  });
}

export function uploadStageMessage(stage: ImageUploadStage) {
  if (stage === 'prepare') return '照片格式處理失敗';
  if (stage === 'storage-upload') return '照片上傳失敗';
  if (stage === 'media-assets') return '照片資料建立失敗';
  return '商品資料儲存失敗';
}

async function convertImageFileToJpeg(file: File, options: { maxSide: number; quality: number }) {
  const image = await createOrientedImageSource(file);
  try {
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const scale = Math.min(1, options.maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas context unavailable');
    context.drawImage(image.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', options.quality));
    if (!blob) throw new Error('canvas did not produce a jpeg blob');
    return blob;
  } finally {
    image.cleanup();
  }
}

async function createOrientedImageSource(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    } catch {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
    }
  }

  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('image decoding unavailable');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      cleanup: () => URL.revokeObjectURL(url)
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function baseDiagnostics(
  stage: ImageUploadStage,
  options: { ownerType: string; familyId?: string | null; childId?: string | null; ownerId?: string | null },
  file?: File
): SafeImageUploadDiagnostics {
  return {
    stage,
    ownerType: options.ownerType,
    familyId: options.familyId ?? null,
    childId: options.childId ?? null,
    ownerId: options.ownerId ?? null,
    originalFileName: file?.name ?? null,
    originalMimeType: file?.type ?? null,
    originalBytes: file?.size ?? null
  };
}

function withErrorDiagnostics(
  diagnostics: SafeImageUploadDiagnostics,
  error: unknown,
  stage: ImageUploadStage
): SafeImageUploadDiagnostics {
  if (!error) return diagnostics;
  const parsed = getErrorDiagnostics(error);
  if (stage === 'storage-upload') {
    return { ...diagnostics, uploadStatus: parsed.status, uploadCode: parsed.code, uploadMessage: getErrorMessage(error) };
  }
  if (stage === 'owner-rpc') {
    return { ...diagnostics, rpcStatus: parsed.status, rpcCode: parsed.code, rpcMessage: getErrorMessage(error) };
  }
  return { ...diagnostics, uploadStatus: parsed.status, uploadCode: parsed.code, uploadMessage: getErrorMessage(error) };
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
