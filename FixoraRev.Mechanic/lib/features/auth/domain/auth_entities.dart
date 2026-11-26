/// Logged-in mechanic.
class MechanicUser {
  const MechanicUser({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.garageName,
    required this.garageBranch,
    required this.employeeId,
    required this.skills,
    this.signedInWithGoogle = false,
  });

  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String garageName;
  final String garageBranch;
  final String employeeId;
  final List<String> skills;
  final bool signedInWithGoogle;

  String get firstName => fullName.split(' ').first;
}

/// A Google account available on the device (shown in the account chooser).
class GoogleAccount {
  const GoogleAccount(
      {required this.name, required this.email, required this.colorValue});
  final String name;
  final String email;
  final int colorValue;
}

enum AuthField {
  fullName,
  email,
  phone,
  password,
  confirmPassword,
  invitationCode,
  general
}

/// Field-level errors returned by the auth repository, so the UI can show
/// each message under the right input (as in the mock-ups).
class AuthFailure implements Exception {
  AuthFailure(this.errors);
  AuthFailure.single(AuthField field, String message)
      : errors = {field: message};

  final Map<AuthField, String> errors;

  @override
  String toString() => errors.values.join(', ');
}

/// Result of a Google sign-in: either straight in, or the account still
/// has to be linked to a garage with an invitation code.
class GoogleSignInResult {
  const GoogleSignInResult({this.user, required this.account});
  final MechanicUser? user;
  final GoogleAccount account;
  bool get needsGarageLink => user == null;
}

abstract class AuthRepository {
  Future<MechanicUser> login({
    required String email,
    required String password,
    required String invitationCode,
  });

  Future<void> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  });

  List<GoogleAccount> deviceGoogleAccounts();

  GoogleAccount addGoogleAccount(String name, String email);

  Future<GoogleSignInResult> signInWithGoogle(GoogleAccount account);

  /// Links a first-time Google account to a garage via its invitation code.
  Future<MechanicUser> linkGoogleAccount(
      GoogleAccount account, String invitationCode);

  Future<void> sendResetLink(String email);

  Future<void> resetPassword(
      {required String email, required String newPassword});

  /// Signed-in change: the current password must match.
  Future<void> changePassword({
    required String email,
    required String currentPassword,
    required String newPassword,
  });

  /// Quick login (Mechanic PIN) on a trusted device:
  /// restores the session for the remembered account.
  Future<MechanicUser> restoreSession(String email);

  Future<void> logout();
}
