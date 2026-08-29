import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { PrivateRoute } from './routes/PrivateRoute';
import { LoginPage } from './features/login/LoginPage';
import { ForgotPasswordPage } from './features/password-reset/ForgotPasswordPage';
import { ResetPasswordPage } from './features/password-reset/ResetPasswordPage';
import { RegisterPage } from './features/register/RegisterPage';
import { PersonalDashboardPage } from './features/dashboard/PersonalDashboardPage';
import { MyProfilePage } from './features/profile/MyProfilePage';
import { EditProfilePage } from './features/profile/EditProfilePage';

/**
 * The app root.
 *
 * `LanguageProvider` wraps everything so any component, at any depth, can read the current
 * language without it being handed down through every component in between. `AuthProvider` sits
 * inside it and answers the other cross-cutting question — who, if anyone, is signed in — which
 * is what the router needs before it can decide whether an address is reachable.
 *
 * Register is public because an account does not exist yet, Login is public because that is where
 * a session begins, and the two password-reset screens are public because someone locked out has
 * no session to reach them with. Everything past `PrivateRoute` needs one: Login is the
 * authentication boundary, and the Personal dashboard is what it opens onto.
 */
export const App = () => (
  <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          {/* Both stay unauthenticated: a person who cannot sign in is exactly who needs them. */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<PrivateRoute />}>
            <Route path="/dashboard" element={<PersonalDashboardPage />} />
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/profile/edit" element={<EditProfilePage />} />
          </Route>

          {/* No 404 screen is migrated yet — approved screen #28 exists as a static prototype
              only — so an unknown address is sent to the authentication boundary rather than to a
              page this application would have to invent. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </LanguageProvider>
);
