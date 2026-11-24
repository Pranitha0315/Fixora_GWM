import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../auth/login_screen.dart';
import '../job/screens/invoice_screen.dart';
import '../plans/my_subscription_screen.dart';
import '../plans/offers_plans_screen.dart';
import 'account_details_screen.dart';
import 'app_settings_screen.dart';
import 'privacy_security_screen.dart';
import '../rewards/my_rewards_screen.dart';
import '../rewards/points_card.dart';
import '../../data/remote/customer_backend.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([app, store, LoyaltyStore.instance]),
      builder: (context, _) {
        final p = app.profile;
        final sub = app.subscription;
        final spent = app.bookings.fold<double>(0, (s, b) => s + (b.amount ?? 0));
        return FxPage(
          title: 'Profile',
          subtitle: 'Your account, plan and app preferences',
          headerIcon: Icons.person_outline_rounded,
          showBack: false,
          children: [
            FadeSlide(
              child: FxCard(
                onTap: () => context.push(const AccountDetailsScreen()),
                padding: const EdgeInsets.all(16),
                gradient: LinearGradient(colors: [AppColors.surface, AppColors.adapt(Color(0xFFE8FDFB))]),
                child: Column(
                  children: [
                    Row(
                      children: [
                        ProfileAvatar(size: 64),
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
                        _stat('${app.vehicles.length}', 'Vehicles'),
                        _stat('${app.bookings.length}', 'Bookings'),
                        _stat(lkr(spent).replaceFirst('LKR ', ''), 'LKR spent'),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            FadeSlide(
              index: 1,
              child: FxCard(
                onTap: () => context.push(sub != null && sub.isActive
                    ? const MySubscriptionScreen()
                    : const OffersPlansScreen(initialTab: 1)),
                padding: const EdgeInsets.all(14),
                // Flat cream pastel (gold plan), no border.
                color: AppColors.adapt(const Color(0xFFFFF3D6)),
                child: Row(
                  children: [
                    PlanMedal(sub?.plan.tier ?? PlanTier.gold, size: 42),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(sub != null && sub.isActive ? sub.plan.name : 'Get a Service Plan',
                              style: AppText.h3.copyWith(fontSize: 16)),
                          Text(
                            sub != null && sub.isActive
                                ? 'Active until ${dayMonthYear(sub.end)}'
                                : 'Save up to 15% on every service',
                            style: AppText.small.copyWith(color: AppColors.text),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_right_rounded, color: AppColors.navy),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            const FadeSlide(index: 1, child: PointsBalanceCard(compact: true)),
            const SectionTitle('Account'),
            FadeSlide(
              index: 2,
              child: FxSettingsGroup(children: [
                FxSettingsTile(
                  icon: Icons.person_outline_rounded,
                  title: 'Account Details',
                  subtitle: 'Name, email and phone number',
                  onTap: () => context.push(const AccountDetailsScreen()),
                ),
                FxSettingsTile(
                  icon: Icons.stars_outlined,
                  title: 'My Rewards',
                  subtitle: '${groupDigits(LoyaltyStore.instance.balance)} points · history and how to earn',
                  onTap: () => context.push(const MyRewardsScreen()),
                ),
                FxSettingsTile(
                  icon: Icons.workspace_premium_outlined,
                  title: 'My Subscription',
                  subtitle: 'Active and past plans',
                  onTap: () => context.push(const MySubscriptionScreen()),
                ),
                FxSettingsTile(
                  icon: Icons.local_offer_outlined,
                  title: 'Offers & Plans',
                  subtitle: 'Deals and service packages',
                  onTap: () => context.push(const OffersPlansScreen()),
                ),
                FxSettingsTile(
                  icon: Icons.receipt_long_outlined,
                  title: 'Payments & Invoices',
                  subtitle: app.savedCardLast4 != null ? 'Saved card •••• ${app.savedCardLast4}' : 'Latest invoice',
                  onTap: () => context.push(const InvoiceScreen()),
                ),
              ]),
            ),
            const SectionTitle('Settings'),
            FadeSlide(
              index: 3,
              child: FxSettingsGroup(children: [
                FxSettingsTile(
                  icon: AppColors.dark ? Icons.dark_mode_rounded : Icons.light_mode_outlined,
                  title: 'Dark Mode',
                  subtitle: AppColors.dark ? 'On · easier on the eyes at night' : 'Off',
                  chevron: false,
                  trailing: FxSwitch(
                    value: AppColors.dark,
                    onChanged: (v) => app.update(() => app.theme = v ? 'Dark' : 'Light'),
                  ),
                  onTap: () => app.update(() => app.theme = AppColors.dark ? 'Light' : 'Dark'),
                ),
                FxSettingsTile(
                  icon: Icons.shield_outlined,
                  title: 'Privacy & Security',
                  subtitle: 'Password, 2FA and privacy controls',
                  onTap: () => context.push(const PrivacySecurityScreen()),
                ),
                FxSettingsTile(
                  icon: Icons.settings_outlined,
                  title: 'App Settings',
                  subtitle: 'Theme, text size, language, units',
                  onTap: () => context.push(const AppSettingsScreen()),
                ),
                FxSettingsTile(
                  icon: Icons.support_agent_rounded,
                  title: 'Help & Support',
                  subtitle: 'Call or chat with the garage',
                  onTap: () => _help(context),
                ),
              ]),
            ),
            const SectionTitle('Demo controls', icon: Icons.science_outlined),
            FxCard(
              padding: const EdgeInsets.all(14),
              color: AppColors.primarySofter,
              shadow: false,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Jump the active job to any stage to present every screen.',
                      style: AppText.muted.copyWith(fontSize: 12.5)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final s in const [
                        (JobStatus.awaitingApproval, 'Awaiting approval'),
                        (JobStatus.inProgress, 'In progress'),
                        (JobStatus.completed, 'Ready for pickup'),
                        (JobStatus.paid, 'Paid'),
                      ])
                        ChoiceChip(
                          label: Text(s.$2),
                          selected: store.status == s.$1,
                          onSelected: (_) => store.setStatus(s.$1),
                          selectedColor: AppColors.primary,
                          labelStyle: TextStyle(
                            fontWeight: FontWeight.w600,
                            color: store.status == s.$1 ? Colors.white : AppColors.navy,
                          ),
                          showCheckmark: false,
                          side: BorderSide(color: AppColors.border),
                          backgroundColor: AppColors.surface,
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            OutlineButton2(
              label: 'Log out',
              icon: Icons.logout_rounded,
              color: AppColors.danger,
              onPressed: () => _logout(context),
            ),
            const SizedBox(height: 10),
            Center(child: Text('Fixora Customer · v1.1.0', style: AppText.small)),
          ],
        );
      },
    );
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
              FittedBox(child: Text(value, style: AppText.h2.copyWith(color: AppColors.link))),
              Text(label, style: AppText.small),
            ],
          ),
        ),
      );

  void _help(BuildContext context) {
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Help & Support', style: AppText.h1),
          const SizedBox(height: 6),
          Text('${MockData.garageName} · Open 8:00 AM - 6:00 PM', style: AppText.muted),
          const SizedBox(height: 14),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.call_outlined,
              title: 'Call the garage',
              subtitle: MockData.garagePhone,
              onTap: () {
                Navigator.of(ctx).pop();
                showFxSnack(context, 'Calling ${MockData.garagePhone}...', icon: Icons.call_rounded);
              },
            ),
            FxSettingsTile(
              icon: Icons.chat_outlined,
              title: 'WhatsApp chat',
              subtitle: 'Reply in about 5 minutes',
              onTap: () {
                Navigator.of(ctx).pop();
                showFxSnack(context, 'Opening WhatsApp chat...', icon: Icons.chat_rounded);
              },
            ),
            FxSettingsTile(
              icon: Icons.help_outline_rounded,
              title: 'FAQ',
              subtitle: 'Bookings, payments and plans',
              onTap: () {
                Navigator.of(ctx).pop();
                showFxSnack(context, 'FAQ opens in the next version', icon: Icons.info_outline_rounded);
              },
            ),
          ]),
        ],
      ),
    );
  }

  Future<void> _logout(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: const Text('Log out?'),
        content: const Text('You will need your mobile number and OTP to sign in again.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Log out', style: TextStyle(color: AppColors.dangerText)),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      if (CustomerBackend.instance.live) await CustomerBackend.instance.logout();
      if (!context.mounted) return;
      NavController.tab.value = 0;
      Navigator.of(context).pushAndRemoveUntil(fxRoute(const LoginScreen()), (_) => false);
    }
  }
}

/// Avatar that shows the user's photo or initial.
class ProfileAvatar extends StatelessWidget {
  final double size;
  const ProfileAvatar({super.key, this.size = 48});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppState.instance,
      builder: (context, _) => _avatar(),
    );
  }

  Widget _avatar() {
    final p = AppState.instance.profile;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: AppColors.primaryGradient,
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.surface, width: 3),
        boxShadow: AppShadows.button,
      ),
      clipBehavior: Clip.antiAlias,
      child: p.photo != null
          ? Image.memory(p.photo!, fit: BoxFit.cover)
          : Center(
              child: Text(
                p.name.isEmpty ? '?' : p.name[0].toUpperCase(),
                style: TextStyle(color: Colors.white, fontSize: size * 0.42, fontWeight: FontWeight.w800),
              ),
            ),
    );
  }
}
