import { configureStore } from '@reduxjs/toolkit';

import { sessionSlice } from './sessionSlice';
import { uiSlice } from './uiSlice';

export const store = configureStore({
  reducer: {
    [uiSlice.name]: uiSlice.reducer,
    [sessionSlice.name]: sessionSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
