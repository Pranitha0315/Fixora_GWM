import 'package:flutter/material.dart';

import 'bronze_colors.dart';

/// Shared input decoration for the bronze theme.
abstract final class BronzeInputs {
  static InputDecorationTheme decorationTheme = InputDecorationTheme(
    filled: true,
    fillColor: BronzeColors.surfaceElevated,
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    hintStyle: const TextStyle(
      color: BronzeColors.creamMuted,
      fontSize: 14,
      fontWeight: FontWeight.w400,
    ),
    labelStyle: const TextStyle(
      color: BronzeColors.creamMuted,
      fontSize: 14,
      fontWeight: FontWeight.w500,
    ),
    floatingLabelStyle: const TextStyle(
      color: BronzeColors.bronzeLight,
      fontSize: 14,
      fontWeight: FontWeight.w600,
    ),
    prefixIconColor: BronzeColors.bronzeMuted,
    suffixIconColor: BronzeColors.bronzeMuted,
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: BronzeColors.outline),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: BronzeColors.outline),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: BronzeColors.bronze, width: 1.5),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: BronzeColors.danger),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: BronzeColors.danger, width: 1.5),
    ),
    disabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: BronzeColors.outline.withValues(alpha: 0.4)),
    ),
  );

  /// Helper for one-off field decorations outside Theme.
  static InputDecoration decoration({
    String? labelText,
    String? hintText,
    Widget? prefixIcon,
    Widget? suffixIcon,
  }) {
    return InputDecoration(
      labelText: labelText,
      hintText: hintText,
      prefixIcon: prefixIcon,
      suffixIcon: suffixIcon,
    );
  }
}
