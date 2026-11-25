import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../../app/theme/bronze_inputs.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/fixora_config.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../auth/presentation/screens/loading_screen.dart';
import '../../../auth/presentation/widgets/auth_scaffold.dart';
import '../../../shell/presentation/main_shell.dart';

/// Main login (employee ID + PIN).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.initialEmail});

  final String? initialEmail;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController _idCtrl;
  final _secretCtrl = TextEditingController();
  bool _loading = false;
  String? _idError;
  String? _secretError;
  String? _error;

  @override
  void initState() {
    super.initState();
    _idCtrl = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _idCtrl.dispose();
    _secretCtrl.dispose();
    super.dispose();
  }

  Future<void> _afterSignIn() async {
    if (!mounted) return;
    context.go(
      RouteNames.loading,
      extra: const LoadingScreen(
        title: 'Signing you in…',
        subtitle: 'Loading your jobs',
        next: MainShell(),
      ),
    );
  }

  Future<void> _signIn() async {
    FocusScope.of(context).unfocus();
    final id = _idCtrl.text.trim();
    final secret = _secretCtrl.text;
    setState(() {
      _idError = id.isEmpty ? 'Enter your employee ID' : null;
      _secretError = secret.isEmpty ? 'Enter your PIN' : null;
      _error = null;
    });
    if (_idError != null || _secretError != null) return;
    setState(() => _loading = true);
    try {
      await MechanicBackend.instance.pinLogin(id.toUpperCase(), secret.trim());
      await AppServices.auth.signInRemote(login: id.toUpperCase());
      if (!mounted) return;
      await _afterSignIn();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.isNetwork) {
          _error =
              "Can't reach the garage server at ${FixoraConfig.apiBase}. "
              'Start the backend, then try again.';
        } else {
          _error = e.status == 401 || e.status == 400
              ? 'Employee ID or PIN is not right.'
              : e.message;
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Spacer(flex: 2),
          const Icon(
            Icons.build_circle_outlined,
            size: 72,
            color: BronzeColors.bronze,
          ),
          const SizedBox(height: 16),
          Text(
            'Welcome back',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 8),
          const Text(
            'Sign in with your employee ID and garage PIN.',
            textAlign: TextAlign.center,
            style: TextStyle(color: BronzeColors.creamMuted),
          ),
          const SizedBox(height: 28),
          TextField(
            controller: _idCtrl,
            textInputAction: TextInputAction.next,
            decoration: BronzeInputs.decoration(
              labelText: 'Employee ID',
              hintText: 'EMP-001',
              prefixIcon: const Icon(Icons.badge_outlined),
            ).copyWith(errorText: _idError),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _secretCtrl,
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
              prefixIcon: const Icon(Icons.lock_outline),
            ).copyWith(errorText: _secretError),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: BronzeColors.danger)),
          ],
          const SizedBox(height: 24),
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
          const SizedBox(height: 8),
          TextButton(
            style: BronzeButtons.text,
            onPressed: () => context.push(RouteNames.garagePin),
            child: const Text('Garage PIN login'),
          ),
          TextButton(
            style: BronzeButtons.text,
            onPressed: () => context.push(RouteNames.quickLogin),
            child: const Text('Quick login'),
          ),
          TextButton(
            style: BronzeButtons.text,
            onPressed: () => context.push(RouteNames.register),
            child: const Text('Register / invite'),
          ),
          const Spacer(flex: 3),
        ],
      ),
    );
  }
}
