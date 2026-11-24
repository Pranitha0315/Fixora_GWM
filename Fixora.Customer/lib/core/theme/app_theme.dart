import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness b) {
    final isDark = b == Brightness.dark;
    // Theme objects are built before AppColors.dark flips, so pick values
    // explicitly instead of reading the live getters.
    // Pastel Garage: white screens, flat pastel cards drawn by the widgets.
    final bg = isDark ? const Color(0xFF0F1517) : Colors.white;
    final surface = isDark ? const Color(0xFF182124) : Colors.white;
    final text = isDark ? const Color(0xFFDCE3E5) : const Color(0xFF2A3238);
    final heading = isDark ? Colors.white : const Color(0xFF151A1E);
    final divider = isDark ? const Color(0xFF222D31) : const Color(0xFFEEF1F2);
    // Text buttons / cursor: darker teal in light mode for 4.5:1 on grey cards.
    final accent = isDark ? AppColors.mint : AppColors.primaryDark;

    final base = ThemeData(
      useMaterial3: true,
      brightness: b,
      fontFamily: 'Inter',
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        brightness: b,
        primary: AppColors.primary,
        onPrimary: Colors.white,
        surface: surface,
        onSurface: heading,
      ),
      scaffoldBackgroundColor: bg,
      canvasColor: surface,
      splashFactory: InkRipple.splashFactory,
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: accent,
        selectionHandleColor: accent,
        selectionColor: accent.withAlpha(0x55),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: accent,
          minimumSize: const Size(48, 44),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        side: BorderSide(color: isDark ? const Color(0xFF6E7B80) : const Color(0xFF8C979D), width: 1.6),
      ),
      dividerColor: divider,
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      bottomSheetTheme: BottomSheetThemeData(backgroundColor: surface, modalBackgroundColor: surface),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: surface,
        headerBackgroundColor: AppColors.primary,
        headerForegroundColor: Colors.white,
      ),
      timePickerTheme: TimePickerThemeData(backgroundColor: surface),
    );
    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: text,
        displayColor: heading,
        fontFamily: 'Inter',
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}

/// Text styles used across the app. Font family comes from the theme.
class AppText {
  AppText._();

  static TextStyle get pageTitle => TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.w700,
    color: AppColors.navy,
    letterSpacing: -0.4,
    height: 1.15,
  );
  static TextStyle get h1 => TextStyle(
    fontSize: 22,
    fontWeight: FontWeight.w800,
    color: AppColors.navy,
    letterSpacing: -0.4,
  );
  static TextStyle get h2 => TextStyle(
    fontSize: 18,
    fontWeight: FontWeight.w700,
    color: AppColors.navy,
    letterSpacing: -0.3,
  );
  static TextStyle get h3 => TextStyle(
    fontSize: 15.5,
    fontWeight: FontWeight.w700,
    color: AppColors.navy,
    letterSpacing: -0.2,
  );
  static TextStyle get body => TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w500,
    color: AppColors.text,
    height: 1.35,
  );
  static TextStyle get label => TextStyle(
    fontSize: 13,
    fontWeight: FontWeight.w600,
    color: AppColors.text,
  );
  static TextStyle get muted => TextStyle(
    fontSize: 12.5,
    fontWeight: FontWeight.w400,
    color: AppColors.textMuted,
    height: 1.35,
  );
  static TextStyle get small => TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w500,
    color: AppColors.textMuted,
  );
  static TextStyle get money => TextStyle(
    fontSize: 14,
    fontWeight: FontWeight.w700,
    color: AppColors.navy,
  );
}
