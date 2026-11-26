import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Type scale. Base body = 15–16px, line height ~1.45 for readability
/// in a noisy workshop. Colours follow light / dark mode.
class AppText {
  AppText._();

  static const family = 'Inter';

  /// Big bold headline: "Jobs for Today".
  static TextStyle get hero => TextStyle(
        fontFamily: family,
        fontSize: 30,
        fontWeight: FontWeight.w800,
        height: 1.12,
        letterSpacing: -0.6,
        color: AppColors.primaryStrong,
      );

  /// "FIXORA REV" word mark.
  static TextStyle get brand => TextStyle(
        fontFamily: family,
        fontSize: 22,
        fontWeight: FontWeight.w900,
        height: 1.0,
        letterSpacing: 0.4,
        color: AppColors.primaryStrong,
      );

  static TextStyle get display => TextStyle(
        fontSize: 26,
        fontWeight: FontWeight.w800,
        color: AppColors.ink,
        height: 1.2,
        letterSpacing: -0.4,
      );

  static TextStyle get title => TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
        height: 1.25,
        letterSpacing: -0.2,
      );

  static TextStyle get heading => TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
        height: 1.3,
      );

  static TextStyle get body => TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w400,
        color: AppColors.body,
        height: 1.45,
      );

  static TextStyle get bodyStrong => TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: AppColors.ink,
        height: 1.4,
      );

  static TextStyle get label => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppColors.body,
        height: 1.3,
      );

  static TextStyle get caption => TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w500,
        color: AppColors.muted,
        height: 1.35,
      );

  static TextStyle get mono => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: AppColors.ink,
        letterSpacing: 1.1,
        fontFamily: 'monospace',
      );
}
