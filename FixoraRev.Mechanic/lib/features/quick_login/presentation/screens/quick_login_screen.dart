import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/nav.dart';
import '../../../auth/presentation/screens/loading_screen.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../data/quick_login_store.dart';
import '../widgets/pin_pad.dart';

class QuickLoginScreen extends StatefulWidget {
  const QuickLoginScreen({super.key});

  @override
  State<QuickLoginScreen> createState() => _QuickLoginScreenState();
}

class _QuickLoginScreenState extends State<QuickLoginScreen>
    with SingleTickerProviderStateMixin {
  final _store = AppServices.quickLogin;
  String _pin = '';
  bool _error = false;
  bool _busy = false;
  late final AnimationController _shake;

  @override
  void initState() {
    super.initState();
    _shake = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 420),
    );
  }

  @override
  void dispose() {
    _shake.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    setState(() => _busy = true);
    final ok = await MechanicBackend.instance.resume();
    if (!mounted) return;
    if (!ok) {
      setState(() => _busy = false);
      context.toast(
        'Session expired. Sign in with your employee ID and PIN.',
        icon: Icons.lock_outline_rounded,
      );
      context.go(
        RouteNames.login,
        extra: _store.email ?? _store.login,
      );
      return;
    }
    final login = _store.login ?? _store.email ?? 'session';
    if (!AppServices.auth.isLoggedIn) {
      await AppServices.auth.signInRemote(login: login);
    }
    if (!mounted) return;
    context.go(
      RouteNames.loading,
      extra: const LoadingScreen(
        title: 'Welcome back',
        subtitle: 'Opening your board',
        next: MainShell(),
      ),
    );
  }

  Future<void> _check() async {
    if (_busy || _pin.length != 4) return;
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
        _shake.forward(from: 0);
        final left = QuickLoginStore.maxAttempts - _store.failed;
        context.toast(
          left > 0 ? 'Wrong PIN. $left tries left.' : 'Wrong PIN.',
          icon: Icons.error_outline_rounded,
        );
      case PinCheck.locked:
        context.toast(
          'Too many wrong PINs. Quick login is off – sign in with your password.',
          icon: Icons.lock_outline_rounded,
        );
        context.go(RouteNames.login, extra: email);
    }
  }

  void _onDigit(String d) {
    if (_busy || _pin.length >= 4) return;
    setState(() {
      _error = false;
      _pin = '$_pin$d';
    });
    if (_pin.length == 4) _check();
  }

  void _onBackspace() {
    if (_busy || _pin.isEmpty) return;
    setState(() {
      _error = false;
      _pin = _pin.substring(0, _pin.length - 1);
    });
  }

  @override
  Widget build(BuildContext context) {
    final label = _store.name ?? _store.login ?? _store.email ?? 'Mechanic';
    return Scaffold(
      backgroundColor: BronzeColors.charcoal,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () => context.go(
                    RouteNames.login,
                    extra: _store.email ?? _store.login,
                  ),
                  child: const Text('Use full login'),
                ),
              ),
              const Spacer(),
              const CircleAvatar(
                radius: 36,
                backgroundColor: BronzeColors.surfaceElevated,
                child: Icon(Icons.person, color: BronzeColors.bronze, size: 36),
              ),
              const SizedBox(height: 16),
              Text('Hi, $label', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                'Enter your quick PIN',
                style: TextStyle(color: BronzeColors.creamMuted),
              ),
              const SizedBox(height: 28),
              AnimatedBuilder(
                animation: _shake,
                builder: (context, child) {
                  final t = Curves.elasticIn.transform(_shake.value);
                  final dx = (1 - t) *
                      10 *
                      ((_shake.value * 4).floor().isEven ? 1 : -1);
                  return Transform.translate(
                    offset: Offset(_error ? dx : 0, 0),
                    child: child,
                  );
                },
                child: PinDots(length: _pin.length, error: _error),
              ),
              if (_busy) ...[
                const SizedBox(height: 20),
                const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: BronzeColors.bronze,
                  ),
                ),
              ],
              const Spacer(),
              PinPad(onDigit: _onDigit, onBackspace: _onBackspace),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}
