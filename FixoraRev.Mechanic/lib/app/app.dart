import 'package:flutter/material.dart';

import 'router/app_router.dart';
import 'theme/bronze_theme.dart';
import 'widgets/phone_frame.dart';

/// Root widget for Fixora Rev Mechanic.
class FixoraMechanicApp extends StatelessWidget {
  const FixoraMechanicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Fixora Rev',
      debugShowCheckedModeBanner: false,
      theme: BronzeTheme.dark,
      themeMode: ThemeMode.dark,
      builder: (context, child) =>
          PhoneFrame(child: child ?? const SizedBox.shrink()),
      routerConfig: AppRouter.router,
    );
  }
}
