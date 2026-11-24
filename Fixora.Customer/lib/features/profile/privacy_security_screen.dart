import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../auth/login_screen.dart';

/// Privacy & Security: password, 2FA, biometric, privacy and sessions.
class PrivacySecurityScreen extends StatelessWidget {
  const PrivacySecurityScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) => FxPage(
        title: 'Privacy & Security',
        subtitle: 'Manage your password and account security',
        compactHeader: true,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Icon(Icons.shield_outlined, color: AppColors.link, size: 28),
                Container(width: 1.2, height: 26, margin: const EdgeInsets.symmetric(horizontal: 12), color: AppColors.border),
                Expanded(child: Text('Your account security is important to us.', style: AppText.label)),
              ],
            ),
          ),
          const SectionTitle('Password & Authentication'),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.lock_outline_rounded,
              title: 'Change Password',
              subtitle: 'Update your account password',
              onTap: () => showFxSheet<void>(context, builder: (_) => const _ChangePasswordSheet()),
            ),
            FxSettingsTile(
              icon: Icons.verified_user_outlined,
              title: 'Two-Factor Authentication',
              subtitle: 'Additional account protection',
              trailing: ValueChip(app.twoFactor ? 'ON' : 'OFF',
                  color: app.twoFactor ? AppColors.success : AppColors.textMuted),
              onTap: () => _twoFactor(context),
            ),
            FxSettingsTile(
              icon: Icons.fingerprint_rounded,
              title: 'Biometric Login',
              subtitle: 'Use Face ID or fingerprint',
              chevron: false,
              trailing: FxSwitch(value: app.biometric, onChanged: (v) => app.update(() => app.biometric = v)),
            ),
          ]),
          const SectionTitle('Privacy Controls'),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.person_outline_rounded,
              title: 'Profile Visibility',
              subtitle: 'Who can see your profile in garages',
              trailing: ValueChip(app.visibility),
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Profile Visibility',
                    options: const ['Private', 'Garages I visit', 'Public'],
                    selected: app.visibility);
                if (v != null) app.update(() => app.visibility = v);
              },
            ),
            FxSettingsTile(
              icon: Icons.location_on_outlined,
              title: 'Location Permissions',
              subtitle: 'Used for SOS and nearby garages',
              trailing: ValueChip(app.locationPermission),
              onTap: () async {
                final v = await pickOption(context,
                    title: 'Location access',
                    options: const ['Always', 'While using app', 'Never'],
                    selected: app.locationPermission,
                    subtitles: const {'Never': 'Roadside SOS will ask you to type your location'});
                if (v != null) app.update(() => app.locationPermission = v);
              },
            ),
            FxSettingsTile(
              icon: Icons.storage_rounded,
              title: 'Data & Privacy',
              subtitle: 'Manage your personal data',
              onTap: () => _data(context),
            ),
          ]),
          const SectionTitle('Account Security'),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.laptop_mac_rounded,
              title: 'Active Sessions',
              subtitle: 'Review signed-in devices',
              onTap: () => showFxSheet<void>(context, builder: (_) => const _SessionsSheet()),
            ),
            FxSettingsTile(
              icon: Icons.history_rounded,
              title: 'Login Activity',
              subtitle: 'View recent sign-ins',
              onTap: () => _activity(context),
            ),
            FxSettingsTile(
              icon: Icons.delete_outline_rounded,
              title: 'Delete Account',
              subtitle: 'Permanently delete your account and data',
              danger: true,
              onTap: () => _delete(context),
            ),
          ]),
        ],
      ),
    );
  }

  void _twoFactor(BuildContext context) {
    final app = AppState.instance;
    if (app.twoFactor) {
      app.update(() => app.twoFactor = false);
      showFxSnack(context, 'Two-factor authentication turned off', icon: Icons.info_outline_rounded);
      return;
    }
    showFxSheet<void>(context, builder: (_) => const _TwoFactorSheet());
  }

  void _data(BuildContext context) {
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Data & Privacy', style: AppText.h1),
          const SizedBox(height: 12),
          FxSettingsGroup(children: [
            FxSettingsTile(
              icon: Icons.download_rounded,
              title: 'Download my data',
              subtitle: 'Vehicles, bookings, invoices (JSON)',
              onTap: () {
                Navigator.of(ctx).pop();
                showFxSnack(context, 'We will email your data within 24 hours');
              },
            ),
            FxSettingsTile(
              icon: Icons.cleaning_services_outlined,
              title: 'Clear search history',
              onTap: () {
                Navigator.of(ctx).pop();
                showFxSnack(context, 'Search history cleared');
              },
            ),
          ]),
        ],
      ),
    );
  }

  void _activity(BuildContext context) {
    final now = DateTime.now();
    final items = [
      ('This device · Chrome', now.subtract(const Duration(minutes: 2)), true),
      ('Android · Fixora app', now.subtract(const Duration(days: 1, hours: 3)), true),
      ('Unknown device · Colombo', now.subtract(const Duration(days: 9)), false),
    ];
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Login Activity', style: AppText.h1),
          const SizedBox(height: 12),
          for (final it in items)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(it.$3 ? Icons.check_circle_rounded : Icons.block_rounded,
                  color: it.$3 ? AppColors.success : AppColors.danger),
              title: Text(it.$1, style: AppText.label),
              subtitle: Text('${dayMonthYear(it.$2)} · ${time12(it.$2)} · ${it.$3 ? 'Successful' : 'Blocked (wrong OTP)'}',
                  style: AppText.small),
            ),
        ],
      ),
    );
  }

  Future<void> _delete(BuildContext context) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
          title: const Text('Delete account?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('This removes your vehicles, bookings and plans. Type DELETE to confirm.'),
              const SizedBox(height: 12),
              FxInput(controller: ctrl, hint: 'DELETE', onChanged: (_) => setD(() {})),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
            TextButton(
              onPressed: ctrl.text.trim() == 'DELETE' ? () => Navigator.of(ctx).pop(true) : null,
              child: Text('Delete', style: TextStyle(color: AppColors.dangerText)),
            ),
          ],
        ),
      ),
    );
    if (ok == true && context.mounted) {
      AppState.instance.deleteCurrentAccount();
      AppState.instance.resetDemo();
      NavController.tab.value = 0;
      Navigator.of(context).pushAndRemoveUntil(fxRoute(const LoginScreen()), (_) => false);
    }
  }
}

