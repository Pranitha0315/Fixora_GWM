import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/backend/fixora_config.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/widgets/warm_ui.dart';
import '../../../../core/utils/nav.dart';
import '../../../auth/domain/auth_entities.dart';
import '../../../auth/presentation/screens/status_screens.dart';
import '../../../authentication/presentation/screens/login_screen.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../data/quick_login_store.dart';
import '../widgets/pin_pad.dart';

/// Opens instead of the full login when quick login is set up on this phone:
/// 4-digit Mechanic PIN.
class QuickLoginScreen extends StatefulWidget {
  const QuickLoginScreen({super.key});

  @override
  State<QuickLoginScreen> createState() => _QuickLoginScreenState();
}

class _QuickLoginScreenState extends State<QuickLoginScreen> {
  final _store = QuickLoginStore.instance;
  String _pin = '';
  bool _error = false;
  bool _busy = false;

  String get _maskedEmail {
    final e = _store.email ?? '';
    final at = e.indexOf('@');
    if (at <= 2) return e;
    return '${e.substring(0, 2)}•••${e.substring(at)}';
  }

  Future<void> _signIn() async {
    setState(() => _busy = true);
    try {
      // Garage account: the saved session is refreshed with the server.
      if (await MechanicBackend.instance.resume()) {
        if (!mounted) return;
        context.resetTo(const LoadingScreen(title: 'Signing you in…', subtitle: 'Loading your jobs', next: MainShell()));
        return;
      }
      if ((_store.email ?? '').endsWith('@garage')) {
        // Garage account but no server: stay here instead of opening demo data.
        if (!mounted) return;
        setState(() {
          _busy = false;
          _pin = '';
        });
        context.toast("Can't reach the garage server at ${FixoraConfig.apiBase}. Start it and try again.",
            icon: Icons.cloud_off_rounded);
        return;
      }
      await AppServices.auth.restoreSession(_store.email ?? '');
      if (!mounted) return;
      context.resetTo(const LoadingScreen(title: 'Signing you in…', subtitle: 'Please wait', next: MainShell()));
    } on AuthFailure {
      await _store.disable();
      if (!mounted) return;
      context.toast('Please sign in with your password again.', icon: Icons.info_outline_rounded);
      context.resetTo(const LoginScreen());
    }
  }

  void _digit(String d) {
    if (_busy || _pin.length >= QuickLoginStore.pinLength) return;
    setState(() {
      _error = false;
      _pin += d;
    });
    if (_pin.length == QuickLoginStore.pinLength) _check();
  }

  void _back() {
    if (_pin.isEmpty || _busy) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  Future<void> _check() async {
    final email = _store.email ?? '';
    final result = await _store.verify(_pin);
    if (!mounted) return;
    switch (result) {
      case PinCheck.ok:
        _signIn();
      case PinCheck.wrong:
        setState(() {
          _error = true;
          _pin = '';
        });
      case PinCheck.locked:
        context.toast('Too many wrong PINs. Quick login is off – sign in with your password.',
            icon: Icons.lock_outline_rounded);
        context.resetTo(LoginScreen(initialEmail: email));
    }
  }

  Future<void> _switchAccount() async {
    await _store.disable();
    if (mounted) context.resetTo(const LoginScreen());
  }

  @override
  Widget build(BuildContext context) {
    final photo = AppServices.profilePhoto.bytes;
    final left = _store.attemptsLeft;

    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 12),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight - 40),
              child: Column(
                children: [
                  const FixoraRevWordmark(size: 18),
                  const SizedBox(height: 22),
                  Container(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.surface, width: 4),
                      boxShadow: AppColors.cardShadow,
                    ),
                    child: CircleAvatar(
                      radius: 46,
                      backgroundColor: AppColors.primarySoft,
                      backgroundImage: photo != null
                          ? MemoryImage(photo)
                          : const AssetImage('assets/images/mechanic_avatar.jpg') as ImageProvider,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text('Welcome back', style: AppText.body),
                  Text(_store.name ?? 'Mechanic', style: AppText.display, textAlign: TextAlign.center),
                  const SizedBox(height: 2),
                  Text(_maskedEmail, style: AppText.caption),
                  const SizedBox(height: 22),
                  PinDots(length: QuickLoginStore.pinLength, filled: _pin.length, error: _error),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 22,
                    child: _error
                        ? Text('Wrong PIN · $left ${left == 1 ? 'try' : 'tries'} left',
                            style: AppText.label.copyWith(color: AppColors.danger))
                        : Text(_busy ? 'Signing in…' : 'Enter your 4-digit PIN', style: AppText.label),
                  ),
                  const SizedBox(height: 14),
                  PinPad(onDigit: _digit, onBackspace: _back),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: () => context.push(LoginScreen(initialEmail: _store.email ?? '')),
                        child: const Text('Use password'),
                      ),
                      TextButton(
                        onPressed: _switchAccount,
                        child: const Text('Use another account'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
