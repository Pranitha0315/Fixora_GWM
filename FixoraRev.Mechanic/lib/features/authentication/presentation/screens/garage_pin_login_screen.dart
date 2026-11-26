import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/utils/nav.dart';
import '../../../auth/presentation/screens/status_screens.dart';
import '../../../shell/presentation/main_shell.dart';

/// Sign in to the garage's Fixora backend with the employee code and the 4-digit PIN
/// set by the manager's invitation (BR-SF-17). Jobs, approvals and alerts then arrive live.
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
      if (!mounted) return;
      context.resetTo(const LoadingScreen(title: 'Signing you in…', subtitle: 'Loading your jobs', next: MainShell()));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.isNetwork
          ? 'Cannot reach the garage server. Check your connection and try again.'
          : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Garage PIN sign-in')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            Text('Sign in to your garage', style: AppText.title),
            const SizedBox(height: 6),
            Text('Use the employee code and PIN from your workshop manager. Your jobs, approvals and SOS alerts load live.',
                style: AppText.body),
            const SizedBox(height: 20),
            Text('Employee code or phone', style: AppText.label),
            const SizedBox(height: 6),
            TextField(
              controller: _code,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(hintText: 'Employee code'),
            ),
            const SizedBox(height: 14),
            Text('PIN', style: AppText.label),
            const SizedBox(height: 6),
            TextField(
              controller: _pin,
              obscureText: true,
              keyboardType: TextInputType.number,
              maxLength: 4,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(hintText: '4 digits', counterText: ''),
              onSubmitted: (_) => _signIn(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: AppText.caption.copyWith(color: AppColors.danger)),
            ],
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _loading ? null : _signIn,
              child: Text(_loading ? 'Signing in…' : 'Sign in'),
            ),
          ],
        ),
      ),
    );
  }
}
