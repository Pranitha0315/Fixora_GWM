/// Small formatting helpers (kept dependency-free instead of using `intl`).
class Fmt {
  Fmt._();

  static const _months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];

  /// 18500 -> "LKR 18,500"
  static String lkr(num value) => 'LKR ${thousands(value.round())}';

  static String thousands(int value) {
    final negative = value < 0;
    final digits = value.abs().toString();
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
      buffer.write(digits[i]);
    }
    return negative ? '-$buffer' : buffer.toString();
  }

  /// 14:05 -> "2:05 PM"
  static String time(DateTime t) {
    final hour = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final minute = t.minute.toString().padLeft(2, '0');
    final period = t.hour < 12 ? 'AM' : 'PM';
    return '$hour:$minute $period';
  }

  /// "5 Nov 2026"
  static String date(DateTime t) =>
      '${t.day} ${_months[t.month - 1]} ${t.year}';

  /// "5 Nov, 2:05 PM"
  static String dateTime(DateTime t) =>
      '${t.day} ${_months[t.month - 1]}, ${time(t)}';

  static String km(int value) => '${thousands(value)} km';

  /// 1.0 -> "1 h", 1.5 -> "1.5 h"
  static String hours(double h) =>
      '${h == h.roundToDouble() ? h.toInt().toString() : h.toStringAsFixed(1)} h';

  /// 95 -> "1 h 35 min"
  static String minutes(int total) {
    if (total < 60) return '$total min';
    final h = total ~/ 60;
    final m = total % 60;
    return m == 0 ? '$h h' : '$h h $m min';
  }

  static String ago(DateTime t) {
    final diff = DateTime.now().difference(t);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    return date(t);
  }

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }
}
