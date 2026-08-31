import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthenticatedUser } from '../api/types';

export interface SessionState {
  readonly user: AuthenticatedUser | null;
  /** Notification badge count, read by the navbar on every screen. */
  readonly unreadNotifications: number;
}

/**
 * Session-derived CLIENT state, not a second copy of the server's answer: the API stays the source
 * of truth and this holds what the whole shell needs to render — who is signed in, and the badge
 * count the navbar shows on every screen.
 */
export const sessionSlice = createSlice({
  name: 'session',
  initialState: { user: null, unreadNotifications: 0 } as SessionState,
  reducers: {
    sessionEstablished(state, action: PayloadAction<AuthenticatedUser | null>) {
      state.user = action.payload;
    },
    sessionCleared(state) {
      state.user = null;
      state.unreadNotifications = 0;
    },
    unreadNotificationsSet(state, action: PayloadAction<number>) {
      state.unreadNotifications = Math.max(0, action.payload);
    },
  },
});

export const { sessionEstablished, sessionCleared, unreadNotificationsSet } = sessionSlice.actions;
