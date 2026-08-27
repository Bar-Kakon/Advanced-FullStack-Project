/**
 * The only error type the API answers deliberately. The `(message, statusCode)` prefix is the
 * signature already used by the flow snippets in `docs/database-design.html`; `code` is required
 * so no expected failure can reach a client without a stable identifier.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, new.target);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
