import 'package:flutter/material.dart';

import 'bronze_colors.dart';

/// Shared button styles for the bronze theme.
abstract final class BronzeButtons {
  static ButtonStyle elevated = ElevatedButton.styleFrom(
    backgroundColor: BronzeColors.bronze,
    foregroundColor: BronzeColors.charcoal,
    disabledBackgroundColor: BronzeColors.surfaceElevated,
    disabledForegroundColor: BronzeColors.creamMuted,
    elevation: 0,
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    textStyle: const TextStyle(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.4,
    ),
  );

  static ButtonStyle outlined = OutlinedButton.styleFrom(
    foregroundColor: BronzeColors.bronzeLight,
    disabledForegroundColor: BronzeColors.creamMuted,
    side: const BorderSide(color: BronzeColors.bronze, width: 1.5),
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    textStyle: const TextStyle(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.4,
    ),
  );

  static ButtonStyle text = TextButton.styleFrom(
    foregroundColor: BronzeColors.bronzeLight,
    disabledForegroundColor: BronzeColors.creamMuted,
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    textStyle: const TextStyle(
      fontSize: 14,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.3,
    ),
  );
}
