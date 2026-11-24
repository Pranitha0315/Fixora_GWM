import 'package:flutter/foundation.dart';

import '../../../core/backend/mechanic_backend.dart';
import '../data/auth_repository.dart';
import '../domain/mechanic_user.dart';

/// Auth state for the mechanic app.
class AuthController extends ChangeNotifier {
  AuthController({AuthRepository? repo}) : _repo = repo ?? AuthRepository();

  final AuthRepository _repo;

  MechanicUser? _user;
  MechanicUser? get user => _user;
  bool get isLoggedIn => _user != null;

  Future<void> restore() async {
    _user = await _repo.loadUser();
    notifyListeners();
  }

  Future<void> signInRemote({
    required String login,
    Map<String, dynamic>? profile,
  }) async {
    if (profile != null) {
      _user = MechanicUser.fromJson({
        ...profile,
        'employee_code': profile['employee_code'] ?? login,
        'login': login,
      });
    } else {
      try {
        _user = await _repo.fetchMe();
      } catch (_) {
        final session = MechanicBackend.instance.api.session;
        _user = MechanicUser.fromSession(
          login: login,
          name: session?.name,
          userId: session?.userId,
        );
      }
    }
    await _repo.saveUser(_user!);
    notifyListeners();
  }

  Future<void> logout() async {
    if (MechanicBackend.instance.live ||
        MechanicBackend.instance.api.signedIn) {
      await MechanicBackend.instance.logout();
    } else {
      await MechanicBackend.instance.api.clear();
    }
    await _repo.logout();
    _user = null;
    notifyListeners();
  }
}
