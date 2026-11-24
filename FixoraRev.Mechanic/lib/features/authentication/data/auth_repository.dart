import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../core/backend/mechanic_backend.dart';
import '../domain/mechanic_user.dart';

/// Persists the current mechanic profile locally.
class AuthRepository {
  AuthRepository({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kUser = 'fixora.mechanic.user';

  Future<MechanicUser?> loadUser() async {
    final raw = await _storage.read(key: _kUser);
    if (raw == null || raw.isEmpty) return null;
    try {
      return MechanicUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveUser(MechanicUser user) async {
    await _storage.write(key: _kUser, value: jsonEncode(user.toJson()));
  }

  Future<void> logout() async {
    await _storage.delete(key: _kUser);
  }

  Future<MechanicUser> fetchMe() async {
    final data = await MechanicBackend.instance.api.get('/mechanic/me');
    if (data is! Map) {
      throw StateError('Invalid /mechanic/me payload');
    }
    final user = MechanicUser.fromJson(Map<String, dynamic>.from(data));
    await saveUser(user);
    return user;
  }
}
