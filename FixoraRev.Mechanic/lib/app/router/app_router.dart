import 'package:flutter/material.dart';

import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/authentication/presentation/screens/otp_args.dart';
import '../../features/authentication/presentation/screens/otp_verification_screen.dart';
import '../../features/authentication/presentation/screens/register_screen.dart';
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

/// Named routes. Screens from the original Fixora Rev app also open each
/// other directly with `context.push(...)` (see core/utils/nav.dart).
class AppRouter {
  AppRouter._();

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    final arg = settings.arguments;
    final id = arg is String ? arg : '';
    Widget page;

    switch (settings.name) {
      case RouteNames.login:
        page = const LoginScreen();
        break;
      case RouteNames.forgotPassword:
        page = ForgotPasswordScreen(initialEmail: id);
        break;
      case RouteNames.register:
        page = const RegisterScreen();
        break;
      case RouteNames.otpVerification:
        page = arg is OtpArgs
            ? OtpVerificationScreen(args: arg)
            : OtpVerificationScreen(args: OtpArgs(email: id));
        break;
      case RouteNames.shell:
        page = const MainShell();
        break;
      case RouteNames.jobDetails:
        page = JobDetailScreen(jobId: id);
        break;
      case RouteNames.inspectionCapture:
        page = InspectionCaptureScreen(jobId: id);
        break;
      case RouteNames.reportReview:
        page = ReportReviewScreen(jobId: id);
        break;
      case RouteNames.repairProposal:
        page = RepairProposalScreen(jobId: id);
        break;
      case RouteNames.evidencePassport:
        page = EvidencePassportScreen(jobId: id);
        break;
      case RouteNames.progressUpdate:
        page = ProgressUpdateScreen(jobId: id);
        break;
      case RouteNames.sosList:
        page = const SosListScreen();
        break;
      case RouteNames.sosDetail:
        page = SosDetailScreen(requestId: id);
        break;
      case RouteNames.notifications:
        page = const NotificationsScreen();
        break;
      case RouteNames.passport:
        page = const PassportScreen(standalone: true);
        break;
      case RouteNames.parts:
        page = const InventoryScreen(standalone: true);
        break;
      default:
        page = const LoginScreen();
    }

    return MaterialPageRoute(builder: (_) => page, settings: settings);
  }
}
