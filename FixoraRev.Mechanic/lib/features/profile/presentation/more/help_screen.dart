import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Help'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Need assistance?',
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Contact your workshop manager for job reassignment, parts '
            'ordering, or account issues. For urgent roadside cases, use the '
            'SOS tab from home.',
            style: TextStyle(color: AppColors.body, height: 1.4),
          ),
        ],
      ),
    );
  }
}