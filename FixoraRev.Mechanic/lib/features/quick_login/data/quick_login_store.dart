import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Result of checking a Mechanic PIN.
enum PinCheck { ok, wrong, locked }

/// Device-level "quick login" with a 4-digit Mechanic PIN. The PIN itself is never stored: only a random salt
/// and SHA-256(salt + PIN). After [maxAttempts] wrong tries quick login is
/// switched off and the mechanic must sign in with email + password again.
///
/// Real backend note: on a production build this should unlock a refresh
/// token kept in secure storage (flutter_secure_storage / Keychain), and the
/// server should be able to revoke the device.
class QuickLoginStore extends ChangeNotifier {
  QuickLoginStore._();
  static final QuickLoginStore instance = QuickLoginStore._();

  static const pinLength = 4;
  static const maxAttempts = 5;

  static const _kEnabled = 'ql_enabled';
  static const _kEmail = 'ql_email';
  static const _kName = 'ql_name';
  static const _kSalt = 'ql_salt';
  static const _kHash = 'ql_hash';
  static const _kFailed = 'ql_failed';

  SharedPreferences? _prefs;

  bool enabled = false;
  String? email;
  String? name;
  int failed = 0;

  int get attemptsLeft => maxAttempts - failed;

  /// Call once at start-up (Splash does this).
  Future<void> load() async {
    try {
      _prefs ??= await SharedPreferences.getInstance();
    } catch (_) {
      return; // storage unavailable (e.g. some test setups) → feature off
    }
    final p = _prefs!;
    enabled = p.getBool(_kEnabled) ?? false;
    email = p.getString(_kEmail);
    name = p.getString(_kName);
    failed = p.getInt(_kFailed) ?? 0;
    notifyListeners();
  }

  String _hash(String salt, String pin) => sha256.convert(utf8.encode('$salt:$pin')).toString();

  String _newSalt() {
    final r = Random.secure();
    return base64UrlEncode(List<int>.generate(16, (_) => r.nextInt(256)));
  }

  Future<void> enable({
    required String email,
    required String name,
    required String pin,
  }) async {
    await load();
    final p = _prefs;
    if (p == null) return;
    final salt = _newSalt();
    await p.setString(_kSalt, salt);
    await p.setString(_kHash, _hash(salt, pin));
    await p.setString(_kEmail, email);
    await p.setString(_kName, name);
    await p.setInt(_kFailed, 0);
    await p.setBool(_kEnabled, true);
    await load();
  }

  Future<PinCheck> verify(String pin) async {
    final p = _prefs;
    if (p == null || !enabled) return PinCheck.locked;
    final salt = p.getString(_kSalt) ?? '';
    final ok = _hash(salt, pin) == p.getString(_kHash);
    if (ok) {
      failed = 0;
      await p.setInt(_kFailed, 0);
      notifyListeners();
      return PinCheck.ok;
    }
    failed++;
    await p.setInt(_kFailed, failed);
    if (failed >= maxAttempts) {
      await disable();
      return PinCheck.locked;
    }
    notifyListeners();
    return PinCheck.wrong;
  }

  /// Turns quick login off on this device (keeps nothing behind).
  Future<void> disable() async {
    final p = _prefs;
    if (p != null) {
      for (final k in [_kEnabled, _kEmail, _kName, _kSalt, _kHash, _kFailed, 'ql_biometric']) {
        await p.remove(k);
      }
    }
    enabled = false;
    email = null;
    name = null;
    failed = 0;
    notifyListeners();
  }
}
