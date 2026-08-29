import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';

import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';

/**
 * The account chip and the menu it opens.
 *
 * MUI's `Menu` is used rather than a hand-rolled popover because it already answers click-away,
 * Escape, focus trapping and arrow-key movement, and `ButtonSpinner` established MUI as this
 * project's component library.
 *
 * The name is rendered from the stored account and never from a string resource: it is the
 * person's own data, so it reads the same in both interface languages.
 */
export const AccountMenu = ({ name, initials }: { name: string; initials: string }) => {
  const { t, lang } = useLanguage();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;

  const close = useCallback((): void => setAnchor(null), []);

  const goToProfile = useCallback((): void => {
    close();
    navigate('/profile');
  }, [close, navigate]);

  /* The session is ended first, so the route guard sees a signed-out state when Login renders. */
  const logOut = useCallback((): void => {
    close();
    signOut();
    navigate('/login', { replace: true });
  }, [close, navigate, signOut]);

  // The menu hangs from the chip's inline-end edge, which is the left one in a mirrored layout.
  const inlineEnd = lang === 'he' ? 'left' : 'right';

  return (
    <>
      <button
        type="button"
        className={`nav-profile${open ? ' is-open-context' : ''}`}
        aria-label={t.nav.accountMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'account-menu' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <span className="nav-profile__avatar" aria-hidden="true">{initials}</span>
        <span className="nav-profile__name" dir="auto">{name}</span>
        <svg className="nav-profile__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <Menu
        id="account-menu"
        anchorEl={anchor}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: inlineEnd }}
        transformOrigin={{ vertical: 'top', horizontal: inlineEnd }}
        slotProps={{
          paper: { dir: lang === 'he' ? 'rtl' : 'ltr', className: 'account-menu__paper' },
          list: { 'aria-label': t.nav.accountMenu, dense: true },
        }}
      >
        <MenuItem onClick={goToProfile}>
          <ListItemText>{t.nav.account.myProfile}</ListItemText>
        </MenuItem>

        {/*
          Settings has no route yet. It is shown because it is part of the approved menu, and it is
          disabled rather than pointed somewhere else — a wrong destination is worse than none.
        */}
        <MenuItem disabled aria-disabled="true">
          <ListItemText
            secondary={t.nav.account.settingsUnavailable}
            slotProps={{ secondary: { className: 'account-menu__note' } }}
          >
            {t.nav.account.settings}
          </ListItemText>
        </MenuItem>

        <Divider />

        <MenuItem onClick={logOut}>
          <ListItemText>{t.nav.account.logOut}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
