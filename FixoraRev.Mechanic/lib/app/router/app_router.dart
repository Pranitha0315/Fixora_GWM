import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/loading_screen.dart';
import '../../features/authentication/presentation/screens/garage_pin_login_screen.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/authentication/presentation/screens/otp_args.dart';
import '../../features/authentication/presentation/screens/otp_verification_screen.dart';
import '../../features/authentication/presentation/screens/register_screen.dart';
import '../../features/evidence_passport/presentation/screens/evidence_passport_screen.dart';
import '../../features/mechanic_invitation/presentation/screens/accept_invitation_screen.dart';
import '../../features/mechanic_invitation/presentation/screens/expired_invite_screen.dart';
import '../../features/quick_login/presentation/screens/quick_login_screen.dart';
import '../../features/fixproof/presentation/screens/inspection_capture_screen.dart';
import '../../features/fixproof/presentation/screens/report_review_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/job_progress/presentation/screens/progress_update_screen.dart';
import '../../features/jobs/presentation/screens/additional_repair_screen.dart';
import '../../features/jobs/presentation/screens/invoice_screen.dart';
import '../../features/jobs/presentation/screens/job_detail_screen.dart';
import '../../features/jobs/presentation/screens/repair_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/passport/presentation/passport_screen.dart';
import '../../features/repair_proposal/presentation/screens/repair_proposal_screen.dart';
import '../../features/shell/presentation/main_shell.dart';
import '../../features/sos/presentation/sos_screen.dart';
import '../../features/splash/presentation/screens/splash_screen.dart';
import 'route_names.dart';

/// GoRouter config for Fixora Rev Mechanic.
class AppRouter {
  AppRouter._();

  static final GlobalKey<NavigatorState> rootNavigatorKey =
      GlobalKey<NavigatorState>();

  static final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: RouteNames.splash,
    routes: [
      GoRoute(
        path: RouteNames.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: RouteNames.login,
        builder: (context, state) {
          final extra = state.extra;
          final initial = extra is LoginScreen
              ? extra.initialEmail
              : extra is String
                  ? extra
                  : state.uri.queryParameters['email'];
          return LoginScreen(initialEmail: initial);
        },
      ),
      GoRoute(
        path: RouteNames.garagePin,
        builder: (context, state) => const GaragePinLoginScreen(),
      ),
      GoRoute(
        path: RouteNames.quickLogin,
        builder: (context, state) => const QuickLoginScreen(),
      ),
      GoRoute(
        path: RouteNames.loading,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is LoadingScreen) return extra;
          return const LoadingScreen(
            title: 'Loading…',
            next: MainShell(),
          );
        },
      ),
      GoRoute(
        path: RouteNames.forgotPassword,
        builder: (context, state) => ForgotPasswordScreen(
          initialEmail: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: RouteNames.register,
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: RouteNames.otpVerification,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is OtpArgs) {
            return OtpVerificationScreen(args: extra);
          }
          final email = state.uri.queryParameters['email'] ?? '';
          return OtpVerificationScreen(args: OtpArgs(email: email));
        },
      ),
      GoRoute(
        path: RouteNames.acceptInvitation,
        builder: (context, state) {
          final token = state.uri.queryParameters['token'] ??
              (state.extra is String ? state.extra as String : '');
          return AcceptInvitationScreen(token: token);
        },
      ),
      GoRoute(
        path: RouteNames.expiredInvitation,
        builder: (context, state) => ExpiredInviteScreen(
          message: state.extra is String
              ? state.extra as String
              : 'This invitation link has expired or was already used. Ask your workshop manager to send a new 7-day invite.',
        ),
      ),
      GoRoute(
        path: RouteNames.shell,
        builder: (context, state) => const MainShell(),
      ),
      GoRoute(
        path: '${RouteNames.jobDetails}/:jobId',
        builder: (context, state) =>
            JobDetailScreen(jobId: state.pathParameters['jobId'] ?? ''),
      ),
      GoRoute(
        path: '${RouteNames.repair}/:jobId',
        builder: (context, state) =>
            RepairScreen(jobId: state.pathParameters['jobId'] ?? ''),
      ),
      GoRoute(
        path: '${RouteNames.invoice}/:jobId',
        builder: (context, state) =>
            InvoiceScreen(jobId: state.pathParameters['jobId'] ?? ''),
      ),
      GoRoute(
        path: '${RouteNames.additionalRepair}/:jobId',
        builder: (context, state) => AdditionalRepairScreen(
          jobId: state.pathParameters['jobId'] ?? '',
        ),
      ),
      GoRoute(
        path: '${RouteNames.inspectionCapture}/:jobId',
        builder: (context, state) => InspectionCaptureScreen(
          jobId: state.pathParameters['jobId'] ?? '',
        ),
      ),
      GoRoute(
        path: '${RouteNames.reportReview}/:jobId',
        builder: (context, state) => ReportReviewScreen(
          jobId: state.pathParameters['jobId'] ?? '',
        ),
      ),
      GoRoute(
        path: '${RouteNames.repairProposal}/:jobId',
        builder: (context, state) => RepairProposalScreen(
          jobId: state.pathParameters['jobId'] ?? '',
        ),
      ),
      GoRoute(
        path: '${RouteNames.evidencePassport}/:jobId',
        builder: (context, state) => EvidencePassportScreen(
          jobId: state.pathParameters['jobId'] ?? '',
        ),
      ),
      GoRoute(
        path: '${RouteNames.progressUpdate}/:jobId',
        builder: (context, state) => ProgressUpdateScreen(
          jobId: state.pathParameters['jobId'] ?? '',
        ),
      ),
      GoRoute(
        path: RouteNames.sosList,
        builder: (context, state) => const SosListScreen(),
      ),
      GoRoute(
        path: '${RouteNames.sosDetail}/:requestId',
        builder: (context, state) => SosDetailScreen(
          requestId: state.pathParameters['requestId'] ?? '',
        ),
      ),
      GoRoute(
        path: RouteNames.notifications,
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: RouteNames.passport,
        builder: (context, state) =>
            const PassportScreen(standalone: true),
      ),
      GoRoute(
        path: RouteNames.parts,
        builder: (context, state) =>
            const InventoryScreen(standalone: true),
      ),
    ],
  );
}
