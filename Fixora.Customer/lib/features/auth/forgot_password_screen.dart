import 'package:flutter/material.dart';

import '../../core/core.dart';
import 'auth_widgets.dart';
import 'login_screen.dart';

/// Forgot Password: email or mobile -> OTP -> new password.
class ForgotPasswordScreen extends StatefulWidget {
  final String prefill;
  const ForgotPasswordScreen({super.key, this.prefill = ''});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _id = TextEditingController(text: widget.prefill);
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _id.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    FocusScope.of(context).unfocus();
    final app = AppState.instance;
    final acc = app.findAccount(_id.text.trim());
    if (_id.text.trim().isEmpty) {
      setState(() => _error = 'Enter your email or mobile number');
      return;
    }
    if (acc == null) {
      setState(() => _error = 'We could not find an account with these details');
      return;
    }
    if (acc.google && acc.password.isEmpty) {
      setState(() => _error = 'This account signs in with Google - no password to reset');
      return;
    }
    setState(() {
      _error = null;
      _loading = true;
    });
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    setState(() => _loading = false);
    final target = acc.phone.isNotEmpty ? acc.phone : acc.email;
    final id = acc.email;
    context.push(OtpScreen(
      phone: target,
      title: 'Enter reset code',
      buttonLabel: 'Verify Code',
      onVerified: (ctx) => Navigator.of(ctx).pushReplacement(fxRoute(ResetPasswordScreen(accountId: id))),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      children: [
        const SizedBox(height: 10),
        const Center(child: IconTile(icon: Icons.lock_reset_rounded, size: 76)),
        const SizedBox(height: 18),
        Text('Forgot Password?', textAlign: TextAlign.center, style: AppText.pageTitle),
        const SizedBox(height: 8),
        Text('No worries! Enter your email or mobile number and we will send you a reset code.',
            textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 14.5)),
        const SizedBox(height: 22),
        const FxLabel('Email or Mobile Number'),
        FxInput(
          controller: _id,
          hint: 'you@example.com or 077 123 4567',
          icon: Icons.alternate_email_rounded,
          keyboardType: TextInputType.emailAddress,
          errorText: _error,
          onChanged: (_) => setState(() => _error = null),
        ),
        const SizedBox(height: 22),
        PrimaryButton(label: 'Send Reset Code', icon: Icons.send_rounded, loading: _loading, onPressed: _send),
        const SizedBox(height: 10),
        Center(
          child: TextButton.icon(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.arrow_back_rounded, size: 18),
            label: const Text('Back to Login'),
          ),
        ),
      ],
    );
  }
}

/// Set a new password after the reset code is verified.
class ResetPasswordScreen extends StatefulWidget {
  final String accountId;
  const ResetPasswordScreen({super.key, required this.accountId});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _show = false;
  bool _submitted = false;
  bool _loading = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _passwordError =>
      _submitted && passwordStrength(_password.text) < 0.75 ? 'Use 8+ characters with upper & lower case and a number' : null;
  String? get _confirmError => _submitted && _confirm.text != _password.text ? 'Passwords do not match' : null;

  Future<void> _save() async {
    setState(() => _submitted = true);
    if (_passwordError != null || _confirmError != null) return;
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    AppState.instance.resetPassword(widget.accountId, _password.text);
    AppState.instance.lastEmail = widget.accountId;
    setState(() => _loading = false);
    Navigator.of(context).pushAndRemoveUntil(fxRoute(const _ResetDoneScreen()), (r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      children: [
        const SizedBox(height: 10),
        const Center(child: IconTile(icon: Icons.password_rounded, size: 76)),
        const SizedBox(height: 18),
        Text('Create New Password', textAlign: TextAlign.center, style: AppText.pageTitle),
        const SizedBox(height: 8),
        Text('Your new password must be different from the old one.',
            textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 14.5)),
        const SizedBox(height: 12),
        const FxLabel('New Password'),
        FxInput(
          controller: _password,
          hint: 'Enter new password',
          icon: Icons.lock_outline_rounded,
          obscure: !_show,
          errorText: _passwordError,
          suffix: EyeToggle(visible: _show, onTap: () => setState(() => _show = !_show)),
          onChanged: (_) => setState(() {}),
        ),
        PasswordStrengthBar(password: _password.text),
        const FxLabel('Confirm Password'),
        FxInput(
          controller: _confirm,
          hint: 'Repeat new password',
          icon: Icons.lock_reset_rounded,
          obscure: !_show,
          errorText: _confirmError,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 22),
        PrimaryButton(label: 'Reset Password', icon: Icons.check_rounded, loading: _loading, onPressed: _save),
      ],
    );
  }
}

class _ResetDoneScreen extends StatelessWidget {
  const _ResetDoneScreen();

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: false,
      children: [
        const SizedBox(height: 40),
        const Center(child: SuccessBurst(size: 86)),
        const SizedBox(height: 10),
        Text('Password Changed!', textAlign: TextAlign.center, style: AppText.pageTitle),
        const SizedBox(height: 8),
        Text('You can now login with your new password.',
            textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 15)),
        const SizedBox(height: 28),
        PrimaryButton(
          label: 'Back to Login',
          icon: Icons.login_rounded,
          onPressed: () => Navigator.of(context).pushReplacement(fxRoute(const LoginScreen())),
        ),
      ],
    );
  }
}