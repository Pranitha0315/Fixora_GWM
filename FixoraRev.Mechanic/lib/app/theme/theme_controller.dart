import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_colors.dart';

/// Light / Dark appearance, saved on the phone.
///
/// The colour tokens in [AppColors] are read while widgets build, so when the
/// effective mode changes every element in the tree is marked for rebuild.
class ThemeController extends ChangeNotifier {
  ThemeController._();
  static final ThemeController instance = ThemeController._();

  static const _key = 'appearance_mode';

  ThemeMode _mode = ThemeMode.light;
  ThemeMode get mode => _mode;

  String get label => switch (_mode) {
        ThemeMode.dark => 'Dark',
        _ => 'Light',
      };

  Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_key);
      // Default is Light Mode ON. Only switch to dark when the user saved it.
      if (saved == ThemeMode.dark.name) {
        _mode = ThemeMode.dark;
      } else {
        _mode = ThemeMode.light;
        if (saved != ThemeMode.light.name) {
          await prefs.setString(_key, ThemeMode.light.name);
        }
      }
    } catch (_) {
      _mode = ThemeMode.light;
    }
    AppColors.isDark = _mode == ThemeMode.dark;
  }

  Future<void> setMode(ThemeMode mode) async {
    final next = mode == ThemeMode.dark ? ThemeMode.dark : ThemeMode.light;
    if (next == _mode) return;
    _mode = next;
    refresh();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, next.name);
    } catch (_) {}
  }

  /// Called on a mode change.
  void refresh() {
    final dark = _mode == ThemeMode.dark;
    final changed = dark != AppColors.isDark;
    AppColors.isDark = dark;
    notifyListeners();
    if (changed) _rebuildAll();
  }

  static void _rebuildAll() {
    void mark(Element e) {
      e.markNeedsBuild();
      e.visitChildren(mark);
    }

    final root = WidgetsBinding.instance.rootElement;
    if (root != null) mark(root);
  }
}
