import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/domain/auth_entities.dart';
import '../../features/jobs/domain/job_entities.dart';
import '../../features/notifications/domain/app_notification.dart';
import '../../features/repair_proposal/domain/entities/repair_item.dart';
import '../../features/repair_proposal/presentation/providers/proposal_provider.dart';
import '../../features/sos/domain/sos_entities.dart';
import '../di/app_services.dart';
import 'api_client.dart';
import 'fixora_config.dart';
import 'fixora_hub.dart';

/// Where a repair proposal is on its route: mechanic → manager → customer → manager → mechanic.
class ProposalRoute {
  const ProposalRoute(this.proposalId, this.status, this.managerNote);
  final String proposalId;
  final String status;
  final String? managerNote;

  String get label => switch (status) {
        'PendingManagerReview' => 'With the service manager for pricing. The customer sees it only after the manager sends it.',
        'ReturnedToMechanic' => 'Returned by the manager: ${managerNote ?? 'see the note'}. Fix and send again.',
        'AwaitingCustomer' => 'The manager sent it to the customer. Wait: do not start these items until the manager releases them.',
        'ReleasedToMechanic' => 'Released by the manager. Do the approved items only.',
        _ => status,
      };

  bool get canStart => status == 'ReleasedToMechanic';
}

/// Connects Fixora Rev to Fixora.Mechanic.Api (/api/v1/mechanic/*) and the realtime hub.
///
/// Every hand-off goes through the service manager:
///  * a repair proposal goes to the manager (not to the customer);
///  * the customer's answer reaches the mechanic only when the manager releases the work;
///  * a customer change request reaches the mechanic only when the manager forwards it.
class MechanicBackend extends ChangeNotifier {
  MechanicBackend._();
  static final MechanicBackend instance = MechanicBackend._();

  final ApiClient api = ApiClient('fixora.mechanic.session');
  late final FixoraHub hub = FixoraHub(api.freshToken);

  /// Lets the backend update Riverpod state (repair proposals) from outside the widget tree.
  ProviderContainer? container;

  bool live = false;
  final Map<String, ProposalRoute> routes = {};

  /// Change requests the manager forwarded and the mechanic has not acknowledged yet (ChangeRequestDto).
  final List<Map<String, dynamic>> forwardedChanges = [];

  bool get enabled => !FixoraConfig.demoOnly;

  // ------------------------------------------------------------------ session

  /// Sign in with the employee code (EMP-001) or phone and the 4-digit garage PIN.
  /// Throws [ApiException] (status 0 when the server cannot be reached).
  Future<void> pinLogin(String login, String pin) async {
    final tokens = await api.post('/mechanic/auth/pin-login', body: {'login': login, 'pin': pin}) as Map<String, dynamic>;
    await api.saveSession(tokens);
    await _afterLogin();
  }

