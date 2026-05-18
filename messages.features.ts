// src/app/chat/store/features/messages.feature.ts
// Manages message loading, pagination (infinite scroll), and reactions.
// Completely isolated from streaming state.

import { tapResponse }                  from '@ngrx/operators';
import {
  patchState,
  signalStoreFeature,
  withMethods,
  withState,
}                                       from '@ngrx/signals';
import { rxMethod }                     from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap }         from 'rxjs';
import { Message }                      from '../../models/chat.models';
import { ChatService }                  from '../../services/chat.service';

export interface MessagesState {
  messages:         Message[];
  isLoadingMessages: boolean;
  hasMoreMessages:  boolean;
  nextBefore:       string | null;
}

export const messagesInitialState: MessagesState = {
  messages:          [],
  isLoadingMessages: false,
  hasMoreMessages:   false,
  nextBefore:        null,
};

// Helper to reset messages state — used when switching conversations
export const resetMessagesState: MessagesState = {
  messages:          [],
  isLoadingMessages: false,
  hasMoreMessages:   false,
  nextBefore:        null,
};

export function withChatMessages(chatService: ChatService) {
  return signalStoreFeature(
    withState<MessagesState>(messagesInitialState),
    withMethods(store => ({

      loadMessages: rxMethod<string>(
        pipe(
          tap(() => patchState(store, {
            isLoadingMessages: true,
            messages:          [],
            hasMoreMessages:   false,
            nextBefore:        null,
          })),
          switchMap(conversationId =>
            chatService.getMessages(conversationId).pipe(
              tapResponse({
                next: result =>
                  patchState(store, {
                    messages:          result.messages,
                    hasMoreMessages:   result.has_more,
                    nextBefore:        result.next_before,
                    isLoadingMessages: false,
                  }),
                error: () =>
                  patchState(store, { isLoadingMessages: false }),
              })
            )
          )
        )
      ),

      loadMoreMessages: rxMethod<{ conversationId: string; before: string }>(
        pipe(
          tap(() => patchState(store, { isLoadingMessages: true })),
          switchMap(({ conversationId, before }) =>
            chatService.getMessages(conversationId, before).pipe(
              tapResponse({
                next: result =>
                  patchState(store, {
                    // Prepend older messages — newest stays at bottom
                    messages:          [...result.messages, ...store.messages()],
                    hasMoreMessages:   result.has_more,
                    nextBefore:        result.next_before,
                    isLoadingMessages: false,
                  }),
                error: () =>
                  patchState(store, { isLoadingMessages: false }),
              })
            )
          )
        )
      ),

      addReaction: rxMethod<{ messageId: string; reaction: 'thumbs_up' | 'thumbs_down' }>(
        pipe(
          switchMap(({ messageId, reaction }) =>
            chatService.addReaction(messageId, reaction).pipe(
              tapResponse({
                next: (updated: Message) =>
                  patchState(store, {
                    messages: store.messages().map(m =>
                      m.message_id === updated.message_id ? updated : m
                    ),
                  }),
                error: () => { /* error handled in chat.store.ts */ },
              })
            )
          )
        )
      ),

      // Called by streaming feature — appends optimistic user message
      appendMessage(message: Message): void {
        patchState(store, {
          messages: [...store.messages(), message],
        });
      },

      // Called by streaming feature — appends final assistant message
      appendAssistantMessage(message: Message): void {
        patchState(store, {
          messages: [...store.messages(), message],
        });
      },

      resetMessages(): void {
        patchState(store, resetMessagesState);
      },
    }))
  );
}