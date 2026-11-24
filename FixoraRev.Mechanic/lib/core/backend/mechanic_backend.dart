import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';

/// App-wide backend facade shared with Riverpod [ProviderContainer].
class MechanicBackend {
  MechanicBackend._();

  static final MechanicBackend instance = MechanicBackend._();

  ProviderContainer? container;

  final ApiClient api = ApiClient('fixora.mechanic.session');

  Future<void> bootstrap() async {
    await api.restore();
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
  }
}
