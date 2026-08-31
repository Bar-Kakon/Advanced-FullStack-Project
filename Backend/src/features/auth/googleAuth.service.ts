import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { UserRepository } from '../users/user.repository.js';
import {
  googleAlreadyLinked,
  googleEmailNotVerified,
  googleIdentityClaimed,
  googleLinkRequired,
  invalidCredentials,
  invalidGoogleCredential,
  unauthenticated,
} from './auth.errors.js';
import { currentTokenVersion, isSessionPermitted } from './auth.service.js';
import { toSessionUser, type SessionUser } from './authenticatedUser.mapper.js';
import type { GoogleIdentityService } from './googleIdentity.service.js';
import type { TokenPair, TokenPairService } from './tokens/tokenPair.service.js';

/**
 * What Google could tell us about a first-time visitor. It is never enough to open an account:
 * FieldSync needs a registration category, a specialty, a business and a location, and Google
 * knows none of them. So this is carried back to the client to pre-fill Register, and nothing is
 * written until the person completes it.
 */
export interface GoogleOnboardingProfile {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

export type GoogleSignInResult =
  | ({ readonly outcome: 'signed_in'; readonly user: SessionUser } & TokenPair)
  | { readonly outcome: 'onboarding_required'; readonly profile: GoogleOnboardingProfile };

export interface GoogleLinkResult {
  readonly linkedEmail: string;
}

export interface GoogleAuthService {
  signIn(idToken: string): Promise<GoogleSignInResult>;
  /** Attaches Google to the account already holding this session. */
  link(userId: string, idToken: string): Promise<GoogleLinkResult>;
}

export interface GoogleAuthDependencies {
  readonly users: UserRepository;
  readonly googleIdentity: GoogleIdentityService;
  readonly tokenPair: TokenPairService;
  readonly companyContext: CompanyContextService;
}

export const createGoogleAuthService = ({
  users,
  googleIdentity,
  tokenPair,
  companyContext,
}: GoogleAuthDependencies): GoogleAuthService => {
  const verified = async (idToken: string) => {
    const identity = await googleIdentity.verify(idToken);
    if (identity === null) throw invalidGoogleCredential();
    if (!identity.emailVerified) throw googleEmailNotVerified();
    return identity;
  };

  return {
    /**
     * Three outcomes, in the order the checks have to happen.
     *
     * The account is looked up by Google's subject first, so a person whose Gmail address changed
     * still reaches the same account. Only when no link exists is the email consulted at all, and
     * then only to refuse: an existing account with that address is never joined automatically.
     */
    async signIn(idToken) {
      const identity = await verified(idToken);

      const linked = await users.findByProviderIdentity('google', identity.subject);
      if (linked !== null) {
        // The same status rule password login applies, answered the same way: a deactivated or
        // banned account cannot hold a session, whichever credential was presented.
        if (!isSessionPermitted(linked)) throw invalidCredentials();

        const userId = linked._id.toString();
        const tokens = await tokenPair.issue({
          userId,
          tokenVersion: currentTokenVersion(linked),
        });

        return {
          outcome: 'signed_in',
          ...tokens,
          user: toSessionUser(linked, await companyContext.forUser(userId)),
        };
      }

      if (await users.existsByEmail(identity.email)) throw googleLinkRequired();

      return {
        outcome: 'onboarding_required',
        profile: {
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
        },
      };
    },

    /**
     * The session proves the FieldSync account, and the credential proves the Google one. Both
     * halves are established before anything is written, which is what the link is for.
     *
     * The two email addresses are deliberately not required to match. A contractor's FieldSync
     * account is often a business address and their Google account a personal one, and requiring
     * a match would refuse that without protecting anything: whoever is holding both credentials
     * at this point already controls both accounts.
     */
    async link(userId, idToken) {
      const identity = await verified(idToken);

      const user = await users.findById(userId);
      if (user === null) throw unauthenticated();
      if (!isSessionPermitted(user)) throw unauthenticated();

      const holder = await users.findByProviderIdentity('google', identity.subject);
      if (holder !== null) {
        throw holder._id.toString() === userId ? googleAlreadyLinked() : googleIdentityClaimed();
      }

      const linked = await users.linkProviderIdentity(user._id, {
        provider: 'google',
        subject: identity.subject,
        linkedAt: new Date(),
      });
      if (!linked) throw googleAlreadyLinked();

      return { linkedEmail: identity.email };
    },
  };
};
