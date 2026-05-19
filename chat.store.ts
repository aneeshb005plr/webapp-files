// src/app/chat/store/chat.store.ts

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
    // _isStopped prevents stopped stream callbacks from affecting next message
    _isStopped:          false,
  })),

  withFeature(store => withChatConversations(store._chatService)),
  withFeature(store => withChatMessages(store._chatService)),
  withChatStreaming(),

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

  withMethods(store => {

    const priv = () => store as unknown as StorePrivate;

    // Saves assistant message and reloads title from backend
    function finaliseStream(
      conversationId: string,
      content:        string,
      ticketUrl:      string | null
    ): void {
      if (content.trim()) {
        const msg: Message = {
          message_id:      `streamed-${Date.now()}`,
          conversation_id: conversationId,
          role:            'assistant',
          content,
          sources:         null,
          ticket_url:      ticketUrl,
          reaction:        null,
          created_at:      new Date().toISOString(),
        };
        store.appendAssistantMessage(msg);
        store.updateConversationMeta(conversationId, content);
      }
      store.stopStreamingState();
      // Reload conversations after delay to pick up backend title generation
      setTimeout(() => store.loadConversations(), 1500);
    }

    return {

      selectConversation(conversationId: string): void {
        if (store.activeConversationId() === conversationId) return;
        store.clearError();          // clear any error from previous conversation
        store.selectConversation(conversationId);
        store.resetMessages();
        store.loadMessages(conversationId);
      },

      createConversation(): void {
        store.clearError();          // clear any error before new conversation
        store.createConversation({
          onCreated: (id: string) => {
            store.resetMessages();
            store.loadMessages(id);
          },
        });
      },

      sendMessage(message: string): void {
        const conversationId = store.activeConversationId();
        if (!conversationId) return;

        // Guard — do not send if still streaming
        if (store.isStreaming()) return;

        // Clean up any previous subscription
        const existingSub = priv()._streamSubscription;
        if (existingSub && !existingSub.closed) existingSub.unsubscribe();
        priv()._streamSubscription = null;

        // Clear stopped flag for fresh stream
        priv()._isStopped = false;

        // Optimistic user message
        store.appendMessage({
          message_id:      `temp-${Date.now()}`,
          conversation_id: conversationId,
          role:            'user',
          content:         message,
          sources:         null,
          ticket_url:      null,
          reaction:        null,
          created_at:      new Date().toISOString(),
        });

        store.startStreaming();
        store.clearError();

        const sub = store._chatService
          .streamMessage(conversationId, message)
          .subscribe({
            next: event => {
              // Ignore events from a stopped stream
              if (priv()._isStopped) return;

              const result = store.handleSseEvent(event);
              if (!result) return;

              if (result.type === 'done') {
                priv()._streamSubscription = null;
                finaliseStream(conversationId, result.content, result.ticketUrl);
              }

              if (result.type === 'error') {
                if (!priv()._isStopped) {
                  store.setError(result.message);
                  store.stopStreamingState();
                }
              }
            },

            error: () => {
              // Only show error if this stream was NOT manually stopped
              if (!priv()._isStopped) {
                store.stopStreamingState();
                store.setError('Connection error. Please try again.');
              }
              priv()._streamSubscription = null;
            },

            complete: () => {
              // Ignore if manually stopped
              if (priv()._isStopped) return;
              if (store.isStreaming()) {
                finaliseStream(conversationId, store.streamingContent(), null);
              }
              priv()._streamSubscription = null;
            },
          });

        priv()._streamSubscription = sub;
      },

      stopStreaming(): void {
        const conversationId = store.activeConversationId();

        // Mark as stopped BEFORE unsubscribing
        // This ensures error/complete callbacks are ignored
        priv()._isStopped = true;

        // Unsubscribe
        const sub = priv()._streamSubscription;
        if (sub && !sub.closed) sub.unsubscribe();
        priv()._streamSubscription = null;

        // Tell backend
        if (conversationId) {
          store._chatService.stopStreaming(conversationId)
            .subscribe({ error: () => {} });
        }

        // Save partial content
        const content = store.streamingContent();
        if (content.trim()) {
          store.appendAssistantMessage({
            message_id:      `stopped-${Date.now()}`,
            conversation_id: conversationId!,
            role:            'assistant',
            content,
            sources:         null,
            ticket_url:      null,
            reaction:        null,
            created_at:      new Date().toISOString(),
          });
          store.updateConversationMeta(conversationId!, content);
        }

        store.stopStreamingState();

        // Reset _isStopped after a safe delay
        // 500ms ensures all pending async callbacks from old stream have fired
        setTimeout(() => {
          priv()._isStopped = false;
        }, 500);
      },

    };
  }),

  withHooks({
    onInit(store) {
      store.loadConversations();
    },
  })
);