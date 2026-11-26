import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../../app/theme/theme_controller.dart';
import '../../../core/di/app_services.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/rev_common.dart' show confirmDialog;
import '../../../core/widgets/common.dart' show StatStrip;
import '../../../core/widgets/rev_ui.dart';
import '../../authentication/presentation/screens/login_screen.dart';
import '../../fixproof/presentation/providers/fixproof_provider.dart';
import '../../jobs/domain/job_entities.dart';
import '../../quick_login/data/quick_login_store.dart';
import '../../quick_login/presentation/screens/quick_login_setup_screen.dart';
import 'more/change_password_screen.dart';
import 'more/devices_screen.dart';
import 'more/help_screen.dart';
import 'more/salary_screen.dart';
import 'more/service_history_screen.dart';

/// Profile tab: photo, stats, account, preferences (appearance, duty,
/// quick login, notifications, Tamil reports), More and log out.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _push = true;
  final _prefsKey = GlobalKey();

  Future<void> _changePhoto() async {
    try {
      final changed = await AppServices.profilePhoto.choosePhoto();
      if (changed && mounted) {
        context.toast('Profile photo updated', icon: Icons.check_circle_outline_rounded);
      }
    } catch (_) {
      if (mounted) {
        context.toast('Could not open your photos. Please try again.', icon: Icons.error_outline_rounded);
      }
    }
  }

  Future<void> _setUpPin() async {
    final user = AppServices.auth.user;
    if (user == null) return;
    await context.push<bool>(QuickLoginSetupScreen(
      email: user.email.trim().toLowerCase(),
      name: user.fullName,
      fromProfile: true,
    ));
  }

  Future<void> _openQuickLogin() async {
    final ql = QuickLoginStore.instance;
    await ql.load();
    if (!mounted) return;
    if (!ql.enabled) {
      await _setUpPin();
      return;
    }
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Quick login', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink)),
              const SizedBox(height: 2),
              Text('Sign in with a 4-digit PIN on this phone', style: TextStyle(color: AppColors.body)),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.password_rounded, color: AppColors.body),
                title: Text('Change PIN', style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.ink)),
                onTap: () {
                  Navigator.pop(ctx);
                  _setUpPin();
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.block_rounded, color: AppColors.danger),
                title: Text('Turn off quick login',
                    style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.danger)),
                onTap: () async {
                  await ql.disable();
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) context.toast('Quick login turned off', icon: Icons.lock_outline_rounded);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _logout() async {
    final ok = await confirmDialog(
      context,
      title: 'Log out?',
      message: 'You will need your password and invitation code to log in again.',
      confirmLabel: 'Log out',
      destructive: true,
    );
    if (!ok) return;
    await AppServices.auth.logout();
    if (mounted) context.resetTo(const LoginScreen());
  }

  void _scrollToPrefs() {
    final ctx = _prefsKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx, duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tamil = ref.watch(reportTamilProvider);
    return ListenableBuilder(
      listenable: Listenable.merge([
        AppServices.auth,
        AppServices.jobs,
        AppServices.profilePhoto,
        QuickLoginStore.instance,
        ThemeController.instance,
      ]),
      builder: (context, _) {
        final user = AppServices.auth.user;
        final jobs = AppServices.jobs.all;
        final doneToday = AppServices.jobs.completedToday;
        final diagnosed = jobs.where((j) => j.diagnosis != null).length;
        final finished = jobs.where((j) => !j.status.isActive).length;
        final onDuty = AppServices.auth.onDuty;
        final ql = QuickLoginStore.instance;
        final photo = AppServices.profilePhoto.bytes;

        return RevTabPage(
          title: '',
          action: IconButton(
            tooltip: 'Settings',
            onPressed: _scrollToPrefs,
            icon: Icon(Icons.settings_outlined, size: 27, color: AppColors.body),
          ),
          children: [
            // Identity
            Row(
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Container(
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.surface, width: 3),
                        boxShadow: [BoxShadow(color: AppColors.shadow, blurRadius: 12, offset: const Offset(0, 4))],
                        image: DecorationImage(
                          fit: BoxFit.cover,
                          image: photo != null
                              ? MemoryImage(photo)
                              : const AssetImage('assets/images/mechanic_avatar.jpg') as ImageProvider,
                        ),
                      ),
                    ),
                    Positioned(
                      right: -10,
                      bottom: -10,
                      child: Semantics(
                        button: true,
                        label: 'Change profile photo',
                        child: Material(
                          color: AppColors.primaryStrong,
                          shape: CircleBorder(side: BorderSide(color: AppColors.surface, width: 2)),
                          child: InkWell(
                            customBorder: const CircleBorder(),
                            onTap: _changePhoto,
                            child: SizedBox(
                              width: 44,
                              height: 44,
                              child: Icon(Icons.photo_camera_rounded, size: 18, color: AppColors.onPrimary),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.fullName ?? 'Mechanic',
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1.15)),
                      const SizedBox(height: 2),
                      Text('Mechanic · ${user?.employeeId ?? '-'}',
                          style: TextStyle(fontSize: 14.5, color: AppColors.body)),
                      const SizedBox(height: 6),
                      RevPill(
                        label: onDuty ? 'On duty' : 'Off duty',
                        tone: onDuty ? RevTone.green : RevTone.grey,
                        icon: Icons.circle,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 18),
            StatStrip(items: [(doneToday.toString().padLeft(2, '0'), 'Jobs today'), (diagnosed.toString().padLeft(2, '0'), 'Diagnoses'), ('4.8', 'Rating')]),

            // Account
            const RevSection('Account'),
            RevCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _KvRow(icon: Icons.mail_outline_rounded, label: 'Email', value: user?.email ?? '-'),
                  _KvRow(
                    icon: Icons.call_outlined,
                    label: 'Phone',
                    value: (user?.phone.isEmpty ?? true) ? '-' : user!.phone,
                  ),
                  _KvRow(
                    icon: Icons.storefront_outlined,
                    label: 'Garage',
                    value: user == null ? '-' : '${user.garageName} · ${user.garageBranch}',
                  ),
                  _KvRow(
                    icon: Icons.badge_outlined,
                    label: 'Skills',
                    value: (user?.skills ?? const <String>[]).join(' · '),
                    last: true,
                  ),
                ],
              ),
            ),

            // Preferences
            RevSection('Preferences', key: _prefsKey),
            RevCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _SwitchRow(
                    icon: ThemeController.instance.mode == ThemeMode.light
                        ? Icons.wb_sunny_outlined
                        : Icons.dark_mode_outlined,
                    title: 'Light Mode',
                    subtitle: ThemeController.instance.mode == ThemeMode.light
                        ? 'Light mood'
                        : 'Dark mood',
                    value: ThemeController.instance.mode == ThemeMode.light,
                    moodStyle: true,
                    onChanged: (on) => ThemeController.instance
                        .setMode(on ? ThemeMode.light : ThemeMode.dark),
                  ),
                  _SwitchRow(
                    icon: Icons.work_outline_rounded,
                    title: 'On duty',
                    subtitle: 'Receive new jobs',
                    value: onDuty,
                    onChanged: AppServices.auth.setOnDuty,
                  ),
                  _NavRow(
                    icon: Icons.pin_outlined,
                    title: 'Quick login (Mechanic PIN)',
                    subtitle: ql.enabled ? 'On · 4-digit PIN' : 'Off · sign in faster on this phone',
                    onTap: _openQuickLogin,
                  ),
                  _SwitchRow(
                    icon: Icons.notifications_none_rounded,
                    title: 'Push notifications',
                    value: _push,
                    onChanged: (v) => setState(() => _push = v),
                  ),
                  _SwitchRow(
                    icon: Icons.translate_rounded,
                    title: 'Reports in Tamil first',
                    subtitle: 'FixProof shows the Tamil draft first',
                    value: tamil,
                    onChanged: (v) => ref.read(reportTamilProvider.notifier).state = v,
                    last: true,
                  ),
                ],
              ),
            ),

            // More
            const RevSection('More'),
            RevCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _NavRow(
                    icon: Icons.payments_outlined,
                    title: 'Salary & payments',
                    subtitle: 'LKR 85,000 · paid for this month',
                    onTap: () => context.push(const SalaryScreen()),
                  ),
                  _NavRow(
                    icon: Icons.history_rounded,
                    title: 'Service history',
                    subtitle: '$finished finished job${finished == 1 ? '' : 's'} today',
                    onTap: () => context.push(const ServiceHistoryScreen()),
                  ),
                  _NavRow(
                    icon: Icons.devices_other_outlined,
                    title: 'Devices',
                    subtitle: 'OBD-II, cameras and signed-in phones',
                    onTap: () => context.push(const DevicesScreen()),
                  ),
                  _NavRow(
                    icon: Icons.help_outline_rounded,
                    title: 'Help & FixProof guide',
                    onTap: () => context.push(const HelpScreen()),
                  ),
                  _NavRow(
                    icon: Icons.lock_outline_rounded,
                    title: 'Change password',
                    onTap: () => context.push(const ChangePasswordScreen()),
                    last: true,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            SizedBox(
              height: 52,
              child: OutlinedButton.icon(
                onPressed: _logout,
                icon: Icon(Icons.logout_rounded, color: AppColors.danger),
                label: Text('Log out',
                    style: TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 15.5)),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(
                    color: AppColors.isDark ? const Color(0xFF7F1D1D) : const Color(0xFFFECACA),
                    width: 1.5,
                  ),
                  backgroundColor: AppColors.surface,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
            const SizedBox(height: 12),
            Center(child: Text('Fixora Rev 1.0.0', style: TextStyle(fontSize: 12.5, color: AppColors.muted))),
            const SizedBox(height: 8),
          ],
        );
      },
    );
  }
}

