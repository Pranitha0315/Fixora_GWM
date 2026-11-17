import 'package:flutter/material.dart';

import '../features/splash/presentation/screens/splash_screen.dart';
import 'router/app_router.dart';
import 'theme/bronze_theme.dart';
import 'widgets/phone_frame.dart';

/// Root widget for Fixora Rev Mechanic.
class FixoraMechanicApp extends StatelessWidget {
  const FixoraMechanicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Fixora Rev',
      debugShowCheckedModeBanner: false,
      theme: BronzeTheme.dark,
      themeMode: ThemeMode.dark,
      builder: (context, child) =>
          PhoneFrame(child: child ?? const SizedBox.shrink()),
      home: const SplashScreen(),
      onGenerateRoute: AppRouter.onGenerateRoute,
    );
  }
}
