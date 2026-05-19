// src/app/chat/store/chat.store.ts
// Root store — composes all features, coordinates cross-feature logic.

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

  withChatUI(),

  withProps(() => ({
    _chatService:        inject(ChatService),
    _streamSubscription: null as Subscription | null,
  })),

  withFeature(store => withChatConversations(store._chatService)),
  withFeature(store => withChatMessages(store._chatService)),
  withChatStreaming(),

  // ── Cross-feature computed ──────────────────────────────────────────────
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

    // Override selectConversation — also resets + loads messages
    selectConversation(conversationId: string): void {
      if (store.activeConversationId() === conversationId) return;
      store.selectConversation(conversationId);
      store.resetMessages();
      store.loadMessages(conversationId);
    },

    // Override createConversation — loads messages after creation
    createConversation(): void {
      store.createConversation({
        onCreated: (conversationId: string) => {
          // Reset messages and load (empty for new session — shows starter prompts)
          store.resetMessages();
          store.loadMessages(conversationId);
        },
      });
    },

    sendMessage(message: string): void {
      const conversationId = store.activeConversationId();
      if (!conversationId || store.isStreaming()) return;

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

  withHooks({
    onInit(store) {
      store.loadConversations();
    },
  })
);