import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/app_state.dart';

/// Privacy & Security: password, 2FA, biometric, privacy and sessions.
class PrivacySecurityScreen extends StatelessWidget {
  const PrivacySecurityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => Scaffold(
        backgroundColor: AppColors.bg,
        appBar: AppBar(
          title: const Text('Privacy & Security'),
          backgroundColor: AppColors.bg,
          foregroundColor: AppColors.navy,
          elevation: 0,
        ),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          children: [
            Text('Manage your password and account security', style: AppText.muted),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(Icons.shield_outlined, color: AppColors.link, size: 28),
                  Container(
                    width: 1.2,
                    height: 26,
                    margin: const EdgeInsets.symmetric(horizontal: 12),
                    color: AppColors.border,
                  ),
                  Expanded(child: Text('Your account security is important to us.', style: AppText.label)),
                ],
              ),
            ),
            _section('Password & Authentication'),
            _group([
              _tile(
                icon: Icons.lock_outline_rounded,
                title: 'Change Password',
                subtitle: 'Update your account password',
                onTap: () => _snack(context, 'Change password sheet coming soon'),
              ),
              _tile(
                icon: Icons.verified_user_outlined,
                title: 'Two-Factor Authentication',
                subtitle: 'Additional account protection',
                trailing: _chip(app.twoFactor ? 'ON' : 'OFF', app.twoFactor ? AppColors.success : AppColors.textMuted),
                onTap: () {
                  app.update(() => app.twoFactor = !app.twoFactor);
                  _snack(
                    context,
                    app.twoFactor ? 'Two-factor authentication is ON' : 'Two-factor authentication turned off',
                  );
                },
              ),
              _tile(
                icon: Icons.fingerprint_rounded,
                title: 'Biometric Login',
                subtitle: 'Use Face ID or fingerprint',
                chevron: false,
                trailing: Switch.adaptive(
                  value: app.biometric,
                  onChanged: (v) => app.update(() => app.biometric = v),
                ),
              ),
            ]),
            _section('Privacy Controls'),
            _group([
              _tile(
                icon: Icons.person_outline_rounded,
                title: 'Profile Visibility',
                subtitle: 'Who can see your profile in garages',
                trailing: _chip(app.visibility),
                onTap: () async {
                  final v = await _pickOption(
                    context,
                    title: 'Profile Visibility',
                    options: const ['Private', 'Garages I visit', 'Public'],
                    selected: app.visibility,
                  );
                  if (v != null) app.update(() => app.visibility = v);
                },
              ),
              // Location Permissions — Always | While using app | Never
              _tile(
                icon: Icons.location_on_outlined,
                title: 'Location Permissions',
                subtitle: 'Used for SOS and nearby garages',
                trailing: _chip(app.locationPermission),
                onTap: () async {
                  final v = await _pickOption(
                    context,
                    title: 'Location access',
                    options: const ['Always', 'While using app', 'Never'],
                    selected: app.locationPermission,
                    neverHint: 'Roadside SOS will ask you to type your location',
                  );
                  if (v != null) app.update(() => app.locationPermission = v);
                },
              ),
              _tile(
                icon: Icons.storage_rounded,
                title: 'Data & Privacy',
                subtitle: 'Manage your personal data',
                onTap: () => _snack(context, 'We will email your data within 24 hours'),
              ),
            ]),
            _section('Account Security'),
            _group([
              _tile(
                icon: Icons.laptop_mac_rounded,
                title: 'Active Sessions',
                subtitle: 'Review signed-in devices',
                onTap: () => _snack(context, 'Sessions list coming soon'),
              ),
              _tile(
                icon: Icons.history_rounded,
                title: 'Login Activity',
                subtitle: 'View recent sign-ins',
                onTap: () => _snack(context, 'Login activity coming soon'),
              ),
              _tile(
                icon: Icons.delete_outline_rounded,
                title: 'Delete Account',
                subtitle: 'Permanently delete your account and data',
                danger: true,
                onTap: () => _snack(context, 'Delete account requires confirmation'),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 18, 2, 10),
        child: Text(title, style: AppText.h2.copyWith(fontSize: 15)),
      );

  Widget _group(List<Widget> children) => Container(
        decoration: BoxDecoration(
          color: AppColors.surfaceSolid,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Divider(height: 1, color: AppColors.divider),
              children[i],
            ],
          ],
        ),
      );

  Widget _tile({
    required IconData icon,
    required String title,
    required String subtitle,
    VoidCallback? onTap,
    Widget? trailing,
    bool chevron = true,
    bool danger = false,
  }) {
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, color: danger ? AppColors.danger : AppColors.link),
      title: Text(
        title,
        style: AppText.label.copyWith(color: danger ? AppColors.dangerText : null),
      ),
      subtitle: Text(subtitle, style: AppText.small),
      trailing: trailing ??
          (chevron ? Icon(Icons.chevron_right_rounded, color: AppColors.navy) : null),
    );
  }

  Widget _chip(String text, [Color? color]) {
    final c = color ?? AppColors.link;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.o(0.12), borderRadius: BorderRadius.circular(20)),
      child: Text(text, style: TextStyle(color: c, fontWeight: FontWeight.w800, fontSize: 11.5)),
    );
  }

  Future<String?> _pickOption(
    BuildContext context, {
    required String title,
    required List<String> options,
    required String selected,
    String? neverHint,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(24)),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title, style: AppText.h1),
              const SizedBox(height: 12),
              for (final o in options)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(o, style: AppText.label),
                  subtitle: o == 'Never' && neverHint != null
                      ? Text(neverHint, style: AppText.small)
                      : null,
                  trailing: Icon(
                    o == selected ? Icons.radio_button_checked : Icons.radio_button_off,
                    color: o == selected ? AppColors.link : AppColors.textMuted,
                  ),
                  onTap: () => Navigator.of(ctx).pop(o),
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _snack(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
    );
  }
}
