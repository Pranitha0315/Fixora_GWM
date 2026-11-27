import 'package:flutter/foundation.dart';

import '../domain/auth_entities.dart';
import '../../../core/backend/mechanic_backend.dart';

/// Holds the signed-in mechanic. Sign-in itself goes through [MechanicBackend]
/// (employee ID + PIN, or invitation accept); this controller only keeps the result.
class AuthController extends ChangeNotifier {
  MechanicUser? _user;
  bool onDuty = true;

  /// True once someone has signed in during this run of the app. After that, the
  /// Login page is where a signed-out user lands (explicit logout or expiry).
  bool _everSignedIn = false;

  /// Set when the server rejected the saved session (token refresh failed), so the
  /// Login page can say why the user was sent back.
  bool sessionExpired = false;

  MechanicUser? get user => _user;
  bool get isLoggedIn => _user != null;
  bool get everSignedIn => _everSignedIn;

  void _signedIn(MechanicUser user) {
    _user = user;
    _everSignedIn = true;
    sessionExpired = false;
  }

  void setOnDuty(bool value) {
    onDuty = value;
    MechanicBackend.instance.setOnDuty(value).catchError((Object _) {});
    notifyListeners();
  }

  /// Signed in against the Fixora backend.
  void signInRemote(MechanicUser user) {
    _signedIn(user);
    notifyListeners();
  }

  Future<void> logout() async {
    if (MechanicBackend.instance.live) await MechanicBackend.instance.logout();
    _user = null;
    notifyListeners();
  }

  /// The server no longer accepts the saved session. Signs the user out locally;
  /// the router then sends them to the Login page.
  void expireSession() {
    if (_user == null) return;
    _user = null;
    sessionExpired = true;
    notifyListeners();
  }
}
