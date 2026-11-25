import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../shell/main_shell.dart';
import '../vehicles/add_vehicle_screen.dart';
import 'auth_widgets.dart';
import 'login_screen.dart';
import '../../core/backend/api_client.dart';
import '../../data/remote/customer_backend.dart';
import '../../core/backend/fixora_config.dart';

/// Create Account: name, email, mobile, password + OTP verification.
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
  bool _agree = false;
  bool _submitted = false;
  bool _loading = false;
  bool _google = false;
  String? _emailTaken;
  String? _phoneTaken;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  String? get _nameError => _submitted && _name.text.trim().length < 2 ? 'Enter your full name' : null;

  String? get _emailError {
    if (!_submitted) return null;
    if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(_email.text.trim())) return 'Enter a valid email address';
    return _emailTaken;
  }

  String? get _phoneError {
    if (!_submitted) return null;
    if (AppState.digitsOf(_phone.text).length != 9) return 'Enter a valid mobile number';
    return _phoneTaken;
  }

  String? get _passwordError {
    if (!_submitted) return null;
    if (passwordStrength(_password.text) < 0.75) return 'Use 8+ characters with upper & lower case and a number';
    return null;
  }

  String? get _confirmError =>
      _submitted && _confirm.text != _password.text ? 'Passwords do not match' : null;

  Future<void> _create() async {
    FocusScope.of(context).unfocus();
    final app = AppState.instance;
    setState(() {
      _submitted = true;
      final local = !CustomerBackend.instance.enabled; // the server checks duplicates itself
      _emailTaken = local && app.findAccount(_email.text.trim()) != null ? 'An account with this email already exists' : null;
      _phoneTaken = local && app.findAccount(_phone.text) != null ? 'This mobile number is already registered' : null;
    });
    if (_nameError != null || _emailError != null || _phoneError != null || _passwordError != null || _confirmError != null) {
      return;
    }
    if (!_agree) {
      showFxSnack(context, 'Please accept the Terms & Privacy Policy', icon: Icons.info_outline_rounded);
      return;
    }
    setState(() => _loading = true);
    final phone = '+94 ${AppState.digitsOf(_phone.text)}';
    final name = _name.text.trim();
    final email = _email.text.trim();
    final password = _password.text;
    var live = CustomerBackend.instance.enabled;
    String? devCode;
    if (live) {
      try {
        devCode = await CustomerBackend.instance.register(name: name, email: email, phone: phone, password: password);
      } on ApiException catch (e) {
        // Never create a phone-only account in a server build: the garage would never see this customer.
        if (!mounted) return;
        setState(() => _loading = false);
        showFxSnack(
            context,
            e.isNetwork
                ? "Can't reach the garage server at ${FixoraConfig.apiBase}. Start the backend and try again."
                : e.message,
            icon: Icons.error_outline_rounded);
        return;
      }
    } else {
      await Future<void>.delayed(const Duration(milliseconds: 800));
    }
    if (!mounted) return;
    setState(() => _loading = false);
    context.push(OtpScreen(
      phone: phone,
      title: 'Verify your mobile',
      buttonLabel: 'Verify & Create Account',
      onVerified: (ctx) {
        if (live) {
          // Demo build: the server exposes the emailed code (Customer:ExposeDevOtp); production reads it from the user.
          CustomerBackend.instance.verifyOtp(email, devCode ?? '').then((_) {
            if (!ctx.mounted) return;
            Navigator.of(ctx).pushAndRemoveUntil(fxRoute(const AccountCreatedScreen()), (_) => false);
          }, onError: (Object e) {
            if (ctx.mounted) showFxSnack(ctx, e.toString(), icon: Icons.error_outline_rounded);
          });
          return;
        }
        final err = AppState.instance.register(name: name, email: email, phone: phone, password: password);
        if (err != null) {
          showFxSnack(ctx, err, icon: Icons.error_outline_rounded);
          Navigator.of(ctx).pop();
          return;
        }
        Navigator.of(ctx).pushAndRemoveUntil(fxRoute(const AccountCreatedScreen()), (_) => false);
      },
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      children: [
        const AuthHeader(
          title: 'Create Account',
          subtitle: 'Join Fixora to book, track and pay in one place',
          logoWidth: 170,
        ),
        GoogleButton(
          label: 'Sign up with Google',
          loading: _google,
          onPressed: () => continueWithGoogle(context, (v) => setState(() => _google = v)),
        ),
        const OrDivider(text: 'or sign up with email'),
        // Fields sit straight on the white sheet (same as Login).
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const FxLabel('Full Name', required: true),
            FxInput(
              controller: _name,
              hint: 'e.g. Thanu Kumar',
              icon: Icons.person_outline_rounded,
              capitalization: TextCapitalization.words,
              errorText: _nameError,
              onChanged: (_) => setState(() {}),
            ),
            const FxLabel('Email Address', required: true),
            FxInput(
              controller: _email,
              hint: 'you@example.com',
              icon: Icons.mail_outline_rounded,
              keyboardType: TextInputType.emailAddress,
              errorText: _emailError,
              onChanged: (_) => setState(() => _emailTaken = null),
            ),
            const FxLabel('Mobile Number', required: true),
            FxInput(
              controller: _phone,
              hint: '+94 77 123 4567',
              icon: Icons.smartphone_rounded,
              keyboardType: TextInputType.phone,
              errorText: _phoneError,
              onChanged: (_) => setState(() => _phoneTaken = null),
            ),
            const FxLabel('Password', required: true),
            FxInput(
              controller: _password,
              hint: 'Create a password',
              icon: Icons.lock_outline_rounded,
              obscure: !_show,
              errorText: _passwordError,
              suffix: EyeToggle(visible: _show, onTap: () => setState(() => _show = !_show)),
              onChanged: (_) => setState(() {}),
            ),
            PasswordStrengthBar(password: _password.text),
            const FxLabel('Confirm Password', required: true),
            FxInput(
              controller: _confirm,
              hint: 'Repeat your password',
              icon: Icons.lock_reset_rounded,
              obscure: !_show,
              errorText: _confirmError,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            GestureDetector(
              onTap: () => setState(() => _agree = !_agree),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 26,
                    height: 26,
                    child: Checkbox(
                      value: _agree,
                      activeColor: AppColors.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
                      onChanged: (v) => setState(() => _agree = v ?? false),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text.rich(
                      TextSpan(children: [
                        TextSpan(text: 'I agree to the '),
                        TextSpan(text: 'Terms of Service', style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w700)),
                        TextSpan(text: ' and '),
                        TextSpan(text: 'Privacy Policy', style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w700)),
                      ]),
                      style: AppText.body.copyWith(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        PrimaryButton(
          label: 'Create Account',
          icon: Icons.person_add_alt_1_outlined,
          loading: _loading,
          onPressed: _create,
        ),
        const SizedBox(height: 10),
        AuthSwitchLink(
          question: 'Already have an account?',
          action: 'Login',
          onTap: () => Navigator.of(context).pushReplacement(fxRoute(const LoginScreen())),
        ),
      ],
    );
  }
}

/// Shown after a new account is created.
class AccountCreatedScreen extends StatelessWidget {
  const AccountCreatedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return AuthScaffold(
      showBack: false,
      children: [
        const SizedBox(height: 20),
        const Center(child: SuccessBurst(size: 86)),
        const SizedBox(height: 8),
        Text('Welcome, ${app.firstName}!', textAlign: TextAlign.center, style: AppText.pageTitle),
        const SizedBox(height: 8),
        Text('Your Fixora account is ready.\nAdd your vehicle to book your first service.',
            textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 15)),
        const SizedBox(height: 20),
        FxCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Column(
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.mail_outline_rounded, color: AppColors.link),
                title: Text(app.profile.email, style: AppText.label),
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(Icons.smartphone_rounded, color: AppColors.link),
                title: Text(app.profile.phone, style: AppText.label),
                trailing: const ValueChip('Verified', color: AppColors.success),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        PrimaryButton(
          label: 'Add My Vehicle',
          icon: Icons.directions_car_outlined,
          onPressed: () {
            NavController.tab.value = 2;
            final nav = Navigator.of(context);
            nav.pushAndRemoveUntil(fxRoute(const MainShell()), (_) => false);
            nav.push(fxRoute(const AddVehicleScreen()));
          },
        ),
        const SizedBox(height: 10),
        OutlineButton2(
          label: 'Go to Home',
          icon: Icons.home_outlined,
          onPressed: () => goToHome(context),
        ),
      ],
    );
  }
}

