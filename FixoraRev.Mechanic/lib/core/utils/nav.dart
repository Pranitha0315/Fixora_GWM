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

  // Do not clear the stack with Navigator.pushAndRemoveUntil: it removes GoRouter's own
  // pages and leaves the router on a stale location (Back then lands on Login).
  // Use goRoute() instead.

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
