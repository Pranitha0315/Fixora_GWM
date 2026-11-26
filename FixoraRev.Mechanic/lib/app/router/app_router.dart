import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/authentication/presentation/screens/otp_verification_screen.dart';
import '../../features/authentication/presentation/screens/register_screen.dart';
import '../../features/mechanic_invitation/presentation/screens/accept_invitation_screen.dart';
import '../../features/quick_login/presentation/screens/quick_login_screen.dart';
import '../../features/mechanic_invitation/presentation/screens/expired_invite_screen.dart';
import '../../features/evidence_passport/presentation/screens/evidence_passport_screen.dart';
import '../../features/fixproof/presentation/screens/inspection_capture_screen.dart';
import '../../features/fixproof/presentation/screens/report_review_screen.dart';
import '../../features/inventory/presentation/inventory_screen.dart';
import '../../features/job_progress/presentation/screens/progress_update_screen.dart';
import '../../features/jobs/presentation/screens/job_detail_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/passport/presentation/passport_screen.dart';
import '../../features/repair_proposal/presentation/screens/repair_proposal_screen.dart';
import '../../features/shell/presentation/main_shell.dart';
import '../../features/sos/presentation/sos_screen.dart';
import 'route_names.dart';

/// GoRouter config for Fixora Rev (named paths in [RouteNames]).
class AppRouter {
  AppRouter._();

  static final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

  static final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: RouteNames.splash,
    routes: [
      GoRoute(
        path: RouteNames.splash,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: RouteNames.quickLogin,
        builder: (_, __) => const QuickLoginScreen(),
      ),
      GoRoute(
        path: RouteNames.login,
        builder: (_, state) => LoginScreen(
          initialEmail: state.extra is String ? state.extra as String : '',
        ),
      ),
      GoRoute(
        path: RouteNames.forgotPassword,
        builder: (context, state) => ForgotPasswordScreen(
          initialEmail: state.extra is String ? state.extra as String : '',
        ),
      ),
      GoRoute(
        path: RouteNames.register,
        builder: (_, __) => const RegisterScreen(),
      ),
      GoRoute(
        path: RouteNames.otpVerification,
        builder: (context, state) {
          final extra = state.extra;
          if (extra is OtpArgs) return OtpVerificationScreen(args: extra);
          final email = extra is String ? extra : '';
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
        builder: (_, __) => const MainShell(),
      ),
      GoRoute(
        path: RouteNames.jobDetails,
        builder: (context, state) => JobDetailScreen(jobId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.inspectionCapture,
        builder: (context, state) => InspectionCaptureScreen(jobId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.reportReview,
        builder: (context, state) => ReportReviewScreen(jobId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.repairProposal,
        builder: (context, state) => RepairProposalScreen(jobId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.evidencePassport,
        builder: (context, state) => EvidencePassportScreen(jobId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.progressUpdate,
        builder: (context, state) => ProgressUpdateScreen(jobId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.sosList,
        builder: (_, __) => const SosListScreen(),
      ),
      GoRoute(
        path: RouteNames.sosDetail,
        builder: (context, state) => SosDetailScreen(requestId: _id(state)),
      ),
      GoRoute(
        path: RouteNames.notifications,
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(
        path: RouteNames.passport,
        builder: (_, __) => const PassportScreen(standalone: true),
      ),
      GoRoute(
        path: RouteNames.parts,
        builder: (_, __) => const InventoryScreen(standalone: true),
      ),
    ],
  );

  static String _id(GoRouterState state) => state.extra is String ? state.extra as String : '';
}
