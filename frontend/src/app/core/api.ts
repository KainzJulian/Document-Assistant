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

// NOTE: The types below mirror the W3 endpoints by hand. `make gen-api` generates the same
// shapes into api-schema.ts; switch to `Schemas[...]` when convenient.

/** A provider as the admin sees it (the key is never returned). */
export interface ProviderOut {
  id: number;
  kind: string;
  label: string;
  base_url: string | null;
  enabled: boolean;
  has_key: boolean;
  models: string[];
}

/** Body to add or change a provider; an empty `api_key` keeps the stored one. */
export interface ProviderForm {
  kind: string;
  label: string;
  base_url: string;
  api_key: string;
}

/** Result of "Verbindung testen". */
export interface ProviderTestOut {
  ok: boolean;
  message: string;
  models: string[];
}

/** A provider a person can pick a model from. */
export interface ProviderChoice {
  id: number;
  kind: string;
  label: string;
  local: boolean;
  models: string[];
}

/** A person's settings with the available choices. */
export interface SettingsOut {
  provider_id: number | null;
  model: string | null;
  summary_language: string;
  providers: ProviderChoice[];
}

/** Verdict of the Ollama hardware check. */
export type Verdict = 'fits' | 'partial' | 'cpu_only' | 'too_big';

/** Answer of the Ollama hardware check. */
export interface OllamaFit {
  model: string;
  ram_total_gb: number;
  ram_free_gb: number;
  gpu: { name: string; vram_total_gb: number; vram_free_gb: number } | null;
  need_gb: number;
  verdict: Verdict;
  est_words_per_s: number | null;
  needs_warning: boolean;
  acknowledged: string | null;
}

/** Measured generation speed. */
export interface BenchmarkOut {
  words_per_s: number;
  tokens: number;
  seconds: number;
}

/** A source of an answer. */
export interface Citation {
  n: number;
  chunk_id: string;
  document_id: string;
  document_title: string;
  page_from: number | null;
  page_to: number | null;
  section_path: string | null;
}

/** A chat message as the API returns it. */
export interface ChatMessageOut {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  provider: string | null;
  model: string | null;
  interrupted: boolean;
  created_at: string;
}

/** A document selected for a chat. */
export interface ChatDocument {
  id: string;
  title: string;
  status: string;
}

/** A chat with its documents and messages. */
export interface ChatDetail {
  id: string;
  title: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  documents: ChatDocument[];
  messages: ChatMessageOut[];
}

/** A chat in the sidebar list or a search result. */
export interface ChatSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  snippet: string | null;
  message_id: string | null;
}

/** A passage shown in the citation panel. */
export interface ChunkOut {
  id: string;
  document_id: string;
  document_title: string;
  page_from: number | null;
  page_to: number | null;
  section_path: string | null;
  text: string;
}

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
