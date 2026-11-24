import 'package:flutter/material.dart';

import '../../../app/theme/app_colors.dart';
import '../../../core/di/app_services.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    AppServices.notifications.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.notifications.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final items = AppServices.notifications.all;
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Alerts'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
        actions: [
          TextButton(
            onPressed: () => AppServices.notifications.markAllRead(),
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: items.isEmpty
          ? Center(
              child: Text(
                'You\'re all caught up.',
                style: TextStyle(color: AppColors.body),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (context, index) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                final n = items[i];
                return ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: AppColors.outline),
                  ),
                  tileColor: n.read
                      ? AppColors.surfaceElevated
                      : AppColors.primary.withValues(alpha: 0.08),
                  title: Text(
                    n.title,
                    style: TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  subtitle: Text(
                    n.body,
                    style: TextStyle(color: AppColors.body),
                  ),
                  onTap: () => AppServices.notifications.markRead(n.id),
                );
              },
            ),
    );
  }
}
