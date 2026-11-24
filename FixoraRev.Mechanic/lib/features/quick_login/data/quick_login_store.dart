import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local quick-login prefs for the mechanic app.
///
/// Non-sensitive profile flags stay in SharedPreferences.
/// PIN unlocks a device session; the PIN itself is kept in secure storage
/// (flutter_secure_storage / Keychain). Production builds should also keep
/// the refresh token there so the server can revoke the device.
class QuickLoginStore extends ChangeNotifier {
  QuickLoginStore({FlutterSecureStorage? secureStorage})
      : _secure = secureStorage ?? const FlutterSecureStorage();

  static const _kEnabled = 'fixora.mechanic.ql.enabled';
  static const _kEmail = 'fixora.mechanic.ql.email';
  static const _kName = 'fixora.mechanic.ql.name';
  static const _kFailed = 'fixora.mechanic.ql.failed';
  static const _kPin = 'fixora.mechanic.ql.pin';

  final FlutterSecureStorage _secure;
  SharedPreferences? _prefs;

  bool enabled = false;
  String? email;
  String? name;
  int failed = 0;

  Future<void> load() async {
    try {
      _prefs ??= await SharedPreferences.getInstance();
    } catch (_) {
      return;
    }
    final p = _prefs!;
    enabled = p.getBool(_kEnabled) ?? false;
    email = p.getString(_kEmail);
    name = p.getString(_kName);
    failed = p.getInt(_kFailed) ?? 0;

    // Migrate legacy PIN out of SharedPreferences if present.
    final legacyPin = p.getString(_kPin);
    if (legacyPin != null && legacyPin.isNotEmpty) {
      await _secure.write(key: _kPin, value: legacyPin);
      await p.remove(_kPin);
    }

    notifyListeners();
  }

  Future<void> enable({
    required String email,
    required String name,
    required String pin,
  }) async {
    final p = await _prefsInstance();
    enabled = true;
    this.email = email;
    this.name = name;
    failed = 0;
    await p.setBool(_kEnabled, true);
    await p.setString(_kEmail, email);
    await p.setString(_kName, name);
    await p.setInt(_kFailed, 0);
    await p.remove(_kPin);
    await _secure.write(key: _kPin, value: pin);
    notifyListeners();
  }

  Future<bool> unlock(String pin) async {
    final p = await _prefsInstance();
    final saved = await _secure.read(key: _kPin);
    if (saved == null || saved != pin) {
      failed += 1;
      await p.setInt(_kFailed, failed);
      notifyListeners();
      return false;
    }
    failed = 0;
    await p.setInt(_kFailed, 0);
    notifyListeners();
    return true;
  }

  Future<void> clear() async {
    final p = await _prefsInstance();
    enabled = false;
    email = null;
    name = null;
    failed = 0;
    await p.remove(_kEnabled);
    await p.remove(_kEmail);
    await p.remove(_kName);
    await p.remove(_kFailed);
    await p.remove(_kPin);
    await _secure.delete(key: _kPin);
    notifyListeners();
  }

  Future<SharedPreferences> _prefsInstance() async {
    return _prefs ??= await SharedPreferences.getInstance();
  }
}
