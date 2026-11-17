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

