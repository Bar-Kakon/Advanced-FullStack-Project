import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { PrivateRoute } from './routes/PrivateRoute';
import { MembershipRoute } from './routes/MembershipRoute';
import { LoginPage } from './features/login/LoginPage';
import { ForgotPasswordPage } from './features/password-reset/ForgotPasswordPage';
import { ResetPasswordPage } from './features/password-reset/ResetPasswordPage';
import { RegisterPage } from './features/register/RegisterPage';
import { PersonalDashboardPage } from './features/dashboard/PersonalDashboardPage';
import { MyProfilePage } from './features/profile/MyProfilePage';
import { EditProfilePage } from './features/profile/EditProfilePage';
import { BrowsePage } from './features/browse/BrowsePage';
import { MyNetworkPage } from './features/network/MyNetworkPage';
import { MyProjectsPage } from './features/projects/MyProjectsPage';
import { ProjectFormPage } from './features/projects/ProjectFormPage';
import { PermissionsPage } from './features/permissions/PermissionsPage';
import { ProjectMembersPage } from './features/members/ProjectMembersPage';
import { ProjectDashboardPage } from './features/projectdashboard/ProjectDashboardPage';
import { MyTasksPage } from './features/tasks/MyTasksPage';
import { TaskDetailPage } from './features/tasks/TaskDetailPage';
import { EmployeeManagementPage } from './features/employees/EmployeeManagementPage';
import { EmployeeOnboardingPage } from './features/employees/EmployeeOnboardingPage';
import { WaitingForApprovalPage } from './features/employees/WaitingForApprovalPage';

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
            {/* A profile belongs to the person, so it stays reachable while a company decides. */}
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/profile/edit" element={<EditProfilePage />} />
            <Route path="/waiting-for-approval" element={<WaitingForApprovalPage />} />

            <Route element={<MembershipRoute />}>
              <Route path="/dashboard" element={<PersonalDashboardPage />} />
              <Route path="/onboarding/employees" element={<EmployeeOnboardingPage />} />
              <Route path="/employees" element={<EmployeeManagementPage />} />
              <Route path="/browse" element={<BrowsePage />} />
              <Route path="/network" element={<MyNetworkPage />} />
              <Route path="/projects" element={<MyProjectsPage />} />
              <Route path="/projects/new" element={<ProjectFormPage />} />
              <Route path="/projects/:projectId/edit" element={<ProjectFormPage />} />
              <Route path="/projects/:projectId/members" element={<ProjectMembersPage />} />
              <Route path="/projects/:projectId" element={<ProjectDashboardPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
              <Route path="/tasks" element={<MyTasksPage />} />
              <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            </Route>
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
