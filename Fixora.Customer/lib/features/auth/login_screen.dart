import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/core.dart';
import 'auth_widgets.dart';
import 'forgot_password_screen.dart';
import 'register_screen.dart';
import 'workshop_hero.dart';
import '../../core/backend/api_client.dart';
import '../../core/backend/fixora_config.dart';
import '../../data/remote/customer_backend.dart';

/// Login with Email + Password, or Mobile + OTP, or Google.
/// UI: Pastel Garage – ink-brush shaped workshop photo slideshow on
/// the photo card on a soft sky background, the form in a white sheet.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  int _tab = 0; // 0 email, 1 mobile
  final _email = TextEditingController(text: AppState.instance.lastEmail ?? '');
  final _password = TextEditingController();
  final _phone = TextEditingController();
  bool _show = false;
  bool _loading = false;

  /// The garage server could not be reached; demo data is offered, never chosen silently.
  bool _offline = false;
  bool _google = false;
  bool _submitted = false;
  String? _authError;
  final _slides = SlideshowController(length: kWorkshopPhotos.length);

  @override
  void dispose() {
    _slides.dispose();
    _email.dispose();
    _password.dispose();
    _phone.dispose();
    super.dispose();
  }

  String? get _emailError {
    if (!_submitted || _tab != 0) return null;
    final v = _email.text.trim();
    if (v.isEmpty) return 'Enter your email';
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(v)) return 'Enter a valid email address';
    return null;
  }

  String? get _passwordError {
    if (!_submitted || _tab != 0) return null;
    if (_password.text.isEmpty) return 'Enter your password';
    return _authError;
  }

  String? get _phoneError {
    if (!_submitted || _tab != 1) return null;
    final d = AppState.digitsOf(_phone.text);
    if (d.length != 9) return 'Enter a valid mobile number';
    return _authError;
  }

  /// Explicit choice to continue offline on the bundled demo account.
  Future<void> _useDemo() async {
    final app = AppState.instance;
    final err = app.login('thanu@example.com', 'Fixora@123');
    if (err != null || !mounted) return;
    showFxSnack(context, 'Demo mode: nothing reaches the garage.', icon: Icons.cloud_off_rounded);
    goToHome(context);
  }

  Future<void> _login() async {
    FocusScope.of(context).unfocus();
    setState(() {
      _submitted = true;
      _authError = null;
    });
    final app = AppState.instance;
    if (_tab == 0) {
      if (_emailError != null || _passwordError != null) return;
      setState(() => _loading = true);
      String? err;
      final demoBuild = !CustomerBackend.instance.enabled;
      _offline = false;
      if (demoBuild) {
        await Future<void>.delayed(const Duration(milliseconds: 600));
        err = app.login(_email.text.trim(), _password.text);
      } else {
        try {
          err = await CustomerBackend.instance.login(_email.text.trim(), _password.text);
        } on ApiException {
          _offline = true;
          err = "Can't reach the garage server at ${FixoraConfig.apiBase}. Start the backend on the PC. "
              'On a real phone, run the app with --dart-define=FIXORA_API=http://<PC-IP>:5080.';
        }
      }
      if (!mounted) return;
      setState(() {
        _loading = false;
        _authError = err;
      });
      if (err == null) {
        showFxSnack(context, 'Welcome back, ${app.firstName}!');
        goToHome(context);
      }
    } else {
      if (_phoneError != null) return;
      if (CustomerBackend.instance.enabled) {
        // Mobile OTP sign-in is not on the garage server yet; only email + password connects.
        setState(() => _authError = 'Mobile login is not available yet. Use the Email tab to log in.');
        return;
      }
      if (app.findAccount(_phone.text) == null) {
        setState(() => _authError = 'No account with this number. Create one below.');
        return;
      }
      setState(() => _loading = true);
      await Future<void>.delayed(const Duration(milliseconds: 800));
      if (!mounted) return;
      setState(() => _loading = false);
      final phone = '+94 ${AppState.digitsOf(_phone.text)}';
      context.push(OtpScreen(
        phone: phone,
        onVerified: (ctx) {
          AppState.instance.loginWithPhone(phone);
          goToHome(ctx);
        },
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final animate = !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    return AuthScaffold(
      slides: _slides,
      // Photo slider in an ink-brush shape, no dots / pause icon.
      // Tap the photo to pause. Kept to 150 px so the Log in button is
      // visible without scrolling on most phones.
      hero: WorkshopPhotoCard(controller: _slides, animate: animate, height: 150),
      children: [
        AuthHeroHeading(
          title: 'Your car\u2019s in good hands.',
          subtitle: 'Log in to track your vehicle, approve costs and pay.',
        ),
        const SizedBox(height: 16),
        FxPillTabs(
          labels: const ['Email', 'Mobile'],
          icons: const [Icons.mail_outline_rounded, Icons.smartphone_rounded],
          index: _tab,
          onChanged: (i) => setState(() {
            _tab = i;
            _submitted = false;
            _authError = null;
          }),
        ),
        const SizedBox(height: 6),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: _tab == 0 ? _emailForm() : _phoneForm(),
        ),
        const SizedBox(height: 20),
        PrimaryButton(
          label: _tab == 0 ? 'Log in' : 'Send OTP',
          icon: _tab == 0 ? null : Icons.sms_outlined,
          height: 56,
          fontSize: 17,
          loading: _loading,
          onPressed: _login,
        ),
        if (_offline && _tab == 0)
          TextButton(
            onPressed: _loading ? null : _useDemo,
            child: const Text('Use demo data (bookings and approvals stay on this phone)'),
          ),
        const OrDivider(),
        GoogleButton(
          loading: _google,
          onPressed: () => continueWithGoogle(context, (v) => setState(() => _google = v)),
        ),
        const SizedBox(height: 8),
        AuthSwitchLink(
          question: 'New to Fixora?',
          action: 'Create an account',
          onTap: () => Navigator.of(context).pushReplacement(fxRoute(const RegisterScreen())),
        ),
        const SizedBox(height: 2),
        Text('Garage account: kavitha@fixora.lk  /  Fixora@123',
            textAlign: TextAlign.center, style: AppText.small.copyWith(color: AppColors.link)),
      ],
    );
  }

  Widget _emailForm() {
    return Column(
      key: const ValueKey('email'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FxLabel('Email Address'),
        FxInput(
          controller: _email,
          hint: 'you@example.com',
          icon: Icons.mail_outline_rounded,
          keyboardType: TextInputType.emailAddress,
          errorText: _emailError,
          onChanged: (_) => setState(() => _authError = null),
        ),
        const FxLabel('Password'),
        FxInput(
          controller: _password,
          hint: 'Enter your password',
          icon: Icons.lock_outline_rounded,
          obscure: !_show,
          errorText: _passwordError,
          suffix: EyeToggle(visible: _show, onTap: () => setState(() => _show = !_show)),
          onChanged: (_) => setState(() => _authError = null),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: Checkbox(
                value: AppState.instance.rememberMe,
                activeColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                onChanged: (v) => setState(() => AppState.instance.rememberMe = v ?? false),
              ),
            ),
            const SizedBox(width: 6),
            Text('Remember me', style: AppText.label),
            const Spacer(),
            TextButton(
              onPressed: () => context.push(ForgotPasswordScreen(prefill: _email.text.trim())),
              child: const Text('Forgot Password?', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ],
    );
  }

  Widget _phoneForm() {
    return Column(
      key: const ValueKey('phone'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
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
              child: Text('🇱🇰 +94', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppColors.navy)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FxInput(
                controller: _phone,
                hint: '77 123 4567',
                icon: Icons.smartphone_rounded,
                keyboardType: TextInputType.phone,
                errorText: _phoneError,
                onChanged: (_) => setState(() => _authError = null),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text('We will send a 6-digit code to verify it is you.', style: AppText.small),
      ],
    );
  }
}

/// 6-digit OTP verification, used for login, sign-up and password reset.
class OtpScreen extends StatefulWidget {
  final String phone;
  final String title;
  final String buttonLabel;
  final void Function(BuildContext context) onVerified;

  const OtpScreen({
    super.key,
    required this.phone,
    required this.onVerified,
    this.title = 'Verify your number',
    this.buttonLabel = 'Verify & Continue',
  });

  @override
  State<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends State<OtpScreen> {
  static const _len = 6;
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  bool _loading = false;
  String? _error;
  int _seconds = 30;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focus.requestFocus();
      _startTimer();
    });
  }

  void _startTimer() {
    _timer?.cancel();
    _seconds = 30;
    if (mounted) setState(() {});
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_seconds <= 1) t.cancel();
      setState(() => _seconds = (_seconds - 1).clamp(0, 30).toInt());
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (_loading) return;
    if (_ctrl.text.length < _len) {
      setState(() => _error = 'Enter the 6-digit code');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    if (_ctrl.text != '123456') {
      setState(() {
        _loading = false;
        _error = 'Wrong code. Demo code is 123456';
      });
      return;
    }
    setState(() => _loading = false);
    widget.onVerified(context);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      children: [
        const SizedBox(height: 10),
        const Center(child: IconTile(icon: Icons.sms_outlined, size: 72)),
        const SizedBox(height: 18),
        Text(widget.title, textAlign: TextAlign.center, style: AppText.pageTitle),
        const SizedBox(height: 8),
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'Enter the 6-digit code we sent to\n'),
            TextSpan(text: widget.phone, style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
          ]),
          textAlign: TextAlign.center,
          style: AppText.muted.copyWith(fontSize: 15),
        ),
        const SizedBox(height: 26),
        GestureDetector(
          onTap: () => _focus.requestFocus(),
          child: Stack(
            children: [
              Opacity(
                opacity: 0,
                child: SizedBox(
                  height: 60,
                  child: TextField(
                    controller: _ctrl,
                    focusNode: _focus,
                    keyboardType: TextInputType.number,
                    maxLength: _len,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    onChanged: (v) {
                      setState(() => _error = null);
                      if (v.length == _len) _verify();
                    },
                  ),
                ),
              ),
              IgnorePointer(
                child: Row(
                  children: List.generate(_len, (i) {
                    final text = _ctrl.text;
                    final filled = i < text.length;
                    final active = i == text.length;
                    return Expanded(
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        height: 58,
                        margin: EdgeInsets.only(right: i == _len - 1 ? 0 : 8),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: AppColors.fieldFill,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: _error != null
                                ? AppColors.danger
                                : active
                                    ? AppColors.link
                                    : filled
                                        ? AppColors.link.o(0.5)
                                        : AppColors.fieldBorder,
                            width: active ? 2 : 1.2,
                          ),
                          boxShadow: active ? AppShadows.soft : null,
                        ),
                        child: Text(filled ? text[i] : '',
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.navy)),
                      ),
                    );
                  }),
                ),
              ),
            ],
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(_error!, textAlign: TextAlign.center, style: AppText.small.copyWith(color: AppColors.danger)),
          ),
        const SizedBox(height: 10),
        Row(
          children: [
            Text('Demo code: 123456', style: AppText.small.copyWith(color: AppColors.link)),
            const Spacer(),
            TextButton(
              onPressed: () {
                _ctrl.text = '123456';
                setState(() {});
                _verify();
              },
              child: const Text('Auto-fill'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        PrimaryButton(label: widget.buttonLabel, loading: _loading, onPressed: _verify),
        const SizedBox(height: 14),
        Center(
          child: _seconds > 0
              ? Text("Didn't get it? Resend in 0:${_seconds.toString().padLeft(2, '0')}", style: AppText.muted)
              : TextButton(
                  onPressed: () {
                    _startTimer();
                    showFxSnack(context, 'A new code was sent to ${widget.phone}', icon: Icons.sms_outlined);
                  },
                  child: const Text('Resend code', style: TextStyle(fontWeight: FontWeight.w700)),
                ),
        ),
      ],
    );
  }
}