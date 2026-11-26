class Validators {
  Validators._();

  static final RegExp _email = RegExp(r'^[\w.+-]+@[\w-]+(\.[\w-]+)+$');

  static bool isEmail(String value) => _email.hasMatch(value.trim());

  static bool hasMinLength(String v) => v.length >= 8;
  static bool hasUppercase(String v) => RegExp(r'[A-Z]').hasMatch(v);
  static bool hasNumber(String v) => RegExp(r'[0-9]').hasMatch(v);
  static bool hasSpecial(String v) => RegExp(r'[^A-Za-z0-9\s]').hasMatch(v);

  static bool isStrongPassword(String v) =>
      hasMinLength(v) && hasUppercase(v) && hasNumber(v) && hasSpecial(v);

  /// Sri Lankan mobile number typed after the +94 prefix: 7XXXXXXXX
  /// (a leading 0 is also accepted, e.g. 077 456 7890).
  static bool isSriLankanMobile(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    return RegExp(r'^0?7\d{8}$').hasMatch(digits);
  }
}
