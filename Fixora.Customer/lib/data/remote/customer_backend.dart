import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../../core/backend/api_client.dart';
import '../../core/backend/fixora_config.dart';
import '../../core/backend/fixora_hub.dart';
import '../mock/mock_data.dart';
import '../models/models.dart';
import '../repositories/app_state.dart';
import '../repositories/job_store.dart';
import '../repositories/loyalty_store.dart';

/// Connects the customer app to Fixora.Customer.Api (/api/v1/customer/*) and the realtime hub.
///
/// The screens keep listening to [AppState] and [JobStore]; this class fills those stores from
/// the backend and keeps them current over SignalR. Every hand-off with the garage goes through
/// the service manager: an approval decision goes to the manager (who releases the work to the
/// mechanic), and a change request goes to the manager (who forwards it to the mechanic).
///
/// When the backend cannot be reached at login the app falls back to its bundled demo data.
class CustomerBackend extends ChangeNotifier {
  CustomerBackend._();
  static final CustomerBackend instance = CustomerBackend._();

  final ApiClient api = ApiClient('fixora.customer.session');
  late final FixoraHub hub = FixoraHub(api.freshToken);

  /// true once signed in against the real backend; false in demo mode.
  bool live = false;
  String garagePhone = '';
  String garageName = MockData.garageName;
  final List<Map<String, dynamic>> services = [];

  /// The proposal the customer is asked to decide on (ProposalDto), if any.
  Map<String, dynamic>? pendingProposal;

  /// Latest SOS from the server (SosDto); the SOS screen listens to this.
  final ValueNotifier<Map<String, dynamic>?> sos = ValueNotifier(null);

  bool get enabled => !FixoraConfig.demoOnly;

  // ------------------------------------------------------------------ session

  /// Called once at start-up: a saved session goes straight to live mode.
  Future<bool> restore() async {
    if (!enabled) return false;
    await api.restore();
    if (!api.signedIn) return false;
    try {
      await _afterLogin();
      return true;
    } on ApiException catch (e) {
      if (e.status == 401) await api.clear();
      live = false;
      return false;
    }
  }

  /// null on success; otherwise the server's message. Throws [ApiException] when the server is unreachable.
  Future<String?> login(String email, String password) async {
    try {
      final tokens = await api.post('/customer/auth/login', body: {'email': email, 'password': password});
      await api.saveSession(tokens as Map<String, dynamic>);
    } on ApiException catch (e) {
      if (e.isNetwork) rethrow;
      return e.message;
    }
    await _afterLogin();
    return null;
  }

  /// Starts registration: the server emails a one-time code. Returns the demo code when the server exposes it.
  Future<String?> register({required String name, required String email, required String phone, required String password}) async {
    final r = await api.post('/customer/auth/register', body: {'name': name, 'email': email, 'phone': phone, 'password': password});
    return (r as Map<String, dynamic>)['devCode'] as String?;
  }

  Future<void> verifyOtp(String email, String code) async {
    final tokens = await api.post('/customer/auth/verify-otp', body: {'email': email, 'code': code});
    await api.saveSession(tokens as Map<String, dynamic>);
    await _afterLogin();
  }

  Future<void> logout() async {
    await hub.stop();
    hub.clearHandlers();
    await api.logout();
    live = false;
    pendingProposal = null;
    LoyaltyStore.instance.resetDemo();
    notifyListeners();
  }

  Future<void> _afterLogin() async {
    live = true;
    final profile = await api.get('/customer/profile') as Map<String, dynamic>;
    AppState.instance.updateProfile(
      name: profile['name'] as String?,
      email: profile['email'] as String?,
      phone: profile['phone'] as String?,
    );
    await Future.wait([_loadGarage(), _loadVehicles(), refreshJob(), refreshNotifications(), refreshLoyalty(), refreshBookings()]);
    _wireRealtime();
    await hub.start();
    notifyListeners();
  }

  Future<void> _loadGarage() async {
    final g = await api.get('/customer/garage') as Map<String, dynamic>;
    garagePhone = (g['phone'] as String?) ?? '';
    garageName = (g['name'] as String?) ?? garageName;
    LoyaltyStore.instance.applyGarage(g);
    final list = await api.get('/customer/garage/services') as List<dynamic>;
    services
      ..clear()
      ..addAll(list.cast<Map<String, dynamic>>());
  }

