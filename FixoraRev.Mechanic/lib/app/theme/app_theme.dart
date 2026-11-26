import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'app_colors.dart';
import 'app_typography.dart';

class AppTheme {
  AppTheme._();

  /// Builds the theme for the current [AppColors.isDark] value.
  static ThemeData current() {
    final dark = AppColors.isDark;
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(0xFFFF5722),
      brightness: dark ? Brightness.dark : Brightness.light,
    ).copyWith(
      primary: AppColors.primaryStrong,
      onPrimary: AppColors.onPrimary,
      secondary: AppColors.primary,
      surface: AppColors.surface,
      onSurface: AppColors.ink,
      onSurfaceVariant: AppColors.body,
      surfaceContainerHighest: AppColors.surfaceAlt,
      error: dark ? AppColors.danger : AppColors.dangerBright,
      outline: AppColors.border,
      outlineVariant: AppColors.border,
    );

    final radius = BorderRadius.circular(16);

    return ThemeData(
      useMaterial3: true,
      fontFamily: AppText.family,
      brightness: dark ? Brightness.dark : Brightness.light,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.background,
      canvasColor: AppColors.surface,
      cardColor: AppColors.surface,
      splashFactory: InkRipple.splashFactory,
      // Thumb-friendly: every tappable control gets at least a 48x48 hit area.
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      // Familiar gestures: swipe from the left edge to go back, on every platform.
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.windows: CupertinoPageTransitionsBuilder(),
          TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
          TargetPlatform.linux: CupertinoPageTransitionsBuilder(),
          TargetPlatform.fuchsia: CupertinoPageTransitionsBuilder(),
        },
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      iconTheme: IconThemeData(color: AppColors.body),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        foregroundColor: AppColors.ink,
        iconTheme: IconThemeData(color: AppColors.ink),
        titleTextStyle: AppText.title,
      ),
      textTheme: TextTheme(
        headlineSmall: AppText.display,
        titleLarge: AppText.title,
        titleMedium: AppText.heading,
        titleSmall: AppText.bodyStrong,
        bodyLarge: AppText.body,
        bodyMedium: AppText.body,
        labelLarge: AppText.label,
        bodySmall: AppText.caption,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceAlt,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        labelStyle: AppText.label,
        floatingLabelStyle: AppText.label.copyWith(color: AppColors.primaryStrong),
        hintStyle: AppText.body.copyWith(color: AppColors.muted),
        prefixIconColor: AppColors.muted,
        suffixIconColor: AppColors.muted,
        border: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.border)),
        enabledBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: AppColors.border)),
        focusedBorder: OutlineInputBorder(
          borderRadius: radius,
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(borderRadius: radius, borderSide: BorderSide(color: scheme.error)),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: radius,
          borderSide: BorderSide(color: scheme.error, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primaryStrong,
          foregroundColor: AppColors.onPrimary,
          disabledBackgroundColor: AppColors.border,
          disabledForegroundColor: AppColors.muted,
          minimumSize: const Size.fromHeight(54),
          textStyle: const TextStyle(fontFamily: AppText.family, fontSize: 16, fontWeight: FontWeight.w700),
          shape: const StadiumBorder(),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primaryStrong,
          foregroundColor: AppColors.onPrimary,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: radius),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.ink,
          minimumSize: const Size.fromHeight(50),
          backgroundColor: AppColors.surface,
          side: BorderSide(color: AppColors.primaryBorder, width: 1.5),
          textStyle: const TextStyle(fontFamily: AppText.family, fontSize: 15, fontWeight: FontWeight.w600),
          shape: const StadiumBorder(),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primaryStrong,
          minimumSize: const Size(44, 44),
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        selectedColor: AppColors.primarySoft,
        side: BorderSide(color: AppColors.border),
        labelStyle: AppText.label,
        checkmarkColor: AppColors.onPrimarySoft,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: AppColors.body,
        textColor: AppColors.ink,
      ),
      dividerTheme: DividerThemeData(color: AppColors.border, thickness: 1, space: 1),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: dark ? const Color(0xFFF5F5F5) : const Color(0xFF212121),
        contentTextStyle: TextStyle(
          color: dark ? const Color(0xFF1A1A1A) : Colors.white,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
        actionTextColor: dark ? const Color(0xFFFF6300) : const Color(0xFFFF6300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        dragHandleColor: AppColors.border,
      ),
      popupMenuTheme: PopupMenuThemeData(
        color: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        textStyle: AppText.body,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.onPrimary : AppColors.muted,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primaryStrong : AppColors.surfaceAlt,
        ),
        trackOutlineColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.transparent : AppColors.border,
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primaryStrong : Colors.transparent,
        ),
        checkColor: WidgetStatePropertyAll(AppColors.onPrimary),
        side: BorderSide(color: AppColors.muted, width: 1.5),
      ),
      radioTheme: RadioThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? AppColors.primaryStrong : AppColors.muted,
        ),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: AppColors.primary,
        linearTrackColor: AppColors.primarySoft,
      ),
    );
  }

  /// Kept for older call sites.
  static ThemeData light() => current();
}
