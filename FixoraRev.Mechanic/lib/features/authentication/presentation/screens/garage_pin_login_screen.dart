import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../../app/theme/bronze_inputs.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../auth/presentation/screens/loading_screen.dart';
import '../../../auth/presentation/widgets/auth_scaffold.dart';
import '../../../shell/presentation/main_shell.dart';

/// Garage PIN — employee code + 4-digit PIN.
class GaragePinLoginScreen extends StatefulWidget {
  const GaragePinLoginScreen({super.key});

  @override
  State<GaragePinLoginScreen> createState() => _GaragePinLoginScreenState();
}

class _GaragePinLoginScreenState extends State<GaragePinLoginScreen> {
  final _code = TextEditingController();
  final _pin = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    FocusScope.of(context).unfocus();
    final code = _code.text.trim();
    final pin = _pin.text.trim();
    if (code.isEmpty || pin.length != 4) {
      setState(() => _error = 'Enter your employee code and 4-digit PIN');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await MechanicBackend.instance.pinLogin(code, pin);
      await AppServices.auth.signInRemote(login: code);
      if (!mounted) return;
      context.go(
        RouteNames.loading,
        extra: const LoadingScreen(
          title: 'Signing you in…',
          subtitle: 'Loading your jobs',
          next: MainShell(),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.isNetwork
            ? 'Cannot reach the garage server. Check your connection and try again.'
            : e.message,
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(RouteNames.login),
      title: 'Garage PIN',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 12),
          Text(
            'Sign in with garage PIN',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          const Text(
            'Use your employee code and the 4-digit PIN from your garage.',
            style: TextStyle(color: BronzeColors.creamMuted),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _code,
            textInputAction: TextInputAction.next,
            decoration: BronzeInputs.decoration(
              labelText: 'Employee code',
              hintText: 'EMP-001',
              prefixIcon: const Icon(Icons.badge_outlined),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _pin,
            obscureText: true,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _signIn(),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            decoration: BronzeInputs.decoration(
              labelText: 'PIN',
              hintText: '••••',
              prefixIcon: const Icon(Icons.pin_outlined),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: BronzeColors.danger)),
          ],
          const Spacer(),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: _loading ? null : _signIn,
            child: _loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.4),
                  )
                : const Text('Sign in'),
          ),
        ],
      ),
    );
  }
}
