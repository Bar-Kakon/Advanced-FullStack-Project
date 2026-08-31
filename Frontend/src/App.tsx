import { Suspense, lazy } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { RouteFallback } from './components/RouteFallback';
import { PrivateRoute } from './routes/PrivateRoute';
import { MembershipRoute } from './routes/MembershipRoute';
import { AdminRoute } from './routes/AdminRoute';
import './styles/routeFallback.css';

// The entry screens stay in the initial bundle: they are what an arriving visitor renders first,
// and splitting them would trade one request for two on the critical path.
import { LandingPage } from './features/landing/LandingPage';
import { LoginPage } from './features/login/LoginPage';
import { NotFoundPage } from './features/errors/NotFoundPage';

// Everything past the entry screens is fetched when its address is first visited. `lazy` needs a
// default export and these screens are named exports, so each import maps one to the other.
const RegisterPage = lazy(() =>
  import('./features/register/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() =>
  import('./features/password-reset/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() =>
  import('./features/password-reset/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const PersonalDashboardPage = lazy(() =>
  import('./features/dashboard/PersonalDashboardPage').then((m) => ({ default: m.PersonalDashboardPage })));
const MyProfilePage = lazy(() =>
  import('./features/profile/MyProfilePage').then((m) => ({ default: m.MyProfilePage })));
const EditProfilePage = lazy(() =>
  import('./features/profile/EditProfilePage').then((m) => ({ default: m.EditProfilePage })));
const SubscriptionsPage = lazy(() =>
  import('./features/subscriptions/SubscriptionsPage').then((m) => ({ default: m.SubscriptionsPage })));
const BrowsePage = lazy(() =>
  import('./features/browse/BrowsePage').then((m) => ({ default: m.BrowsePage })));
const MyNetworkPage = lazy(() =>
  import('./features/network/MyNetworkPage').then((m) => ({ default: m.MyNetworkPage })));
const MyProjectsPage = lazy(() =>
  import('./features/projects/MyProjectsPage').then((m) => ({ default: m.MyProjectsPage })));
const ProjectFormPage = lazy(() =>
  import('./features/projects/ProjectFormPage').then((m) => ({ default: m.ProjectFormPage })));
const PermissionsPage = lazy(() =>
  import('./features/permissions/PermissionsPage').then((m) => ({ default: m.PermissionsPage })));
const ProjectMembersPage = lazy(() =>
  import('./features/members/ProjectMembersPage').then((m) => ({ default: m.ProjectMembersPage })));
const ProjectDashboardPage = lazy(() =>
  import('./features/projectdashboard/ProjectDashboardPage').then((m) => ({ default: m.ProjectDashboardPage })));
const MyTasksPage = lazy(() =>
  import('./features/tasks/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));
const CreateTaskPage = lazy(() =>
  import('./features/tasks/CreateTaskPage').then((m) => ({ default: m.CreateTaskPage })));
const TaskDetailPage = lazy(() =>
  import('./features/tasks/TaskDetailPage').then((m) => ({ default: m.TaskDetailPage })));
const ProposalReviewPage = lazy(() =>
  import('./features/coordination/ProposalReviewPage').then((m) => ({ default: m.ProposalReviewPage })));
const StageGraphPage = lazy(() =>
  import('./features/coordination/StageGraphPage').then((m) => ({ default: m.StageGraphPage })));
const EmployeeManagementPage = lazy(() =>
  import('./features/employees/EmployeeManagementPage').then((m) => ({ default: m.EmployeeManagementPage })));
const EmployeeOnboardingPage = lazy(() =>
  import('./features/employees/EmployeeOnboardingPage').then((m) => ({ default: m.EmployeeOnboardingPage })));
const WaitingForApprovalPage = lazy(() =>
  import('./features/employees/WaitingForApprovalPage').then((m) => ({ default: m.WaitingForApprovalPage })));
const ModerationQueuePage = lazy(() =>
  import('./features/moderation/ModerationQueuePage').then((m) => ({ default: m.ModerationQueuePage })));
const ReportDetailPage = lazy(() =>
  import('./features/moderation/ReportDetailPage').then((m) => ({ default: m.ReportDetailPage })));
const NotificationsPage = lazy(() =>
  import('./features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() =>
  import('./features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ScheduleExceptionsPage = lazy(() =>
  import('./features/scheduleexceptions/ScheduleExceptionsPage').then((m) => ({ default: m.ScheduleExceptionsPage })));
const EditTaskPage = lazy(() =>
  import('./features/tasks/EditTaskPage').then((m) => ({ default: m.EditTaskPage })));
const AuditLogPage = lazy(() =>
  import('./features/moderation/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));

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
 *
 * One `Suspense` sits inside the router rather than one per route, so a navigation between two
 * lazy screens shows the fallback once instead of unmounting the whole tree.
 */
export const App = () => (
  <LanguageProvider>
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* The public face of the platform, and the only address reachable with no session at
                all. It never redirects: a visitor who has not chosen anything yet is exactly who
                it is for. */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Both stay unauthenticated: a person who cannot sign in is exactly who needs them. */}
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route element={<PrivateRoute />}>
              {/* A profile belongs to the person, so it stays reachable while a company decides. */}
              <Route path="/profile" element={<MyProfilePage />} />
              <Route path="/profile/edit" element={<EditProfilePage />} />
              {/* An account-level screen, so it sits beside the profile rather than inside
                  MembershipRoute: what somebody's plan is does not depend on a company approving
                  them, and being kept out of it would be the wrong reason to hide their billing. */}
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              {/* Account-level, so they sit beside the profile rather than inside MembershipRoute:
                  preferences do not depend on a company approving somebody, and a notification
                  about an invitation has to be readable before one is accepted. */}
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
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

                {/* Platform moderation. It sits under its own guard because it is platform
                    authority, which no project grant and no company position can produce. */}
                <Route element={<AdminRoute />}>
                  <Route path="/admin/reports" element={<ModerationQueuePage />} />
                  <Route path="/admin/reports/:reportId" element={<ReportDetailPage />} />
                  <Route path="/admin/audit" element={<AuditLogPage />} />
                </Route>
                <Route path="/tasks" element={<MyTasksPage />} />
                {/* Ahead of `:taskId`, or the literal path would be read as a task id. */}
                <Route path="/tasks/new" element={<CreateTaskPage />} />
                <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
                <Route path="/tasks/:taskId/edit" element={<EditTaskPage />} />
                <Route path="/proposals/:proposalId" element={<ProposalReviewPage />} />
                <Route path="/projects/:projectId/stages" element={<StageGraphPage />} />
                <Route
                  path="/projects/:projectId/schedule-exceptions"
                  element={<ScheduleExceptionsPage />}
                />
              </Route>
            </Route>

            {/* Outside `PrivateRoute` on purpose: an unmatched address is not an authentication
                failure, so it is answered rather than redirected. A signed-out visitor and a signed-in
                one both see the same neutral screen, and neither is sent to Login. */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  </LanguageProvider>
);
