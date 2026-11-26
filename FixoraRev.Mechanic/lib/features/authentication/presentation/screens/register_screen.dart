import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/app_text_field.dart' show PasswordRules;
import '../../../../core/widgets/buttons.dart' show GoogleGlyph;
import '../../../../core/widgets/common.dart';
import '../../../auth/domain/auth_entities.dart';
import '../../../auth/presentation/screens/status_screens.dart';
import '../../../auth/presentation/widgets/google_account_sheet.dart';
import '../../../shell/presentation/main_shell.dart';
import 'otp_verification_screen.dart';

/// Create a mechanic account (email / phone + password), then verify the
/// email with a 6-digit OTP. The garage is joined at login with the
/// invitation code from the workshop manager.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _pwCtrl = TextEditingController();
  final _pw2Ctrl = TextEditingController();

  static const _skills = ['General', 'Engine', 'Electrical', 'Brakes', 'Hybrid / EV', 'A/C', 'Body & paint', 'Tyres'];
  final Set<String> _selectedSkills = {'General'};
  Map<AuthField, String> _errors = {};
  bool _hidePw = true;
  bool _agree = false;
  bool _loading = false;

  @override
  void dispose() {
    for (final c in [_nameCtrl, _phoneCtrl, _emailCtrl, _pwCtrl, _pw2Ctrl]) {
      c.dispose();
    }
    super.dispose();
  }

  void _clear(AuthField f) {
    if (_errors.containsKey(f)) setState(() => _errors = Map.of(_errors)..remove(f));
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    final name = _nameCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    final phone = _phoneCtrl.text.trim();
    final pw = _pwCtrl.text;

    final errors = <AuthField, String>{};
    if (name.isEmpty) {
      errors[AuthField.fullName] = 'Name required';
    } else if (name.length < 3) {
      errors[AuthField.fullName] = 'Enter your full name';
    }
    if (phone.isEmpty) {
      errors[AuthField.phone] = 'Phone number required';
    } else if (!Validators.isSriLankanMobile(phone)) {
      errors[AuthField.phone] = 'Incorrect phone number';
    }
    if (email.isEmpty) {
      errors[AuthField.email] = 'Email required';
    } else if (!Validators.isEmail(email)) {
      errors[AuthField.email] = 'Incorrect email';
    }
    if (pw.isEmpty) {
      errors[AuthField.password] = 'Password required';
    } else if (!Validators.isStrongPassword(pw)) {
      errors[AuthField.password] = 'Password does not meet all the rules';
    }
    if (_pw2Ctrl.text.isEmpty) {
      errors[AuthField.confirmPassword] = 'Confirm password required';
    } else if (_pw2Ctrl.text != pw) {
      errors[AuthField.confirmPassword] = 'Passwords do not match';
    }
    setState(() => _errors = errors);
    if (errors.isNotEmpty) return;
    if (!_agree) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please accept the workshop terms to continue')),
      );
      return;
    }

    setState(() => _loading = true);
    try {
      await AppServices.auth.register(
        fullName: name,
        email: email,
        phone: '+94 ${phone.replaceFirst(RegExp(r'^0'), '')}',
        password: pw,
      );
      if (!mounted) return;
      context.pushRoute(
        RouteNames.otpVerification,
        extra: OtpArgs(email: email, purpose: OtpPurpose.register),
      );
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _errors = e.errors);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _google() async {
    final account = await showGoogleAccountSheet(context);
    if (account == null || !mounted) return;
    final nav = Navigator.of(context);
    nav.push(MaterialPageRoute<void>(
      builder: (_) => const LoadingScreen(title: 'Signing you in…', subtitle: 'Please wait'),
    ));
    final result = await AppServices.auth.signInWithGoogle(account);
    if (!mounted) return;
    // New Google accounts join the demo garage automatically — no invite code.
    if (result.needsGarageLink) {
      await AppServices.auth.linkGoogleAccount(result.account, 'FXR2048');
      if (!mounted) return;
    }
    context.resetTo(const MainShell());
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 8),
        child: Text(text, style: AppText.label),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(backgroundColor: AppColors.surface, title: const Text('Create account')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          children: [
            Text('Create your mechanic account. After Google or email sign-up you go straight into your garage.',
                style: AppText.body.copyWith(color: AppColors.muted)),
            _label('Full name'),
            TextField(
              controller: _nameCtrl,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              onChanged: (_) => _clear(AuthField.fullName),
              decoration: InputDecoration(
                hintText: 'Enter your name',
                prefixIcon: Icon(Icons.person_outline_rounded, color: AppColors.muted),
                errorText: _errors[AuthField.fullName],
              ),
            ),
            _label('Mobile number'),
            TextField(
              controller: _phoneCtrl,
              keyboardType: TextInputType.phone,
              textInputAction: TextInputAction.next,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')),
                LengthLimitingTextInputFormatter(13),
              ],
              onChanged: (_) => _clear(AuthField.phone),
              decoration: InputDecoration(
                hintText: 'Enter your mobile number',
                prefixIcon: Icon(Icons.phone_outlined, color: AppColors.muted),
                prefixText: '+94  ',
                errorText: _errors[AuthField.phone],
              ),
            ),
            _label('Email'),
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              textInputAction: TextInputAction.next,
              onChanged: (_) => _clear(AuthField.email),
              decoration: InputDecoration(
                hintText: 'Enter your email',
                prefixIcon: Icon(Icons.mail_outline_rounded, color: AppColors.muted),
                errorText: _errors[AuthField.email],
                helperText: 'We\'ll send a 6-digit code here to verify it.',
              ),
            ),
            _label('Your skills'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in _skills)
                  FilterChip(
                    label: Text(s),
                    selected: _selectedSkills.contains(s),
                    onSelected: (on) => setState(() => on ? _selectedSkills.add(s) : _selectedSkills.remove(s)),
                    checkmarkColor: AppColors.primaryStrong,
                    labelStyle: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: _selectedSkills.contains(s) ? AppColors.primaryStrong : AppColors.body,
                    ),
                    backgroundColor: AppColors.surface,
                    selectedColor: AppColors.primarySoft,
                    side: BorderSide(color: _selectedSkills.contains(s) ? AppColors.primaryBorder : AppColors.border),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
                  ),
              ],
            ),
            _label('Password'),
            TextField(
              controller: _pwCtrl,
              obscureText: _hidePw,
              textInputAction: TextInputAction.next,
              onChanged: (_) {
                _clear(AuthField.password);
                setState(() {});
              },
              decoration: InputDecoration(
                hintText: 'Enter your password',
                prefixIcon: Icon(Icons.lock_outline_rounded, color: AppColors.muted),
                errorText: _errors[AuthField.password],
                suffixIcon: IconButton(
                  tooltip: _hidePw ? 'Show password' : 'Hide password',
                  onPressed: () => setState(() => _hidePw = !_hidePw),
                  icon: Icon(_hidePw ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: AppColors.muted),
                ),
              ),
            ),
            if (_pwCtrl.text.isNotEmpty) ...[
              const SizedBox(height: 10),
              PasswordRules(password: _pwCtrl.text),
            ],
            _label('Confirm password'),
            TextField(
              controller: _pw2Ctrl,
              obscureText: _hidePw,
              onChanged: (_) => _clear(AuthField.confirmPassword),
              onSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                hintText: 'Enter your password again',
                prefixIcon: Icon(Icons.lock_reset_rounded, color: AppColors.muted),
                errorText: _errors[AuthField.confirmPassword],
              ),
            ),
            const SizedBox(height: 14),
            CheckboxListTile(
              value: _agree,
              onChanged: (v) => setState(() => _agree = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: AppColors.primaryStrong,
              title: Text('I agree to the workshop terms and data policy', style: AppText.body.copyWith(color: AppColors.ink)),
            ),
            const SizedBox(height: 10),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.muted)),
                        SizedBox(width: 10),
                        Text('Creating account…'),
                      ],
                    )
                  : const Text('Create account'),
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _loading ? null : _google,
              icon: const GoogleGlyph(),
              label: const Text('Continue with Google'),
            ),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Already have an account?', style: AppText.body.copyWith(color: AppColors.muted)),
                TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Sign in')),
              ],
            ),
            const SizedBox(height: 4),
            const InfoBanner(
              text: 'Your manager approves new mechanic accounts before you get jobs.',
              icon: Icons.verified_user_outlined,
            ),
          ],
        ),
      ),
    );
  }
}
