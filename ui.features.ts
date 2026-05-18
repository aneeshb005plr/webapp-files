// src/app/chat/store/features/ui.feature.ts
// UI state — sidebar collapse, search query, error.
// Completely isolated — no dependency on other features.

import { patchState, signalStoreFeature, withMethods, withState } from '@ngrx/signals';

export interface UiState {
  sidebarCollapsed: boolean;
  searchQuery:      string;
  error:            string | null;
}

export const uiInitialState: UiState = {
  sidebarCollapsed: false,
  searchQuery:      '',
  error:            null,
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
    }))
  );
}