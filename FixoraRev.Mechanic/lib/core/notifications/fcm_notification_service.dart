import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../app/router/app_router.dart';
import '../backend/mechanic_backend.dart';
import '../../app/router/route_names.dart';

/// FCM-ready push handler.
/// Wire `firebase_messaging` here for production; demo routes by payload type.
class FcmNotificationService {
  FcmNotificationService._();
  static final instance = FcmNotificationService._();

  bool _initialized = false;
  int badgeCount = 0;
  final ValueNotifier<int> badge = ValueNotifier(0);

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    // Production: FirebaseMessaging.instance.requestPermission / onMessage / onMessageOpenedApp,
    // then: FirebaseMessaging.instance.getToken().then(setToken) and onTokenRefresh.listen(setToken).
    // Needs the firebase_messaging package + Firebase project config (not in this app yet).
    if (_devToken.isNotEmpty) unawaited(setToken(_devToken));
    debugPrint('FcmNotificationService ready (demo routing enabled)');
  }

  /// Manual test token: flutter run --dart-define=FIXORA_DEVICE_TOKEN=YOUR_TOKEN
  static const String _devToken = String.fromEnvironment('FIXORA_DEVICE_TOKEN');

  String? token;

  /// Hand the device's push token to the garage (POST /devices). Call it whenever FCM gives or renews a token.
  /// It is kept until sign-in if the mechanic is not logged in yet.
  Future<void> setToken(String value) async {
    if (value.isEmpty) return;
    token = value;
    try {
      await MechanicBackend.instance.registerDevice(value);
    } catch (e) {
      debugPrint('Device token registration failed: $e');
    }
  }

  void handlePayload(Map<String, dynamic> data) {
    final type = (data['type'] as String?) ?? '';
    badgeCount++;
    badge.value = badgeCount;

    if (type.contains('approval') || type.contains('proposal')) {
      final jobId = data['jobId'] as String? ?? '';
      AppRouter.router.push(RouteNames.repairProposal, extra: jobId);
      return;
    }
    if (type.contains('sos')) {
      final id = data['sosId'] as String? ?? data['id'] as String? ?? '';
      AppRouter.router.push(RouteNames.sosDetail, extra: id);
      return;
    }
    AppRouter.router.push(RouteNames.notifications);
  }

  void clearBadge() {
    badgeCount = 0;
    badge.value = 0;
  }
}
