import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router/route_names.dart';
import '../../../app/theme/app_colors.dart';
import '../../../app/theme/bronze_buttons.dart';
import '../../../app/theme/bronze_colors.dart';
import '../../../core/di/app_services.dart';
import '../../../core/widgets/confirm_dialog.dart';
import '../../jobs/domain/job_entities.dart';

/// Profile tab: photo, stats, account, preferences (appearance, duty,
/// quick login, notifications, Tamil reports), More and log out.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _tamilReports = false;

  @override
  void initState() {
    super.initState();
    AppServices.auth.addListener(_refresh);
    AppServices.jobs.addListener(_refresh);
    AppServices.quickLogin.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.auth.removeListener(_refresh);
    AppServices.jobs.removeListener(_refresh);
    AppServices.quickLogin.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _logout() async {
    final ok = await confirmDialog(
      context,
      title: 'Log out?',
      message:
          'You will need your password and invitation code to log in again.',
      confirmLabel: 'Log out',
      destructive: true,
    );
    if (!ok) return;
    await AppServices.auth.logout();
    await AppServices.quickLogin.disable();
    if (mounted) context.go(RouteNames.login);
  }

  @override
  Widget build(BuildContext context) {
    final user = AppServices.auth.user;
    final active = AppServices.jobs.all.where((j) => j.status.isActive).length;
    final done =
        AppServices.jobs.all.where((j) => !j.status.isActive).length;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: AppColors.surfaceElevated,
                child: Icon(Icons.person, color: AppColors.primary, size: 36),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.name ?? user?.employeeCode ?? 'Mechanic',
                      style: TextStyle(
                        color: AppColors.ink,
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (user?.employeeCode != null)
                      Text(
                        user!.employeeCode,
                        style: TextStyle(color: AppColors.body),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              _MiniStat(label: 'Active', value: '$active'),
              const SizedBox(width: 10),
              _MiniStat(label: 'Done', value: '$done'),
              const SizedBox(width: 10),
              _MiniStat(
                label: 'Duty',
                value: AppServices.auth.onDuty ? 'On' : 'Off',
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            'Preferences',
            style: TextStyle(
              color: AppColors.ink,
              fontWeight: FontWeight.w700,
            ),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('On duty', style: TextStyle(color: AppColors.ink)),
            subtitle: Text(
              'Show as available for new jobs',
              style: TextStyle(color: AppColors.body, fontSize: 12),
            ),
            value: AppServices.auth.onDuty,
            activeThumbColor: AppColors.primary,
            onChanged: (v) => AppServices.auth.setOnDuty(v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('Quick login', style: TextStyle(color: AppColors.ink)),
            subtitle: Text(
              AppServices.quickLogin.enabled
                  ? 'Enabled on this device'
                  : 'Off — enable after next PIN login',
              style: TextStyle(color: AppColors.body, fontSize: 12),
            ),
            value: AppServices.quickLogin.enabled,
            activeThumbColor: AppColors.primary,
            onChanged: (v) async {
              if (!v) {
                await AppServices.quickLogin.disable();
              } else {
                final email = user?.email ?? user?.employeeCode ?? 'mechanic';
                final name = user?.name ?? email;
                await AppServices.quickLogin.enable(
                  email: email,
                  name: name,
                  pin: '1234',
                );
                if (!mounted) return;
                ScaffoldMessenger.of(this.context).showSnackBar(
                  const SnackBar(
                    content: Text('Quick login set with demo PIN 1234'),
                  ),
                );
              }
              setState(() {});
            },
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title:
                Text('Tamil reports', style: TextStyle(color: AppColors.ink)),
            value: _tamilReports,
            activeThumbColor: AppColors.primary,
            onChanged: (v) => setState(() => _tamilReports = v),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text('Alerts', style: TextStyle(color: AppColors.ink)),
            trailing: Text(
              '${AppServices.notifications.unread} unread',
              style: TextStyle(color: AppColors.body),
            ),
            onTap: () => context.push(RouteNames.notifications),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            style: BronzeButtons.elevated.copyWith(
              backgroundColor:
                  const WidgetStatePropertyAll(BronzeColors.danger),
              foregroundColor:
                  const WidgetStatePropertyAll(BronzeColors.cream),
            ),
            onPressed: _logout,
            child: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surfaceElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.outline),
        ),
        child: Column(
          children: [
            Text(value,
                style: TextStyle(
                  color: AppColors.ink,
                  fontWeight: FontWeight.w700,
                )),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: AppColors.body, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
