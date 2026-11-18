import '../../core/backend/api_client.dart';
import '../../core/backend/fixora_config.dart';
import '../repositories/app_state.dart';

/// Customer auth + session bridge to the garage `/api/v1` backend.
///
/// When [enabled] is false the UI uses in-memory [AppState] demo accounts.
class CustomerBackend {
  CustomerBackend._();
  static final CustomerBackend instance = CustomerBackend._();

  final ApiClient api = ApiClient.instance;

  /// `--dart-define=FIXORA_DEMO=true` forces offline demo mode.
  bool get enabled =>
      const String.fromEnvironment('FIXORA_DEMO', defaultValue: '') != 'true' &&
      FixoraConfig.apiBase.isNotEmpty;

  /// Called once at start-up: a saved session goes straight to live mode.
  Future<bool> restore() async {
    if (!enabled) return false;
    await api.restore();
    if (!api.signedIn) return false;
    try {
      await _afterLogin();
      return true;
    } on ApiException catch (e) {
      if (e.status == 401) await api.clear();
      return false;
    }
  }

  /// Email + password login. Returns an error message, or null on success.
  Future<String?> login(String email, String password) async {
    try {
      final tokens = await api.post('/customer/auth/login', body: {
        'email': email.trim(),
        'password': password,
      });
      await api.saveSession(tokens);
      await _afterLogin();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Starts registration. On success returns optional [devCode] (demo OTP), else throws.
  Future<String?> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    final r = await api.post('/customer/auth/register', body: {
      'fullName': fullName.trim(),
      'email': email.trim(),
      'phone': phone,
      'password': password,
    });
    return r['devCode'] as String?;
  }

  /// Verifies the email OTP from register, stores tokens, then syncs [AppState].
  Future<void> verifyOtp(String email, String code) async {
    final tokens = await api.post('/customer/auth/verify-otp', body: {
      'email': email.trim(),
      'code': code.trim(),
    });
    await api.saveSession(tokens);
    await _afterLogin();
  }

  Future<void> logout() async {
    try {
      await api.post('/customer/auth/logout');
    } on ApiException {
      // Still clear local session if the server is unreachable.
    }
    await api.clear();
  }

  /// Copy session profile fields into the in-memory app store after auth.
  Future<void> _afterLogin() async {
    final s = api.session;
    if (s == null) return;
    final app = AppState.instance;
    final name = s.name.trim();
    if (name.isNotEmpty) {
      app.firstName = name.split(RegExp(r'\s+')).first;
    }
    app.notifyListeners();
  }
}
