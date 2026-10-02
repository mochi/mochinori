import type {ImagePreparer} from './ImageUploadExtension.ts';

export interface ImageResizerOptions {
  /**
   * Largest image uploaded, in bytes. Defaults to the extension's
   * `maxFileSize`. An image that fits is uploaded byte for byte; a larger
   * one is re-encoded until it fits.
   */
  maxBytes?: number;
  /** Widest re-encoded image, in pixels (default no limit) */
  maxWidth?: number;
  /** Tallest re-encoded image, in pixels (default no limit) */
  maxHeight?: number;
  /** Encoder quality from 0 to 1 for JPEG and WebP output (default 0.92) */
  quality?: number;
  /**
   * The format to re-encode to, such as `'image/webp'`. When the browser
   * can't encode it, the default applies: JPEG for JPEG photos, else WebP
   * where possible. JPEG has no transparency.
   */
  type?: string;
}

// Each retry shrinks the image by at least this factor
const MIN_STEP = 0.5;
// Re-encodes, after which the last attempt is returned (and the
// extension's maxFileSize check rejects it if it is still too large)
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
 * Creates an {@link ImagePreparer} that uploads every image that fits
 * `maxBytes` (by default the extension's `maxFileSize`) byte for byte, and
 * re-encodes larger ones until they fit: first at full size (or at most
 * `maxWidth` × `maxHeight`), then smaller step by step. Re-encoding keeps
 * the aspect ratio, EXIF orientation and (where the browser supports it)
 * Display P3 color, and drops EXIF metadata such as location. JPEG photos
 * stay JPEG and other images become WebP where the browser can encode it
 * (else PNG), unless `type` asks for another format. GIFs (which could be
 * animated) and images the browser can't decode are never re-encoded.
 */
export function createImageResizer(
  options: ImageResizerOptions = {},
): ImagePreparer {
  const {
    maxHeight = Infinity,
    maxWidth = Infinity,
    quality = 0.92,
    type: preferredType,
  } = options;
  return async (image, {maxFileSize}) => {
    const maxBytes = options.maxBytes ?? maxFileSize;
    if (
      image.size <= maxBytes ||
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
      const defaultType =
        image.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
      const encode = async (canvas: OffscreenCanvas): Promise<Blob> => {
        if (preferredType && preferredType !== defaultType) {
          const blob = await canvas.convertToBlob({
            quality,
            type: preferredType,
          });
          // Browsers return PNG for a type they can't encode
          if (blob.type === preferredType) {
            return blob;
          }
        }
        return canvas.convertToBlob({quality, type: defaultType});
      };
      let scale = Math.min(
        1,
        maxWidth / bitmap.width,
        maxHeight / bitmap.height,
      );
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
        result = await encode(canvas);
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
