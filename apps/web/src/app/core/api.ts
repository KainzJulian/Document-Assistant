import { Injectable } from '@angular/core';
import { de } from './i18n/de';
import type { components } from './api-schema';

/** Shortcut to the generated schema types. */
type Schemas = components['schemas'];

/** A user as returned by the API (generated from the OpenAPI schema). */
export type User = Schemas['UserOut'];
/** Body to create a user. */
export type UserCreate = Schemas['UserCreate'];
/** Body to change a user. */
export type UserPatch = Schemas['UserPatch'];
/** Body to rename or share a document. */
export type DocumentPatch = Schemas['DocumentPatch'];
/** A library document. */
export type DocumentOut = Schemas['DocumentOut'];
/** Extracted text of a document. */
export type DocumentTextOut = Schemas['DocumentTextOut'];
/** Login credentials. */
export type LoginRequest = Schemas['LoginRequest'];

/** An error answer from the API: HTTP status, stable code and a German message. */
export class ApiRequestError extends Error {
  /**
   * Create the error.
   * @param status - HTTP status code (0 if the server could not be reached).
   * @param code - Stable machine-readable code such as `account_locked`.
   * @param message - German, user-facing message.
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Shape of the API's error envelope. */
interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

/**
 * Thin typed wrapper around `fetch` for the `/api` backend: sends the session cookie and the
 * CSRF header, and turns error answers into `ApiRequestError`.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  /** Called when a request other than login hits an expired session (HTTP 401). */
  onUnauthorized: (() => void) | null = null;

  /**
   * Send a request.
   * @param method - HTTP method.
   * @param path - Path below `/api`, e.g. `/auth/me`.
   * @param body - Optional JSON body.
   * @returns The parsed JSON answer (`undefined` for 204).
   */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'app',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(0, 'network', de.errors.network);
    }
    if (response.status === 204) return undefined as T;
    const data = (await response.json().catch(() => null)) as T | ErrorEnvelope | null;
    if (!response.ok) {
      const error = (data as ErrorEnvelope | null)?.error;
      const code = error?.code ?? 'unknown';
      if (response.status === 401 && code === 'not_authenticated' && path !== '/auth/me') {
        this.onUnauthorized?.();
      }
      throw new ApiRequestError(response.status, code, error?.message ?? de.errors.unknown);
    }
    return data as T;
  }

  /**
   * GET a resource.
   * @param path - Path below `/api`.
   * @returns The parsed JSON answer.
   */
  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * POST a body.
   * @param path - Path below `/api`.
   * @param body - Optional JSON body.
   * @returns The parsed JSON answer.
   */
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * DELETE a resource.
   * @param path - Path below `/api`.
   * @returns Nothing (the API answers 204).
   */
  delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }

  /**
   * PATCH a resource.
   * @param path - Path below `/api`.
   * @param body - JSON body with the fields to change.
   * @returns The parsed JSON answer.
   */
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
}
