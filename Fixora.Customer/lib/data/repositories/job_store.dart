import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../mock/mock_data.dart';
import '../models/models.dart';
import '../remote/customer_backend.dart';
import 'app_state.dart';

/// In-memory app state for the demo.
///
/// Swap the bodies of these methods for HTTP / SignalR calls to the Fixora
/// .NET backend later; the screens only listen to this store.
class JobStore extends ChangeNotifier {
  JobStore._();
  static final JobStore instance = JobStore._();

  // ----- Job -----
  Vehicle get vehicle => AppState.instance.vehicleById(_vehicleId ?? 'v1');
  String jobId = MockData.jobId;
  String? _vehicleId;

  // ----- Live backend binding (all null / false in demo mode) -----
  /// Job card id on the backend.
  String? remoteJobId;

  /// Backend JobStatus (Open, Inspecting, AwaitingManagerReview, AwaitingCustomerApproval, AwaitingRelease, InProgress, ...).
  String? garageStatus;

  /// The customer has answered every item; the service manager still has to release the work to the mechanic.
  bool decisionSent = false;

  bool get isLive => remoteJobId != null;
  final List<EstimateItem> items = List.of(MockData.estimateItems);

  JobStatus _status = JobStatus.awaitingApproval;
  JobStatus get status => _status;

  /// Index of the current step in [MockData.progressSteps].
  int _progress = 2;
  int get progress => _progress;

  final List<MediaItem> media = List.of(MockData.initialMedia);
  final List<ChangeRequest> changeRequests = [];
  String? approvalRemarks;
  double? paidAmount;
  String? paymentMethod;

  /// Server invoice for the live job, once the garage has issued it (InvoiceDto).
  String? invoiceNumber;
  double? invoiceSubtotal;
  double? invoiceTax;
  double? invoiceTotal;

  /// Loyalty discount the garage applied on the issued invoice (points already used).
  double loyaltyDiscount = 0;
  bool get invoiceIssued => invoiceTotal != null;

  double get partsTotal => items
      .where((i) => i.type == ItemType.part)
      .fold(0.0, (s, i) => s + i.amount);
  double get labourTotal => items
      .where((i) => i.type == ItemType.labour)
      .fold(0.0, (s, i) => s + i.amount);
  double get subtotal => partsTotal + labourTotal;
  double get tax => invoiceTax ?? (isLive ? 0 : subtotal * MockData.vatRate);
  double get total => invoiceTotal ?? subtotal + tax;

  bool get allPartsInStock => items.every((i) => i.inStock);

  String get currentStepLabel {
    if (_status == JobStatus.awaitingApproval ||
        _status == JobStatus.changesRequested) {
      return 'Estimate Approval';
    }
    if (_status == JobStatus.completed || _status == JobStatus.paid) {
      return 'Ready for Pickup';
    }
    return _progress == 2 ? 'Parts Installation' : MockData.progressSteps[_progress];
  }

  String get statusLabel {
    if (isLive && decisionSent) return 'Waiting for Garage';
    if (isLive && garageStatus == 'AwaitingManagerReview') return 'Being Priced';
    switch (_status) {
      case JobStatus.diagnosis:
        return 'Diagnosing';
      case JobStatus.awaitingApproval:
        return 'Awaiting Approval';
      case JobStatus.changesRequested:
        return 'Changes Requested';
      case JobStatus.inProgress:
        return 'Repair In Progress';
      case JobStatus.completed:
        return 'Ready for Pickup';
      case JobStatus.paid:
        return 'Paid & Delivered';
    }
  }

  /// Overall journey 0..1 used in the home hero card.
  double get journey {
    switch (_status) {
      case JobStatus.diagnosis:
        return 0.15;
      case JobStatus.awaitingApproval:
      case JobStatus.changesRequested:
        return 0.35;
      case JobStatus.inProgress:
        return 0.45 + (_progress / MockData.progressSteps.length) * 0.45;
      case JobStatus.completed:
        return 0.95;
      case JobStatus.paid:
        return 1;
    }
  }

