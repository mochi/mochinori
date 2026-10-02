import type {ImageMirror, ImageUploader} from './ImageUploadExtension.ts';

export interface HttpImageUploaderOptions {
  /**
   * The endpoint that receives the image: the raw image as the request body
   * for an upload, or `{"url": "<remote url>"}` as JSON for a mirror
   */
  url: string;
  /** Extra request headers, such as an authorization token */
  headers?: Record<string, string>;
}

/**
 * Creates an {@link ImageUploader} that POSTs the image as the raw request
 * body (with its MIME type as `Content-Type`) and expects a JSON response
 * of `{"src": "<url>"}`. A relative `src` resolves against `url`.
 *
 * It uses `XMLHttpRequest` rather than `fetch` because only XHR reports
 * upload progress.
 */
export function createHttpImageUploader({
  url,
  headers = {},
}: HttpImageUploaderOptions): ImageUploader {
  return (file, {onProgress, signal}) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const onAbort = () => xhr.abort();
      signal.addEventListener('abort', onAbort, {once: true});
      xhr.open('POST', url);
      xhr.responseType = 'json';
      if (file.type) {
        xhr.setRequestHeader('Content-Type', file.type);
      }
      for (const [name, value] of Object.entries(headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.addEventListener('progress', event => {
        if (event.lengthComputable) {
          onProgress(event.loaded / event.total);
        }
      });
      xhr.addEventListener('loadend', () => {
        signal.removeEventListener('abort', onAbort);
        const body: unknown = xhr.response;
        const src =
          body !== null && typeof body === 'object' && 'src' in body
            ? body.src
            : undefined;
        if (xhr.status >= 200 && xhr.status < 300 && typeof src === 'string') {
          resolve({src: new URL(src, xhr.responseURL || url).href});
        } else {
          const message =
            body !== null && typeof body === 'object' && 'error' in body
              ? String(body.error)
              : `Upload failed with status ${xhr.status}`;
          reject(new Error(message));
        }
      });
      xhr.send(file);
    });
}

/**
 * Creates an {@link ImageMirror} that POSTs `{"url": "<remote url>"}` as
 * JSON and expects the same `{"src": "<url>"}` response as
 * {@link createHttpImageUploader}. The server fetches the remote image and
 * stores its own copy.
 */
export function createHttpImageMirror({
  url,
  headers = {},
}: HttpImageUploaderOptions): ImageMirror {
  return async (src, {signal}) => {
    const response = await fetch(url, {
      body: JSON.stringify({url: src}),
      headers: {...headers, 'Content-Type': 'application/json'},
      method: 'POST',
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    const mirrored =
      body !== null && typeof body === 'object' && 'src' in body
        ? body.src
        : undefined;
    if (response.ok && typeof mirrored === 'string') {
      return {src: new URL(mirrored, response.url || url).href};
    }
    throw new Error(
      body !== null && typeof body === 'object' && 'error' in body
        ? String(body.error)
        : `Mirror failed with status ${response.status}`,
    );
  };
}
