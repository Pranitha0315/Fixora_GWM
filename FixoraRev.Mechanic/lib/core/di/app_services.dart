import '../../features/authentication/presentation/auth_controller.dart';
import '../../features/quick_login/data/quick_login_store.dart';
import '../backend/api_client.dart';
import '../backend/mechanic_backend.dart';

/// App-level service accessors / controllers.
class AppServices {
  AppServices._();

  static final AuthController auth = AuthController();
  static final QuickLoginStore quickLogin = QuickLoginStore();

  static ApiClient get api => MechanicBackend.instance.api;

  static Future<void> bootstrap() async {
    await MechanicBackend.instance.bootstrap();
    await auth.restore();
    await quickLogin.load();

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