  void approve({String? remarks}) {
    approvalRemarks = remarks;
    _status = JobStatus.inProgress;
    _progress = 2;
    notifications.insert(0, AppNotification(
      id: nextNotificationId(),
      title: 'Estimate approved',
      body: 'Thanks! Work on $jobId has started.',
      time: DateTime.now(),
      kind: NotificationKind.estimate,
      unread: true,
    ));
    notifyListeners();
  }

  void reject() {
    _status = JobStatus.changesRequested;
    notifyListeners();
  }

  ChangeRequest requestChanges(List<String> changes, String details) {
    final cr = ChangeRequest(
      id: 'CR-2026-${(47 + changeRequests.length).toString().padLeft(4, '0')}',
      changes: changes,
      details: details,
      createdAt: DateTime.now(),
    );
    changeRequests.insert(0, cr);
    _status = JobStatus.changesRequested;
    notifyListeners();
    return cr;
  }

  void addMedia(List<MediaItem> list) {
    media.insertAll(0, list);
    notifyListeners();
  }

  void advance() {
    if (_status == JobStatus.awaitingApproval ||
        _status == JobStatus.changesRequested) {
      approve();
      return;
    }
    if (_status == JobStatus.inProgress) {
      if (_progress < MockData.progressSteps.length - 1) {
        _progress++;
      } else {
        _status = JobStatus.completed;
        notifications.insert(0, AppNotification(
          id: nextNotificationId(),
          title: 'Your vehicle is ready!',
          body: '${vehicle.name} (${vehicle.plate}) is ready for pickup.',
          time: DateTime.now(),
          kind: NotificationKind.completed,
          unread: true,
        ));
      }
    } else if (_status == JobStatus.completed) {
      _status = JobStatus.paid;
      paidAmount = total;
    }
    notifyListeners();
  }

  void setStatus(JobStatus s) {
    _status = s;
    if (s == JobStatus.inProgress) _progress = 2;
    if (s == JobStatus.completed || s == JobStatus.paid) {
      _progress = MockData.progressSteps.length - 1;
    }
    if (s == JobStatus.paid) paidAmount = total;
    notifyListeners();
  }

  void recordCashPayment(double amount, {String method = 'Card at counter'}) {
    paymentMethod = method;
    paidAmount = amount;
    _status = JobStatus.paid;
    notifications.insert(0, AppNotification(
      id: nextNotificationId(),
      title: 'Payment received',
      body: 'Payment for $jobId received by $method. Thank you!',
      time: DateTime.now(),
      kind: NotificationKind.payment,
      unread: true,
    ));
    notifyListeners();
  }

  // ----- Notifications -----
  final List<AppNotification> notifications = MockData.buildNotifications();
  int get unreadCount => notifications.where((n) => n.unread).length;

  void markAllRead() {
    for (var i = 0; i < notifications.length; i++) {
      notifications[i] = notifications[i].copyWith(unread: false);
    }
    CustomerBackend.instance.markAllRead();
    notifyListeners();
  }

  void replaceNotifications(List<AppNotification> list) {
    notifications
      ..clear()
      ..addAll(list);
    notifyListeners();
  }

  // ----- Backend → store -----

