/// Runtime config for Fixora Rev Mechanic.
class FixoraConfig {
  FixoraConfig._();

  /// API host including `/api/v1`. Override: `--dart-define=API_BASE=...`
  static const String apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://api.fixora.local/api/v1',
  );

  static const String appName = 'Fixora Rev';
}
