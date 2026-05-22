// src/app/chat/models/chat.models.ts
// All TypeScript interfaces for the chat feature.
// These match the backend API response structures exactly.

// ── Source reference from vector search ──────────────────────────────────────
export interface Source {
  file_name:   string;
  source_url:  string;
  application: string | null;
  // rerank_score removed — new Vector API only returns cited chunks
  // (quality already guaranteed, score no longer provided)
}

// ── Individual message ────────────────────────────────────────────────────────
export interface Message {
  message_id:      string;
  conversation_id: string;
  role:            'user' | 'assistant';
  content:         string;
  sources:         Source[] | null;
  ticket_url:      string | null;
  reaction:        'thumbs_up' | 'thumbs_down' | null;
  created_at:      string;
  isStreaming?:    boolean;   // local only — not from API
}

// ── Token usage per agent/model ───────────────────────────────────────────────
export interface TokenSummary {
  input_tokens:  number;
  output_tokens: number;
  total_tokens:  number;
}

export interface ConversationTokenUsage {
  total_input_tokens:  number;
  total_output_tokens: number;
  total_tokens:        number;
  by_agent: Record<string, TokenSummary>;
  by_model: Record<string, TokenSummary>;
}

// ── Conversation session ──────────────────────────────────────────────────────
export interface Conversation {
  conversation_id:  string;
  user_id:          string;
  title:            string;
  summary:          string | null;
  last_message:     string | null;
  last_message_at:  string | null;
  message_count:    number;
  token_usage:      ConversationTokenUsage;
  created_at:       string;
  is_deleted:       boolean;
}

// ── Paginated messages response ───────────────────────────────────────────────
export interface PaginatedMessages {
  messages:    Message[];
  has_more:    boolean;
  next_before: string | null;   // ISO datetime cursor for scroll up
}

// ── SSE event types from backend ──────────────────────────────────────────────
export type SseEventType =
  | 'agent_thinking'
  | 'tool_call'
  | 'tool_result'
  | 'token'
  | 'done'
  | 'error'
  | 'heartbeat';

export interface SseEvent {
  type: SseEventType;
  data: Record<string, unknown>;
}

// Specific SSE event data shapes
export interface AgentThinkingData {
  status: string;
  node:   string;
}

export interface ToolCallData {
  tool:  string;
  query: string;
}

export interface ToolResultData {
  tool:  string;
  found: boolean;
}

export interface TokenData {
  token: string;
}

export interface DoneData {
  message_id:  string;
  ticket_url:  string | null;
  sources:     Source[];      // citations from vector search
  suggestions: string[];      // grounded follow-up questions
}

export interface ErrorData {
  message: string;
}

// ── Thinking event for UI display ─────────────────────────────────────────────
export interface ThinkingEvent {
  type:    'agent_thinking' | 'tool_call' | 'tool_result';
  status?: string;
  node?:   string;
  tool?:   string;
  query?:  string;
  found?:  boolean;
}

// ── NgRx Signal Store state ───────────────────────────────────────────────────
export interface ChatState {
  conversations:          Conversation[];
  activeConversationId:   string | null;
  messages:               Message[];
  isLoadingConversations: boolean;
  isLoadingMessages:      boolean;
  isStreaming:            boolean;
  streamingContent:       string;
  thinkingEvents:         ThinkingEvent[];
  hasMoreMessages:        boolean;
  nextBefore:             string | null;
  error:                  string | null;
  sidebarCollapsed:       boolean;
  searchQuery:            string;
  suggestions:            string[];   // grounded follow-up questions for active message
}

// ── API request bodies ────────────────────────────────────────────────────────
export interface SendMessageRequest {
  session_id: string;
  message:    string;
}

export interface StopStreamRequest {
  session_id: string;
}

export interface ReactionRequest {
  reaction: 'thumbs_up' | 'thumbs_down';
}

export interface RenameTitleRequest {
  title: string;
}