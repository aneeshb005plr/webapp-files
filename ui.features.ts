// src/app/chat/store/features/ui.feature.ts
// UI state — sidebar collapse, search query, error.
// Completely isolated — no dependency on other features.

import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';

export interface UiState {
  sidebarCollapsed:         boolean;
  searchQuery:              string;
  error:                    string | null;
  suggestions:              string[];
  isPendingNewConversation: boolean;  // true = New Chat clicked, session not yet created
}

export const uiInitialState: UiState = {
  sidebarCollapsed:         false,
  searchQuery:              '',
  error:                    null,
  suggestions:              [],
  isPendingNewConversation: false,
};

export function withChatUI() {
  return signalStoreFeature(
    withState<UiState>(uiInitialState),
    withMethods(store => ({

      toggleSidebar(): void {
        patchState(store, { sidebarCollapsed: !store.sidebarCollapsed() });
      },

      setSidebarCollapsed(collapsed: boolean): void {
        patchState(store, { sidebarCollapsed: collapsed });
      },

      setSearchQuery(query: string): void {
        patchState(store, { searchQuery: query });
      },

      setError(error: string | null): void {
        patchState(store, { error });
      },

      clearError(): void {
        patchState(store, { error: null });
      },

      setSuggestions(suggestions: string[]): void {
        patchState(store, { suggestions });
      },

      clearSuggestions(): void {
        patchState(store, { suggestions: [] });
      },

      setPendingNewConversation(pending: boolean): void {
        patchState(store, { isPendingNewConversation: pending });
      },
    }))
  );
}