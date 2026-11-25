import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';

class MoreMenuScreen extends StatelessWidget {
  const MoreMenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('More'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        children: [
          ListTile(
            leading: Icon(Icons.help_outline, color: AppColors.primary),
            title: Text('Help', style: TextStyle(color: AppColors.ink)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(RouteNames.help),
          ),
          ListTile(
            leading: Icon(Icons.info_outline, color: AppColors.primary),
            title: Text('About', style: TextStyle(color: AppColors.ink)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(RouteNames.about),
          ),
          ListTile(
            leading: Icon(Icons.language_outlined, color: AppColors.primary),
            title: Text('Language', style: TextStyle(color: AppColors.ink)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(RouteNames.language),
          ),
        ],
      ),
    );
  }
}