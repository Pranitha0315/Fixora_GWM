import 'package:flutter/foundation.dart';

import '../../core/backend/api_client.dart';
import '../../core/backend/fixora_config.dart';
import '../models/vehicle.dart';
import '../repositories/app_state.dart';

/// Customer auth + session bridge to the garage `/api/v1` backend.
///
/// When [enabled] is false the UI uses in-memory [AppState] demo accounts.
class CustomerBackend extends ChangeNotifier {
  CustomerBackend._();
  static final CustomerBackend instance = CustomerBackend._();

  final ApiClient api = ApiClient.instance;

  /// true once signed in against the real backend; false in demo mode.
  bool live = false;

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
    try {
      await api.post('/customer/auth/logout');
    } on ApiException {
      // Still clear local session if the server is unreachable.
    }
    await api.clear();
    live = false;
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
    app.notifyListeners();
    notifyListeners();
  }
}
