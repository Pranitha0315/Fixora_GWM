import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

class QueueScreen extends StatelessWidget {
  const QueueScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Jobs queue'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: Center(
        child: Text(
          'Job queue — coming soon',
          style: TextStyle(color: AppColors.body),
        ),
      ),
    );
  }
}
