// src/app/chat/store/features/streaming.feature.ts
// Manages SSE streaming state.
// Thinking events: replaces instead of appends for same-type/same-status events.

import {
  patchState,
  signalStoreFeature,
  withMethods,
  withState,
}                    from '@ngrx/signals';
import type { Source } from '../../models/chat.models';
import {
  AgentThinkingData,
  DoneData,
  ErrorData,
  SseEvent,
  ThinkingEvent,
  TokenData,
  ToolCallData,
  ToolResultData,
}                    from '../../models/chat.models';

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

      handleSseEvent(
        event: SseEvent
      ): { type: 'done'; content: string; ticketUrl: string | null; messageId?: string; sources: Source[]; suggestions: string[] }
        | { type: 'error'; message: string }
        | null {

        switch (event.type) {

          case 'agent_thinking': {
            const d = event.data as unknown as AgentThinkingData;
            const current = store.thinkingEvents();

            // Replace last event if it was also agent_thinking with same status
            // Prevents "Processing..." appearing 3+ times
            const lastEvent = current[current.length - 1];
            const isSameStatus =
              lastEvent?.type === 'agent_thinking' &&
              lastEvent?.status === d.status;

            const updated = isSameStatus
              ? current  // same — don't add duplicate
              : [...current, { type: 'agent_thinking' as const, status: d.status, node: d.node }];

            patchState(store, { thinkingEvents: updated });
            return null;
          }

          case 'tool_call': {
            const d = event.data as unknown as ToolCallData;
            // Replace any existing tool_call for same tool — avoid duplicates
            const current    = store.thinkingEvents();
            const withoutDup = current.filter(
              e => !(e.type === 'tool_call' && e.tool === d.tool)
            );
            patchState(store, {
              thinkingEvents: [
                ...withoutDup,
                { type: 'tool_call' as const, tool: d.tool, query: d.query },
              ],
            });
            return null;
          }

          case 'tool_result': {
            const d = event.data as unknown as ToolResultData;
            // Replace the matching tool_call with tool_result
            const current = store.thinkingEvents();
            const updated  = current.map(e =>
              e.type === 'tool_call' && e.tool === d.tool
                ? { type: 'tool_result' as const, tool: d.tool, found: d.found }
                : e
            );
            // Add if no matching tool_call found
            const hasMatch = current.some(e => e.type === 'tool_call' && e.tool === d.tool);
            patchState(store, {
              thinkingEvents: hasMatch
                ? updated
                : [...current, { type: 'tool_result' as const, tool: d.tool, found: d.found }],
            });
            return null;
          }

          case 'token': {
            const d = event.data as unknown as TokenData;
            patchState(store, {
              thinkingEvents:   [],  // clear thinking when tokens arrive
              streamingContent: store.streamingContent() + d.token,
            });
            return null;
          }

          case 'done': {
            const d       = event.data as unknown as DoneData;
            const content = store.streamingContent();
            patchState(store, streamingInitialState);
            return {
              type:        'done',
              content,
              ticketUrl:   d.ticket_url,
              messageId:   d.message_id as string | undefined,
              sources:     (d.sources ?? []) as Source[],
              suggestions: (d.suggestions ?? []) as string[],
              title:       (d.title ?? null) as string | null,
            };
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