class _ChangePasswordSheet extends StatefulWidget {
  const _ChangePasswordSheet();

  @override
  State<_ChangePasswordSheet> createState() => _ChangePasswordSheetState();
}

class _ChangePasswordSheetState extends State<_ChangePasswordSheet> {
  final _current = TextEditingController();
  final _new = TextEditingController();
  final _confirm = TextEditingController();
  bool _show = false;
  bool _submitted = false;

  @override
  void dispose() {
    _current.dispose();
    _new.dispose();
    _confirm.dispose();
    super.dispose();
  }

  double get _strength {
    final p = _new.text;
    var s = 0.0;
    if (p.length >= 8) s += 0.25;
    if (RegExp(r'[A-Z]').hasMatch(p)) s += 0.25;
    if (RegExp(r'[0-9]').hasMatch(p)) s += 0.25;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(p)) s += 0.25;
    return s;
  }

  @override
  Widget build(BuildContext context) {
    final err1 = _submitted && _current.text.length < 4 ? 'Enter your current password' : null;
    final err2 = _submitted && _strength < 0.75 ? 'Use 8+ characters with a capital letter and a number' : null;
    final err3 = _submitted && _confirm.text != _new.text ? 'Passwords do not match' : null;
    final color = _strength < 0.5 ? AppColors.danger : (_strength < 1 ? AppColors.warning : AppColors.success);
    final eye = IconButton(
      icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppColors.textMuted),
      onPressed: () => setState(() => _show = !_show),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Change Password', style: AppText.h1),
        const FxLabel('Current password'),
        FxInput(controller: _current, hint: '••••••••', icon: Icons.lock_outline_rounded, obscure: !_show, errorText: err1, suffix: eye),
        const FxLabel('New password'),
        FxInput(
          controller: _new,
          hint: 'At least 8 characters',
          icon: Icons.lock_reset_rounded,
          obscure: !_show,
          errorText: err2,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        FxProgressBar(value: _strength, color: color, height: 6),
        const FxLabel('Confirm new password'),
        FxInput(controller: _confirm, hint: 'Repeat new password', icon: Icons.lock_outline_rounded, obscure: !_show, errorText: err3),
        const SizedBox(height: 18),
        PrimaryButton(
          label: 'Update Password',
          icon: Icons.check_rounded,
          onPressed: () {
            setState(() => _submitted = true);
            final ok = _current.text.length >= 4 && _strength >= 0.75 && _confirm.text == _new.text;
            if (!ok) return;
            Navigator.of(context).pop();
            showFxSnack(context, 'Password updated');
          },
        ),
      ],
    );
  }
}

