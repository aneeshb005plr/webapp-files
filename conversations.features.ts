// src/app/chat/store/features/conversations.feature.ts
// Manages conversation sessions — CRUD, selection, search filtering.
// Methods use rxMethod for all async HTTP calls.
// Cross-feature: setError from UiState is handled in chat.store.ts coordinator.

import { computed }                           from '@angular/core';
import { tapResponse }                        from '@ngrx/operators';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
}                                             from '@ngrx/signals';
import { rxMethod }                           from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap }               from 'rxjs';
import { Conversation }                       from '../../models/chat.models';
import { ChatService }                        from '../../services/chat.service';

export interface ConversationsState {
  conversations:          Conversation[];
  activeConversationId:   string | null;
  isLoadingConversations: boolean;
}

export const conversationsInitialState: ConversationsState = {
  conversations:          [],
  activeConversationId:   null,
  isLoadingConversations: false,
};

export function withChatConversations(chatService: ChatService) {
  return signalStoreFeature(
    withState<ConversationsState>(conversationsInitialState),

    withComputed(store => ({

      activeConversation: computed(() =>
        store.conversations().find(
          c => c.conversation_id === store.activeConversationId()
        ) ?? null
      ),

      filteredConversations: computed(() => {
        // searchQuery comes from UiState — exposed via chat.store.ts withFeature
        // Components use store.filteredConversations() which is computed here
        // Search filtering delegated to chat.store.ts where both states are visible
        return store.conversations();
      }),
    })),

    withMethods(store => ({

      loadConversations: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoadingConversations: true })),
          switchMap(() =>
            chatService.getSessions().pipe(
              tapResponse({
                next: (conversations: Conversation[]) =>
                  patchState(store, {
                    conversations,
                    isLoadingConversations: false,
                  }),
                error: () =>
                  patchState(store, { isLoadingConversations: false }),
              })
            )
          )
        )
      ),

      createConversation: rxMethod<void>(
        pipe(
          switchMap(() =>
            chatService.createSession().pipe(
              tapResponse({
                next: (conversation: Conversation) =>
                  patchState(store, {
                    conversations:        [conversation, ...store.conversations()],
                    activeConversationId: conversation.conversation_id,
                  }),
                error: () => { /* error handled in chat.store.ts */ },
              })
            )
          )
        )
      ),

      selectConversation(conversationId: string): void {
        if (store.activeConversationId() === conversationId) return;
        patchState(store, { activeConversationId: conversationId });
      },

      deleteConversation: rxMethod<string>(
        pipe(
          switchMap(conversationId =>
            chatService.deleteSession(conversationId).pipe(
              tapResponse({
                next: () => {
                  const remaining  = store.conversations().filter(
                    c => c.conversation_id !== conversationId
                  );
                  const wasActive  = store.activeConversationId() === conversationId;
                  patchState(store, {
                    conversations:        remaining,
                    activeConversationId: wasActive
                      ? (remaining[0]?.conversation_id ?? null)
                      : store.activeConversationId(),
                  });
                },
                error: () => { /* error handled in chat.store.ts */ },
              })
            )
          )
        )
      ),

      renameConversation: rxMethod<{ id: string; title: string }>(
        pipe(
          switchMap(({ id, title }) =>
            chatService.renameSession(id, title).pipe(
              tapResponse({
                next: () =>
                  patchState(store, {
                    conversations: store.conversations().map(c =>
                      c.conversation_id === id ? { ...c, title } : c
                    ),
                  }),
                error: () => { /* error handled in chat.store.ts */ },
              })
            )
          )
        )
      ),

      // Called by streaming feature after assistant message completes
      updateConversationMeta(
        conversationId: string,
        lastMessage:    string
      ): void {
        patchState(store, {
          conversations: store.conversations().map(c =>
            c.conversation_id === conversationId
              ? {
                  ...c,
                  last_message:    lastMessage.substring(0, 100),
                  last_message_at: new Date().toISOString(),
                  message_count:   c.message_count + 1,
                }
              : c
          ),
        });
      },
    }))
  );
}