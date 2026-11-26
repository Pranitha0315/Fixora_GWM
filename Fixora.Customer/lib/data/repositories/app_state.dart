import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../../core/utils/format.dart';
import '../mock/mock_data.dart';
import '../models/models.dart';
import 'job_store.dart';

/// App-wide state: profile, vehicles, bookings, subscription and settings.
///
/// Everything is kept in memory for the demo. Replace the method bodies with
/// API calls to the Fixora .NET backend; the screens only listen to this store.
class AppState extends ChangeNotifier {
  AppState._();
  static final AppState instance = AppState._();

  final _rnd = math.Random();

  // ---------------------------------------------------------------- Profile
  UserProfile profile = const UserProfile(
    name: MockData.customerName,
    email: MockData.customerEmail,
    phone: MockData.customerPhone,
  );

  void updateProfile({String? name, String? email, String? phone, Uint8List? photo}) {
    final acc = findAccount(profile.email);
    if (acc != null) {
      if (name != null) acc.name = name;
      if (email != null) acc.email = email;
      if (phone != null) acc.phone = phone;
    }
    profile = profile.copyWith(name: name, email: email, phone: phone, photo: photo);
    notifyListeners();
  }

  String get greeting {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  String get firstName => profile.name.trim().split(' ').first;

  // ---------------------------------------------------------------- Auth
  /// Demo accounts. Login: thanu@example.com / Fixora@123
  final List<Account> accounts = [
    Account(
      name: MockData.customerName,
      email: MockData.customerEmail,
      phone: MockData.customerPhone,
      password: 'Fixora@123',
    ),
  ];
  bool rememberMe = true;
  String? lastEmail = MockData.customerEmail;

  static String digitsOf(String s) {
    final d = s.replaceAll(RegExp(r'\D'), '');
    // 0771234567 / 94771234567 / 771234567 -> 771234567
    if (d.startsWith('94') && d.length == 11) return d.substring(2);
    if (d.startsWith('0') && d.length == 10) return d.substring(1);
    return d;
  }

  Account? findAccount(String emailOrPhone) {
    final v = emailOrPhone.trim().toLowerCase();
    for (final a in accounts) {
      if (a.email.toLowerCase() == v) return a;
      if (v.isNotEmpty && digitsOf(v).length >= 9 && digitsOf(a.phone) == digitsOf(v)) return a;
    }
    return null;
  }

  void _useAccount(Account a) {
    profile = UserProfile(name: a.name, email: a.email, phone: a.phone, photo: profile.photo);
    lastEmail = a.email;
    notifyListeners();
  }

  /// Returns an error message, or null when the login worked.
  String? login(String emailOrPhone, String password) {
    final a = findAccount(emailOrPhone);
    if (a == null) return 'No account found with this email';
    if (a.google && a.password.isEmpty) return 'This account uses Google. Tap "Continue with Google".';
    if (a.password != password) return 'Wrong password. Try again or reset it.';
    _useAccount(a);
    return null;
  }

  /// Signs in with a phone number after the OTP is verified.
  void loginWithPhone(String phone) {
    final a = findAccount(phone);
    if (a != null) _useAccount(a);
  }

  /// Returns an error message, or null when the account was created.
  String? register({required String name, required String email, required String phone, required String password}) {
    if (findAccount(email) != null) return 'An account with this email already exists';
    if (findAccount(phone) != null) return 'This mobile number is already registered';
    final a = Account(name: name, email: email, phone: phone, password: password);
    accounts.add(a);
    _useAccount(a);
    return null;
  }

  /// Returns true when a new account was created.
  bool signInWithGoogle(GoogleAccount g) {
    final existing = findAccount(g.email);
    if (existing != null) {
      _useAccount(existing);
      return false;
    }
    final a = Account(name: g.name, email: g.email, phone: '', password: '', google: true);
    accounts.add(a);
    _useAccount(a);
    return true;
  }

  bool resetPassword(String emailOrPhone, String newPassword) {
    final a = findAccount(emailOrPhone);
    if (a == null) return false;
    a.password = newPassword;
    return true;
  }

  void deleteCurrentAccount() {
    accounts.removeWhere((a) => a.email == profile.email);
  }

  // ---------------------------------------------------------------- Vehicles
  final List<Vehicle> vehicles = List.of(MockData.vehicles);
  String _selectedId = 'v1';

  Vehicle vehicleById(String id) => vehicles.firstWhere(
        (v) => v.id == id,
        orElse: () => MockData.vehicles.firstWhere((v) => v.id == id, orElse: () => MockData.corolla),
      );

  List<Vehicle> get activeVehicles => vehicles.where((v) => v.active).toList();

  Vehicle get selectedVehicle {
    final found = vehicles.where((v) => v.id == _selectedId);
    if (found.isNotEmpty) return found.first;
    return vehicles.isNotEmpty ? vehicles.first : MockData.corolla;
  }

  void selectVehicle(String id) {
    _selectedId = id;
    notifyListeners();
  }

  String newVehicleId() => 'v${DateTime.now().millisecondsSinceEpoch}';

  bool plateExists(String plate, {String? exceptId}) {
    String norm(String p) => p.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
    return vehicles.any((v) => v.id != exceptId && norm(v.plate) == norm(plate));
  }

  void addVehicle(Vehicle v) {
    vehicles.insert(0, v);
    _selectedId = v.id;
    JobStore.instance.push(AppNotification(
      id: JobStore.instance.nextNotificationId(),
      title: 'Vehicle added',
      body: '${v.name} (${v.plate}) is now in My Vehicles.',
      time: DateTime.now(),
      kind: NotificationKind.reminder,
      unread: true,
    ));
    notifyListeners();
  }

  void updateVehicle(Vehicle v) {
    final i = vehicles.indexWhere((e) => e.id == v.id);
    if (i >= 0) vehicles[i] = v;
    notifyListeners();
  }

  void removeVehicle(String id) {
    vehicles.removeWhere((v) => v.id == id);
    notifyListeners();
  }

  List<ServiceRecord> historyFor(String id) => MockData.history[id] ?? const [];
  List<UpcomingService> upcomingFor(String id) => MockData.upcoming[id] ?? const [];
  List<PassportEntry> passportFor(String id) => MockData.passport[id] ?? const [];

  // ---------------------------------------------------------------- Bookings
  final List<Booking> bookings = MockData.buildBookings();

  List<Booking> bookingsIn(Set<BookingState> states) =>
      bookings.where((b) => states.contains(b.state)).toList()..sort((a, b) => b.date.compareTo(a.date));

  Booking addBooking({
    required String vehicleId,
    required String service,
    required DateTime date,
    List<String> symptoms = const [],
    String? offer,
    String garage = MockData.garageName,
    String? id,
    String statusLabel = 'Confirmed',
  }) {
    final b = Booking(
      id: id ?? 'BK-${date.year}-${(_rnd.nextInt(90000) + 10000)}',
      vehicleId: vehicleId,
      service: service,
      date: date,
      state: BookingState.upcoming,
      statusLabel: statusLabel,
      queuePosition: 1 + _rnd.nextInt(3),
      garage: garage,
      symptoms: symptoms,
      offer: offer,
    );
    bookings.insert(0, b);
    final v = vehicleById(vehicleId);
    final confirmed = statusLabel == 'Confirmed';
    JobStore.instance.push(AppNotification(
      id: JobStore.instance.nextNotificationId(),
      title: confirmed ? 'Booking Confirmed' : 'Booking requested',
      body: confirmed
          ? 'Your $service booking for ${v.name} on ${dayMonthYear(date)} at ${time12(date)} is confirmed.'
          : 'Your $service request for ${v.name} on ${dayMonthYear(date)} at ${time12(date)} is with the garage. You will be told when it is confirmed.',
      time: DateTime.now(),
      kind: NotificationKind.booking,
      unread: true,
    ));
    notifyListeners();
    return b;
  }

  /// Replaces the bookings with BookingDto rows from the backend.
  void applyRemoteBookings(List<Map<String, dynamic>> rows) {
    bookings
      ..clear()
      ..addAll(rows.map((b) {
        final status = (b['status'] as String?) ?? 'Requested';
        return Booking(
          id: b['id'] as String,
          vehicleId: b['vehicleId'] as String,
          service: (b['serviceName'] as String?) ?? 'Service',
          date: DateTime.tryParse((b['slotStart'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
          state: switch (status) {
            'CheckedIn' => BookingState.active,
            'Completed' => BookingState.completed,
            'Declined' || 'Cancelled' || 'NoShow' => BookingState.cancelled,
            _ => BookingState.upcoming,
          },
          statusLabel: switch (status) {
            'Requested' => 'Waiting for garage',
            'CheckedIn' => 'In the workshop',
            'NoShow' => 'Missed',
            _ => status,
          },
          garage: MockData.garageName,
          offer: b['promoCode'] as String?,
        );
      }));
    notifyListeners();
  }

  void cancelBooking(String id) {
    final i = bookings.indexWhere((b) => b.id == id);
    if (i < 0) return;
    bookings[i] = bookings[i].copyWith(state: BookingState.cancelled, statusLabel: 'Cancelled');
    notifyListeners();
  }

  void rescheduleBooking(String id, DateTime date) {
    final i = bookings.indexWhere((b) => b.id == id);
    if (i < 0) return;
    bookings[i] = bookings[i].copyWith(date: date, statusLabel: 'Rescheduled');
    notifyListeners();
  }

  Booking? get nextUpcoming {
    final list = bookingsIn({BookingState.upcoming})..sort((a, b) => a.date.compareTo(b.date));
    return list.isEmpty ? null : list.first;
  }

  // ---------------------------------------------------------------- Plans
  Subscription? subscription;
  final List<Subscription> pastSubscriptions = MockData.buildPastSubscriptions();
  String? savedCardLast4;

  Subscription subscribe(ServicePlan plan, String paymentMethod) {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);
    final end = DateTime(start.year, start.month + plan.months, start.day).subtract(const Duration(days: 1));
    if (subscription != null) pastSubscriptions.insert(0, subscription!);
    subscription = Subscription(
      plan: plan,
      start: start,
      end: end,
      paymentMethod: paymentMethod,
      transactionId: 'FXR${1000000 + _rnd.nextInt(8999999)}',
    );
    JobStore.instance.push(AppNotification(
      id: JobStore.instance.nextNotificationId(),
      title: '${plan.name} activated',
      body: 'Your ${plan.name} is active until ${dayMonthYear(end)}.',
      time: DateTime.now(),
      kind: NotificationKind.subscription,
      unread: true,
    ));
    notifyListeners();
    return subscription!;
  }

  // ---------------------------------------------------------------- Settings
  /// Pastel Garage is a light design: light is the default.
  String theme = 'Light';
  String textSize = 'Default';
  String language = 'English';
  String region = 'Sri Lanka';
  bool pushNotifications = true;
  bool sound = true;
  bool vibration = true;
  String units = 'Kilometers';
  bool biometric = true;
  bool twoFactor = false;
  String visibility = 'Private';
  String locationPermission = 'While using app';

  static const textSizes = {'Small': 0.9, 'Default': 1.0, 'Large': 1.12, 'Extra Large': 1.25};

  double get textScale => textSizes[textSize] ?? 1.0;

  /// Change any setting and refresh the app.
  void update(VoidCallback change) {
    change();
    notifyListeners();
  }

  /// Small tap feedback that respects the Sound / Vibration settings.
  void feedback() {
    if (vibration) HapticFeedback.selectionClick();
    if (sound) SystemSound.play(SystemSoundType.click);
  }

  /// Formats a distance using the selected unit.
  String distance(num km) {
    if (units == 'Miles') return '${groupDigits((km * 0.621371).round())} mi';
    return '${groupDigits(km.round())} km';
  }

  String distanceShort(double km) {
    if (units == 'Miles') return '${(km * 0.621371).toStringAsFixed(1)} mi';
    return '${km.toStringAsFixed(1)} km';
  }

  void resetDemo() {
    vehicles
      ..clear()
      ..addAll(MockData.vehicles);
    bookings
      ..clear()
      ..addAll(MockData.buildBookings());
    subscription = null;
    notifyListeners();
  }
}
