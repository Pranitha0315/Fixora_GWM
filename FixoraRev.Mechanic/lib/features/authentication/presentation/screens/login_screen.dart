import 'package:flutter/material.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../../core/utils/nav.dart';
import '../../../shell/presentation/main_shell.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              const Icon(Icons.build_circle_outlined, size: 72, color: BronzeColors.bronze),
              const SizedBox(height: 16),
              Text(
                'Mechanic Login',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => context.resetTo(const MainShell()),
                child: const Text('Continue'),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).pushNamed(RouteNames.register),
                child: const Text('Register'),
              ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
