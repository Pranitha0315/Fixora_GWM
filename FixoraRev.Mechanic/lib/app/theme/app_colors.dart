import 'package:flutter/material.dart';

/// Fixora Rev palette: orange · white · brown · black only.
/// Every token switches with [AppColors.isDark].
///
/// Swatches (light → dark):
///   orange  #FF5722 · #E64A19 · dark buttons #FF6300
///   brown   #6D4C41 · #3E2723
///   black   #212121 · #000000
///   white   #FFFFFF · #F5F5F5 · #EEEEEE
class AppColors {
  AppColors._();

  /// Set by the theme controller before the app rebuilds.
  static bool isDark = false;

  static Color _p(int light, int dark) => Color(isDark ? dark : light);

  // Brand orange
  /// Icons, accents, large shapes. Dark mode uses #FF6300 on buttons too.
  static Color get primary => _p(0xFFFF5722, 0xFFFF6300);

  /// Buttons + strong orange text.
  static Color get primaryStrong => _p(0xFFE64A19, 0xFFFF6300);

  /// Text / icons placed ON a primary or primaryStrong fill.
  static Color get onPrimary => _p(0xFFFFFFFF, 0xFFFFFFFF);
  static Color get onPrimaryMuted => _p(0xD9FFFFFF, 0xD9FFFFFF);

  /// Soft orange wash / selected background.
  static Color get primarySoft => _p(0xFFFFE8E0, 0xFF3A1F16);
  static Color get primaryBorder => _p(0xFFFFCCBC, 0xFF5C3326);

  /// Orange/brown text used on [primarySoft].
  static Color get onPrimarySoft => _p(0xFFBF360C, 0xFFFFCCBC);

  // Neutrals — brown + black + white only
  static Color get ink => _p(0xFF212121, 0xFFF5F5F5);
  static Color get body => _p(0xFF3E2723, 0xFFE0D5D1);
  static Color get muted => _p(0xFF6D4C41, 0xFFBCAAA4);
  static Color get border => _p(0xFFE0E0E0, 0xFF3E2723);
  static Color get background => _p(0xFFFAFAFA, 0xFF121212);
  static Color get surface => _p(0xFFFFFFFF, 0xFF1E1E1E);
  static Color get surfaceAlt => _p(0xFFF5F5F5, 0xFF2A2A2A);

  // Status indicators (Available / Reserved / Incoming etc.)
  static Color get success => _p(0xFF16A34A, 0xFF4ADE80);
  static Color get successSoft => _p(0xFFDCFCE7, 0xFF0F2E1C);
  static Color get warning => _p(0xFFEAB308, 0xFFFACC15);
  static Color get warningSoft => _p(0xFFFEF9C3, 0xFF33270A);
  static Color get danger => _p(0xFFDC2626, 0xFFF87171);
  static Color get dangerSoft => _p(0xFFFEE2E2, 0xFF3A1418);

  /// Solid orange-red fills (SOS) – white text on top in both modes.
  static Color get dangerBright => _p(0xFFE64A19, 0xFFFF6300);
  static Color get info => _p(0xFF6D4C41, 0xFFFF6300);
  static Color get infoSoft => _p(0xFFF5F5F5, 0xFF2A221E);

  // Names used by the diagnosis / queue / parts / passport screens
  static Color get primaryDark => primaryStrong;
  static Color get primaryLight => _p(0xFFFF8A65, 0xFFFF6300);
  static Color get field => surfaceAlt;
  static Color get inkSoft => body;
  static Color get purple => _p(0xFF6D4C41, 0xFFBCAAA4);
  static Color get purpleSoft => _p(0xFFF5F5F5, 0xFF2A221E);

  /// Card shadow (soft brown tint in light, near-black in dark).
  static Color get shadow => _p(0x406D4C41, 0x66000000);

  /// Flat on purpose (Fixora Rev uses flat colour, no gradient washes).
  static LinearGradient get primaryGradient => LinearGradient(
        colors: [primaryStrong, primaryStrong],
      );

  static LinearGradient get softGradient => LinearGradient(
        colors: [_p(0xFFFFF5F2, 0xFF1A1210), surface],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      );

  /// Top colour of the wash (also used behind the status bar).
  static Color get headerTop => background;

  /// Wash behind the top of Home / Jobs / Alerts / Profile.
  static LinearGradient get headerGradient => LinearGradient(
        colors: [background, background],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      );

  /// Dark photo banner behind white text.
  static const heroInk = Color(0xFF212121);

  /// Soft raised look: light edge top-left and warm shadow bottom-right.
  static List<BoxShadow> get cardShadow => isDark
      ? [BoxShadow(color: shadow, blurRadius: 18, spreadRadius: -6, offset: const Offset(0, 8))]
      : [
          const BoxShadow(color: Color(0xCCFFFFFF), blurRadius: 14, spreadRadius: -2, offset: Offset(-5, -5)),
          BoxShadow(color: shadow, blurRadius: 18, spreadRadius: -4, offset: const Offset(6, 8)),
        ];

  /// Soft disc the car stands on (Login, Job).
  static Color get pedestal => _p(0xFFFFE8E0, 0xFF3A1F16);
}
