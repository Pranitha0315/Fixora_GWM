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
}