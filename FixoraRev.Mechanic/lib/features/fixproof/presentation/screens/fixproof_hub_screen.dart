import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

class FixproofHubScreen extends StatelessWidget {
  const FixproofHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('FixProof'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: Center(
        child: Text(
          'FixProof hub — capture & review',
          style: TextStyle(color: AppColors.body),
        ),
      ),
    );
  }
}