  // ------------------------------------------------------------------ loyalty

  /// Points balance and ledger (LoyaltyDto). Also re-reads the garage's discount rules,
  /// since the owner can change them in Workshop settings at any time.
  Future<void> refreshLoyalty() async {
    if (!live) return;
    final results = await Future.wait([api.get('/customer/loyalty'), api.get('/customer/garage')]);
    LoyaltyStore.instance
      ..applyGarage(results[1] as Map<String, dynamic>)
      ..applyRemote(results[0] as Map<String, dynamic>);
  }

  // ------------------------------------------------------------------ vehicles

  Future<void> _loadVehicles() async {
    final list = (await api.get('/customer/vehicles') as List<dynamic>).cast<Map<String, dynamic>>();
    final app = AppState.instance;
    // The server's list is the truth, also when it is empty (a new customer): never keep demo cars,
    // because a booking for a demo car id cannot reach the garage.
    app.vehicles
      ..clear()
      ..addAll(list.map(_vehicle));
    if (app.vehicles.isNotEmpty) app.selectVehicle(app.vehicles.first.id);
  }

  /// Saves a vehicle on the server (POST, or PUT when [id] is a server id) and returns it as the app model.
  Future<Vehicle> saveVehicle({
    String? id,
    required String plate,
    required String make,
    required String model,
    required int year,
    required VehicleType type,
    required int mileageKm,
    String? color,
    String? fuel,
  }) async {
    final body = {
      'registrationNo': plate,
      'make': make,
      'model': model,
      'year': year,
      'type': switch (type) {
        VehicleType.twoWheeler => 'Bike',
        VehicleType.threeWheeler => 'ThreeWheeler',
        VehicleType.fourWheeler => 'Car',
      },
      'mileageKm': mileageKm,
      'color': color,
      'fuel': fuel,
    };
    final r = id != null && id.length == 36
        ? await api.put('/customer/vehicles/$id', body: body)
        : await api.post('/customer/vehicles', body: body);
    return _vehicle(r as Map<String, dynamic>);
  }

  static Vehicle _vehicle(Map<String, dynamic> v) {
    final type = switch (v['type']) {
      'Bike' => VehicleType.twoWheeler,
      'ThreeWheeler' => VehicleType.threeWheeler,
      _ => VehicleType.fourWheeler,
    };
    final make = (v['make'] as String?) ?? '';
    final image = switch (make.toLowerCase()) {
      'toyota' => Img.corollaThumb,
      'honda' => type == VehicleType.twoWheeler ? Img.bikeDio : Img.vezel,
      'nissan' => Img.xtrail,
      'yamaha' => Img.bikeFz,
      _ => type == VehicleType.fourWheeler ? Img.carThumb : null,
    };
    return Vehicle(
      id: v['id'] as String,
      make: make,
      model: (v['model'] as String?) ?? '',
      year: (v['year'] as num?)?.toInt() ?? DateTime.now().year,
      plate: (v['registrationNo'] as String?) ?? '',
      image: image,
      mileageKm: (v['mileageKm'] as num?)?.toInt() ?? 0,
      fuel: (v['fuel'] as String?) ?? 'Petrol',
      transmission: 'Manual',
      color: (v['color'] as String?) ?? 'White',
      bodyType: type == VehicleType.fourWheeler ? (v['type'] == 'VanSuv' ? 'SUV' : 'Hatchback') : type.label,
      type: type,
      nextServiceNote: v['driveSenseOptIn'] == true ? 'DriveSense is watching wear on rough roads' : 'Turn on DriveSense for early-wear alerts',
      healthScore: 0.8,
    );
  }

  // ------------------------------------------------------------------ job + approvals

  /// Re-reads the active job, its FixProof report and any proposal waiting for the customer.
  Future<void> refreshJob() async {
    final jobs = (await api.get('/customer/jobs', query: {'activeOnly': 'true'}) as List<dynamic>).cast<Map<String, dynamic>>();
    final pending = (await api.get('/customer/approvals/pending') as List<dynamic>).cast<Map<String, dynamic>>();
    if (jobs.isEmpty) {
      pendingProposal = null;
      JobStore.instance.clearRemote();
      return;
    }
    final summary = jobs.first;
    final detail = await api.get('/customer/jobs/${summary['id']}') as Map<String, dynamic>;
    pendingProposal = pending.where((p) => p['jobCardId'] == summary['id']).firstOrNull;
    JobStore.instance.applyRemote(detail, pendingProposal);
    notifyListeners();
  }

