import { Component, type ReactNode } from 'react';

import { useLanguage } from '../i18n/useLanguage';
import '../styles/appError.css';

interface BoundaryStrings {
  readonly title: string;
  readonly body: string;
  readonly reload: string;
  readonly home: string;
}

const RELOAD_FLAG = 'app-error-reloaded';

/** A redeploy retires the hashed chunk an open tab still points at; that import rejection reads
 *  as a stale build rather than a defect, and one silent reload fetches the current one. */
const isStaleChunkError = (error: unknown): boolean =>
  error instanceof Error &&
  /dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported/i.test(
    error.message,
  );

const alreadyReloaded = (): boolean => {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) !== null;
  } catch {
    return true;
  }
};

const markReloaded = (): void => {
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* Blocked storage only loses the one-reload guard. */
  }
};

interface BoundaryProps {
  readonly strings: BoundaryStrings;
  readonly children: ReactNode;
}

interface BoundaryState {
  readonly failed: boolean;
  readonly reloading: boolean;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false, reloading: false };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    console.error('Unhandled render error', error);
    if (isStaleChunkError(error) && !alreadyReloaded()) {
      markReloaded();
      this.setState({ reloading: true });
      window.location.reload();
    }
  }

  override render(): ReactNode {
    const { strings, children } = this.props;
    if (this.state.reloading) return null;
    if (!this.state.failed) return children;

    return (
      <main className="app-error" role="alert">
        <h1 className="app-error__title">{strings.title}</h1>
        <p className="app-error__body">{strings.body}</p>
        <div className="app-error__actions">
          <button
            type="button"
            className="app-error__button app-error__button--primary"
            onClick={() => window.location.reload()}
          >
            {strings.reload}
          </button>
          <a className="app-error__button" href="/">
            {strings.home}
          </a>
        </div>
      </main>
    );
  }
}

export const AppErrorBoundary = ({ children }: { children: ReactNode }) => {
  const { t } = useLanguage();
  return <Boundary strings={t.appError}>{children}</Boundary>;
};
