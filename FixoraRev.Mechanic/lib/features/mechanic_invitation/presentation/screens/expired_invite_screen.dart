import 'package:flutter/material.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../auth/presentation/widgets/auth_scaffold.dart';

/// Shown when a manager's 7-day invitation link is expired or already used.
class ExpiredInviteScreen extends StatelessWidget {
  const ExpiredInviteScreen({
    super.key,
    this.message =
        'This invitation link has expired or was already used. Ask your workshop manager to send a new 7-day invite.',
  });

  final String message;

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.goRoute(RouteNames.login),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.dangerSoft,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(Icons.link_off_rounded, color: AppColors.danger, size: 32),
            ),
          ),
          const SizedBox(height: 18),
          Text('Invitation expired', style: AppText.title),
          const SizedBox(height: 8),
          Text(message, style: AppText.body),
          const SizedBox(height: 10),
          Text(
            'Manager invitations stay valid for 7 days. After that you need a fresh link.',
            style: AppText.caption,
          ),
          const SizedBox(height: 28),
          PrimaryButton(
            label: 'Back to sign in',
            icon: Icons.login_rounded,
            onPressed: () => context.goRoute(RouteNames.login),
          ),
        ],
      ),
    );
  }
}