  /// Per-item decision (BR-FP-07). Goes to the service manager, who releases approved work to the mechanic.
  /// The same idempotency key is reused on a retry, so a double tap never records two decisions.
  Future<void> decide(Map<String, bool> approveByItemId, {String? note}) async {
    final p = pendingProposal;
    if (p == null) throw ApiException(409, 'nothing_pending', 'There is nothing waiting for your approval.');
    final items = (p['items'] as List<dynamic>).cast<Map<String, dynamic>>();
    final decisions = [
      for (final it in items)
        if (it['status'] == 'AwaitingCustomer')
          {'itemId': it['id'], 'approve': approveByItemId[it['id']] ?? true, 'version': it['version']},
    ];
    final key = ApiClient.newIdempotencyKey();
    try {
      await api.post('/customer/approvals/${p['id']}/decisions',
          body: {'decisions': decisions, 'note': (note == null || note.isEmpty) ? null : note},
          headers: {'Idempotency-Key': key});
    } on ApiException catch (e) {
      if (!e.isNetwork) {
        await refreshJob();
        rethrow;
      }
      // One retry with the SAME key: if the first call landed, the server returns the same answer.
      await Future<void>.delayed(const Duration(seconds: 2));
      await api.post('/customer/approvals/${p['id']}/decisions',
          body: {'decisions': decisions, 'note': note}, headers: {'Idempotency-Key': key});
    }
    await refreshJob();
  }

  /// Customer → manager. The mechanic only sees it if the manager forwards it.
  Future<ChangeRequest> requestChanges(List<String> changes, String details) async {
    final jobId = JobStore.instance.remoteJobId;
    if (jobId == null) throw ApiException(404, 'no_job', 'You have no active job at the garage.');
    final r = await api.post('/customer/jobs/$jobId/change-requests', body: {'changes': changes, 'details': details}) as Map<String, dynamic>;
    await refreshJob();
    return JobStore.changeRequestFrom(r);
  }

  // ------------------------------------------------------------------ notifications

  Future<void> refreshNotifications() async {
    final list = (await api.get('/notifications', query: {'take': '60'}) as List<dynamic>).cast<Map<String, dynamic>>();
    JobStore.instance.replaceNotifications(list.map(notificationFrom).toList());
  }

  void markRead(String id) {
    if (live && id.length == 36) unawaited(api.post('/notifications/$id/read').catchError((Object _) => null));
  }

  void markAllRead() {
    if (live) unawaited(api.post('/notifications/read-all').catchError((Object _) => null));
  }

