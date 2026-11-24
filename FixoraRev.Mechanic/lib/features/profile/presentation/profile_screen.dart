import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/route_names.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/bronze_buttons.dart';
import '../../../app/theme/bronze_colors.dart';
import '../../../core/di/app_services.dart';
import '../../../core/widgets/confirm_dialog.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _logout(BuildContext context) async {
    final ok = await confirmDialog(
      context,
      title: 'Log out?',
      message:
          'You will need your password and invitation code to log in again.',
      confirmLabel: 'Log out',
      destructive: true,
    );
    if (!ok) return;
    await AppServices.auth.logout();
    await AppServices.quickLogin.disable();
    if (context.mounted) context.go(RouteNames.login);
  }

  @override
  Widget build(BuildContext context) {
    final user = AppServices.auth.user;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              user?.name ?? user?.employeeCode ?? 'Mechanic profile',
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 20,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (user?.employeeCode != null) ...[
              const SizedBox(height: 6),
              Text(
                user!.employeeCode,
                style: TextStyle(color: AppColors.body),
              ),
            ],
            const Spacer(),
            ElevatedButton(
              style: BronzeButtons.elevated.copyWith(
                backgroundColor:
                    const WidgetStatePropertyAll(BronzeColors.danger),
                foregroundColor:
                    const WidgetStatePropertyAll(BronzeColors.cream),
              ),
              onPressed: () => _logout(context),
              child: const Text('Log out'),
            ),
          ],
        ),
      ),
    );
  }
}
