import 'package:flutter/foundation.dart';

import '../models/vehicle.dart';

/// App-wide state: profile, vehicles, bookings, subscription and settings.
///
/// Everything is kept in memory for the demo. Replace the method bodies with
/// API calls to the Fixora .NET backend; the screens only listen to this store.
class AppState extends ChangeNotifier {
  AppState._();
  static final AppState instance = AppState._();

  //final _rnd = math.Random();

  /// Digits only from a phone field (strips spaces, +94, leading 0, etc.).
  static String digitsOf(String raw) {
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    if (digits.startsWith('94') && digits.length >= 11) {
      return digits.substring(digits.length - 9);
    }
    if (digits.startsWith('0') && digits.length == 10) {
      return digits.substring(1);
    }
    return digits.length > 9 ? digits.substring(digits.length - 9) : digits;
  }

  String? lastEmail;
  String firstName = '';
  bool rememberMe = false;

  /// Demo profile shown on the Profile card → Account Details.
  UserProfile profile = const UserProfile(
    name: 'Kavitha Perera',
    email: 'kavitha@fixora.lk',
    phone: '+94 77 123 4567',
  );

  int bookingCount = 5;
  double totalSpentLkr = 48500;

  final List<Vehicle> vehicles = [
    const Vehicle(
      id: 'v1',
      make: 'Toyota',
      model: 'Corolla',
      year: 2019,
      plate: 'CAA-4521',
      type: VehicleType.fourWheeler,
      active: true,
    ),
    const Vehicle(
      id: 'v2',
      make: 'Honda',
      model: 'Dio',
      year: 2021,
      plate: 'EP-2087',
      type: VehicleType.twoWheeler,
      active: false,
    ),
  ];

  List<Vehicle> get activeVehicles => vehicles.where((v) => v.active).toList();

  int get vehicleCount => vehicles.length;

  Vehicle vehicleById(String id) => vehicles.firstWhere(
        (v) => v.id == id,
        orElse: () => vehicles.first,
      );

  void addVehicle(Vehicle v) {
    vehicles.insert(0, v);
    notifyListeners();
  }

  void updateVehicle(Vehicle v) {
    final i = vehicles.indexWhere((e) => e.id == v.id);
    if (i >= 0) {
      vehicles[i] = v;
      notifyListeners();
    }
  }

  String newVehicleId() => 'v_${DateTime.now().millisecondsSinceEpoch}';

  bool plateExists(String plate, {String? exceptId}) {
    String norm(String p) => p.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
    final key = norm(plate);
    return vehicles.any((v) => v.id != exceptId && norm(v.plate) == key);
  }

  String? selectedVehicleId;

  void selectVehicle(String id) {
    selectedVehicleId = id;
    notifyListeners();
  }

  void removeVehicle(String id) {
    vehicles.removeWhere((v) => v.id == id);
    if (selectedVehicleId == id) {
      selectedVehicleId = vehicles.isNotEmpty ? vehicles.first.id : null;
    }
    notifyListeners();
  }

  void updateProfile({String? name, String? email, String? phone}) {
    profile = profile.copyWith(name: name, email: email, phone: phone);
    if (name != null && name.trim().isNotEmpty) {
      firstName = name.trim().split(RegExp(r'\s+')).first;
    }
    if (email != null) lastEmail = email.trim();
    notifyListeners();
  }

  final Set<String> _emails = {'kavitha@fixora.lk', 'thanu@example.com'};
  final Set<String> _phones = {'771234567'};

  bool isEmailTaken(String email) => _emails.contains(email.trim().toLowerCase());

  bool isPhoneTaken(String digits) => _phones.contains(digits);

  /// Demo register. Returns an error message, or null on success.
  Future<String?> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 600));
    final key = email.trim().toLowerCase();
    if (_emails.contains(key)) return 'An account with this email already exists';
    if (_phones.contains(phone)) return 'An account with this mobile number already exists';
    _emails.add(key);
    _phones.add(phone);
    lastEmail = email.trim();
    firstName = fullName.trim().split(RegExp(r'\s+')).first;
    profile = UserProfile(
      name: fullName.trim(),
      email: email.trim(),
      phone: '+94 $phone',
    );
    notifyListeners();
    return null;
  }
}

class UserProfile {
  const UserProfile({
    required this.name,
    required this.email,
    required this.phone,
  });

  final String name;
  final String email;
  final String phone;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  UserProfile copyWith({String? name, String? email, String? phone}) => UserProfile(
        name: name ?? this.name,
        email: email ?? this.email,
        phone: phone ?? this.phone,
      );
}