  static AppNotification notificationFrom(Map<String, dynamic> n) {
    final type = (n['type'] as String?) ?? '';
    final kind = switch (type.split('.').first) {
      'approval' || 'proposal' || 'change' => type == 'approval.confirmed' ? NotificationKind.progress : NotificationKind.estimate,
      'booking' => NotificationKind.booking,
      'job' => type == 'job.completed' ? NotificationKind.completed : NotificationKind.progress,
      'queue' => NotificationKind.queue,
      'sos' => NotificationKind.sos,
      'invoice' => NotificationKind.payment,
      'drivesense' => NotificationKind.serviceDue,
      _ => NotificationKind.reminder,
    };
    return AppNotification(
      id: n['id'] as String,
      title: (n['title'] as String?) ?? '',
      body: (n['body'] as String?) ?? '',
      time: DateTime.tryParse((n['createdAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
      kind: kind,
      unread: n['read'] != true,
    );
  }

  // ------------------------------------------------------------------ realtime

  void _wireRealtime() {
    hub.clearHandlers();
    hub.on('notification', (payload) {
      if (payload is! Map) return;
      final n = Map<String, dynamic>.from(payload);
      JobStore.instance.push(notificationFrom(n));
      final type = (n['type'] as String?) ?? '';
      if (type.startsWith('approval') || type.startsWith('change') || type.startsWith('job') || type.startsWith('queue') || type.startsWith('invoice')) {
        unawaited(refreshJob().catchError((Object _) {}));
      }
      if (type.startsWith('sos') && n['entityId'] is String) {
        unawaited(refreshSos(n['entityId'] as String).catchError((Object _) {}));
      }
      if (type.startsWith('booking')) unawaited(refreshBookings().catchError((Object _) {}));
      // Paying an invoice earns points, billing uses them, a good DriveSense week adds them.
      if (type.startsWith('invoice') || type.startsWith('drivesense') || type.startsWith('loyalty')) {
        unawaited(refreshLoyalty().catchError((Object _) {}));
      }
    });
    // A realtime event never proves completion: re-read the authoritative state.
    hub.on('approval.updated', (_) => unawaited(refreshJob().catchError((Object _) {})));
    hub.on('sos.updated', (payload) {
      if (payload is Map) sos.value = Map<String, dynamic>.from(payload);
    });
    hub.onConnected(() {
      unawaited(refreshJob().catchError((Object _) {}));
      unawaited(refreshNotifications().catchError((Object _) {}));
      unawaited(refreshLoyalty().catchError((Object _) {}));
    });
  }

  // ------------------------------------------------------------------ bookings (USP 5)

  /// Requests a booking against real bay capacity. 409 means the slot was just taken.
  Future<Map<String, dynamic>> book({required String vehicleId, required String serviceName, required DateTime slotStart, String? notes}) async {
    final svc = services.where((s) => _sameService(s['name'] as String, serviceName)).firstOrNull ?? services.firstOrNull;
    if (svc == null) throw ApiException(404, 'no_services', 'The garage has no services to book yet.');
    final r = await api.post('/customer/appointments',
        body: {
          'vehicleId': vehicleId,
          'serviceId': svc['id'],
          'slotStart': slotStart.toUtc().toIso8601String(),
          'notes': notes,
          'promoCode': null,
          'suggestionId': null,
        },
        headers: {'Idempotency-Key': ApiClient.newIdempotencyKey()});
    return r as Map<String, dynamic>;
  }

  Future<void> refreshBookings() async {
    final list = (await api.get('/customer/appointments') as List<dynamic>).cast<Map<String, dynamic>>();
    AppState.instance.applyRemoteBookings(list);
  }

  static bool _sameService(String a, String b) {
    String n(String s) => s.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
    final x = n(a), y = n(b);
    return x == y || x.contains(y) || y.contains(x) || (x.contains('brake') && y.contains('brake')) || (x.contains('oil') && y.contains('oil'));
  }

  // ------------------------------------------------------------------ SOS (USP 4)

  static const Map<String, String> sosCategories = {
    'Breakdown': 'WontStart',
    'Flat tyre': 'FlatTyre',
    'Battery': 'WontStart',
    'Overheating': 'Overheating',
    'Locked out': 'Other',
    'Accident': 'Accident',
  };

  /// Sends the SOS and returns the server receipt (SosReceipt). "Delivered" may only be shown after this returns.
  /// Retries with the same idempotency key, so a retry never creates a second request.
  Future<Map<String, dynamic>> raiseSos({required String problem, String? note, String? idempotencyKey}) async {
    final pos = await _position();
    final key = idempotencyKey ?? ApiClient.newIdempotencyKey();
    final vehicleId = AppState.instance.selectedVehicle.id;
    final r = await api.post('/customer/sos/requests',
        body: {
          'lat': pos.$1,
          'lng': pos.$2,
          'category': sosCategories[problem] ?? 'Other',
          'vehicleId': vehicleId.length == 36 ? vehicleId : null,
          'note': [problem, if (!pos.$3) 'GPS unavailable: location is approximate', if (note != null && note.isNotEmpty) note].join(' · '),
          'locationConsent': true,
        },
        headers: {'Idempotency-Key': key}) as Map<String, dynamic>;
    await refreshSos(r['receiptId'] as String);
    return r;
  }

  Future<void> refreshSos(String id) async {
    sos.value = await api.get('/customer/sos/requests/$id') as Map<String, dynamic>;
  }

  Future<void> cancelSos() async {
    final id = sos.value?['id'] as String?;
    if (id == null) return;
    sos.value = await api.post('/customer/sos/requests/$id/cancel') as Map<String, dynamic>;
  }

  /// (lat, lng, fromGps). Falls back to the garage's town when GPS is off or refused.
  Future<(double, double, bool)> _position() async {
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) throw StateError('no permission');
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 10)),
      );
      return (p.latitude, p.longitude, true);
    } catch (_) {
      return (9.6615, 80.0255, false);
    }
  }
}

