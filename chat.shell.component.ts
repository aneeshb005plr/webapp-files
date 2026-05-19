// src/app/chat/components/chat-shell/chat-shell.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { ChatStore }           from '../../store/chat.store';
import { SidebarComponent }    from '../sidebar/sidebar.component';
import { ChatWindowComponent } from '../chat-window/chat-window.component';

@Component({
  selector:        'app-chat-shell',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [SidebarComponent, ChatWindowComponent],
  templateUrl:     './chat-shell.component.html',
  styleUrl:        './chat-shell.component.scss',
})
export class ChatShellComponent {
  protected readonly store = inject(ChatStore);
}