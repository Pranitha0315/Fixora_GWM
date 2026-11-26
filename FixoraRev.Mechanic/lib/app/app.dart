import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/widgets/warm_ui.dart';
import 'router/app_router.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';
import 'theme/theme_controller.dart';

/// App flow: Splash → Login / Create account → OTP → Home.
/// Appearance (Light / Dark) comes from [ThemeController].
class FixoraRevApp extends StatefulWidget {
  const FixoraRevApp({super.key});

  @override
  State<FixoraRevApp> createState() => _FixoraRevAppState();
}

class _FixoraRevAppState extends State<FixoraRevApp> with WidgetsBindingObserver {
  final _theme = ThemeController.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _theme.addListener(_onTheme);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _theme.removeListener(_onTheme);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() => _theme.refresh();

  void _onTheme() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final dark = AppColors.isDark;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
        statusBarBrightness: dark ? Brightness.dark : Brightness.light,
        systemNavigationBarColor: AppColors.background,
        systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
      ),
      child: MaterialApp.router(
        title: 'Fixora Rev',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.current(),
        themeMode: ThemeMode.light,
        builder: (context, child) => PhoneFrame(child: child ?? const SizedBox.shrink()),
        routerConfig: AppRouter.router,
      ),
    );
  }
}
