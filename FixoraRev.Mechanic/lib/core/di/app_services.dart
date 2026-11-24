import '../../features/authentication/presentation/auth_controller.dart';
import '../../features/jobs/presentation/job_controller.dart';
import '../../features/notifications/presentation/notifications_controller.dart';
import '../../features/quick_login/data/quick_login_store.dart';
import '../../features/sos/presentation/sos_controller.dart';
import '../backend/api_client.dart';
import '../backend/mechanic_backend.dart';

/// App-level service accessors / controllers.
class AppServices {
  AppServices._();

  static final AuthController auth = AuthController();
  static final QuickLoginStore quickLogin = QuickLoginStore();
  static final JobController jobs = JobController();
  static final NotificationsController notifications =
      NotificationsController();
  static final SosController sos = SosController();

  static ApiClient get api => MechanicBackend.instance.api;

  static Future<void> bootstrap() async {
    await MechanicBackend.instance.bootstrap();
    await auth.restore();
    await quickLogin.load();
    sos.seedDemo();

    if (api.signedIn && !auth.isLoggedIn) {
      final session = api.session;
      await auth.signInRemote(
        login: session?.userId.isNotEmpty == true
            ? session!.userId
            : (session?.name.isNotEmpty == true ? session!.name : 'session'),
      );
    }
  }
}
