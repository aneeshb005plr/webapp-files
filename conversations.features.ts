// src/app/chat/store/features/conversations.feature.ts

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
    })),

    withMethods(store => ({

      loadConversations: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { isLoadingConversations: true })),
          switchMap(() =>
            chatService.getSessions().pipe(
              tapResponse({
                next: (conversations: Conversation[]) =>
                  patchState(store, { conversations, isLoadingConversations: false }),
                error: () =>
                  patchState(store, { isLoadingConversations: false }),
              })
            )
          )
        )
      ),

      // Returns conversation_id so coordinator can loadMessages after
      createConversation: rxMethod<{ onCreated: (id: string) => void }>(
        pipe(
          switchMap(({ onCreated }) =>
            chatService.createSession().pipe(
              tapResponse({
                next: (conversation: Conversation) => {
                  patchState(store, {
                    conversations:        [conversation, ...store.conversations()],
                    activeConversationId: conversation.conversation_id,
                  });
                  // Notify coordinator to load messages
                  onCreated(conversation.conversation_id);
                },
                error: () => { /* error handled in coordinator */ },
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
                  const remaining = store.conversations().filter(
                    c => c.conversation_id !== conversationId
                  );
                  const wasActive = store.activeConversationId() === conversationId;
                  patchState(store, {
                    conversations:        remaining,
                    activeConversationId: wasActive
                      ? (remaining[0]?.conversation_id ?? null)
                      : store.activeConversationId(),
                  });
                },
                error: () => { },
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
                error: () => { },
              })
            )
          )
        )
      ),

      updateConversationMeta(conversationId: string, lastMessage: string): void {
        patchState(store, {
          conversations: store.conversations().map(c => {
            if (c.conversation_id !== conversationId) return c;
            return {
              ...c,
              last_message:    lastMessage.substring(0, 100),
              last_message_at: new Date().toISOString(),
              message_count:   c.message_count + 1,
            };
          }),
        });
      },
    }))
  );
}