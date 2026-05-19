// src/app/chat/store/chat.store.ts
// Root store — composes all features, coordinates cross-feature logic.

import { computed, inject }                   from '@angular/core';
import {
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

type StorePrivate = {
  _streamSubscription: Subscription | null;
  _isStopped:          boolean;
};

export const ChatStore = signalStore(
  { providedIn: 'root' },

  withChatUI(),

  withProps(() => ({
    _chatService:        inject(ChatService),
    _streamSubscription: null as Subscription | null,
    _isStopped:          false,
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
  withMethods(store => {

    const priv = () => store as unknown as StorePrivate;

    function cancelExistingStream(): void {
      const sub = priv()._streamSubscription;
      if (sub && !sub.closed) sub.unsubscribe();
      priv()._streamSubscription = null;
      priv()._isStopped          = false;
    }

    function finaliseStream(
      conversationId: string,
      content:        string,
      ticketUrl:      string | null
    ): void {
      if (content.trim()) {
        const assistantMessage: Message = {
          message_id:      `streamed-${Date.now()}`,
          conversation_id: conversationId,
          role:            'assistant',
          content,
          sources:         null,
          ticket_url:      ticketUrl,
          reaction:        null,
          created_at:      new Date().toISOString(),
        };
        store.appendAssistantMessage(assistantMessage);
        store.updateConversationMeta(conversationId, content);
      }

      store.stopStreamingState();

      // Reload conversations to pick up backend-generated title update
      // Small delay gives backend time to finish title generation
      setTimeout(() => store.loadConversations(), 1500);
    }

    return {

      selectConversation(conversationId: string): void {
        if (store.activeConversationId() === conversationId) return;
        store.selectConversation(conversationId);
        store.resetMessages();
        store.loadMessages(conversationId);
      },

      createConversation(): void {
        store.createConversation({
          onCreated: (conversationId: string) => {
            store.resetMessages();
            store.loadMessages(conversationId);
          },
        });
      },

      sendMessage(message: string): void {
        const conversationId = store.activeConversationId();
        if (!conversationId || store.isStreaming()) return;

        // Cancel any lingering stream before starting new one
        cancelExistingStream();
        priv()._isStopped = false;

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
        store.clearError();

        const subscription = store._chatService
          .streamMessage(conversationId, message)
          .subscribe({
            next: event => {
              if (priv()._isStopped) return;

              const result = store.handleSseEvent(event);
              if (!result) return;

              if (result.type === 'done') {
                priv()._streamSubscription = null;
                finaliseStream(conversationId, result.content, result.ticketUrl);
              }

              if (result.type === 'error') {
                if (priv()._isStopped) return;
                store.setError(result.message);
                store.stopStreamingState();
              }
            },

            error: (err: Error) => {
              if (priv()._isStopped) return;
              console.error('Stream error:', err);
              store.stopStreamingState();
              store.setError('Connection error. Please try again.');
              priv()._streamSubscription = null;
            },

            complete: () => {
              if (priv()._isStopped) return;
              const content = store.streamingContent();
              if (store.isStreaming()) {
                finaliseStream(conversationId, content, null);
              }
              priv()._streamSubscription = null;
            },
          });

        priv()._streamSubscription = subscription;
      },

      stopStreaming(): void {
        const conversationId = store.activeConversationId();

        // Set flag FIRST — suppresses all pending callbacks
        priv()._isStopped = true;

        // Cancel subscription
        const sub = priv()._streamSubscription;
        if (sub && !sub.closed) sub.unsubscribe();
        priv()._streamSubscription = null;

        // Tell backend to stop
        if (conversationId) {
          store._chatService.stopStreaming(conversationId).subscribe({
            error: () => { /* ignore */ }
          });
        }

        // Save whatever was streamed so far
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

        // Reset stopped flag after brief delay so next sendMessage works cleanly
        setTimeout(() => { priv()._isStopped = false; }, 200);
      },

    };
  }),

  withHooks({
    onInit(store) {
      store.loadConversations();
    },
  })
);