import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

/// App-wide backend facade shared with Riverpod [ProviderContainer].
class MechanicBackend extends ChangeNotifier {
  MechanicBackend._();

  static final MechanicBackend instance = MechanicBackend._();

  ProviderContainer? container;

  final ApiClient api = ApiClient('fixora.mechanic.session');

  bool live = false;
  bool get enabled => live || api.signedIn;

  Future<void> bootstrap() async {
    await api.restore();
  }

  /// Sign in with employee code (EMP-001) / phone and the 4-digit garage PIN.
  Future<void> pinLogin(String login, String pin) async {
    final tokens = await api.post(
      '/mechanic/auth/pin-login',
      body: {'login': login, 'pin': pin},
    ) as Map<String, dynamic>;
    await api.saveSession(tokens);
    await _afterLogin();
  }

  /// Quick login: restore saved session (refresh) after local PIN check.
  Future<bool> resume() async {
    try {
      await api.restore();
      if (!api.signedIn) return false;
      if (await api.refresh() == null) return false;
      await _afterLogin();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Accept a manager's 7-day invitation: name + PIN → session tokens.
  Future<void> acceptInvitation({
    required String token,
    required String name,
    required String pin,
  }) async {
    final raw = await api.post(
      '/mechanic/auth/accept-invitation',
      body: {
        'token': token,
        'name': name,
        'pin': pin,
      },
    );
    if (raw is! Map) {
      throw ApiException(
        'Invalid invitation response',
        code: 'invalid_invite_response',
      );
    }
    await api.saveSession(Map<String, dynamic>.from(raw));
    await _afterLogin();
  }

  Future<void> _afterLogin() async {
    live = true;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      if (api.signedIn) {
        await api.post('/mechanic/auth/logout');
      }
    } catch (_) {
      // Best-effort.
    }
    await api.clear();
    live = false;
    notifyListeners();
  }
}