  /// Quick login: picks up the saved garage session (refresh token) after the PIN check.
  /// Returns false when there is none, or the server cannot be reached.
  Future<bool> resume() async {
    if (!enabled) return false;
    try {
      await api.restore();
      if (!api.signedIn) return false;
      if (await api.refresh() == null) return false;
      await _afterLogin();
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Accepts the manager's 7-day invitation and sets the PIN.
  Future<void> acceptInvitation(String token, String name, String pin) async {
    final tokens = await api.post('/mechanic/auth/invitations/accept', body: {'token': token, 'name': name, 'pin': pin}) as Map<String, dynamic>;
    await api.saveSession(tokens);
    await _afterLogin();
  }

  Future<void> logout() async {
    await hub.stop();
    hub.clearHandlers();
    await api.logout();
    live = false;
    routes.clear();
    forwardedChanges.clear();
    notifyListeners();
  }

  Future<void> _afterLogin() async {
    live = true;
    final p = await api.get('/mechanic/profile') as Map<String, dynamic>;
    AppServices.auth.signInRemote(MechanicUser(
      id: p['id'] as String,
      fullName: (p['name'] as String?) ?? 'Mechanic',
      email: '${(p['employeeCode'] as String? ?? 'mechanic').toLowerCase()}@garage',
      phone: (p['phone'] as String?) ?? '',
      garageName: 'Fixora Garage',
      garageBranch: 'Jaffna',
      employeeId: (p['employeeCode'] as String?) ?? '',
      skills: const ['General service', 'Brakes', 'Suspension'],
    ));
    AppServices.auth.setOnDuty(p['onDuty'] == true);
    await Future.wait([refreshJobs(), refreshNotifications(), refreshSos()]);
    _wireRealtime();
    await hub.start();
    notifyListeners();
  }

  Future<void> setOnDuty(bool onDuty) async {
    if (!live) return;
    await api.put('/mechanic/profile/duty', body: {'onDuty': onDuty});
  }

  // ------------------------------------------------------------------ jobs

  /// Pull-to-refresh: re-reads jobs, alerts and SOS from the garage. Demo mode just settles.
  Future<void> pullRefresh() async {
    if (!live) {
      await Future<void>.delayed(const Duration(milliseconds: 600));
      return;
    }
    try {
      await Future.wait([refreshJobs(), refreshNotifications(), refreshSos()]);
    } catch (_) {
      // Keep what is on screen; the realtime hub will catch up.
    }
  }

  Future<void> refreshJobs() async {
    final list = (await api.get('/mechanic/jobs') as List<dynamic>).cast<Map<String, dynamic>>();
    AppServices.jobs.replaceAll(list.map(jobFrom).toList());
    for (final j in list) {
      unawaited(refreshProposals(j['id'] as String).catchError((Object _) {}));
    }
  }

  static Job jobFrom(Map<String, dynamic> j) {
    final label = (j['vehicleLabel'] as String?) ?? 'Vehicle';
    final plateMatch = RegExp(r'\(([^)]*)\)').firstMatch(label);
    final name = label.split('(').first.trim();
    final parts = name.split(' ');
    final number = (j['number'] as String?) ?? '';
    final complaint = (j['complaint'] as String?) ?? 'Service';
    final lower = complaint.toLowerCase();
    return Job(
      id: j['id'] as String,
      token: int.tryParse(number.split('-').last) ?? ((j['queuePosition'] as num?)?.toInt() ?? 0) + 1,
      vehicle: Vehicle(
        id: (j['vehicleId'] as String?) ?? '',
        make: parts.first,
        model: parts.length > 1 ? parts.sublist(1).join(' ') : '',
        year: DateTime.now().year,
        plate: plateMatch?.group(1) ?? '',
        mileageKm: 0,
        fuel: 'Petrol',
        color: '',
      ),
      customer: Customer(name: (j['customerName'] as String?) ?? 'Customer', phone: ''),
      serviceType: complaint,
      reportedSymptoms: [complaint],
      slotTime: DateTime.tryParse((j['createdAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      estimatedMinutes: (j['estimatedMinutes'] as num?)?.toInt() ?? 60,
      status: switch (j['status']) {
        'Open' => JobStatus.waiting,
        'Inspecting' => JobStatus.diagnosing,
        'AwaitingManagerReview' || 'AwaitingCustomerApproval' || 'AwaitingRelease' => JobStatus.awaitingApproval,
        'InProgress' || 'Paused' => JobStatus.inProgress,
        'Completed' || 'Closed' => JobStatus.completed,
        _ => JobStatus.waiting,
      },
      bay: (j['bayName'] as String?) ?? 'Bay 1',
      scenario: lower.contains('brake')
          ? 'brakes'
          : lower.contains('heat')
              ? 'overheat'
              : lower.contains('a/c') || lower.contains('ac ')
                  ? 'ac'
                  : 'service',
      priority: switch ((j['priority'] as num?)?.toInt() ?? 0) {
        >= 2 => JobPriority.sos,
        1 => JobPriority.safety,
        _ => JobPriority.normal,
      },
      startedAt: DateTime.tryParse((j['startedAt'] as String?) ?? '')?.toLocal(),
      completedAt: DateTime.tryParse((j['completedAt'] as String?) ?? '')?.toLocal(),
      customerNote: complaint,
    )..log('Job card $number', detail: (j['status'] as String?) ?? '', icon: Icons.assignment_outlined);
  }

  /// Start / pause / complete etc. (JobActionRequest). The manager and customer follow it live.
  Future<void> jobAction(String jobId, String action, {String? stage, String? message, int? percent}) async {
    if (!live) return;
    await api.post('/mechanic/jobs/$jobId/actions', body: {'action': action, 'stage': stage, 'message': message, 'percent': percent});
    await refreshJobs();
  }

  // ------------------------------------------------------------------ proposals (mechanic → manager)

  Future<void> refreshProposals(String jobId) async {
    final list = (await api.get('/mechanic/jobs/$jobId/proposals') as List<dynamic>).cast<Map<String, dynamic>>();
    if (list.isEmpty) return;
    list.sort((a, b) => ((a['submittedAt'] as String?) ?? '').compareTo((b['submittedAt'] as String?) ?? ''));
    _applyProposal(list.last);
  }

  /// Sends the unsent items to the service manager (never straight to the customer).
  Future<void> submitProposal(String jobId, List<RepairItem> items, {String? note}) async {
    final p = await api.post('/mechanic/jobs/$jobId/proposals', body: {
      'note': note,
      'items': [
        for (final i in items)
          {
            'title': i.title,
            'kind': i.type == RepairItemType.labour ? 'Labour' : 'Part',
            'qty': 1,
            'unitPrice': i.price,
            'linkedIssueId': null,
            'partId': null,
          },
      ],
    }) as Map<String, dynamic>;
    _applyProposal(p);
    await refreshJobs();
  }

  void _applyProposal(Map<String, dynamic> p) {
    final jobId = p['jobCardId'] as String;
    routes[jobId] = ProposalRoute(p['id'] as String, (p['status'] as String?) ?? '', p['managerNote'] as String?);
    final items = ((p['items'] as List?) ?? const []).cast<Map<String, dynamic>>().map((i) => RepairItem(
          id: i['id'] as String,
          title: (i['title'] as String?) ?? '',
          type: i['kind'] == 'Labour' ? RepairItemType.labour : RepairItemType.part,
          price: ((i['amount'] as num?) ?? 0).round(),
          decision: switch (i['status']) {
            'Approved' || 'Released' => ApprovalDecision.approved,
            'Rejected' => ApprovalDecision.declined,
            _ => ApprovalDecision.pending,
          },
        ));
    container?.read(proposalProvider.notifier).applyRemote(jobId, items.toList());
    notifyListeners();
  }

  // ------------------------------------------------------------------ change requests (customer → manager → mechanic)

  Future<void> acknowledgeChange(String changeRequestId, {String? note}) async {
    await api.post('/mechanic/jobs/change-requests/$changeRequestId/acknowledge', body: {'note': note});
    forwardedChanges.removeWhere((c) => c['id'] == changeRequestId);
    notifyListeners();
  }

  // ------------------------------------------------------------------ notifications + SOS

  Future<void> refreshNotifications() async {
    final list = (await api.get('/notifications', query: {'take': '60'}) as List<dynamic>).cast<Map<String, dynamic>>();
    AppServices.notifications.replaceAll(list.map(notificationFrom).toList());
  }

  void markRead(String? remoteId) {
    if (live && remoteId != null) unawaited(api.post('/notifications/$remoteId/read').catchError((Object _) => null));
  }

  static AppNotification notificationFrom(Map<String, dynamic> n) {
    final type = (n['type'] as String?) ?? '';
    return AppNotification(
      kind: switch (type.split('.').first) {
        'proposal' || 'approval' => NotificationKind.approval,
        'sos' => NotificationKind.sos,
        'queue' => NotificationKind.queue,
        'inventory' => NotificationKind.parts,
        _ => NotificationKind.job,
      },
      title: (n['title'] as String?) ?? '',
      body: (n['body'] as String?) ?? '',
      time: DateTime.tryParse((n['createdAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      read: n['read'] == true,
      jobId: n['jobId'] as String?,
      remoteId: n['id'] as String?,
      remoteType: type,
      entityId: n['entityId'] as String?,
    );
  }

  Future<void> refreshSos() async {
    final list = (await api.get('/mechanic/sos') as List<dynamic>).cast<Map<String, dynamic>>();
    AppServices.sos.replaceAll(list.map(sosFrom).toList());
  }

  static SosRequest sosFrom(Map<String, dynamic> s) {
    final label = (s['vehicleLabel'] as String?) ?? 'Vehicle';
    final name = label.split('(').first.trim();
    final parts = name.split(' ');
    return SosRequest(
      id: s['id'] as String,
      customer: Customer(name: (s['customerName'] as String?) ?? 'Customer', phone: (s['customerPhone'] as String?) ?? ''),
      vehicle: Vehicle(
        id: (s['vehicleId'] as String?) ?? '',
        make: parts.first,
        model: parts.length > 1 ? parts.sublist(1).join(' ') : '',
        year: DateTime.now().year,
        plate: RegExp(r'\(([^)]*)\)').firstMatch(label)?.group(1) ?? '',
        mileageKm: 0,
        fuel: 'Petrol',
        color: '',
      ),
      issue: [s['category'] as String? ?? 'SOS', if (s['driveSenseContext'] != null) s['driveSenseContext'] as String].join(' · '),
      locationLabel: '${(s['lat'] as num?)?.toStringAsFixed(4)}, ${(s['lng'] as num?)?.toStringAsFixed(4)}',
      distanceKm: 0,
      channel: SosChannel.online,
      receivedAt: DateTime.tryParse((s['receivedAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      status: switch (s['status']) {
        'Acknowledged' => SosStatus.accepted,
        'Dispatched' => SosStatus.enRoute,
        'OnSite' => SosStatus.arrived,
        'Resolved' => SosStatus.resolvedOnSite,
        'Cancelled' => SosStatus.declined,
        _ => SosStatus.pending,
      },
    );
  }

  /// Mechanic updates a dispatched SOS (OnSite, Resolved).
  Future<void> sosStatus(String id, String status, {String? note}) async {
    await api.post('/mechanic/sos/$id/status', body: {'status': status, 'note': note});
    await refreshSos();
  }

  // ------------------------------------------------------------------ realtime

  void _wireRealtime() {
    hub.clearHandlers();
    hub.on('notification', (payload) {
      if (payload is! Map) return;
      final n = Map<String, dynamic>.from(payload);
      AppServices.notifications.add(notificationFrom(n));
      final type = (n['type'] as String?) ?? '';
      final jobId = n['jobId'] as String?;
      if (type == 'change.forwarded' && n['entityId'] is String) {
        forwardedChanges.add({'id': n['entityId'], 'jobId': jobId, 'body': n['body'], 'title': n['title']});
        notifyListeners();
      }
      if (type.startsWith('proposal') || type.startsWith('approval') || type.startsWith('job') || type.startsWith('queue')) {
        unawaited(refreshJobs().catchError((Object _) {}));
      }
      if (type.startsWith('sos')) unawaited(refreshSos().catchError((Object _) {}));
    });
    // The mechanic's copy is masked by the server: customer answers stay hidden until the manager releases them.
    hub.on('approval.updated', (payload) {
      if (payload is Map) _applyProposal(Map<String, dynamic>.from(payload));
    });
    hub.on('sos.updated', (_) => unawaited(refreshSos().catchError((Object _) {})));
    hub.onConnected(() {
      unawaited(refreshJobs().catchError((Object _) {}));
      unawaited(refreshNotifications().catchError((Object _) {}));
    });
  }
}
