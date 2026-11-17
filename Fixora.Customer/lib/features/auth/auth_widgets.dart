import '../../data/repositories/app_state.dart';

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$');

/// 0–1 score: length 8+, lower, upper, digit each add 0.25.
double passwordStrength(String raw) {
  if (raw.isEmpty) return 0;
  var score = 0.0;
  if (raw.length >= 8) score += 0.25;
  if (RegExp(r'[a-z]').hasMatch(raw)) score += 0.25;
  if (RegExp(r'[A-Z]').hasMatch(raw)) score += 0.25;
  if (RegExp(r'[0-9]').hasMatch(raw)) score += 0.25;
  return score;
}

/// Shared field validators for login / register / reset screens.
String? validateFullName(String raw) {
  final v = raw.trim();
  if (v.isEmpty) return 'Enter your full name';
  if (v.length < 2) return 'Name must be at least 2 characters';
  if (!RegExp(r"^[A-Za-z][A-Za-z .'\-]*$").hasMatch(v)) {
    return 'Use letters only in your name';
  }
  return null;
}

String? validateEmail(String raw, {bool required = true}) {
  final v = raw.trim();
  if (v.isEmpty) return required ? 'Enter your email' : null;
  if (!_emailRe.hasMatch(v)) return 'Enter a valid email address';
  return null;
}

String? validateMobile(String raw) {
  final d = AppState.digitsOf(raw);
  if (d.isEmpty) return 'Enter your mobile number';
  if (d.length != 9) return 'Enter a valid 9-digit mobile number';
  if (!d.startsWith('7')) return 'Enter a valid Sri Lankan mobile number';
  return null;
}

String? validatePassword(String raw, {bool requireStrength = false}) {
  if (raw.isEmpty) return 'Enter your password';
  if (requireStrength && passwordStrength(raw) < 0.75) {
    return 'Use 8+ characters with upper & lower case and a number';
  }
  return null;
}

String? validateConfirmPassword(String password, String confirm) {
  if (confirm.isEmpty) return 'Confirm your password';
  if (confirm != password) return 'Passwords do not match';
  return null;
}
