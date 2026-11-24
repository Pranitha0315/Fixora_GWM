import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../../core/di/app_services.dart';

/// Splash gate — logged in? Home : quick PIN? QuickLogin : Login.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    await Future<void>.delayed(const Duration(milliseconds: 800));
    await AppServices.bootstrap();
    if (!mounted) return;
    final quick = AppServices.quickLogin;
    if (AppServices.auth.isLoggedIn) {
      context.go(RouteNames.shell);
    } else if (quick.enabled) {
      context.go(RouteNames.quickLogin);
    } else {
      context.go(RouteNames.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: BronzeColors.charcoal,
      body: Center(
        child: Icon(
          Icons.build_circle_outlined,
          size: 72,
          color: BronzeColors.bronze,
        ),
      ),
    );
  }
}
