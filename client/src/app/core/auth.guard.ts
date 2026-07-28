import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ChatStateService } from './chat-state.service';

export const authGuard: CanActivateFn = () => {
  const chatState = inject(ChatStateService);
  const router = inject(Router);

  if (chatState.currentUser()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
