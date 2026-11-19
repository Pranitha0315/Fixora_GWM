import 'package:flutter/foundation.dart';

import '../models/models.dart';

/// In-memory job + notification store (demo). Screens listen to this.
class JobStore extends ChangeNotifier {
  JobStore._();
  static final JobStore instance = JobStore._();

  final List<AppNotification> notifications = [
    AppNotification(
      id: 'n1',
      title: 'You are #2 in the queue',
      body: 'Bay 2 is finishing up. Estimated start in about 10 minutes.',
      time: DateTime.now().subtract(const Duration(minutes: 4)),
      kind: NotificationKind.queue,
      unread: true,
    ),
    AppNotification(
      id: 'n2',
      title: 'Booking confirmed',
      body: 'Your Full Service slot is confirmed. Tap to view bookings.',
      time: DateTime.now().subtract(const Duration(hours: 2)),
      kind: NotificationKind.booking,
      unread: true,
    ),
    AppNotification(
      id: 'n3',
      title: 'Service reminder',
      body: 'General Service is due soon for your vehicle.',
      time: DateTime.now().subtract(const Duration(days: 1)),
      kind: NotificationKind.reminder,
      unread: false,
    ),
  ];

  int get unreadCount => notifications.where((n) => n.unread).length;

  int _nid = 100;
  String nextNotificationId() => 'n${_nid++}';

  void push(AppNotification n) {
    notifications.insert(0, n);
    notifyListeners();
  }

  void markRead(String id) {
    final i = notifications.indexWhere((n) => n.id == id);
    if (i >= 0 && notifications[i].unread) {
      notifications[i] = notifications[i].copyWith(unread: false);
      notifyListeners();
    }
  }

  void markAllRead() {
    for (var i = 0; i < notifications.length; i++) {
      notifications[i] = notifications[i].copyWith(unread: false);
    }
    notifyListeners();
  }

  void remove(String id) {
    notifications.removeWhere((n) => n.id == id);
    notifyListeners();
  }

  void replaceNotifications(List<AppNotification> list) {
    notifications
      ..clear()
      ..addAll(list);
    notifyListeners();
  }

  /// Active remote job id from the garage API, if any.
  String? remoteJobId;
  String jobId = 'FX-1042';
  String statusLabel = 'In progress';
  String currentStepLabel = 'Diagnosis';
  double journey = 0.2;
  JobStatus status = JobStatus.diagnosis;

  final List<MediaItem> media = [
    const MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.before,
      caption: 'Front bumper scratch at check-in',
    ),
    const MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.during,
      caption: 'Brake disc inspection',
    ),
    const MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.during,
      caption: 'Old vs new brake pads',
    ),
    const MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.during,
      caption: 'Wheel alignment in progress',
    ),
    const MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.after,
      caption: 'Bumper after polishing',
    ),
    const MediaItem(
      asset: '',
      kind: MediaKind.video,
      stage: MediaStage.during,
      caption: 'Brake pad replacement',
      duration: '02:36',
    ),
  ];

  void clearRemote() {
    remoteJobId = null;
    statusLabel = 'In progress';
    journey = 0;
    notifyListeners();
  }

  /// Applies JobDetailDto (+ optional pending proposal) from the backend.
  void applyRemote(Map<String, dynamic> detail, Map<String, dynamic>? pending) {
    final job = detail['job'] as Map<String, dynamic>?;
    remoteJobId = job?['id'] as String?;
    final status = (job?['status'] as String?) ?? '';
    statusLabel = switch (status) {
      'AwaitingCustomerApproval' => 'Awaiting your approval',
      'InProgress' || 'Paused' => 'In progress',
      'Completed' => 'Completed',
      'Closed' => 'Closed',
      _ => status.isEmpty ? 'In progress' : status,
    };
    final timeline = ((detail['timeline'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final pct = timeline.fold<int>(
      0,
      (m, t) => ((t['percent'] as num?)?.toInt() ?? 0) > m ? (t['percent'] as num).toInt() : m,
    );
    journey = (pct / 100).clamp(0.0, 1.0);
    if (pending != null) statusLabel = 'Approval needed';
    notifyListeners();
  }
}
