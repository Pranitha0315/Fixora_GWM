import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/di/app_services.dart';
import '../../features/auth/presentation/auth_controller.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/auth/presentation/screens/status_screens.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/mechanic_invitation/presentation/screens/accept_invitation_screen.dart';
import '../../features/mechanic_invitation/presentation/screens/expired_invite_screen.dart';
import '../../features/fixproof/presentation/screens/inspection_capture_screen.dart';
import '../../features/fixproof/presentation/screens/report_review_screen.dart';
import '../../features/job_progress/presentation/screens/progress_update_screen.dart';
import '../../features/jobs/presentation/screens/job_detail_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/repair_proposal/presentation/screens/repair_proposal_screen.dart';
import '../../features/shell/presentation/main_shell.dart';
import '../../features/sos/presentation/sos_screen.dart';
import 'route_names.dart';

/// Pages a signed-out user may open. Every other path needs a signed-in mechanic.
const _publicPaths = {
  RouteNames.splash,
  RouteNames.login,
  RouteNames.acceptInvitation,
  RouteNames.expiredInvitation,
};

/// Pages that make no sense once signed in. Going Back (or typing the URL) to one of
/// them lands on Home instead of showing Login again.
const _signedOutOnlyPaths = {
  RouteNames.splash,
  RouteNames.login,
};

/// Tells the router to re-check where the user may be, but only when a signed-in user
/// becomes signed out (logout or expired session). Signing in does not refresh it:
/// the login flow moves on to Home by itself.
class _SignOutRefresh extends ChangeNotifier {
  _SignOutRefresh(this._auth) : _wasSignedIn = _auth.isLoggedIn {
    _auth.addListener(_onAuthChanged);
  }

  final AuthController _auth;
  bool _wasSignedIn;

  void _onAuthChanged() {
    final signedOut = _wasSignedIn && !_auth.isLoggedIn;
    _wasSignedIn = _auth.isLoggedIn;
    if (!signedOut) return;
    // Pages opened with Navigator.push sit above the router's own pages; close them
    // so the Login page is not hidden behind a stale screen.
    AppRouter.closeImperativePages();
    notifyListeners();
  }

  @override
  void dispose() {
    _auth.removeListener(_onAuthChanged);
    super.dispose();
  }
}

/// GoRouter config for Fixora Rev (named paths in [RouteNames]).
///
/// Login only appears when the user is signed out (explicit logout, expired session,
/// or a fresh start). Back never returns to Login while a session is active.
class AppRouter {
  AppRouter._();

  static final GlobalKey<NavigatorState> rootNavigatorKey = GlobalKey<NavigatorState>();

  /// Pops screens opened with `Navigator.push` until a router-managed page is on top.
  static void closeImperativePages() {
    rootNavigatorKey.currentState?.popUntil((route) => route.settings is Page);
  }

  static String? _guard(BuildContext context, GoRouterState state) {
    final auth = AppServices.auth;
    final path = state.uri.path;

    if (auth.isLoggedIn) {
      if (_signedOutOnlyPaths.contains(path)) return RouteNames.shell;
      // The loading page only makes sense right after signing in.
      // Reaching it through browser history (no arguments) goes to Home.
      if (path == RouteNames.loading && state.extra is! LoadingArgs) return RouteNames.shell;
      return null;
    }

    if (_publicPaths.contains(path)) return null;
    // Signed out on a protected page: Login after a logout or expired session,
    // otherwise the splash decides where to go.
    return auth.everSignedIn ? RouteNames.login : RouteNames.splash;
  }

  static final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: RouteNames.splash,
    redirect: _guard,
    refreshListenable: _SignOutRefresh(AppServices.auth),
    routes: [
      GoRoute(
        path: RouteNames.splash,
        builder: (_, __) => const SplashScreen(),
      ),
      GoRoute(
        path: RouteNames.loading,
        builder: (_, state) {
          final args = state.extra;
          return args is LoadingArgs
              ? LoadingScreen.fromArgs(args)
              : const LoadingScreen(title: 'Signing you in…', subtitle: 'Please wait');
        },
      ),
      GoRoute(
        path: RouteNames.login,
        builder: (_, state) => LoginScreen(
          initialEmail: state.extra is String ? state.extra as String : '',
        ),
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
    ],
  );

  static String _id(GoRouterState state) => state.extra is String ? state.extra as String : '';
}
