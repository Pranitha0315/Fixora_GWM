import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// Fixora Rev palette: orange · white · brown · black.
class AppColors {
  AppColors._();

  static bool get isDark {
    final brightness =
        SchedulerBinding.instance.platformDispatcher.platformBrightness;
    return brightness == Brightness.dark;
  }

  static const Color _orange = Color(0xFFFF6300);
  static const Color _orangeStrong = Color(0xFFFF5722);

  static Color get primary => _orange;
  static Color get primaryStrong => _orangeStrong;
  static Color get onPrimary => Colors.white;

  static Color get ink => isDark ? const Color(0xFFF5F5F5) : const Color(0xFF1A1A1A);
  static Color get body => isDark ? const Color(0xFFBDBDBD) : const Color(0xFF5C5C5C);
  static Color get surface => isDark ? const Color(0xFF121212) : Colors.white;
  static Color get surfaceElevated =>
      isDark ? const Color(0xFF1E1E1E) : const Color(0xFFF7F7F7);
  static Color get navBar => isDark ? Colors.black : Colors.white;
  static Color get outline =>
      isDark ? const Color(0xFF333333) : const Color(0xFFE0E0E0);
}
