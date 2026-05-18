// src/app/chat/store/chat.store.ts
// Root store — composes all features and coordinates cross-feature logic.
//
// Feature responsibilities:
//   withChatUI()            — sidebar, search, error (isolated)
//   withChatConversations() — CRUD, selection (isolated)
//   withChatMessages()      — loading, pagination, reactions (isolated)
//   withChatStreaming()      — SSE state, thinking events (isolated)
//
// Coordinator responsibilities (this file):
//   - Inject ChatService via withProps
//   - sendMessage()   — needs messages + streaming + conversations
//   - stopStreaming()  — needs streaming + backend call
//   - selectConversation() override — resets messages + loads fresh
//   - filteredConversations computed — needs conversations + searchQuery
//   - canSend computed — needs streaming + activeConversationId
//   - onInit hook — loads conversations automatically

import { computed, inject }                   from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withFeature,
  withHooks,
  withMethods,
  withProps,
}                                             from '@ngrx/signals';
import { Subscription }                       from 'rxjs';
import { Message }                            from '../models/chat.models';
import { ChatService }                        from '../services/chat.service';
import { withChatConversations }              from './features/conversations.feature';
import { withChatMessages }                   from './features/messages.feature';
import { withChatStreaming }                  from './features/streaming.feature';
import { withChatUI }                         from './features/ui.feature';

export const ChatStore = signalStore(
  { providedIn: 'root' },

  // ── Feature composition ─────────────────────────────────────────────────
  withChatUI(),

  withProps(() => ({
    _chatService:        inject(ChatService),
    _streamSubscription: null as Subscription | null,
  })),

  withFeature(store => withChatConversations(store._chatService)),
  withFeature(store => withChatMessages(store._chatService)),
  withChatStreaming(),

  // ── Cross-feature computed signals ──────────────────────────────────────
  withComputed(store => ({

    filteredConversations: computed(() => {
      const q = store.searchQuery().toLowerCase().trim();
      if (!q) return store.conversations();
      return store.conversations().filter(
        c => c.title.toLowerCase().includes(q)
      );
    }),

    canSend: computed(() =>
      !store.isStreaming() && store.activeConversationId() !== null
    ),

    isEmptyConversation: computed(() =>
      store.activeConversationId() !== null &&
      store.messages().length === 0 &&
      !store.isLoadingMessages()
    ),
  })),

  // ── Cross-feature methods ───────────────────────────────────────────────
  withMethods(store => ({

    selectConversation(conversationId: string): void {
      if (store.activeConversationId() === conversationId) return;
      store.selectConversation(conversationId);
      store.resetMessages();
      store.loadMessages(conversationId);
    },

    sendMessage(message: string): void {
      const conversationId = store.activeConversationId();
      if (!conversationId || store.isStreaming()) return;

      // Optimistic user message
      const userMessage: Message = {
        message_id:      `temp-${Date.now()}`,
        conversation_id: conversationId,
        role:            'user',
        content:         message,
        sources:         null,
        ticket_url:      null,
        reaction:        null,
        created_at:      new Date().toISOString(),
      };
      store.appendMessage(userMessage);
      store.startStreaming();

      const subscription = store._chatService
        .streamMessage(conversationId, message)
        .subscribe({
          next: event => {
            const result = store.handleSseEvent(event);
            if (!result) return;

            if (result.type === 'done' && result.content.trim()) {
              const assistantMessage: Message = {
                message_id:      `streamed-${Date.now()}`,
                conversation_id: conversationId,
                role:            'assistant',
                content:         result.content,
                sources:         null,
                ticket_url:      result.ticketUrl,
                reaction:        null,
                created_at:      new Date().toISOString(),
              };
              store.appendAssistantMessage(assistantMessage);
              store.updateConversationMeta(conversationId, result.content);
            }

            if (result.type === 'error') {
              store.setError(result.message);
            }
          },

          error: () => {
            store.stopStreamingState();
            store.setError('Connection error. Please try again.');
          },

          complete: () => {
            const content = store.streamingContent();
            if (content && store.isStreaming()) {
              const assistantMessage: Message = {
                message_id:      `streamed-${Date.now()}`,
                conversation_id: conversationId,
                role:            'assistant',
                content,
                sources:         null,
                ticket_url:      null,
                reaction:        null,
                created_at:      new Date().toISOString(),
              };
              store.appendAssistantMessage(assistantMessage);
              store.updateConversationMeta(conversationId, content);
              store.stopStreamingState();
            }
          },
        });

      (store as unknown as { _streamSubscription: Subscription | null })
        ._streamSubscription = subscription;
    },

    stopStreaming(): void {
      const conversationId = store.activeConversationId();

      const sub = (store as unknown as { _streamSubscription: Subscription | null })
        ._streamSubscription;
      if (sub) {
        sub.unsubscribe();
        (store as unknown as { _streamSubscription: Subscription | null })
          ._streamSubscription = null;
      }

      if (conversationId) {
        store._chatService.stopStreaming(conversationId).subscribe();
      }

      const content = store.streamingContent();
      if (content.trim()) {
        const assistantMessage: Message = {
          message_id:      `stopped-${Date.now()}`,
          conversation_id: conversationId!,
          role:            'assistant',
          content,
          sources:         null,
          ticket_url:      null,
          reaction:        null,
          created_at:      new Date().toISOString(),
        };
        store.appendAssistantMessage(assistantMessage);
        store.updateConversationMeta(conversationId!, content);
      }

      store.stopStreamingState();
    },
  })),

  // ── Lifecycle ───────────────────────────────────────────────────────────
  withHooks({
    onInit(store) {
      store.loadConversations();
    },
  })
);