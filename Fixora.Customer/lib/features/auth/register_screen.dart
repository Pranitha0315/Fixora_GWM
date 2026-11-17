import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../../data/repositories/app_state.dart';
import 'auth_widgets.dart';
import 'login_screen.dart';
import 'workshop_hero.dart';

/// Create account: name, email, mobile, password + terms.
/// Field checks reuse shared validators from [auth_widgets.dart].
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  bool _show = false;
  bool _showConfirm = false;
  bool _agree = false;
  bool _loading = false;
  bool _submitted = false;
  bool _google = false;

  /// Set after format checks pass when the email/phone is already registered.
  String? _emailTaken;
  String? _phoneTaken;

  final _slides = SlideshowController(length: kWorkshopPhotos.length);

  @override
  void dispose() {
    _slides.dispose();
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _nameError => _submitted ? validateFullName(_name.text) : null;

  String? get _emailError {
    if (!_submitted) return null;
    return validateEmail(_email.text) ?? _emailTaken;
  }

  String? get _phoneError {
    if (!_submitted) return null;
    return validateMobile(_phone.text) ?? _phoneTaken;
  }

  String? get _passwordError =>
      _submitted ? validatePassword(_password.text, requireStrength: true) : null;

  String? get _confirmError =>
      _submitted ? validateConfirmPassword(_password.text, _confirm.text) : null;

  String? get _agreeError =>
      _submitted && !_agree ? 'Please accept the Terms & Privacy Policy' : null;

  Future<void> _register() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _submitted = true;
      _emailTaken = null;
      _phoneTaken = null;
    });

    if (_nameError != null ||
        _emailError != null ||
        _phoneError != null ||
        _passwordError != null ||
        _confirmError != null ||
        _agreeError != null) {
      return;
    }

    final app = AppState.instance;
    final email = _email.text.trim();
    final phoneDigits = AppState.digitsOf(_phone.text);

    if (app.isEmailTaken(email)) {
      setState(() => _emailTaken = 'An account with this email already exists');
      return;
    }
    if (app.isPhoneTaken(phoneDigits)) {
      setState(() => _phoneTaken = 'An account with this mobile number already exists');
      return;
    }

    setState(() => _loading = true);
    final err = await app.register(
      fullName: _name.text.trim(),
      email: email,
      phone: phoneDigits,
      password: _password.text,
    );
    if (!mounted) return;
    setState(() => _loading = false);

    if (err != null) {
      showFxSnack(context, err, icon: Icons.error_outline_rounded);
      return;
    }

    showFxSnack(context, 'Welcome to Fixora, ${app.firstName}!');
    goToHome(context);
  }

  @override
  Widget build(BuildContext context) {
    final animate = !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    return AuthScaffold(
      slides: _slides,
      hero: WorkshopPhotoCard(controller: _slides, animate: animate, height: 120),
      children: [
        AuthHeroHeading(
          title: 'Join Fixora.',
          subtitle: 'Create an account to book services and track your car.',
        ),
        const SizedBox(height: 16),
        const FxLabel('Full Name'),
        FxInput(
          controller: _name,
          hint: 'Your full name',
          icon: Icons.person_outline_rounded,
          keyboardType: TextInputType.name,
          errorText: _nameError,
          onChanged: (_) => setState(() {}),
        ),
        const FxLabel('Email Address'),
        FxInput(
          controller: _email,
          hint: 'you@example.com',
          icon: Icons.mail_outline_rounded,
          keyboardType: TextInputType.emailAddress,
          errorText: _emailError,
          onChanged: (_) => setState(() => _emailTaken = null),
        ),
        const FxLabel('Mobile Number'),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 54,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.fieldFill,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: AppColors.fieldBorder, width: 1.2),
              ),
              child: Text(
                '🇱🇰 +94',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.navy),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FxInput(
                controller: _phone,
                hint: '77 123 4567',
                icon: Icons.smartphone_rounded,
                keyboardType: TextInputType.phone,
                errorText: _phoneError,
                onChanged: (_) => setState(() => _phoneTaken = null),
              ),
            ),
          ],
        ),
        const FxLabel('Password'),
        FxInput(
          controller: _password,
          hint: 'Create a strong password',
          icon: Icons.lock_outline_rounded,
          obscure: !_show,
          errorText: _passwordError,
          suffix: EyeToggle(visible: _show, onTap: () => setState(() => _show = !_show)),
          onChanged: (_) => setState(() {}),
        ),
        if (_password.text.isNotEmpty) ...[
          const SizedBox(height: 6),
          _PasswordStrengthBar(strength: passwordStrength(_password.text)),
        ],
        const FxLabel('Confirm Password'),
        FxInput(
          controller: _confirm,
          hint: 'Re-enter your password',
          icon: Icons.lock_outline_rounded,
          obscure: !_showConfirm,
          errorText: _confirmError,
          suffix: EyeToggle(
            visible: _showConfirm,
            onTap: () => setState(() => _showConfirm = !_showConfirm),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: Checkbox(
                value: _agree,
                activeColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                onChanged: (v) => setState(() => _agree = v ?? false),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'I agree to the Terms of Service and Privacy Policy',
                style: AppText.label,
              ),
            ),
          ],
        ),
        if (_agreeError != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(_agreeError!, style: AppText.small.copyWith(color: AppColors.danger)),
          ),
        const SizedBox(height: 20),
        PrimaryButton(
          label: 'Create account',
          height: 56,
          fontSize: 17,
          loading: _loading,
          onPressed: _register,
        ),
        const OrDivider(),
        GoogleButton(
          loading: _google,
          onPressed: () => continueWithGoogle(context, (v) => setState(() => _google = v)),
        ),
        const SizedBox(height: 8),
        AuthSwitchLink(
          question: 'Already have an account?',
          action: 'Log in',
          onTap: () => Navigator.of(context).pushReplacement(fxRoute(const LoginScreen())),
        ),
      ],
    );
  }
}

class _PasswordStrengthBar extends StatelessWidget {
  final double strength;
  const _PasswordStrengthBar({required this.strength});

  @override
  Widget build(BuildContext context) {
    final label = strength < 0.5
        ? 'Weak'
        : strength < 0.75
            ? 'Fair'
            : 'Strong';
    final color = strength < 0.5
        ? AppColors.danger
        : strength < 0.75
            ? AppColors.warning
            : AppColors.success;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: strength.clamp(0.0, 1.0),
            minHeight: 6,
            backgroundColor: AppColors.fieldBorder,
            color: color,
          ),
        ),
        const SizedBox(height: 4),
        Text(label, style: AppText.small.copyWith(color: color, fontWeight: FontWeight.w700)),
      ],
    );
  }
}
