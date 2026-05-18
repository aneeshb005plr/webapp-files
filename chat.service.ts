// src/app/chat/services/chat.service.ts
// All HTTP and SSE communication with the NextGenAMS backend.
//
// Base URL: environment.apiUrl (http://localhost:8080)
// Full path: /nextgenams-agent/api/v1/chat/...
//
// SSE streaming uses native fetch() + ReadableStream.
// EventSource is NOT used — it does not support POST with body.
// All REST calls use Angular HttpClient.

import { inject, Injectable } from '@angular/core';
import { HttpClient }          from '@angular/common/http';
import { Observable }          from 'rxjs';
import { environment }         from '../../../environments/environment';
import {
  Conversation,
  Message,
  PaginatedMessages,
  ReactionRequest,
  RenameTitleRequest,
  SseEvent,
  SseEventType,
} from '../models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatService {

  private readonly http    = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/nextgenams-agent/api/v1/chat`;

  // ── Session management ──────────────────────────────────────────────────────

  getSessions(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.baseUrl}/sessions`);
  }

  createSession(): Observable<Conversation> {
    return this.http.post<Conversation>(`${this.baseUrl}/sessions`, {});
  }

  deleteSession(conversationId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${conversationId}`);
  }

  renameSession(conversationId: string, title: string): Observable<void> {
    const body: RenameTitleRequest = { title };
    return this.http.patch<void>(`${this.baseUrl}/sessions/${conversationId}/title`, body);
  }

  // ── Messages ────────────────────────────────────────────────────────────────

  getMessages(conversationId: string, before?: string): Observable<PaginatedMessages> {
    const params: Record<string, string> = {};
    if (before) params['before'] = before;
    return this.http.get<PaginatedMessages>(
      `${this.baseUrl}/sessions/${conversationId}/messages`,
      { params }
    );
  }

  addReaction(messageId: string, reaction: 'thumbs_up' | 'thumbs_down'): Observable<Message> {
    const body: ReactionRequest = { reaction };
    return this.http.post<Message>(`${this.baseUrl}/messages/${messageId}/reaction`, body);
  }

  // ── Streaming control ───────────────────────────────────────────────────────

  stopStreaming(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/stop`, { session_id: sessionId });
  }

  // ── SSE Streaming ───────────────────────────────────────────────────────────
  // Uses native fetch() with ReadableStream.
  // EventSource cannot POST with a body — fetch is the correct approach.
  //
  // Parses SSE format:
  //   event: {type}\n
  //   data: {json}\n
  //   \n
  //
  // Emits SseEvent objects to subscriber.
  // Caller can unsubscribe to abort the stream (AbortController).

  streamMessage(sessionId: string, message: string): Observable<SseEvent> {
    const url  = `${this.baseUrl}/`;
    const body = JSON.stringify({ session_id: sessionId, message });

    return new Observable<SseEvent>(observer => {
      const controller = new AbortController();

      fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal:  controller.signal,
      })
        .then(async response => {
          if (!response.ok) {
            observer.error(new Error(`HTTP ${response.status}: ${response.statusText}`));
            return;
          }

          if (!response.body) {
            observer.error(new Error('Response body is null'));
            return;
          }

          const reader  = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer       = '';
          let currentEvent: SseEventType = 'token';

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              observer.complete();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Keep the last incomplete line in buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim() as SseEventType;
              } else if (line.startsWith('data:')) {
                // Skip heartbeat events — no data to process
                if (currentEvent === 'heartbeat') continue;

                try {
                  const data = JSON.parse(line.slice(5).trim());
                  observer.next({ type: currentEvent, data });
                } catch {
                  // Ignore malformed JSON lines
                }
              }
              // Empty line resets event type (SSE spec)
              else if (line === '') {
                currentEvent = 'token';
              }
            }
          }
        })
        .catch((err: Error) => {
          // AbortError is expected when user stops streaming — complete cleanly
          if (err.name === 'AbortError') {
            observer.complete();
          } else {
            observer.error(err);
          }
        });

      // Teardown — called when observer unsubscribes
      return () => controller.abort();
    });
  }
}