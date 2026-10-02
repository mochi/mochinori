import type {ImagePreparer} from './ImageUploadExtension.ts';

export interface ImageResizerOptions {
  /** Widest image uploaded, in pixels (default 2048) */
  maxWidth?: number;
  /** Tallest image uploaded, in pixels (default 2048) */
  maxHeight?: number;
  /** Encoder quality from 0 to 1 for JPEG and WebP output (default 0.85) */
  quality?: number;
}

/**
 * Creates an {@link ImagePreparer} that downscales images larger than
 * `maxWidth` × `maxHeight`, keeping their aspect ratio and EXIF
 * orientation. JPEG photos stay JPEG; other images become WebP where the
 * browser can encode it, else PNG. Images that already fit, GIFs (which
 * could be animated), and anything the browser can't decode are uploaded
 * unchanged.
 */
export function createImageResizer(
  options: ImageResizerOptions = {},
): ImagePreparer {
  const {maxWidth = 2048, maxHeight = 2048, quality = 0.85} = options;
  return async image => {
    if (
      image.type === 'image/gif' ||
      typeof createImageBitmap !== 'function' ||
      typeof OffscreenCanvas !== 'function'
    ) {
      return image;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(image, {imageOrientation: 'from-image'});
    } catch {
      return image;
    }
    try {
      const scale = Math.min(
        1,
        maxWidth / bitmap.width,
        maxHeight / bitmap.height,
      );
      if (scale === 1) {
        return image;
      }
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      // Checked above: without OffscreenCanvas the image is returned as is
      // eslint-disable-next-line compat/compat
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) {
        return image;
      }
      context.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({
        quality,
        type: image.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp',
      });
    } finally {
      bitmap.close();
    }
  };
}
