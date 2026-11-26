import '../domain/auth_entities.dart';

/// In-memory auth used for the demo. Replace with an API-backed repository
/// (ASP.NET Core + JWT) without touching the UI.
///
/// Demo login:  mechanic01@gmail.com  /  Fixora@123  /  invitation FXR2048
class MockAuthRepository implements AuthRepository {
  static const validInvitationCodes = {'FXR2048', 'FXR2026'};

  final List<GoogleAccount> _googleAccounts = [
    const GoogleAccount(
        name: 'Arun Kumar',
        email: 'arunkumar@gmail.com',
        colorValue: 0xFF3577E5),
    const GoogleAccount(
        name: 'Fixora Dev',
        email: 'fixoradev@gmail.com',
        colorValue: 0xFF7B5CE0),
  ];

  final Map<String, _Account> _accounts = {
    'mechanic01@gmail.com': _Account(
      fullName: 'Arun Kumar Perera',
      phone: '+94 77 456 7890',
      password: 'Fixora@123',
    ),
    'arunkumar@gmail.com': _Account(
      fullName: 'Arun Kumar',
      phone: '+94 77 456 7890',
      password: 'Fixora@123',
      googleLinked: true,
    ),
  };

  Future<void> _network([int ms = 1300]) =>
      Future<void>.delayed(Duration(milliseconds: ms));

  MechanicUser _toUser(String email, _Account a, {bool google = false}) =>
      MechanicUser(
        id: 'MEC-${email.hashCode.abs() % 9000 + 1000}',
        fullName: a.fullName,
        email: email,
        phone: a.phone,
        garageName: 'Fixora Auto Care',
        garageBranch: 'Colombo 05 Workshop',
        employeeId: 'FX-M-0142',
        skills: const ['Engine', 'Electrical', 'Brakes', 'Hybrid', 'A/C'],
        signedInWithGoogle: google,
      );

  @override
  Future<MechanicUser> login({
    required String email,
    required String password,
    required String invitationCode,
  }) async {
    await _network();
    final key = email.trim().toLowerCase();
    final account = _accounts[key];
    final errors = <AuthField, String>{};
    if (account == null) {
      errors[AuthField.email] = 'Incorrect email';
    } else if (account.password != password) {
      errors[AuthField.password] = 'Incorrect password';
    }
    if (!validInvitationCodes.contains(invitationCode.trim().toUpperCase())) {
      errors[AuthField.invitationCode] = 'Incorrect invitation code';
    }
    if (errors.isNotEmpty) throw AuthFailure(errors);
    return _toUser(key, account!);
  }

  @override
  Future<void> register({
    required String fullName,
    required String email,
    required String phone,
    required String password,
  }) async {
    await _network(1600);
    final key = email.trim().toLowerCase();
    if (_accounts.containsKey(key)) {
      throw AuthFailure.single(AuthField.email, 'Email already registered');
    }
    _accounts[key] =
        _Account(fullName: fullName.trim(), phone: phone, password: password);
  }

  @override
  List<GoogleAccount> deviceGoogleAccounts() =>
      List.unmodifiable(_googleAccounts);

  @override
  GoogleAccount addGoogleAccount(String name, String email) {
    final normalizedEmail = email.trim().toLowerCase();
    for (final account in _googleAccounts) {
      if (account.email.toLowerCase() == normalizedEmail) return account;
    }
    const colors = [0xFF3577E5, 0xFF7B5CE0, 0xFF1E9E57, 0xFFE99A0C];
    final colorIndex = normalizedEmail.hashCode.abs() % colors.length;
    final account = GoogleAccount(
      name: name.trim(),
      email: normalizedEmail,
      colorValue: colors[colorIndex],
    );
    _googleAccounts.add(account);
    return account;
  }

  @override
  Future<GoogleSignInResult> signInWithGoogle(GoogleAccount account) async {
    await _network(1500);
    final existing = _accounts[account.email];
    if (existing != null && existing.googleLinked) {
      return GoogleSignInResult(
        account: account,
        user: _toUser(account.email, existing, google: true),
      );
    }
    return GoogleSignInResult(account: account);
  }

  @override
  Future<MechanicUser> linkGoogleAccount(
      GoogleAccount account, String invitationCode) async {
    await _network(1200);
    // Invitation code is optional in the demo — any / empty code is accepted.
    final created = _Account(
      fullName: account.name,
      phone: '',
      password: '',
      googleLinked: true,
    );
    _accounts[account.email] = created;
    return _toUser(account.email, created, google: true);
  }

  @override
  Future<void> sendResetLink(String email) async {
    await _network();
    if (!_accounts.containsKey(email.trim().toLowerCase())) {
      throw AuthFailure.single(AuthField.email, 'Incorrect email address');
    }
  }

  @override
  Future<void> resetPassword(
      {required String email, required String newPassword}) async {
    await _network(1500);
    final account = _accounts[email.trim().toLowerCase()];
    if (account == null) {
      throw AuthFailure.single(
          AuthField.general, 'This reset link is no longer valid');
    }
    account.password = newPassword;
  }

  @override
  Future<void> changePassword({
    required String email,
    required String currentPassword,
    required String newPassword,
  }) async {
    await _network(1100);
    final account = _accounts[email.trim().toLowerCase()];
    if (account == null) {
      throw AuthFailure.single(AuthField.general, 'Please log in again and retry');
    }
    if (account.password != currentPassword) {
      throw AuthFailure.single(AuthField.password, 'Current password is incorrect');
    }
    if (currentPassword == newPassword) {
      throw AuthFailure.single(AuthField.confirmPassword, 'Use a password you have not used before');
    }
    account.password = newPassword;
  }

  @override
  Future<MechanicUser> restoreSession(String email) async {
    await _network(700);
    final key = email.trim().toLowerCase();
    final account = _accounts[key];
    if (account == null) {
      throw AuthFailure.single(AuthField.general, 'This account is no longer on this device');
    }
    return _toUser(key, account, google: account.googleLinked);
  }

  @override
  Future<void> logout() => _network(400);
}

class _Account {
  _Account({
    required this.fullName,
    required this.phone,
    required this.password,
    this.googleLinked = false,
  });

  final String fullName;
  final String phone;
  String password;
  bool googleLinked;
}