class _KvRow extends StatelessWidget {
  const _KvRow({required this.icon, required this.label, required this.value, this.last = false});
  final IconData icon;
  final String label;
  final String value;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 11, 14, 11),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 22, color: AppColors.muted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 13, color: AppColors.muted)),
                Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.ink)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.icon,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    this.moodStyle = false,
    this.last = false,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;
  final bool moodStyle;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return MergeSemantics(
      child: InkWell(
        onTap: () => onChanged(!value),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 6, 8, 6),
          constraints: const BoxConstraints(minHeight: 56),
          decoration: BoxDecoration(
            border: last ? null : Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 22, color: AppColors.muted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.ink)),
                    if (subtitle != null)
                      Text(subtitle!, style: TextStyle(fontSize: 13, color: AppColors.muted)),
                  ],
                ),
              ),
              if (moodStyle)
                _MoodToggle(lightOn: value, onChanged: onChanged)
              else
                _GlassToggle(value: value, onChanged: onChanged),
            ],
          ),
        ),
      ),
    );
  }
}

/// Sun / moon pill: light = orange + sun · dark = black + moon. No ON/OFF text.
class _MoodToggle extends StatelessWidget {
  const _MoodToggle({required this.lightOn, required this.onChanged});

  final bool lightOn;
  final ValueChanged<bool> onChanged;

