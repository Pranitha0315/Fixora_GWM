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
}
