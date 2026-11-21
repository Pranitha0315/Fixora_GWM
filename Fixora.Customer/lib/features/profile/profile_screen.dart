import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/app_state.dart';
import 'account_details_screen.dart';
import 'privacy_security_screen.dart';

/// Profile tab: account card (name / email / phone + stats) opens Account Details.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: app,
          builder: (context, _) {
            final p = app.profile;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
              children: [
                Text('Profile', style: AppText.pageTitle),
                const SizedBox(height: 4),
                Text('Your account, plan and app preferences', style: AppText.muted),
                const SizedBox(height: 16),
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => context.push(const AccountDetailsScreen()),
                    child: Ink(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        gradient: LinearGradient(
                          colors: [AppColors.surface, AppColors.adapt(const Color(0xFFE8FDFB))],
                        ),
                      ),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 32,
                                backgroundColor: AppColors.primarySoft,
                                child: Text(
                                  p.initials,
                                  style: AppText.h2.copyWith(color: AppColors.link),
                                ),
                              ),
                              const SizedBox(width: 14),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(p.name, style: AppText.h1),
                                    const SizedBox(height: 2),
                                    Text(p.email, style: AppText.muted),
                                    Text(p.phone, style: AppText.small),
                                  ],
                                ),
                              ),
                              Icon(Icons.chevron_right_rounded, color: AppColors.navy),
                            ],
                          ),
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              _stat('${app.vehicleCount}', 'Vehicles'),
                              _stat('${app.bookingCount}', 'Bookings'),
                              _stat(_spentLabel(app.totalSpentLkr), 'LKR spent'),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text('Account', style: AppText.h3),
                const SizedBox(height: 8),
                ListTile(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  tileColor: AppColors.surface,
                  leading: Icon(Icons.person_outline_rounded, color: AppColors.link),
                  title: Text('Account Details', style: AppText.label),
                  subtitle: Text('Name, email and phone number', style: AppText.small),
                  trailing: Icon(Icons.chevron_right_rounded, color: AppColors.navy),
                  onTap: () => context.push(const AccountDetailsScreen()),
                ),
                const SizedBox(height: 8),
                ListTile(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  tileColor: AppColors.surface,
                  leading: Icon(Icons.shield_outlined, color: AppColors.link),
                  title: Text('Privacy & Security', style: AppText.label),
                  subtitle: Text('Password, location and sessions', style: AppText.small),
                  trailing: Icon(Icons.chevron_right_rounded, color: AppColors.navy),
                  onTap: () => context.push(const PrivacySecurityScreen()),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  static String _spentLabel(double spent) {
    if (spent <= 0) return '0';
    final n = spent.round();
    final s = n.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      final fromEnd = s.length - i;
      if (i > 0 && fromEnd % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return buf.toString();
  }

  Widget _stat(String value, String label) => Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: AppColors.surfaceSolid,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              FittedBox(
                child: Text(value, style: AppText.h2.copyWith(color: AppColors.link)),
              ),
              Text(label, style: AppText.small),
            ],
          ),
        ),
      );
}
