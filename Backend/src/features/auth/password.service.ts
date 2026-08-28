import bcrypt from 'bcrypt';

/**
 * A real bcrypt hash of a throwaway random string, at the cost 12 `docs/database-design.html`
 * specifies. It is not a secret and unlocks nothing — its only job is to give the "no such account"
 * path the same cost as a real comparison.
 */
const DUMMY_HASH = '$2b$12$Z651brCDk7E6ZfVNKDXDBev7wQY8J0Gz07qRoN5emdwZREiz5JvoS';

export interface PasswordService {
  verify(plainPassword: string, passwordHash: string): Promise<boolean>;
  /**
   * Burns the same time a real comparison would when no account was found. Without it, an unknown
   * email answers measurably faster than a known one, which is an account-enumeration oracle — the
   * exact thing the unified `INVALID_CREDENTIALS` answer exists to prevent.
   */
  simulateVerify(): Promise<void>;
}

/** The only module in the backend that calls bcrypt. */
export const passwordService: PasswordService = {
  async verify(plainPassword, passwordHash) {
    return bcrypt.compare(plainPassword, passwordHash);
  },

  async simulateVerify() {
    await bcrypt.compare('', DUMMY_HASH);
  },
};
