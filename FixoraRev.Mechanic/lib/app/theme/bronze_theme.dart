import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'bronze_buttons.dart';
import 'bronze_colors.dart';
import 'bronze_inputs.dart';
import 'bronze_typography.dart';

/// Assembled ThemeData for Fixora Rev Mechanic.
abstract final class BronzeTheme {
  static const ColorScheme _colorScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: BronzeColors.bronze,
    onPrimary: BronzeColors.charcoal,
    primaryContainer: BronzeColors.bronzeDark,
    onPrimaryContainer: BronzeColors.cream,
    secondary: BronzeColors.bronzeLight,
    onSecondary: BronzeColors.charcoal,
    secondaryContainer: BronzeColors.surfaceElevated,
    onSecondaryContainer: BronzeColors.cream,
    tertiary: BronzeColors.bronzeMuted,
    onTertiary: BronzeColors.charcoal,
    error: BronzeColors.danger,
    onError: BronzeColors.cream,
    surface: BronzeColors.surface,
    onSurface: BronzeColors.cream,
    onSurfaceVariant: BronzeColors.creamMuted,
    outline: BronzeColors.outline,
    outlineVariant: Color(0xFF4A4038),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: BronzeColors.cream,
    onInverseSurface: BronzeColors.charcoal,
    inversePrimary: BronzeColors.bronzeDark,
    surfaceTint: BronzeColors.bronze,
  );

  static ThemeData get dark {
    final textTheme = BronzeTypography.textTheme;

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: _colorScheme,
      scaffoldBackgroundColor: BronzeColors.charcoal,
      textTheme: textTheme,
      primaryTextTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: BronzeColors.charcoal,
        foregroundColor: BronzeColors.cream,
        elevation: 0,
        centerTitle: true,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle: textTheme.titleLarge,
        iconTheme: const IconThemeData(color: BronzeColors.bronzeLight),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(style: BronzeButtons.elevated),
      outlinedButtonTheme: OutlinedButtonThemeData(style: BronzeButtons.outlined),
      textButtonTheme: TextButtonThemeData(style: BronzeButtons.text),
      inputDecorationTheme: BronzeInputs.decorationTheme,
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: BronzeColors.bronze,
        foregroundColor: BronzeColors.charcoal,
        elevation: 2,
      ),
      dividerTheme: const DividerThemeData(
        color: BronzeColors.outline,
        thickness: 1,
        space: 1,
      ),
      cardTheme: CardThemeData(
        color: BronzeColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: BronzeColors.outline),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: BronzeColors.surfaceElevated,
        contentTextStyle: textTheme.bodyMedium?.copyWith(color: BronzeColors.cream),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