  static const _w = 72.0;
  static const _h = 34.0;
  static const _knob = 28.0;
  static const _pad = 3.0;
  static const _orange = Color(0xFFFF6300);
  static const _dark = Color(0xFF1A1A1A);

  @override
  Widget build(BuildContext context) {
    return Semantics(
      toggled: lightOn,
      label: lightOn ? 'Light mood' : 'Dark mood',
      child: GestureDetector(
        onTap: () => onChanged(!lightOn),
        behavior: HitTestBehavior.opaque,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          width: _w,
          height: _h,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(_h / 2),
            color: lightOn ? _orange : _dark,
            // Orange border only in dark mood.
            border: Border.all(
              color: lightOn ? Colors.transparent : _orange,
              width: 2,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.14),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: Stack(
            children: [
              // Icon sits opposite the knob.
              AnimatedAlign(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                alignment: lightOn ? Alignment.centerLeft : Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Icon(
                    lightOn ? Icons.wb_sunny_outlined : Icons.dark_mode_outlined,
                    size: 16,
                    color: Colors.white,
                  ),
                ),
              ),
              AnimatedAlign(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOutCubic,
                alignment: lightOn ? Alignment.centerRight : Alignment.centerLeft,
                child: const Padding(
                  padding: EdgeInsets.all(_pad),
                  child: _WhiteKnob(size: _knob),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pill toggle with ON/OFF text for duty / notifications / Tamil.
class _GlassToggle extends StatelessWidget {
  const _GlassToggle({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  static const _w = 72.0;
  static const _h = 34.0;
  static const _knob = 28.0;
  static const _pad = 3.0;

  @override
  Widget build(BuildContext context) {
    const orange = Color(0xFFFF6300);

    return Semantics(
      toggled: value,
      child: GestureDetector(
        onTap: () => onChanged(!value),
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: _w,
          height: _h,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(_h / 2),
              color: value ? orange : Colors.white,
              border: Border.all(
                color: value ? orange : const Color(0xFFFFD0B8),
                width: 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.10),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
                if (value)
                  BoxShadow(
                    color: orange.withValues(alpha: 0.28),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
              ],
            ),
            child: Stack(
              children: [
                AnimatedAlign(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  alignment: value ? Alignment.centerLeft : Alignment.centerRight,
                  child: Padding(
                    padding: EdgeInsets.only(
                      left: value ? 10 : 0,
                      right: value ? 0 : 10,
                    ),
                    child: Text(
                      value ? 'ON' : 'OFF',
                      style: TextStyle(
                        color: value ? Colors.white : orange,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ),
                AnimatedAlign(
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOutCubic,
                  alignment: value ? Alignment.centerRight : Alignment.centerLeft,
                  child: const Padding(
                    padding: EdgeInsets.all(_pad),
                    child: _WhiteKnob(size: _knob),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _WhiteKnob extends StatelessWidget {
  const _WhiteKnob({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFFFFFF), Color(0xFFF4F4F4)],
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.9),
            blurRadius: 1,
            offset: const Offset(0, -0.5),
          ),
        ],
      ),
    );
  }
}

class _NavRow extends StatelessWidget {
  const _NavRow({required this.icon, required this.title, required this.onTap, this.subtitle, this.last = false});

  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool last;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
          constraints: const BoxConstraints(minHeight: 56),
          decoration: BoxDecoration(
            border: last ? null : Border(bottom: BorderSide(color: AppColors.border)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 22, color: AppColors.muted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: AppColors.ink)),
                    if (subtitle != null)
                      Text(subtitle!, style: TextStyle(fontSize: 13, color: AppColors.muted)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: AppColors.muted),
            ],
          ),
        ),
      ),
    );
  }
}
