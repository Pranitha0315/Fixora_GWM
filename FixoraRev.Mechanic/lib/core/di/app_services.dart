import '../../features/auth/presentation/auth_controller.dart';
import '../../features/jobs/presentation/job_controller.dart';
import '../../features/notifications/presentation/notification_controller.dart';
import '../../features/sos/presentation/sos_controller.dart';

/// Service locator. Controllers start empty; MechanicBackend fills them
/// from /api/v1/mechanic/* after PIN login.
class AppServices {
  AppServices._();

  static final AuthController auth = AuthController();
  static final JobController jobs = JobController([]);
  static final SosController sos = SosController([]);
  static final NotificationController notifications = NotificationController([]);
}
