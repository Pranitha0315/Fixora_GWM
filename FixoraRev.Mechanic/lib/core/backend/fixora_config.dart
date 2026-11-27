import 'package:flutter/foundation.dart';

/// Where the one Fixora backend lives.
///
///   flutter run --dart-define=FIXORA_API=http://192.168.1.20:5080   (real phone on the same Wi-Fi)
///
/// Defaults: Android emulator → 10.0.2.2 (the host PC), web / iOS simulator / desktop → localhost.
class FixoraConfig {
  static const String _defined = String.fromEnvironment('FIXORA_API');

  static String get apiBase {
    if (_defined.isNotEmpty) return _defined.endsWith('/') ? _defined.substring(0, _defined.length - 1) : _defined;
    if (kIsWeb) return 'http://localhost:5080';
    if (defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:5080';
    return 'http://localhost:5080';
  }

  static String get hubUrl => '$apiBase/hubs/fixora';
}
