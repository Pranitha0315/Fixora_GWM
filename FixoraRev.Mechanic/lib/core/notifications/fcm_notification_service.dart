import 'package:flutter/foundation.dart';

import '../../app/router/app_router.dart';
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
    // Production: FirebaseMessaging.instance.requestPermission / onMessage / onMessageOpenedApp
    debugPrint('FcmNotificationService ready (demo routing enabled)');
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
