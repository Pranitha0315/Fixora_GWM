import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../app/theme/bronze_colors.dart';
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
      onBack: () => context.go(RouteNames.login),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          const Icon(
            Icons.link_off_rounded,
            size: 64,
            color: BronzeColors.warning,
          ),
          const SizedBox(height: 20),
          Text(
            'Invitation expired',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(
            message,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: BronzeColors.creamMuted,
                ),
          ),
          const Spacer(),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: () => context.go(RouteNames.login),
            child: const Text('Back to sign in'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(
            style: BronzeButtons.outlined,
            onPressed: () => context.push(RouteNames.register),
            child: const Text('Create account'),
          ),
        ],
      ),
    );
  }
}
