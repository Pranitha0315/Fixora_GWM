import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../auth/presentation/widgets/auth_scaffold.dart';

/// Registration entry — mechanics normally join via a 7-day manager invite.
class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(RouteNames.login),
      title: 'Create account',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 16),
          const Icon(
            Icons.mail_outline_rounded,
            size: 56,
            color: BronzeColors.bronze,
          ),
          const SizedBox(height: 16),
          Text(
            'Join with an invite',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 10),
          const Text(
            'Fixora Rev mechanics are invited by a workshop manager. '
            'Open the 7-day invite link from your email/SMS to set your name and PIN.',
            style: TextStyle(color: BronzeColors.creamMuted, height: 1.4),
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
            onPressed: () => context.go(
              RouteNames.expiredInvitation,
              extra:
                  'Paste or open a valid invite link from your manager to continue registration.',
            ),
            child: const Text('I have an invite link'),
          ),
        ],
      ),
    );
  }
}
