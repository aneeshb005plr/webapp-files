// src/app/chat/store/chat.store.ts
// Root store — composes all features, coordinates cross-feature logic.
//
// Lazy session creation pattern (2026 production standard):
//   "New Chat" clicked  → sets isPendingNewConversation=true (local state only, NO API call)
//   User types + sends  → creates session in DB THEN starts SSE stream
//   User refreshes      → no orphaned empty sessions in DB ever
//   User clicks away    → isPendingNewConversation resets (nothing to clean up)

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
import { Message, Source }                    from '../models/chat.models';
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

    // User can send if: not streaming AND (active conversation OR pending new conv)
    canSend: computed(() =>
      !store.isStreaming() &&
      (store.activeConversationId() !== null || store.isPendingNewConversation())
    ),

    // Show starter prompts when: pending new conv OR active conv with no messages
    isEmptyConversation: computed(() =>
      store.isPendingNewConversation() ||
      (
        store.activeConversationId() !== null &&
        store.messages().length === 0 &&
        !store.isLoadingMessages()
      )
    ),
  })),

  // ── Cross-feature methods ───────────────────────────────────────────────
  withMethods(store => {

    const priv = () => store as unknown as StorePrivate;

    // ── Internal: run SSE stream for a known conversationId ───────────────
    function _streamMessage(
      conversationId: string,
      message:        string,
      isFirstMessage: boolean,
    ): void {
      const existingSub = priv()._streamSubscription;
      if (existingSub && !existingSub.closed) existingSub.unsubscribe();
      priv()._streamSubscription = null;
      priv()._isStopped          = false;

      // Optimistic user message — appears immediately
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
              _finaliseStream(
                conversationId,
                result.content,
                result.ticketUrl,
                isFirstMessage,
                result.messageId,
                result.sources,
                result.suggestions,
                result.title,
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
              _finaliseStream(
                conversationId,
                store.streamingContent(),
                null,
                isFirstMessage,
              );
            }
            priv()._streamSubscription = null;
          },
        });

      priv()._streamSubscription = sub;
    }

    // ── Internal: finalise after stream completes ─────────────────────────
    function _finaliseStream(
      conversationId: string,
      content:        string,
      ticketUrl:      string | null,
      isFirstMessage: boolean,
      realMessageId?: string,
      sources:        Source[] = [],
      suggestions:    string[] = [],
      title:          string | null = null,
    ): void {
      if (content.trim()) {
        const msg: Message = {
          message_id:      realMessageId ?? `streamed-${Date.now()}`,
          conversation_id: conversationId,
          role:            'assistant',
          content,
          sources:         sources.length > 0 ? sources : null,
          ticket_url:      ticketUrl,
          reaction:        null,
          created_at:      new Date().toISOString(),
        };
        store.appendAssistantMessage(msg);
        store.updateConversationMeta(conversationId, content);
      }

      store.stopStreamingState();

      if (suggestions.length > 0) {
        store.setSuggestions(suggestions);
      } else {
        store.clearSuggestions();
      }

      // Update title immediately from done payload — no setTimeout needed
      // Backend generates title BEFORE sending done event
      if (isFirstMessage && title) {
        store.updateConversationTitle(conversationId, title);
      }
    }

    return {

      // ── Select existing conversation ─────────────────────────────────────
      selectConversation(conversationId: string): void {
        if (store.activeConversationId() === conversationId) return;

        // Cancel pending new conversation if user clicks an existing one
        if (store.isPendingNewConversation()) {
          store.setPendingNewConversation(false);
        }

        store.clearError();
        store.clearSuggestions();
        store.selectConversation(conversationId);
        store.resetMessages();
        store.loadMessages(conversationId);
      },

      // ── New Chat — lazy creation (NO API call) ───────────────────────────
      // Sets a pending flag — actual session created when first message sent.
      // This prevents orphaned empty sessions on refresh.
      createConversation(): void {
        // Already pending or already on empty conversation — do nothing
        if (store.isPendingNewConversation() || store.isEmptyConversation()) return;

        store.clearError();
        store.clearSuggestions();

        // Deselect any active conversation
        patchState(store, { activeConversationId: null });
        store.resetMessages();

        // Mark as pending — UI shows starter prompts, input is enabled (canSend handles it)
        store.setPendingNewConversation(true);
      },

      // ── Send message — creates session lazily if pending ─────────────────
      sendMessage(message: string): void {
        if (store.isStreaming()) return;

        // ── Lazy session creation ──────────────────────────────────────────
        // If pending new conversation, create the session NOW (user has committed)
        if (store.isPendingNewConversation()) {
          store._chatService.createSession().subscribe({
            next: conversation => {
              // Session created — update state
              patchState(store, {
                conversations:            [conversation, ...store.conversations()],
                activeConversationId:     conversation.conversation_id,
                isPendingNewConversation: false,
              });

              // Start stream — this IS the first message (brand new session)
              _streamMessage(conversation.conversation_id, message, true);
            },
            error: () => {
              store.setError('Failed to create conversation. Please try again.');
              store.setPendingNewConversation(false);
            },
          });
          return;
        }

        // ── Existing conversation ──────────────────────────────────────────
        const conversationId = store.activeConversationId();
        if (!conversationId) return;

        const isFirstMessage = store.messages().filter(m => m.role === 'user').length === 0;
        _streamMessage(conversationId, message, isFirstMessage);
      },

      // ── Stop streaming ───────────────────────────────────────────────────
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