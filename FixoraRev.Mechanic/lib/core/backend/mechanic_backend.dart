import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;
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
        'CustomerResponded' => 'The customer has answered. Wait for the manager to check it and release the approved items.',
        'Cancelled' => 'This proposal was cancelled. Send a new one if more work is needed.',
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
  MechanicBackend._() {
    api.onSessionExpired = _onSessionExpired;
  }
  static final MechanicBackend instance = MechanicBackend._();

  final ApiClient api = ApiClient('fixora.mechanic.session');

  /// The server rejected the saved session while the mechanic was signed in:
  /// stop live updates and sign out locally. The router then shows the Login page.
  void _onSessionExpired() {
    if (!AppServices.auth.isLoggedIn) return;
    unawaited(hub.stop().catchError((Object _) {}));
    hub.clearHandlers();
    live = false;
    AppServices.notifications.clearServerUnread();
    routes.clear();
    forwardedChanges.clear();
    AppServices.auth.expireSession();
    notifyListeners();
  }
  late final FixoraHub hub = FixoraHub(api.freshToken);

  /// Lets the backend update Riverpod state (repair proposals) from outside the widget tree.
  ProviderContainer? container;

  bool live = false;
  final Map<String, ProposalRoute> routes = {};

  /// Change requests the manager forwarded and the mechanic has not acknowledged yet (ChangeRequestDto).
  final List<Map<String, dynamic>> forwardedChanges = [];

  // ------------------------------------------------------------------ session

  /// Sign in with the employee code (EMP-001) or phone and the 4-digit garage PIN.
  /// Throws [ApiException] (status 0 when the server cannot be reached).
  Future<void> pinLogin(String login, String pin) async {
    final tokens = await api.post('/mechanic/auth/pin-login', body: {'login': login, 'pin': pin}) as Map<String, dynamic>;
    await api.saveSession(tokens);
    await _afterLogin();
  }

  /// Checks an invitation link before the form is shown (name, phone, expiry).
  /// Throws [ApiException] 410 when it has expired or was already used.
  Future<Map<String, dynamic>> checkInvitation(String token) async =>
      await api.get('/mechanic/auth/invitations/${Uri.encodeComponent(token)}') as Map<String, dynamic>;

  /// Changes the garage PIN used to sign in. Throws [ApiException] 401 when the current PIN is wrong.
  Future<void> changePin(String currentPin, String newPin) async {
    await api.post('/mechanic/profile/pin', body: {'currentPin': currentPin, 'newPin': newPin});
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
    AppServices.notifications.clearServerUnread();
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
    await Future.wait([refreshJobs(), refreshNotifications(), refreshSos(), _sendDeviceToken()]);
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

  /// Job card plus the DriveSense hint (`driveSense` is null when the customer has not opted in or has no trips yet).
  Future<Map<String, dynamic>> jobDetail(String jobId) async =>
      await api.get('/mechanic/jobs/$jobId') as Map<String, dynamic>;

  static Job jobFrom(Map<String, dynamic> j) {
    final label = (j['vehicleLabel'] as String?) ?? 'Vehicle';
    final plateMatch = RegExp(r'\(([^)]*)\)').firstMatch(label);
    final name = label.split('(').first.trim();
    final parts = name.split(' ');
    final number = (j['number'] as String?) ?? '';
    final complaint = (j['complaint'] as String?) ?? 'Service';
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
        // "Paused" is shown as in progress with the paused flag set below.
        'Completed' || 'Closed' => JobStatus.completed,
        _ => JobStatus.waiting,
      },
      bay: (j['bayName'] as String?) ?? 'Bay 1',
      paused: j['status'] == 'Paused',
      priority: switch ((j['priority'] as num?)?.toInt() ?? 0) {
        >= 2 => JobPriority.sos,
        1 => JobPriority.safety,
        _ => JobPriority.normal,
      },
      startedAt: DateTime.tryParse((j['startedAt'] as String?) ?? '')?.toLocal(),
      completedAt: DateTime.tryParse((j['completedAt'] as String?) ?? '')?.toLocal(),
      customerNote: complaint,
      managerNote: ((j['managerNote'] as String?) ?? '').trim().isEmpty
          ? null
          : ((j['managerNote'] as String?) ?? '').trim(),
    )..log('Job card $number', detail: (j['status'] as String?) ?? '', icon: Icons.assignment_outlined);
  }

  /// Gemini speech-to-text for a FixProof voice note (backend holds the Gemini key).
  /// Returns (transcript, reason). transcript == null → show the reason and let the mechanic type.
  Future<(String?, String?)> transcribe(String jobId, List<int> wav, {String language = 'ta'}) async {
    if (!live) {
      return (null, 'Speech-to-text needs the garage server. Type what you found below.');
    }
    final r = await api.postFile(
      '/mechanic/jobs/$jobId/fixproof/transcribe',
      field: 'audio',
      bytes: wav,
      filename: 'voice-note.wav',
      contentType: 'audio/wav',
      fields: {'language': language},
    ) as Map<String, dynamic>;
    return r['available'] == true
        ? ((r['transcript'] as String?), null)
        : (null, r['reason'] as String?);
  }

  // ------------------------------------------------------------------ FixProof (photos → AI draft → verify → publish)

  /// Turns the server's relative signed preview path (`/api/v1/media/{ref}?exp=&sig=`) into a full URL.
  /// GET /media/{mediaRef} is open to the signature itself, so no Bearer header is needed for image widgets.
  static String? absoluteMediaUrl(String? previewUrl) {
    if (previewUrl == null || previewUrl.isEmpty) return null;
    if (previewUrl.startsWith('http://') || previewUrl.startsWith('https://')) return previewUrl;
    return '${FixoraConfig.apiBase}${previewUrl.startsWith('/') ? '' : '/'}$previewUrl';
  }

  /// Uploads one photo or video of the job. Returns the server's media ref and signed preview URL.
  Future<({String mediaRef, String? previewUrl})> uploadFixProofMedia(
    String jobId,
    List<int> bytes, {
    required String filename,
    required String contentType,
    String phase = 'Before',
  }) async {
    final r = await api.postFile(
      '/mechanic/jobs/$jobId/fixproof/media',
      field: 'file',
      bytes: bytes,
      filename: filename,
      contentType: contentType,
      fields: {'phase': phase},
    ) as Map<String, dynamic>;
    return (mediaRef: r['mediaRef'] as String, previewUrl: absoluteMediaUrl(r['previewUrl'] as String?));
  }

  /// Photos and videos already uploaded for this job (MediaUploadResult list).
  Future<List<Map<String, dynamic>>> listFixProofMedia(String jobId) async =>
      (await api.get('/mechanic/jobs/$jobId/fixproof/media') as List<dynamic>).cast<Map<String, dynamic>>();

  Future<List<Map<String, dynamic>>> listDrafts(String jobId) async =>
      (await api.get('/mechanic/jobs/$jobId/fixproof/drafts') as List<dynamic>).cast<Map<String, dynamic>>();

  /// Creates a draft finding. With a transcript the server drafts the words; without one it is a manual entry.
  Future<Map<String, dynamic>> createDraft(
    String jobId, {
    required String component,
    String? transcript,
    required String language,
    required String severity,
    List<String>? mediaRefs,
  }) async =>
      await api.post('/mechanic/jobs/$jobId/fixproof/drafts', body: {
        'component': component,
        'transcript': transcript,
        'language': language,
        'severity': severity,
        'mediaRefs': mediaRefs,
      }) as Map<String, dynamic>;

  Future<Map<String, dynamic>> updateDraft(
    String jobId,
    String draftId, {
    required String component,
    required String findingEn,
    required String findingTa,
    required String recommendationEn,
    required String recommendationTa,
    required String severity,
  }) async =>
      await api.put('/mechanic/jobs/$jobId/fixproof/drafts/$draftId', body: {
        'component': component,
        'findingEn': findingEn,
        'findingTa': findingTa,
        'recommendationEn': recommendationEn,
        'recommendationTa': recommendationTa,
        'severity': severity,
      }) as Map<String, dynamic>;

  Future<void> discardDraft(String jobId, String draftId) async {
    await api.delete('/mechanic/jobs/$jobId/fixproof/drafts/$draftId');
  }

  /// Verifies a draft and publishes it to the manager and customer.
  Future<Map<String, dynamic>> confirmDraft(String jobId, String draftId) async =>
      await api.post('/mechanic/jobs/$jobId/fixproof/drafts/$draftId/confirm') as Map<String, dynamic>;

  /// Start / pause / complete etc. (JobActionRequest). The manager and customer follow it live.
  Future<void> jobAction(String jobId, String action, {String? stage, String? message, int? percent}) async {
    if (!live || !isServerId(jobId)) return; // sample SOS jobs stay on this phone
    await api.post('/mechanic/jobs/$jobId/actions', body: {'action': action, 'stage': stage, 'message': message, 'percent': percent});
    await refreshJobs();
  }

  // ------------------------------------------------------------------ proposals (mechanic → manager)

  /// Real garage-server ids are GUIDs; sample / phone-only ids are not.
  static bool isServerId(String id) => RegExp(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$').hasMatch(id);

  Future<void> refreshProposals(String jobId) async {
    final list = (await api.get('/mechanic/jobs/$jobId/proposals') as List<dynamic>).cast<Map<String, dynamic>>();
    if (list.isEmpty) return;
    list.sort((a, b) => ((a['submittedAt'] as String?) ?? '').compareTo((b['submittedAt'] as String?) ?? ''));
    _applyProposal(list.last);
  }

  /// Sends the unsent items to the service manager (never straight to the customer).
  Future<void> submitProposal(String jobId, List<RepairItem> items, {String? note}) async {
    // Jobs made from a sample SOS (JOB-xxxx) exist only on this phone: the server has no such job.
    if (live && !isServerId(jobId)) {
      throw ApiException(404, 'sample_job',
          'This job is only on this phone. Ask the manager for a walk-in job to send a repair proposal.');
    }
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
    await refreshUnreadCount();
  }

  /// GET /notifications/unread-count: the server's number drives the bell badge.
  Future<void> refreshUnreadCount() async {
    if (!live) return;
    try {
      final r = await api.get('/notifications/unread-count') as Map<String, dynamic>;
      AppServices.notifications.setServerUnread((r['count'] as num?)?.toInt() ?? 0);
    } catch (_) {
      // Keep the locally counted badge when the call fails.
    }
  }

  /// POST /notifications/read-all: the server marks every alert of this user read.
  Future<void> markAllRead() async {
    if (!live) return;
    await api.post('/notifications/read-all');
    await refreshUnreadCount();
  }

  void markRead(String? remoteId) {
    if (live && remoteId != null) {
      unawaited(
        api.post('/notifications/$remoteId/read').then((_) => refreshUnreadCount()).catchError((Object _) => null),
      );
    }
  }

  // ------------------------------------------------------------------ push device token

  String? _deviceToken;

  /// POST /devices: registers this phone's push token so the garage can reach it.
  /// Safe to call before login: the token is kept and sent right after sign-in.
  Future<void> registerDevice(String token, {String? platform}) async {
    if (token.isEmpty) return;
    _deviceToken = token;
    _devicePlatform = platform ?? _currentPlatform();
    if (!live) return;
    await _sendDeviceToken();
  }

  String _devicePlatform = 'web';

  static String _currentPlatform() {
    if (kIsWeb) return 'web';
    switch (defaultTargetPlatform) {
      case TargetPlatform.iOS:
        return 'ios';
      case TargetPlatform.android:
        return 'android';
      default:
        return 'web';
    }
  }

  Future<void> _sendDeviceToken() async {
    final t = _deviceToken;
    if (t == null) return;
    try {
      await api.post('/devices', body: {'token': t, 'platform': _devicePlatform});
    } catch (e) {
      debugPrint('POST /devices failed: $e');
    }
  }

  static AppNotification notificationFrom(Map<String, dynamic> n) {
    final type = (n['type'] as String?) ?? '';
    return AppNotification(
      kind: switch (type.split('.').first) {
        'proposal' || 'approval' => NotificationKind.approval,
        'sos' => NotificationKind.sos,
        'queue' => NotificationKind.queue,
        'inventory' => NotificationKind.job,
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
    // Only the SOS alerts the garage server routed to this mechanic. Closed (Cancelled) ones are left out.
    final list = (await api.get('/mechanic/sos') as List<dynamic>).cast<Map<String, dynamic>>();
    AppServices.sos.replaceAll(list.where((s) => s['status'] != 'Cancelled').map(sosFrom).toList());
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
      lat: (s['lat'] as num?)?.toDouble(),
      lng: (s['lng'] as num?)?.toDouble(),
      receivedAt: DateTime.tryParse((s['receivedAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      status: switch (s['status']) {
        'Acknowledged' => SosStatus.accepted,
        'Dispatched' => SosStatus.enRoute,
        'OnSite' => SosStatus.arrived,
        'Resolved' => SosStatus.resolvedOnSite,
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

  /// Adds a forwarded change request once; the notification and the realtime event can both bring it.
  void _upsertForwardedChange(Map<String, dynamic> change) {
    if (forwardedChanges.any((c) => c['id'] == change['id'])) return;
    forwardedChanges.add(change);
    notifyListeners();
  }

  void _wireRealtime() {
    hub.clearHandlers();
    hub.on('notification', (payload) {
      if (payload is! Map) return;
      final n = Map<String, dynamic>.from(payload);
      AppServices.notifications.add(notificationFrom(n));
      final type = (n['type'] as String?) ?? '';
      final jobId = n['jobId'] as String?;
      if (type == 'change.forwarded' && n['entityId'] is String) {
        _upsertForwardedChange({'id': n['entityId'], 'jobId': jobId, 'body': n['body'], 'title': n['title']});
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
    // The manager moved cars in the workshop queue: positions and ETAs on my cards change.
    hub.on('queue.updated', (_) => unawaited(refreshJobs().catchError((Object _) {})));
    // My job card changed (status, bay, ETA, notes) on the manager side: re-read my jobs.
    hub.on('job.updated', (_) => unawaited(refreshJobs().catchError((Object _) {})));
    // A customer change request moved on (forwarded to me, acknowledged or declined).
    hub.on('changeRequest.updated', (payload) {
      if (payload is! Map) return;
      final id = payload['id'];
      if (id is! String) return;
      switch (payload['status']) {
        case 'ForwardedToMechanic':
          final changes = (payload['changes'] as List?)?.join(', ') ?? '';
          final details = (payload['details'] as String?) ?? '';
          _upsertForwardedChange({
            'id': id,
            'jobId': payload['jobCardId'],
            'title': 'Change request ${payload['number'] ?? ''}'.trim(),
            'body': [if (changes.isNotEmpty) changes, if (details.isNotEmpty) details].join(' · '),
          });
        case 'Acknowledged' || 'Declined':
          forwardedChanges.removeWhere((c) => c['id'] == id);
          notifyListeners();
      }
    });
    hub.onConnected(() {
      unawaited(refreshJobs().catchError((Object _) {}));
      unawaited(refreshNotifications().catchError((Object _) {}));
    });
  }
}
