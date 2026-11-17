//import 'dart:math' as math;

import 'package:flutter/foundation.dart';
///import 'package:flutter/services.dart';

///import '../../core/utils/format.dart';
///import '../mock/mock_data.dart';
//import '../models/models.dart';
//import 'job_store.dart';

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
    notifyListeners();
    return null;
  }
}