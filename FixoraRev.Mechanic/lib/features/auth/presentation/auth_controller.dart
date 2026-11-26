import 'package:flutter/foundation.dart';

import '../domain/auth_entities.dart';
import '../../../core/backend/mechanic_backend.dart';

/// Holds the signed-in mechanic. Screens keep their own form state and
/// call these methods; errors come back as [AuthFailure].
class AuthController extends ChangeNotifier {
  AuthController(this._repo);

  final AuthRepository _repo;
  MechanicUser? _user;
  bool onDuty = true;

  MechanicUser? get user => _user;
  bool get isLoggedIn => _user != null;

  Future<void> login(
      String email, String password, String invitationCode) async {
    _user = await _repo.login(
      email: email,
      password: password,
      invitationCode: invitationCode,
    );
    notifyListeners();
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) =>
      _repo.register(
          fullName: fullName, email: email, phone: phone, password: password);

  List<GoogleAccount> get googleAccounts => _repo.deviceGoogleAccounts();

  GoogleAccount addGoogleAccount(String name, String email) =>
      _repo.addGoogleAccount(name, email);

  Future<GoogleSignInResult> signInWithGoogle(GoogleAccount account) async {
    final result = await _repo.signInWithGoogle(account);
    if (result.user != null) {
      _user = result.user;
      notifyListeners();
    }
    return result;
  }

  Future<void> linkGoogleAccount(
      GoogleAccount account, String invitationCode) async {
    _user = await _repo.linkGoogleAccount(account, invitationCode);
    notifyListeners();
  }

  Future<void> restoreSession(String email) async {
    _user = await _repo.restoreSession(email);
    notifyListeners();
  }

  Future<void> sendResetLink(String email) => _repo.sendResetLink(email);

  Future<void> resetPassword(String email, String newPassword) =>
      _repo.resetPassword(email: email, newPassword: newPassword);

  Future<void> changePassword(String current, String next) async {
    final u = _user;
    if (u == null) throw AuthFailure.single(AuthField.general, 'Please log in again and retry');
    await _repo.changePassword(email: u.email, currentPassword: current, newPassword: next);
  }

  void setOnDuty(bool value) {
    onDuty = value;
    MechanicBackend.instance.setOnDuty(value).catchError((Object _) {});
    notifyListeners();
  }

  /// Signed in with the garage PIN against the Fixora backend.
  void signInRemote(MechanicUser user) {
    _user = user;
    notifyListeners();
  }

  Future<void> logout() async {
    if (MechanicBackend.instance.live) await MechanicBackend.instance.logout();
    await _repo.logout();
    _user = null;
    notifyListeners();
  }
}
