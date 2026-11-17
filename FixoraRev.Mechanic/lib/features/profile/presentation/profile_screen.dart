import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: Center(
        child: Text(
          'Profile — coming soon',
          style: TextStyle(color: AppColors.body),
        ),
      ),
    );
  }
}
