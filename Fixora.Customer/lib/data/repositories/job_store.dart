import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
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

  bool get isLive => remoteJobId != null;

  final List<EstimateItem> items = [
    EstimateItem(
      id: 'demo-1',
      status: 'AwaitingCustomer',
      name: 'Thermostat assembly',
      subtitle: 'Part',
      qty: 1,
      unitPrice: 8500,
      type: ItemType.part,
      icon: Icons.settings_input_component_rounded,
      color: const Color(0xFFB7791F),
    ),
    EstimateItem(
      id: 'demo-2',
      status: 'AwaitingCustomer',
      name: 'Coolant flush labour',
      subtitle: 'Labour',
      qty: 1,
      unitPrice: 4500,
      type: ItemType.labour,
      icon: Icons.handyman_outlined,
      color: AppColors.primary,
    ),
  ];

  String? approvalRemarks;

  void approve({String? remarks}) {
    approvalRemarks = remarks;
    status = JobStatus.inProgress;
    statusLabel = 'In progress';
    currentStepLabel = 'Repair';
    journey = 0.45;
    notifications.insert(
      0,
      AppNotification(
        id: nextNotificationId(),
        title: 'Estimate approved',
        body: 'Thanks! Work on $jobId has started.',
        time: DateTime.now(),
        kind: NotificationKind.estimate,
        unread: true,
      ),
    );
    notifyListeners();
  }

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
    final garageStatus = (job?['status'] as String?) ?? '';
    statusLabel = switch (garageStatus) {
      'AwaitingCustomerApproval' => 'Awaiting your approval',
      'InProgress' || 'Paused' => 'In progress',
      'Completed' => 'Completed',
      'Closed' => 'Closed',
      _ => garageStatus.isEmpty ? 'In progress' : garageStatus,
    };
    status = switch (garageStatus) {
      'AwaitingCustomerApproval' => JobStatus.awaitingApproval,
      'InProgress' || 'Paused' => JobStatus.inProgress,
      'Completed' => JobStatus.completed,
      'Closed' => JobStatus.paid,
      _ => JobStatus.diagnosis,
    };
    final timeline = ((detail['timeline'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final pct = timeline.fold<int>(
      0,
      (m, t) => ((t['percent'] as num?)?.toInt() ?? 0) > m ? (t['percent'] as num).toInt() : m,
    );
    journey = (pct / 100).clamp(0.0, 1.0);
    if (pending != null) {
      statusLabel = 'Approval needed';
      status = JobStatus.awaitingApproval;
      items
        ..clear()
        ..addAll(((pending['items'] as List?) ?? const []).cast<Map<String, dynamic>>().map(_itemFrom));
    }
    notifyListeners();
  }

  static EstimateItem _itemFrom(Map<String, dynamic> i) {
    final labour = i['kind'] == 'Labour';
    final status = (i['status'] as String?) ?? '';
    return EstimateItem(
      id: i['id'] as String,
      version: (i['version'] as num?)?.toInt() ?? 1,
      status: status,
      name: (i['title'] as String?) ?? '',
      subtitle: switch (status) {
        'Approved' => 'Approved by you',
        'Rejected' => 'Declined by you',
        'Released' => 'In the repair plan',
        _ => labour ? 'Labour' : 'Part',
      },
      qty: (i['qty'] as num?)?.toInt() ?? 1,
      unitPrice: (i['unitPrice'] as num?)?.toDouble() ?? 0,
      type: labour ? ItemType.labour : ItemType.part,
      icon: labour ? Icons.handyman_outlined : Icons.settings_input_component_rounded,
      color: labour ? AppColors.primary : const Color(0xFFB7791F),
    );
  }
}
