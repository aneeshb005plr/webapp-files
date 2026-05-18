// src/app/chat/chat.routes.ts

import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/chat-shell/chat-shell.component')
        .then(m => m.ChatShellComponent),
  },
];