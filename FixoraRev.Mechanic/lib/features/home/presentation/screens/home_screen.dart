import 'package:flutter/material.dart';

import '../../../../app/theme/bronze_colors.dart';
import '../../../../app/theme/bronze_inputs.dart';

/// Initial landing screen for the Mechanic shell.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Fixora Rev Mechanic'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              const Icon(
                Icons.build_circle_outlined,
                size: 72,
                color: BronzeColors.bronze,
              ),
              const SizedBox(height: 20),
              Text(
                'Welcome, Mechanic',
                textAlign: TextAlign.center,
                style: textTheme.headlineMedium,
              ),
              const SizedBox(height: 8),
              Text(
                'Bronze shell is ready. Jobs and profile modules live under features.',
                textAlign: TextAlign.center,
                style: textTheme.bodyMedium,
              ),
              const SizedBox(height: 32),
              TextField(
                decoration: BronzeInputs.decoration(
                  labelText: 'Shop code',
                  hintText: 'Enter workshop code',
                  prefixIcon: const Icon(Icons.storefront_outlined),
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () {},
                child: const Text('Continue'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () {},
                child: const Text('View jobs'),
              ),
              const Spacer(),
              Text(
                'v1.0.0 · Android shell',
                textAlign: TextAlign.center,
                style: textTheme.labelSmall,
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
