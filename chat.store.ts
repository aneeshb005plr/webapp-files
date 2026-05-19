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

    function finaliseStream(
      conversationId: string,
      content:        string,
      ticketUrl:      string | null,
      isFirstMessage: boolean,
      realMessageId?: string       // real backend message_id for reactions
    ): void {
      if (content.trim()) {
        const msg: Message = {
          // Use real message_id from backend if available — required for reactions
          // Falls back to local ID only if backend didn't return one
          message_id:      realMessageId ?? `streamed-${Date.now()}`,
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

      // Only reload conversations list for FIRST message
      // This picks up the backend-generated title
      if (isFirstMessage) {
        setTimeout(() => store.loadConversations(), 2000);
      }
    }

    return {

      // Select existing conversation — loads messages
      selectConversation(conversationId: string): void {
        if (store.activeConversationId() === conversationId) return;
        store.clearError();
        store.selectConversation(conversationId);
        store.resetMessages();
        store.loadMessages(conversationId);
      },

      // Create new conversation — NO loadMessages call
      // New conversation has 0 messages — shows starter prompts immediately
      createConversation(): void {
        store.clearError();
        store.createConversation({
          onCreated: (_id: string) => {
            // Just reset messages — do NOT call loadMessages for new conversation
            // It has zero messages so the API call is wasteful
            // isEmptyConversation computed handles showing starter prompts
            store.resetMessages();
          },
        });
      },

      sendMessage(message: string): void {
        const conversationId = store.activeConversationId();
        if (!conversationId || store.isStreaming()) return;

        // Determine if this is the first user message in this conversation
        // Used to decide whether to reload conversations (for title update)
        const currentMessages = store.messages();
        const userMessages    = currentMessages.filter(m => m.role === 'user');
        const isFirstMessage  = userMessages.length === 0;

        // Clean up any previous subscription
        const existingSub = priv()._streamSubscription;
        if (existingSub && !existingSub.closed) existingSub.unsubscribe();
        priv()._streamSubscription = null;
        priv()._isStopped          = false;

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
              if (priv()._isStopped) return;

              const result = store.handleSseEvent(event);
              if (!result) return;

              if (result.type === 'done') {
                priv()._streamSubscription = null;
                finaliseStream(
                  conversationId,
                  result.content,
                  result.ticketUrl,
                  isFirstMessage,
                  result.messageId    // pass real backend message_id
                );
              }

              if (result.type === 'error') {
                if (!priv()._isStopped) {
                  store.setError(result.message);
                  store.stopStreamingState();
                }
              }
            },

            error: () => {
              if (!priv()._isStopped) {
                store.stopStreamingState();
                store.setError('Connection error. Please try again.');
              }
              priv()._streamSubscription = null;
            },

            complete: () => {
              if (priv()._isStopped) return;
              if (store.isStreaming()) {
                // No real messageId on complete — message was already saved via done event
                finaliseStream(
                  conversationId,
                  store.streamingContent(),
                  null,
                  isFirstMessage
                );
              }
              priv()._streamSubscription = null;
            },
          });

        priv()._streamSubscription = sub;
      },

      stopStreaming(): void {
        const conversationId = store.activeConversationId();

        priv()._isStopped = true;

        const sub = priv()._streamSubscription;
        if (sub && !sub.closed) sub.unsubscribe();
        priv()._streamSubscription = null;

        if (conversationId) {
          store._chatService.stopStreaming(conversationId)
            .subscribe({ error: () => {} });
        }

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

        setTimeout(() => { priv()._isStopped = false; }, 500);
      },
    };
  }),

  withHooks({
    onInit(store) {
      store.loadConversations();
    },
  })
);