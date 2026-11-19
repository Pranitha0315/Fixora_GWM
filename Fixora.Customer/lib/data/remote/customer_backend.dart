import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/backend/api_client.dart';
import '../../core/backend/fixora_config.dart';
import '../../core/backend/fixora_hub.dart';
import '../models/models.dart';
import '../models/vehicle.dart';
import '../repositories/app_state.dart';
import '../repositories/job_store.dart';

/// Customer auth + session bridge to the garage `/api/v1` backend.
///
/// When [enabled] is false the UI uses in-memory [AppState] demo accounts.
class CustomerBackend extends ChangeNotifier {
  CustomerBackend._();
  static final CustomerBackend instance = CustomerBackend._();

  final ApiClient api = ApiClient.instance;
  late final FixoraHub hub = FixoraHub(api.freshToken);

  /// true once signed in against the real backend; false in demo mode.
  bool live = false;

  /// Garage service catalog from `/customer/garage/services` (used to resolve serviceId).
  final List<Map<String, dynamic>> services = [];

  /// The proposal the customer is asked to decide on, if any.
  Map<String, dynamic>? pendingProposal;

  /// Latest SOS payload from the hub, if any.
  final ValueNotifier<Map<String, dynamic>?> sos = ValueNotifier(null);

  /// `--dart-define=FIXORA_DEMO=true` forces offline demo mode.
  bool get enabled =>
      const String.fromEnvironment('FIXORA_DEMO', defaultValue: '') != 'true' &&
      FixoraConfig.apiBase.isNotEmpty;

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
      return false;
    }
  }

  /// Email + password login. Returns an error message, or null on success.
  Future<String?> login(String email, String password) async {
    try {
      final tokens = await api.post('/customer/auth/login', body: {
        'email': email.trim(),
        'password': password,
      });
      await api.saveSession(tokens);
      await _afterLogin();
      return null;
    } on ApiException catch (e) {
      return e.message;
    }
  }

  /// Starts registration. On success returns optional [devCode] (demo OTP), else throws.
  Future<String?> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    final r = await api.post('/customer/auth/register', body: {
      'fullName': fullName.trim(),
      'email': email.trim(),
      'phone': phone,
      'password': password,
    });
    return r['devCode'] as String?;
  }

  /// Verifies the email OTP from register, stores tokens, then syncs [AppState].
  Future<void> verifyOtp(String email, String code) async {
    final tokens = await api.post('/customer/auth/verify-otp', body: {
      'email': email.trim(),
      'code': code.trim(),
    });
    await api.saveSession(tokens);
    await _afterLogin();
  }

  Future<void> logout() async {
    await hub.stop();
    hub.clearHandlers();
    try {
      await api.post('/customer/auth/logout');
    } on ApiException {
      // Still clear local session if the server is unreachable.
    }
    await api.clear();
    live = false;
    pendingProposal = null;
    sos.value = null;
    notifyListeners();
  }

  /// Saves a vehicle on the server (POST, or PUT when [id] is a server GUID).
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
    return _vehicle(r);
  }

  static Vehicle _vehicle(Map<String, dynamic> v) {
    final type = switch (v['type']) {
      'Bike' => VehicleType.twoWheeler,
      'ThreeWheeler' => VehicleType.threeWheeler,
      _ => VehicleType.fourWheeler,
    };
    return Vehicle(
      id: v['id'] as String,
      make: (v['make'] as String?) ?? '',
      model: (v['model'] as String?) ?? '',
      year: (v['year'] as num?)?.toInt() ?? DateTime.now().year,
      plate: (v['registrationNo'] as String?) ?? '',
      type: type,
      mileageKm: (v['mileageKm'] as num?)?.toInt() ?? 0,
      fuel: (v['fuel'] as String?) ?? 'Petrol',
      color: (v['color'] as String?) ?? 'White',
      active: true,
    );
  }

  /// Loads garage services so [book] can resolve a real [serviceId].
  Future<void> ensureServices() async {
    if (services.isNotEmpty) return;
    final list = await api.getList('/customer/garage/services');
    services
      ..clear()
      ..addAll(list.whereType<Map>().map((e) => Map<String, dynamic>.from(e)));
  }

  /// Requests a booking against real bay capacity. 409 means the slot was just taken.
  ///
  /// POST /customer/appointments
  /// vehicleId, serviceId, slotStart, notes + Idempotency-Key
  Future<Map<String, dynamic>> book({
    required String vehicleId,
    required String serviceName,
    required DateTime slotStart,
    String? notes,
  }) async {
    await ensureServices();
    final svc = services.where((s) => _sameService('${s['name'] ?? ''}', serviceName)).firstOrNull ??
        services.firstOrNull;
    if (svc == null) {
      throw ApiException(404, 'no_services', 'The garage has no services to book yet.');
    }
    final r = await api.post(
      '/customer/appointments',
      body: {
        'vehicleId': vehicleId,
        'serviceId': svc['id'],
        'slotStart': slotStart.toUtc().toIso8601String(),
        'notes': notes,
        'promoCode': null,
        'suggestionId': null,
      },
      headers: {'Idempotency-Key': ApiClient.newIdempotencyKey()},
    );
    return r;
  }

  static bool _sameService(String a, String b) {
    String n(String s) => s.toLowerCase().replaceAll(RegExp(r'[^a-z]'), '');
    final x = n(a), y = n(b);
    return x == y ||
        x.contains(y) ||
        y.contains(x) ||
        (x.contains('brake') && y.contains('brake')) ||
        (x.contains('oil') && y.contains('oil'));
  }

  Future<void> refreshBookings() async {
    final list = (await api.getList('/customer/appointments'))
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    AppState.instance.applyRemoteBookings(list);
  }

  /// Re-reads the active job, its FixProof report and any proposal waiting for the customer.
  Future<void> refreshJob() async {
    final jobs = (await api.getList('/customer/jobs', query: {'activeOnly': 'true'}))
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final pending = (await api.getList('/customer/approvals/pending'))
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    if (jobs.isEmpty) {
      pendingProposal = null;
      JobStore.instance.clearRemote();
      return;
    }
    final summary = jobs.first;
    final detail = await api.get('/customer/jobs/${summary['id']}');
    pendingProposal = pending.where((p) => p['jobCardId'] == summary['id']).firstOrNull;
    JobStore.instance.applyRemote(detail, pendingProposal);
    notifyListeners();
  }

  Future<void> refreshNotifications() async {
    final list = (await api.getList('/notifications', query: {'take': '60'}))
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    JobStore.instance.replaceNotifications(list.map(notificationFrom).toList());
  }

  static AppNotification notificationFrom(Map<String, dynamic> n) {
    final type = (n['type'] as String?) ?? '';
    final kind = switch (type.split('.').first) {
      'approval' || 'proposal' || 'change' =>
        type == 'approval.confirmed' ? NotificationKind.progress : NotificationKind.estimate,
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
      // queue / booking / job events...
      if (type.startsWith('approval') ||
          type.startsWith('change') ||
          type.startsWith('job') ||
          type.startsWith('queue') ||
          type.startsWith('invoice')) {
        unawaited(refreshJob().catchError((Object _) {}));
      }
      if (type.startsWith('booking')) unawaited(refreshBookings().catchError((Object _) {}));
    });
    // A realtime event never proves completion: re-read the authoritative state.
    hub.on('approval.updated', (_) => unawaited(refreshJob().catchError((Object _) {})));
    hub.on('sos.updated', (payload) {
      if (payload is Map) sos.value = Map<String, dynamic>.from(payload);
    });
    hub.onConnected(() {
      unawaited(refreshJob().catchError((Object _) {}));
      unawaited(refreshNotifications().catchError((Object _) {}));
    });
  }

  /// Copy session profile fields into the in-memory app store after auth.
  Future<void> _afterLogin() async {
    live = true;
    final s = api.session;
    if (s == null) {
      notifyListeners();
      return;
    }
    final app = AppState.instance;
    final name = s.name.trim();
    if (name.isNotEmpty) {
      app.firstName = name.split(RegExp(r'\s+')).first;
    }
    try {
      await Future.wait([
        ensureServices(),
        refreshBookings(),
        refreshJob(),
        refreshNotifications(),
      ]);
    } on ApiException {
      // Profile sync still succeeds even if catalog/bookings are temporarily down.
    }
    _wireRealtime();
    unawaited(hub.start());
    app.notifyListeners();
    notifyListeners();
  }
}
