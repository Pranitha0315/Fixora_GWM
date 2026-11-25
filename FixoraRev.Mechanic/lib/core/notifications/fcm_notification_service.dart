import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/app_router.dart';
import '../../app/router/route_names.dart';
import '../../features/notifications/presentation/notifications_controller.dart';
import '../di/app_services.dart';

/// Local FCM payload router (no firebase_messaging dependency).
class FcmNotificationService {
  FcmNotificationService._();

  static final FcmNotificationService instance = FcmNotificationService._();

  bool _inited = false;

  Future<void> init() async {
    if (_inited) return;
    _inited = true;
    AppServices.notifications.addListener(_onBadgeRefresh);
    _onBadgeRefresh();
  }

  void _onBadgeRefresh() {
    debugPrint(
      'FCM badge sync: ${AppServices.notifications.unread} unread',
    );
  }

  /// Route push data / tap targets from a simulated FCM payload map.
  void handlePayload(Map<String, String> data) {
    final type = data['type'] ?? data['event'] ?? '';
    final jobId = data['job_id'] ?? data['jobId'];
    final requestId = data['request_id'] ?? data['requestId'] ?? data['sos_id'];
    final title = data['title'] ?? _titleFor(type);
    final body = data['body'] ?? data['message'] ?? '';

    AppServices.notifications.push(
      AppNotification(
        id: data['id'] ?? 'fcm-${DateTime.now().millisecondsSinceEpoch}',
        title: title,
        body: body.isNotEmpty ? body : 'Tap to open',
        type: type.isEmpty ? null : type,
        route: _routeFor(type, jobId: jobId, requestId: requestId),
      ),
    );

    final ctx = AppRouter.rootNavigatorKey.currentContext;
    if (ctx == null || !ctx.mounted) return;
    final route = _routeFor(type, jobId: jobId, requestId: requestId);
    if (route != null) ctx.push(route);
  }

  String? _routeFor(
    String type, {
    String? jobId,
    String? requestId,
  }) {
    final t = type.toLowerCase();
    if (t.contains('approval') || t.contains('proposal')) {
      if (jobId != null && jobId.isNotEmpty) {
        return RouteNames.repairProposalPath(jobId);
      }
    }
    if (t.contains('sos') && requestId != null && requestId.isNotEmpty) {
      return RouteNames.sosDetailPath(requestId);
    }
    if (t.contains('job') && jobId != null && jobId.isNotEmpty) {
      return RouteNames.jobDetailsPath(jobId);
    }
    return null;
  }

  String _titleFor(String type) {
    final t = type.toLowerCase();
    if (t.contains('approval')) return 'Customer approved';
    if (t.contains('proposal')) return 'Proposal update';
    if (t.contains('sos')) return 'SOS alert';
    if (t.contains('job')) return 'Job update';
    return 'Fixora alert';
  }

  void dispose() {
    AppServices.notifications.removeListener(_onBadgeRefresh);
    _inited = false;
  }
}