// src/app/chat/components/chat-shell/chat-shell.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { ChatStore }        from '../../store/chat.store';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector:        'app-chat-shell',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [SidebarComponent],
  templateUrl:     './chat-shell.component.html',
  styleUrl:        './chat-shell.component.scss',
})
export class ChatShellComponent {
  protected readonly store = inject(ChatStore);
}