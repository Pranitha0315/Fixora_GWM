import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/common.dart';
import '../../../auth/domain/auth_entities.dart';
import '../../../auth/presentation/screens/status_screens.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../../../core/di/app_services.dart';
import '../../../quick_login/data/quick_login_store.dart';
import '../../../quick_login/presentation/screens/quick_login_setup_screen.dart';
enum OtpPurpose { register, login }

class OtpArgs {
  const OtpArgs({required this.email, this.purpose = OtpPurpose.register});
  final String email;
  final OtpPurpose purpose;
}

/// 6-digit email OTP with resend countdown.
/// Register → "Account created" · Login → "Signing you in…" → Home.
class OtpVerificationScreen extends StatefulWidget {
  const OtpVerificationScreen({super.key, required this.args});
  final OtpArgs args;

  String get email => args.email;

  @override
  State<OtpVerificationScreen> createState() => _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends State<OtpVerificationScreen> {
  static const _length = 6;
  final _ctrls = List.generate(_length, (_) => TextEditingController());
  final _nodes = List.generate(_length, (_) => FocusNode());

  Timer? _timer;
  int _resendIn = 45;
  bool _verifying = false;
  bool _verified = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _resendIn = 45);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_resendIn <= 1) t.cancel();
      setState(() => _resendIn--);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _ctrls) {
      c.dispose();
    }
    for (final n in _nodes) {
      n.dispose();
    }
    super.dispose();
  }

  String get _code => _ctrls.map((c) => c.text).join();

  void _onChanged(int i, String v) {
    setState(() => _error = null);
    if (v.length > 1) {
      // Pasted full code
      final digits = v.replaceAll(RegExp(r'\D'), '');
      for (var k = 0; k < _length; k++) {
        _ctrls[k].text = k < digits.length ? digits[k] : '';
      }
      final last = digits.isEmpty ? 0 : (digits.length > _length ? _length - 1 : digits.length - 1);
      _nodes[last].requestFocus();
    } else if (v.isNotEmpty && i < _length - 1) {
      _nodes[i + 1].requestFocus();
    } else if (v.isEmpty && i > 0) {
      _nodes[i - 1].requestFocus();
    }
    if (_code.length == _length) _verify();
  }

  Future<void> _verify() async {
    if (_code.length < _length) {
      setState(() => _error = 'Enter all 6 digits');
      return;
    }
    setState(() => _verifying = true);
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    // Demo rule: 000000 is treated as wrong to show the error state.
    if (_code == '000000') {
      setState(() {
        _verifying = false;
        _error = 'That code is not right. Check the latest email.';
      });
      return;
    }
    if (widget.args.purpose == OtpPurpose.login) {
      await _goToGarage();
      return;
    }
    // Email verified: sign the new account in so the mechanic goes straight into the garage
    // (the login page only takes the garage PIN, so the new email/password account can't use it).
    try {
      await AppServices.auth.restoreSession(widget.email.trim().toLowerCase());
    } on AuthFailure {
      if (mounted) {
        setState(() {
          _verifying = false;
          _error = 'Could not sign you in. Try again.';
        });
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      _verifying = false;
      _verified = true;
    });
  }

  /// Opens the garage: first time on this phone → set the quick-login PIN, otherwise → Home.
  Future<void> _goToGarage() async {
    final email = widget.email.trim().toLowerCase();
    final store = QuickLoginStore.instance;
    await store.load();
    if (!mounted) return;
    final needsSetup = !store.enabled || store.email != email;
    context.resetTo(LoadingScreen(
      title: 'Signing you in…',
      subtitle: 'Please wait',
      next: needsSetup
          ? QuickLoginSetupScreen(
              email: email,
              name: AppServices.auth.user?.fullName ?? 'Mechanic',
            )
          : const MainShell(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    if (_verified) return _SuccessView(email: widget.email, onContinue: () => _goToGarage());

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(backgroundColor: AppColors.surface, title: const Text('Verify email')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          children: [
            const IconBox(icon: Icons.mark_email_unread_outlined, size: 60),
            const SizedBox(height: 20),
            Text('Check your email', style: AppText.title),
            const SizedBox(height: 6),
            Text.rich(
              TextSpan(
                style: AppText.body.copyWith(color: AppColors.muted),
                children: [
                  const TextSpan(text: 'We sent a 6-digit code to '),
                  TextSpan(
                    text: widget.email.isEmpty ? 'your email' : widget.email,
                    style: TextStyle(color: AppColors.ink, fontWeight: FontWeight.w700),
                  ),
                  const TextSpan(text: '. It expires in 10 minutes.'),
                ],
              ),
            ),
            const SizedBox(height: 28),
            Row(
              children: [
                for (var i = 0; i < _length; i++) ...[
                  Expanded(
                    child: SizedBox(
                      height: 60,
                      child: TextField(
                        controller: _ctrls[i],
                        focusNode: _nodes[i],
                        autofocus: i == 0,
                        textAlign: TextAlign.center,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                        style: AppText.title.copyWith(fontSize: 24),
                        onChanged: (v) => _onChanged(i, v),
                        decoration: InputDecoration(
                          counterText: '',
                          contentPadding: EdgeInsets.zero,
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(14),
                            borderSide: BorderSide(
                              color: _error != null ? AppColors.dangerBright : AppColors.border,
                              width: _error != null ? 1.5 : 1,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  if (i < _length - 1) const SizedBox(width: 8),
                ],
              ],
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(
                  children: [
                    Icon(Icons.error_outline_rounded, size: 18, color: AppColors.danger),
                    const SizedBox(width: 6),
                    Expanded(child: Text(_error!, style: AppText.label.copyWith(color: AppColors.danger))),
                  ],
                ),
              ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _verifying ? null : _verify,
              child: _verifying
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.muted),
                    )
                  : const Text('Verify'),
            ),
            const SizedBox(height: 12),
            Center(
              child: _resendIn > 0
                  ? Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Text('Resend code in 0:${_resendIn.toString().padLeft(2, '0')}',
                          style: AppText.caption.copyWith(color: AppColors.body)),
                    )
                  : TextButton(
                      onPressed: () {
                        _startTimer();
                        ScaffoldMessenger.of(context)
                            .showSnackBar(const SnackBar(content: Text('New code sent')));
                      },
                      child: const Text('Resend code'),
                    ),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Wrong email? Go back'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.email, required this.onContinue});
  final String email;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 112,
                height: 112,
                decoration: BoxDecoration(color: AppColors.successSoft, shape: BoxShape.circle),
                child: Icon(Icons.check_rounded, size: 60, color: AppColors.success),
              ),
              const SizedBox(height: 24),
              Text('Account created', style: AppText.display, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                'Your email is verified. You can start now. Your workshop manager approves new accounts before jobs are assigned.',
                style: AppText.body.copyWith(color: AppColors.muted),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Icon(Icons.hourglass_top_rounded, color: AppColors.warning),
                    SizedBox(width: 12),
                    Expanded(child: Text('Status: Waiting for manager approval', style: AppText.bodyStrong)),
                  ],
                ),
              ),
              const Spacer(),
              FilledButton(
                onPressed: onContinue,
                child: const Text('Continue to my garage'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
