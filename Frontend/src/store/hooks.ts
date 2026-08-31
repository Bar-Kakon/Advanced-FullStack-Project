import { useDispatch, useSelector } from 'react-redux';

import type { AppDispatch, RootState } from './store';

/** Typed wrappers, so no component has to annotate the store shape itself. */
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
