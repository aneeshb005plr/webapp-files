// src/app/chat/services/chat.service.ts
// All HTTP and SSE communication with NextGenAMS backend.
// HttpClient handles auth token automatically via HttpErrorLoggingInterceptor.
// fetch() for SSE needs token manually from OAuthService.getAccessToken().

import { inject, Injectable }   from '@angular/core';
import { HttpClient }            from '@angular/common/http';
import { OAuthService }          from 'angular-oauth2-oidc';
import { Observable }            from 'rxjs';
import { environment }           from '../../../environments/environment';
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

  private readonly http         = inject(HttpClient);
  private readonly oauthService = inject(OAuthService);
  private readonly baseUrl      = `${environment.apiUrl}/nextgenams-agent/api/v1/chat`;

  // ── Auth helper ─────────────────────────────────────────────────────────────
  // Returns Authorization header value — works for both dev (no auth) and prod
  private getAuthHeaders(): Record<string, string> {
    const token = this.oauthService.getAccessToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

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
    return this.http.patch<void>(
      `${this.baseUrl}/sessions/${conversationId}/title`, body
    );
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

  addReaction(
    messageId: string,
    reaction: 'thumbs_up' | 'thumbs_down'
  ): Observable<Message> {
    const body: ReactionRequest = { reaction };
    return this.http.post<Message>(
      `${this.baseUrl}/messages/${messageId}/reaction`, body
    );
  }

  stopStreaming(sessionId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/stop`, { session_id: sessionId });
  }

  // ── SSE Streaming ───────────────────────────────────────────────────────────
  // Uses native fetch() — EventSource cannot POST with body.
  // Auth token added manually via OAuthService.getAccessToken().

  streamMessage(sessionId: string, message: string): Observable<SseEvent> {
    const url  = `${this.baseUrl}/`;
    const body = JSON.stringify({ session_id: sessionId, message });

    return new Observable<SseEvent>(observer => {
      const controller = new AbortController();

      fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),   // inject Bearer token
        },
        body,
        signal: controller.signal,
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

          const reader        = response.body.getReader();
          const decoder       = new TextDecoder();
          let buffer          = '';
          let currentEvent: SseEventType = 'token';

          while (true) {
            const { done, value } = await reader.read();
            if (done) { observer.complete(); break; }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer      = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event:')) {
                currentEvent = line.slice(6).trim() as SseEventType;
              } else if (line.startsWith('data:') && currentEvent !== 'heartbeat') {
                try {
                  const data = JSON.parse(line.slice(5).trim());
                  observer.next({ type: currentEvent, data });
                } catch { /* ignore malformed */ }
              } else if (line === '') {
                currentEvent = 'token';
              }
            }
          }
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') observer.complete();
          else observer.error(err);
        });

      return () => controller.abort();
    });
  }
}