class _TwoFactorSheet extends StatefulWidget {
  const _TwoFactorSheet();

  @override
  State<_TwoFactorSheet> createState() => _TwoFactorSheetState();
}

class _TwoFactorSheetState extends State<_TwoFactorSheet> {
  final _code = TextEditingController();
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Two-Factor Authentication', style: AppText.h1),
        const SizedBox(height: 6),
        Text('We will send a 6-digit code to ${app.profile.phone} each time you sign in on a new device.',
            style: AppText.muted),
        const SizedBox(height: 14),
        if (_sent) ...[
          FxInput(
            controller: _code,
            hint: 'Enter code (demo: 123456)',
            icon: Icons.sms_outlined,
            keyboardType: TextInputType.number,
            errorText: _error,
          ),
          const SizedBox(height: 14),
        ],
        PrimaryButton(
          label: _sent ? 'Verify & Turn On' : 'Send Code',
          icon: _sent ? Icons.verified_user_outlined : Icons.send_rounded,
          onPressed: () {
            if (!_sent) {
              setState(() => _sent = true);
              return;
            }
            if (_code.text.trim() != '123456') {
              setState(() => _error = 'Wrong code. Try 123456');
              return;
            }
            app.update(() => app.twoFactor = true);
            Navigator.of(context).pop();
            showFxSnack(context, 'Two-factor authentication is ON');
          },
        ),
      ],
    );
  }
}

class _SessionsSheet extends StatefulWidget {
  const _SessionsSheet();

  @override
  State<_SessionsSheet> createState() => _SessionsSheetState();
}

class _SessionsSheetState extends State<_SessionsSheet> {
  final _sessions = [
    ('This device', 'Chrome · Kandy · now', true),
    ('Samsung Galaxy A54', 'Fixora app · Kandy · yesterday', false),
    ('iPad', 'Fixora app · Colombo · 12 days ago', false),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Active Sessions', style: AppText.h1),
        const SizedBox(height: 10),
        for (final s in List.of(_sessions))
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(s.$3 ? Icons.laptop_mac_rounded : Icons.smartphone_rounded, color: AppColors.link),
            title: Text(s.$1, style: AppText.label),
            subtitle: Text(s.$2, style: AppText.small),
            trailing: s.$3
                ? const ValueChip('Current', color: AppColors.success)
                : TextButton(
                    onPressed: () {
                      setState(() => _sessions.remove(s));
                      showFxSnack(context, '${s.$1} signed out');
                    },
                    child: Text('Sign out', style: TextStyle(color: AppColors.dangerText)),
                  ),
          ),
      ],
    );
  }
}
