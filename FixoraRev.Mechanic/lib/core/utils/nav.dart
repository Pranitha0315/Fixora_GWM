import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme/app_colors.dart';

/// Navigation shortcuts used across the app (GoRouter + imperative pushes).
extension NavX on BuildContext {
  Future<T?> push<T>(Widget page) =>
      Navigator.of(this).push<T>(MaterialPageRoute(builder: (_) => page));

  Future<T?> pushRoute<T extends Object?>(String location, {Object? extra}) =>
      GoRouter.of(this).push<T>(location, extra: extra);

  void goRoute(String location, {Object? extra}) => GoRouter.of(this).go(location, extra: extra);

  Future<T?> replaceWith<T>(Widget page) => Navigator.of(this)
      .pushReplacement<T, void>(MaterialPageRoute(builder: (_) => page));

  /// Clears the whole stack and shows [page] (used after login / logout).
  Future<T?> resetTo<T>(Widget page) =>
      Navigator.of(this).pushAndRemoveUntil<T>(
        PageRouteBuilder<T>(
          transitionDuration: const Duration(milliseconds: 450),
          pageBuilder: (_, __, ___) => page,
          transitionsBuilder: (_, animation, __, child) =>
              FadeTransition(opacity: animation, child: child),
        ),
        (_) => false,
      );

  /// Clears stack via GoRouter path (preferred for named destinations).
  void resetToRoute(String location, {Object? extra}) => go(location, extra: extra);

  void popToRoot() => Navigator.of(this).popUntil((route) => route.isFirst);

  void toast(String message, {IconData? icon}) {
    ScaffoldMessenger.of(this)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, color: AppColors.onPrimary, size: 18),
                const SizedBox(width: 10),
              ],
              Expanded(child: Text(message)),
            ],
          ),
        ),
      );
  }
}
