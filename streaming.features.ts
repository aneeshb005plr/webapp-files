// src/app/chat/store/features/streaming.feature.ts
// Manages SSE streaming state — thinking events, streaming content, stop.
// Pure state only — no methods (streaming logic in chat.store.ts coordinator
// because it needs cross-feature access to messages + conversations).

import {
  patchState,
  signalStoreFeature,
  withMethods,
  withState,
}                     from '@ngrx/signals';
import {
  AgentThinkingData,
  Message,
  SseEvent,
  ThinkingEvent,
  TokenData,
  ToolCallData,
  ToolResultData,
  DoneData,
  ErrorData,
}                     from '../../models/chat.models';

export interface StreamingState {
  isStreaming:      boolean;
  streamingContent: string;
  thinkingEvents:   ThinkingEvent[];
}

export const streamingInitialState: StreamingState = {
  isStreaming:      false,
  streamingContent: '',
  thinkingEvents:   [],
};

export function withChatStreaming() {
  return signalStoreFeature(
    withState<StreamingState>(streamingInitialState),
    withMethods(store => ({

      startStreaming(): void {
        patchState(store, {
          isStreaming:      true,
          streamingContent: '',
          thinkingEvents:   [],
        });
      },

      stopStreamingState(): void {
        patchState(store, {
          isStreaming:      false,
          streamingContent: '',
          thinkingEvents:   [],
        });
      },

      // Processes incoming SSE events and updates streaming state
      // Returns:
      //   { type: 'done', content, ticketUrl } when stream completes
      //   { type: 'error', message }           when error occurs
      //   null                                 for all other events (state updated internally)
      handleSseEvent(
        event: SseEvent
      ): { type: 'done'; content: string; ticketUrl: string | null }
        | { type: 'error'; message: string }
        | null {

        switch (event.type) {

          case 'agent_thinking': {
            const d = event.data as unknown as AgentThinkingData;
            patchState(store, {
              thinkingEvents: [
                ...store.thinkingEvents(),
                { type: 'agent_thinking', status: d.status, node: d.node },
              ],
            });
            return null;
          }

          case 'tool_call': {
            const d = event.data as unknown as ToolCallData;
            patchState(store, {
              thinkingEvents: [
                ...store.thinkingEvents(),
                { type: 'tool_call', tool: d.tool, query: d.query },
              ],
            });
            return null;
          }

          case 'tool_result': {
            const d = event.data as unknown as ToolResultData;
            patchState(store, {
              thinkingEvents: [
                ...store.thinkingEvents(),
                { type: 'tool_result', tool: d.tool, found: d.found },
              ],
            });
            return null;
          }

          case 'token': {
            const d = event.data as unknown as TokenData;
            patchState(store, {
              // Clear thinking events when first token arrives
              thinkingEvents:   store.thinkingEvents().length > 0
                ? []
                : store.thinkingEvents(),
              streamingContent: store.streamingContent() + d.token,
            });
            return null;
          }

          case 'done': {
            const d       = event.data as unknown as DoneData;
            const content = store.streamingContent();
            patchState(store, streamingInitialState);
            return { type: 'done', content, ticketUrl: d.ticket_url };
          }

          case 'error': {
            const d = event.data as unknown as ErrorData;
            patchState(store, streamingInitialState);
            return { type: 'error', message: d.message };
          }

          case 'heartbeat':
            return null;

          default:
            return null;
        }
      },
    }))
  );
}