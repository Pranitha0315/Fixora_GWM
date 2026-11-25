// Small formatting helpers (no intl dependency needed).

String groupDigits(num value, {bool decimals = false}) {
  final negative = value < 0;
  final n = value.abs();
  final whole = n.floor();
  final s = whole.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
    buf.write(s[i]);
  }
  var out = '${negative ? '-' : ''}$buf';
  if (decimals) {
    final cents = ((n - whole) * 100).round().clamp(0, 99).toInt();
    out += '.${cents.toString().padLeft(2, '0')}';
  }
  return out;
}

/// LKR 41,400  /  LKR 41,400.00
String lkr(num value, {bool decimals = false}) =>
    'LKR ${groupDigits(value, decimals: decimals)}';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const _weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

String monthShort(int m) => _months[m - 1];
String weekdayShort(DateTime d) => _weekdays[d.weekday - 1];

String time12(DateTime d) {
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final m = d.minute.toString().padLeft(2, '0');
  return '${h.toString().padLeft(2, '0')}:$m ${d.hour < 12 ? 'AM' : 'PM'}';
}

/// 27 Aug, 02:10 PM
String dayTime(DateTime d) => '${d.day} ${monthShort(d.month)}, ${time12(d)}';

/// 27 Aug 2026
String dayMonthYear(DateTime d) => '${d.day} ${monthShort(d.month)} ${d.year}';
