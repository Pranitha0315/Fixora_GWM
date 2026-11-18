import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/route_names.dart';
import '../../app/theme/bronze_colors.dart';
import '../../features/authentication/presentation/screens/login_screen.dart';
import '../../features/shell/presentation/main_shell.dart';

/// Navigation shortcuts used across the app.
extension NavX on BuildContext {
  Future<T?> pushPage<T>(Widget page) =>
      Navigator.of(this).push<T>(MaterialPageRoute(builder: (_) => page));

  Future<T?> replaceWithPage<T>(Widget page) => Navigator.of(this)
      .pushReplacement<T, void>(MaterialPageRoute(builder: (_) => page));

  /// Clears the stack. Known shell/login widgets use GoRouter; others fade-replace.
  Future<T?> resetTo<T>(Widget page) {
    if (page is MainShell) {
      go(RouteNames.shell);
      return Future<T?>.value(null);
    }
    if (page is LoginScreen) {
      go(RouteNames.login);
      return Future<T?>.value(null);
    }
    return Navigator.of(this).pushAndRemoveUntil<T>(
      PageRouteBuilder<T>(
        transitionDuration: const Duration(milliseconds: 450),
        pageBuilder: (context, animation, secondaryAnimation) => page,
        transitionsBuilder: (context, animation, secondaryAnimation, child) =>
            FadeTransition(opacity: animation, child: child),
      ),
      (_) => false,
    );
  }

  void popToRoot() {
    final router = GoRouter.maybeOf(this);
    if (router != null) {
      go(RouteNames.shell);
      return;
    }
    Navigator.of(this).popUntil((route) => route.isFirst);
  }

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
