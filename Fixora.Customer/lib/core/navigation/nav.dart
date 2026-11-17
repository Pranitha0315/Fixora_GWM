import 'package:flutter/material.dart';

/// Keeps the selected bottom-nav tab so inner pages can show the same
/// floating nav bar and jump back to a tab.
class NavController {
  NavController._();

  static final ValueNotifier<int> tab = ValueNotifier<int>(0);

  static void goToTab(BuildContext context, int index) {
    tab.value = index;
    Navigator.of(context).popUntil((route) => route.isFirst);
  }
}

/// Smooth fade + slide route used for every push in the app.
Route<T> fxRoute<T>(Widget page) {
  return PageRouteBuilder<T>(
    transitionDuration: const Duration(milliseconds: 380),
    reverseTransitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (_, _, _) => page,
    transitionsBuilder: (_, animation, _, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: Curves.easeOutCubic,
        reverseCurve: Curves.easeInCubic,
      );
      return FadeTransition(
        opacity: curved,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0.06, 0),
            end: Offset.zero,
          ).animate(curved),
          child: child,
        ),
      );
    },
  );
}
extension NavX on BuildContext {
  Future<T?> push<T>(Widget page) => Navigator.of(this).push<T>(fxRoute<T>(page));

  Future<T?> pushReplacement<T>(Widget page) =>
      Navigator.of(this).pushReplacement<T, dynamic>(fxRoute<T>(page));

  void pop<T>([T? result]) => Navigator.of(this).pop<T>(result);
}
