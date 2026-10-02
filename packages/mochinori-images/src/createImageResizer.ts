import type {ImagePreparer} from './ImageUploadExtension.ts';

export interface ImageResizerOptions {
  /** Widest image uploaded, in pixels (default 2048) */
  maxWidth?: number;
  /** Tallest image uploaded, in pixels (default 2048) */
  maxHeight?: number;
  /**
   * Largest image uploaded, in bytes (default no limit). A larger image is
   * re-encoded, first at its full size and then smaller, until it fits.
   * Images within every limit are uploaded byte for byte.
   */
  maxBytes?: number;
  /** Encoder quality from 0 to 1 for JPEG and WebP output (default 0.92) */
  quality?: number;
}

// Each retry for maxBytes shrinks the image by at least this factor
const MIN_STEP = 0.5;
// Re-encodes for maxBytes, after which the last attempt is returned (and
// the extension's maxFileSize check rejects it if it is still too large)
const MAX_ATTEMPTS = 6;

function drawingContext(
  canvas: OffscreenCanvas,
): OffscreenCanvasRenderingContext2D | null {
  try {
    // Keeps the wide-gamut colors of phone photos where supported
    return canvas.getContext('2d', {colorSpace: 'display-p3'});
  } catch {
    return canvas.getContext('2d');
  }
}

/**
 * Creates an {@link ImagePreparer} that re-encodes images that are larger
 * than `maxWidth` × `maxHeight` or `maxBytes`, keeping their aspect ratio,
 * EXIF orientation and (where the browser supports it) Display P3 color.
 * JPEG photos stay JPEG; other images become WebP where the browser can
 * encode it, else PNG. Re-encoding drops EXIF metadata such as location.
 * Images within every limit, GIFs (which could be animated), and anything
 * the browser can't decode are uploaded unchanged.
 *
 * For uploads as close to lossless as possible, lift the dimension limits
 * and set only `maxBytes` to the server's limit:
 * `createImageResizer({maxBytes, maxHeight: Infinity, maxWidth: Infinity})`.
 */
export function createImageResizer(
  options: ImageResizerOptions = {},
): ImagePreparer {
  const {
    maxBytes = Infinity,
    maxHeight = 2048,
    maxWidth = 2048,
    quality = 0.92,
  } = options;
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
      let scale = Math.min(
        1,
        maxWidth / bitmap.width,
        maxHeight / bitmap.height,
      );
      if (scale === 1 && image.size <= maxBytes) {
        return image;
      }
      const type = image.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
      let result: Blob = image;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        // Checked above: without OffscreenCanvas the image is returned as is
        // eslint-disable-next-line compat/compat
        const canvas = new OffscreenCanvas(width, height);
        const context = drawingContext(canvas);
        if (!context) {
          return image;
        }
        context.drawImage(bitmap, 0, 0, width, height);
        result = await canvas.convertToBlob({quality, type});
        if (result.size <= maxBytes) {
          return result;
        }
        // Bytes grow roughly with the pixel count, so scale each side by
        // the square root of the overshoot, with some margin
        scale *= Math.max(MIN_STEP, Math.sqrt(maxBytes / result.size) * 0.95);
      }
      return result;
    } finally {
      bitmap.close();
    }
  };
}
