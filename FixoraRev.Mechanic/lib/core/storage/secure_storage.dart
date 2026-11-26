import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Encrypted key/value store for auth tokens (Keychain / Keystore).
class SecureStorage {
  SecureStorage({FlutterSecureStorage? backend})
      : _store = backend ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(encryptedSharedPreferences: true),
            );

  final FlutterSecureStorage _store;

  Future<void> write(String key, String value) => _store.write(key: key, value: value);

  Future<String?> read(String key) => _store.read(key: key);

  Future<void> delete(String key) => _store.delete(key: key);

  /// Moves a legacy SharedPreferences value into secure storage once.
  Future<String?> readMigratingFromPrefs(String key) async {
    final secure = await read(key);
    if (secure != null && secure.isNotEmpty) return secure;
    try {
      final prefs = await SharedPreferences.getInstance();
      final legacy = prefs.getString(key);
      if (legacy == null || legacy.isEmpty) return null;
      await write(key, legacy);
      await prefs.remove(key);
      return legacy;
    } catch (_) {
      return null;
    }
  }
}
