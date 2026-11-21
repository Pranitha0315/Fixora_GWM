import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../models/models.dart';
import '../models/vehicle.dart';

export '../models/models.dart'
    show Booking, BookingState, PassportEntry, PassportStatus, ServiceRecord, UpcomingService;

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
  String _firstName = 'Kavitha';
  bool rememberMe = false;

  String get firstName {
    if (_firstName.isNotEmpty) return _firstName;
    final n = profile.name.trim();
    if (n.isEmpty) return 'there';
    return n.split(RegExp(r'\s+')).first;
  }

  set firstName(String v) => _firstName = v;

  String get greeting {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  /// Demo profile shown on the Profile card → Account Details.
  UserProfile profile = const UserProfile(
    name: 'Kavitha Perera',
    email: 'kavitha@fixora.lk',
    phone: '+94 77 123 4567',
  );

  int bookingCount = 5;
  double totalSpentLkr = 48500;

  // Privacy & security preferences
  bool twoFactor = false;
  bool biometric = false;
  String visibility = 'Garages I visit';
  String locationPermission = 'While using app';

  void update(VoidCallback fn) {
    fn();
    notifyListeners();
  }

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

  static const Map<String, List<PassportEntry>> _passport = {
    'v1': [
      PassportEntry(
        title: 'Radiator cap seal weak',
        detail: 'Pressure test borderline (0.9 bar). Could cause slow coolant loss.',
        foundOn: '27 Aug 2026',
        jobId: 'FX-1042',
        status: PassportStatus.unresolved,
        linkedSymptom: 'Coolant level dropping',
      ),
      PassportEntry(
        title: 'Rear left wheel bearing noise',
        detail: 'Faint hum above 80 km/h. Not confirmed on lift.',
        foundOn: '14 Jun 2026',
        jobId: 'JC-2026-00087',
        status: PassportStatus.stillUnresolved,
        linkedSymptom: 'Humming noise at speed',
      ),
      PassportEntry(
        title: 'Alternator undercharging',
        detail: 'Output measured 14.1 V after battery check - within range.',
        foundOn: '05 Sep 2025',
        jobId: 'JC-2025-00731',
        status: PassportStatus.ruledOut,
        linkedSymptom: 'Battery drains overnight',
      ),
      PassportEntry(
        title: 'Thermostat stuck open',
        detail: 'Suspected in June, confirmed by OBD P0128 + thermal image in August.',
        foundOn: '14 Jun 2026',
        jobId: 'FX-1042',
        status: PassportStatus.confirmed,
        linkedSymptom: 'Heater blows cold air',
      ),
    ],
    'v2': [
      PassportEntry(
        title: 'Hybrid battery cell imbalance',
        detail: 'Block 7 voltage 0.3 V lower than average. Monitor next visit.',
        foundOn: '02 Mar 2026',
        jobId: 'JC-2026-00031',
        status: PassportStatus.unresolved,
        linkedSymptom: 'Reduced EV mode range',
      ),
    ],
  };

  List<PassportEntry> passportFor(String id) => _passport[id] ?? const [];

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

  Vehicle get selectedVehicle {
    if (vehicles.isEmpty) {
      return const Vehicle(
        id: 'none',
        make: 'Add',
        model: 'a vehicle',
        year: 2024,
        plate: '—',
      );
    }
    final id = selectedVehicleId;
    if (id != null) {
      final found = vehicles.where((v) => v.id == id);
      if (found.isNotEmpty) return found.first;
    }
    final active = activeVehicles;
    return active.isNotEmpty ? active.first : vehicles.first;
  }

  void selectVehicle(String id) {
    selectedVehicleId = id;
    notifyListeners();
  }

  /// Demo current job for the home "Current Service" card.
  String currentJobId = 'FX-1042';
  String currentStepLabel = 'In progress';
  String currentStatusLabel = 'Bay 3 · Oil service';
  int currentJobStep = 2; // 0..4 progress dots

  final List<Booking> bookings = [
    Booking(
      id: 'b1',
      vehicleId: 'v1',
      service: 'Full Service',
      date: DateTime.now().add(const Duration(days: 3)),
      state: BookingState.upcoming,
      statusLabel: 'Confirmed',
      queuePosition: 2,
    ),
    Booking(
      id: 'b2',
      vehicleId: 'v1',
      service: 'Oil Change',
      date: DateTime.now().subtract(const Duration(days: 18)),
      state: BookingState.completed,
      statusLabel: 'Completed',
    ),
  ];

  Booking? get nextUpcoming {
    final upcoming = bookings.where((b) => b.upcoming).toList()
      ..sort((a, b) => a.date.compareTo(b.date));
    return upcoming.isEmpty ? null : upcoming.first;
  }

  List<Booking> upcomingBookingsFor(String vehicleId) =>
      bookings.where((b) => b.upcoming && b.vehicleId == vehicleId).toList()
        ..sort((a, b) => a.date.compareTo(b.date));

  static final Map<String, List<ServiceRecord>> _history = {
    'v1': [
      ServiceRecord(
        title: 'General Service',
        subtitle: 'Oil change, filters, full inspection',
        jobId: 'JC-2026-00087',
        date: DateTime(2026, 6, 14),
        mileageKm: 32500,
        amount: 18630,
        work: const ['Engine oil & filter', 'Air filter', '21-point inspection'],
        icon: Icons.handyman_outlined,
      ),
      ServiceRecord(
        title: 'Brake Inspection',
        subtitle: 'Front brake pad check and cleaning',
        jobId: 'JC-2026-00044',
        date: DateTime(2026, 3, 10),
        mileageKm: 29900,
        amount: 6500,
        work: const ['Front pads cleaned', 'Brake fluid checked'],
        icon: Icons.album_outlined,
      ),
      ServiceRecord(
        title: 'Wheel Alignment',
        subtitle: 'Alignment and balancing',
        jobId: 'JC-2025-00980',
        date: DateTime(2025, 12, 22),
        mileageKm: 25200,
        amount: 7800,
        work: const ['4-wheel alignment', 'Wheel balancing'],
        garage: 'AutoCare Workshop',
        icon: Icons.tire_repair_rounded,
      ),
      ServiceRecord(
        title: 'Battery Check',
        subtitle: 'Battery health test and terminal cleaning',
        jobId: 'JC-2025-00731',
        date: DateTime(2025, 9, 5),
        mileageKm: 21800,
        amount: 2500,
        work: const ['Battery load test', 'Terminal cleaning'],
        icon: Icons.battery_charging_full_rounded,
      ),
    ],
    'v2': [
      ServiceRecord(
        title: 'AC Repair',
        subtitle: 'AC gas refill and leak test',
        jobId: 'JC-2026-00031',
        date: DateTime(2026, 3, 2),
        mileageKm: 18020,
        amount: 24150,
        work: const ['AC gas refill', 'Cabin filter', 'Leak test'],
        garage: 'AutoCare Workshop',
        icon: Icons.ac_unit_rounded,
      ),
    ],
  };

  static final Map<String, List<UpcomingService>> _upcomingServices = {
    'v1': [
      UpcomingService(
        title: 'Engine Oil Change',
        subtitle: 'Oil and filter replacement',
        date: DateTime(2026, 11, 27),
        icon: Icons.oil_barrel_outlined,
        service: 'General Service',
      ),
      UpcomingService(
        title: 'General Service',
        subtitle: 'Full vehicle inspection and maintenance',
        date: DateTime(2027, 1, 27),
        icon: Icons.handyman_outlined,
        service: 'General Service',
      ),
      UpcomingService(
        title: 'Brake Service',
        subtitle: 'Brake pad check and replacement (if needed)',
        date: DateTime(2027, 3, 27),
        icon: Icons.album_outlined,
        service: 'Brakes',
      ),
    ],
  };

  List<ServiceRecord> historyFor(String id) => _history[id] ?? const [];

  List<UpcomingService> upcomingFor(String id) => _upcomingServices[id] ?? const [];

  String distance(int km) => '${km.toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')} km';

  List<Booking> bookingsIn(Set<BookingState> states) =>
      bookings.where((b) => states.contains(b.state)).toList()
        ..sort((a, b) => b.date.compareTo(a.date));

  Booking addBooking({
    String? id,
    required String vehicleId,
    required String service,
    required DateTime date,
    List<String> symptoms = const [],
    String? garage,
    BookingState state = BookingState.upcoming,
    String? statusLabel,
    int? queuePosition,
  }) {
    final b = Booking(
      id: id ?? 'b_${DateTime.now().millisecondsSinceEpoch}',
      vehicleId: vehicleId,
      service: service,
      date: date,
      state: state,
      statusLabel: statusLabel ?? 'Confirmed',
      garage: garage ?? 'Fixora Garage',
      symptoms: symptoms,
      queuePosition: queuePosition,
    );
    bookings.insert(0, b);
    bookingCount = bookings.length;
    notifyListeners();
    return b;
  }

  /// Replaces the bookings with BookingDto rows from the backend.
  /// status → active / upcoming / completed / cancelled
  void applyRemoteBookings(List<Map<String, dynamic>> rows) {
    bookings
      ..clear()
      ..addAll(rows.map((b) {
        final status = (b['status'] as String?) ?? 'Requested';
        final state = switch (status) {
          'CheckedIn' => BookingState.active,
          'Completed' => BookingState.completed,
          'Declined' || 'Cancelled' || 'NoShow' => BookingState.cancelled,
          _ => BookingState.upcoming,
        };
        return Booking(
          id: b['id'] as String,
          vehicleId: (b['vehicleId'] as String?) ?? '',
          service: (b['serviceName'] as String?) ?? 'Service',
          date: DateTime.tryParse((b['slotStart'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
          state: state,
          statusLabel: switch (status) {
            'Requested' => 'Waiting for garage',
            'CheckedIn' => 'In the workshop',
            'NoShow' => 'Missed',
            _ => status,
          },
          garage: (b['garageName'] as String?) ?? 'Fixora Garage',
          queuePosition: (b['queuePosition'] as num?)?.toInt(),
        );
      }));
    bookingCount = bookings.length;
    notifyListeners();
  }

  void cancelBooking(String id) {
    final i = bookings.indexWhere((b) => b.id == id);
    if (i < 0) return;
    bookings[i] = bookings[i].copyWith(
      state: BookingState.cancelled,
      statusLabel: 'Cancelled',
    );
    notifyListeners();
  }

  void rescheduleBooking(String id, DateTime date) {
    final i = bookings.indexWhere((b) => b.id == id);
    if (i < 0) return;
    bookings[i] = bookings[i].copyWith(date: date, statusLabel: 'Rescheduled');
    notifyListeners();
  }

  final List<NearbyGarage> nearestGarages = const [
    NearbyGarage(
      name: 'Fixora Colombo',
      distanceKm: 2.4,
      rating: 4.8,
      reviews: 128,
      etaMin: 12,
      address: '42 Galle Road, Colombo 03',
      hours: 'Open · 8:00 AM – 6:00 PM',
      capabilities: ['Full Service', 'Body Shop', 'EV'],
    ),
    NearbyGarage(
      name: 'Fixora Nugegoda',
      distanceKm: 5.1,
      rating: 4.6,
      reviews: 86,
      etaMin: 22,
      address: '15 High Level Road, Nugegoda',
      hours: 'Open · 8:30 AM – 5:30 PM',
      capabilities: ['Quick Service', 'Tyres', 'AC'],
    ),
  ];

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

class NearbyGarage {
  const NearbyGarage({
    required this.name,
    required this.distanceKm,
    required this.rating,
    this.reviews = 0,
    this.etaMin = 15,
    this.address = '',
    this.hours = 'Open today',
    this.capabilities = const [],
  });

  final String name;
  final double distanceKm;
  final double rating;
  final int reviews;
  final int etaMin;
  final String address;
  final String hours;
  final List<String> capabilities;
}