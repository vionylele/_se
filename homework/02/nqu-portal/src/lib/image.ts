import { compressImageToDataUrl } from '../utils/imageCompressor';

/** Kept for existing imports; the implementation lives in src/utils/imageCompressor.ts. */
export const fileToAvatarDataUrl = (file: File): Promise<string> => compressImageToDataUrl(file);
