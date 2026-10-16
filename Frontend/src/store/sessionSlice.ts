import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SessionState {
  /** The navbar badge, rendered on every screen, so no single screen owns it. */
  readonly unreadNotifications: number;
}

/**
 * Session-DERIVED client state, and deliberately not the session itself.
 *
 * Who is signed in stays owned by `AuthContext` over `tokenStorage`, because the route guards read
 * it synchronously on the very first render and it has to survive a reload — a store that hydrates
 * empty would bounce an authenticated visitor to Login for a frame. Mirroring the user in here as
 * well would have created a second copy with no reader, which is worse than no Redux at all.
 *
 * What does belong here is the unread count: the navbar renders it on every screen and no screen
 * owns it, which is the actual test for global state.
 */
export const sessionSlice = createSlice({
  name: 'session',
  initialState: { unreadNotifications: 0 } as SessionState,
  reducers: {
    unreadNotificationsSet(state, action: PayloadAction<number>) {
      state.unreadNotifications = Math.max(0, action.payload);
    },
    unreadNotificationsCleared(state) {
      state.unreadNotifications = 0;
    },
  },
});

export const { unreadNotificationsSet, unreadNotificationsCleared } = sessionSlice.actions;
