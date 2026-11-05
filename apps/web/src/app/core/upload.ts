import { de } from './i18n/de';
import type { components } from './api-schema';

/** Outcome of one uploaded file as reported by the API. */
export type UploadResult = components['schemas']['UploadResult'];

/**
 * Upload one file and report progress (fetch cannot report upload progress, XHR can).
 * @param file - The file to upload.
 * @param onProgress - Called with a number from 0 to 1 while bytes are sent.
 * @param onUnauthorized - Called if the session expired during the upload (HTTP 401).
 * @returns The API's result for this file.
 */
export function uploadFile(
  file: File,
  onProgress: (fraction: number) => void,
  onUnauthorized?: () => void,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const failed = (message: string): UploadResult => ({ filename: file.name, outcome: 'rejected', message });
    const body = new FormData();
    body.append('files', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents/upload');
    xhr.setRequestHeader('X-Requested-With', 'app');
    xhr.upload.onprogress = (event): void => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = (): void => resolve(failed(de.errors.network));
    xhr.onload = (): void => {
      if (xhr.status === 401) onUnauthorized?.();
      try {
        const parsed = JSON.parse(xhr.responseText) as UploadResult[] | { error?: { message?: string } };
        if (xhr.status === 200 && Array.isArray(parsed) && parsed[0]) resolve(parsed[0]);
        else resolve(failed((!Array.isArray(parsed) && parsed.error?.message) || de.errors.unknown));
      } catch {
        resolve(failed(de.errors.unknown));
      }
    };
    xhr.send(body);
  });
}
