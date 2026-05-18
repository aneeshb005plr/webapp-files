// src/app/app.routes.ts
// Root routes — redirects to /chat as default.
// Dashboard removed — chat is the main feature.

import { Routes }        from '@angular/router';
import { AuthGuard }     from '@rco/angular-auth-extensions';
import { TokenComponent } from './auth/token.component/token.component';
import { environment }   from '../environments/environment';

const guard = environment.useAuth ? [AuthGuard] : undefined;

export const routes: Routes = [
  {
    path:      '',
    pathMatch: 'full',
    redirectTo: 'chat',
  },
  {
    path:         'chat',
    canActivate:  guard,
    loadChildren: () =>
      import('./chat/chat.routes').then(m => m.CHAT_ROUTES),
  },
  {
    path:         'profile',
    canActivate:  guard,
    loadChildren: () =>
      import('./profile/profile.routes').then(m => m.PROFILE_ROUTES),
  },
  {
    path:         'logout',
    loadChildren: () =>
      import('./auth/logout/logout-routes').then(m => m.LOGOUT_ROUTES),
  },
  {
    path:      'login/token',
    component: TokenComponent,
  },
  {
    path:       '**',
    redirectTo: 'chat',
  },
];