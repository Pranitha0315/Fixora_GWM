/// Runtime API base URL for the garage .NET backend.
///
/// Override on device builds:
/// `--dart-define=FIXORA_API=http://<PC-IP>:5080`
class FixoraConfig {
  FixoraConfig._();

  static const apiBase = String.fromEnvironment(
    'FIXORA_API',
    defaultValue: 'http://localhost:5080',
  );

  static String get apiV1 => '$apiBase/api/v1';

  static String get hubUrl => '$apiBase/hubs/fixora';
}
