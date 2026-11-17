import 'package:flutter/material.dart';

import '../../app/theme/bronze_colors.dart';

/// Navigation shortcuts used across the app.
extension NavX on BuildContext {
  Future<T?> push<T>(Widget page) =>
      Navigator.of(this).push<T>(MaterialPageRoute(builder: (_) => page));

  Future<T?> replaceWith<T>(Widget page) => Navigator.of(this)
      .pushReplacement<T, void>(MaterialPageRoute(builder: (_) => page));

  /// Clears the whole stack and shows [page] (used after login / logout).
  Future<T?> resetTo<T>(Widget page) =>
      Navigator.of(this).pushAndRemoveUntil<T>(
        PageRouteBuilder<T>(
          transitionDuration: const Duration(milliseconds: 450),
          pageBuilder: (context, animation, secondaryAnimation) => page,
          transitionsBuilder: (context, animation, secondaryAnimation, child) =>
              FadeTransition(opacity: animation, child: child),
        ),
        (_) => false,
      );

  void popToRoot() => Navigator.of(this).popUntil((route) => route.isFirst);

  void toast(String message, {IconData? icon}) {
    ScaffoldMessenger.of(this)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, color: BronzeColors.charcoal, size: 18),
                const SizedBox(width: 10),
              ],
              Expanded(child: Text(message)),
            ],
          ),
        ),
      );
  }
}