  /// Fills the job from JobDetailDto and the proposal waiting for the customer (ProposalDto), if any.
  void applyRemote(Map<String, dynamic> detail, Map<String, dynamic>? pending) {
    final job = detail['job'] as Map<String, dynamic>;
    remoteJobId = job['id'] as String;
    jobId = (job['number'] as String?) ?? jobId;
    _vehicleId = job['vehicleId'] as String?;
    garageStatus = job['status'] as String?;

    final proposals = ((detail['proposals'] as List?) ?? const []).cast<Map<String, dynamic>>().toList()
      ..sort((a, b) => ((a['submittedAt'] as String?) ?? '').compareTo((b['submittedAt'] as String?) ?? ''));
    final shown = pending ?? (proposals.isEmpty ? null : proposals.last);
    if (shown != null) {
      items
        ..clear()
        ..addAll(((shown['items'] as List?) ?? const []).cast<Map<String, dynamic>>().map(_itemFrom));
    }
    decisionSent = shown != null && shown['status'] == 'CustomerResponded';

    final changes = ((detail['changeRequests'] as List?) ?? const []).cast<Map<String, dynamic>>();
    changeRequests
      ..clear()
      ..addAll(changes.map(changeRequestFrom));
    final changePending = changes.any((c) => c['status'] == 'PendingManagerReview');

    _status = switch (garageStatus) {
      'AwaitingCustomerApproval' => changePending ? JobStatus.changesRequested : JobStatus.awaitingApproval,
      'AwaitingRelease' => JobStatus.awaitingApproval,
      'InProgress' || 'Paused' => JobStatus.inProgress,
      'Completed' => JobStatus.completed,
      'Closed' => JobStatus.paid,
      _ => JobStatus.diagnosis,
    };
    final timeline = ((detail['timeline'] as List?) ?? const []).cast<Map<String, dynamic>>();
    final pct = timeline.fold<int>(0, (m, t) => ((t['percent'] as num?)?.toInt() ?? 0) > m ? (t['percent'] as num).toInt() : m);
    final last = MockData.progressSteps.length - 1;
    _progress = ((pct / 100) * last).round().clamp(0, last).toInt();

    final invoice = detail['invoice'];
    if (invoice is Map) {
      invoiceNumber = invoice['number'] as String?;
      invoiceSubtotal = (invoice['subtotal'] as num?)?.toDouble();
      invoiceTax = (invoice['tax'] as num?)?.toDouble();
      invoiceTotal = (invoice['total'] as num?)?.toDouble();
      loyaltyDiscount = (invoice['loyaltyDiscount'] as num?)?.toDouble() ?? 0;
    } else {
      invoiceNumber = null;
      invoiceSubtotal = null;
      invoiceTax = null;
      invoiceTotal = null;
      loyaltyDiscount = 0;
    }
    if (invoice is Map && invoice['status'] == 'Paid') {
      paidAmount = (invoice['total'] as num?)?.toDouble();
      paymentMethod = invoice['paymentMethod'] as String?;
    }
    notifyListeners();
  }

  /// The customer has no active job at the garage any more.
  void clearRemote() {
    if (remoteJobId == null) return;
    remoteJobId = null;
    garageStatus = null;
    decisionSent = false;
    invoiceNumber = null;
    invoiceSubtotal = null;
    invoiceTax = null;
    invoiceTotal = null;
    loyaltyDiscount = 0;
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

  static ChangeRequest changeRequestFrom(Map<String, dynamic> c) => ChangeRequest(
        id: (c['number'] as String?) ?? '',
        changes: ((c['changes'] as List?) ?? const []).cast<String>(),
        details: (c['details'] as String?) ?? '',
        createdAt: DateTime.tryParse((c['createdAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
        status: switch (c['status']) {
          'PendingManagerReview' => 'With service manager',
          'ForwardedToMechanic' => 'Sent to your mechanic',
          'Declined' => 'Declined: ${(c['managerNote'] as String?) ?? ''}',
          'Acknowledged' => 'Mechanic is on it',
          _ => 'Under Review',
        },
      );

  int _nid = 100;
  String nextNotificationId() => 'n${_nid++}';

  /// Adds a notification at the top and refreshes listeners.
  void push(AppNotification n) {
    notifications.insert(0, n);
    notifyListeners();
  }

  void markRead(String id) {
    final i = notifications.indexWhere((n) => n.id == id);
    if (i >= 0 && notifications[i].unread) {
      notifications[i] = notifications[i].copyWith(unread: false);
      CustomerBackend.instance.markRead(id);
      notifyListeners();
    }
  }

  void remove(String id) {
    notifications.removeWhere((n) => n.id == id);
    notifyListeners();
  }
}
