// src/app/chat/components/chat-shell/chat-shell.component.ts
// Minimal shell — just confirms routing works.
// Real layout built in Step 2.

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector:        'app-chat-shell',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat-shell-placeholder">
      <h2>NextGenAMS Chat</h2>
      <p>Step 1 complete — routing works ✅</p>
    </div>
  `,
  styles: [`
    .chat-shell-placeholder {
      display:         flex;
      flex-direction:  column;
      align-items:     center;
      justify-content: center;
      height:          100%;
      color:           var(--app-text-primary);
      gap:             1rem;
    }
  `],
})
export class ChatShellComponent {}