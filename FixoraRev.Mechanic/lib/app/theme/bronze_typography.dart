import 'package:flutter/material.dart';

import 'bronze_colors.dart';

/// Fixora Rev Mechanic — typography scale on the bronze palette.
abstract final class BronzeTypography {
  static const String fontFamily = 'Roboto';

  static TextTheme textTheme = const TextTheme(
    displayLarge: TextStyle(
      fontFamily: fontFamily,
      fontSize: 40,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.5,
      height: 1.15,
      color: BronzeColors.cream,
    ),
    displayMedium: TextStyle(
      fontFamily: fontFamily,
      fontSize: 32,
      fontWeight: FontWeight.w700,
      letterSpacing: -0.25,
      height: 1.2,
      color: BronzeColors.cream,
    ),
    headlineLarge: TextStyle(
      fontFamily: fontFamily,
      fontSize: 28,
      fontWeight: FontWeight.w600,
      height: 1.25,
      color: BronzeColors.cream,
    ),
    headlineMedium: TextStyle(
      fontFamily: fontFamily,
      fontSize: 24,
      fontWeight: FontWeight.w600,
      height: 1.3,
      color: BronzeColors.cream,
    ),
    headlineSmall: TextStyle(
      fontFamily: fontFamily,
      fontSize: 20,
      fontWeight: FontWeight.w600,
      height: 1.3,
      color: BronzeColors.cream,
    ),
    titleLarge: TextStyle(
      fontFamily: fontFamily,
      fontSize: 18,
      fontWeight: FontWeight.w600,
      height: 1.35,
      color: BronzeColors.cream,
    ),
    titleMedium: TextStyle(
      fontFamily: fontFamily,
      fontSize: 16,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.1,
      height: 1.4,
      color: BronzeColors.cream,
    ),
    titleSmall: TextStyle(
      fontFamily: fontFamily,
      fontSize: 14,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.1,
      height: 1.4,
      color: BronzeColors.cream,
    ),
    bodyLarge: TextStyle(
      fontFamily: fontFamily,
      fontSize: 16,
      fontWeight: FontWeight.w400,
      height: 1.5,
      color: BronzeColors.cream,
    ),
    bodyMedium: TextStyle(
      fontFamily: fontFamily,
      fontSize: 14,
      fontWeight: FontWeight.w400,
      height: 1.5,
      color: BronzeColors.creamMuted,
    ),
    bodySmall: TextStyle(
      fontFamily: fontFamily,
      fontSize: 12,
      fontWeight: FontWeight.w400,
      height: 1.45,
      color: BronzeColors.creamMuted,
    ),
    labelLarge: TextStyle(
      fontFamily: fontFamily,
      fontSize: 14,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.4,
      height: 1.3,
      color: BronzeColors.cream,
    ),
    labelMedium: TextStyle(
      fontFamily: fontFamily,
      fontSize: 12,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.4,
      height: 1.3,
      color: BronzeColors.creamMuted,
    ),
    labelSmall: TextStyle(
      fontFamily: fontFamily,
      fontSize: 11,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.5,
      height: 1.3,
      color: BronzeColors.creamMuted,
    ),
  );
}
