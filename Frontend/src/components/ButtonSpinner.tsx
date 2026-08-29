import CircularProgress from '@mui/material/CircularProgress';

/**
 * The in-button loading indicator.
 *
 * MUI is used for this one component and nothing else — no theme provider, no `CssBaseline`, no
 * MUI form controls. `color="inherit"` makes it take the button's own colour, so it belongs to the
 * FieldSync button rather than importing MUI's palette into a design system that already has one.
 *
 * It is positioned absolutely by `.btn__spinner`, so the approved label neither moves nor is
 * replaced while a request is running.
 */
export const ButtonSpinner = () => (
  <span className="btn__spinner" aria-hidden="true">
    <CircularProgress size={18} thickness={5} color="inherit" />
  </span>
);
