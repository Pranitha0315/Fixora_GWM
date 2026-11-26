import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/fixora_config.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart' show GoogleGlyph;
import '../../../../core/widgets/warm_ui.dart';
import '../../../auth/presentation/screens/forgot_password_screen.dart';
import '../../../auth/presentation/screens/status_screens.dart';
import '../../../auth/presentation/widgets/auth_scaffold.dart' show OrDivider;
import '../../../auth/presentation/widgets/google_account_sheet.dart';
import '../../../quick_login/data/quick_login_store.dart';
import '../../../quick_login/presentation/screens/quick_login_setup_screen.dart';
import '../../../shell/presentation/main_shell.dart';

/// Garage PIN login, plus Google / forgot password / new mechanic links.
///
/// Quick login is NOT offered here. After the first successful sign-in the app asks the
/// mechanic to set a 4-digit PIN; every later start opens the quick-login screen instead.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.initialEmail = ''});
  final String initialEmail;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final _idCtrl = TextEditingController(text: widget.initialEmail);
  final _secretCtrl = TextEditingController();
  bool _hide = true;
  bool _loading = false;
  String? _idError;
  String? _secretError;
  String? _error;

  @override
  void dispose() {
    _idCtrl.dispose();
    _secretCtrl.dispose();
    super.dispose();
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
      if (!mounted) return;
      await _afterSignIn();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.isNetwork) {
          _error = "Can't reach the garage server at ${FixoraConfig.apiBase}. "
              'Start the backend, then try again.';
        } else {
          _error = e.status == 401 || e.status == 400 ? 'Employee ID or PIN is not right.' : e.message;
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _google() async {
    final account = await showGoogleAccountSheet(context);
    if (account == null || !mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await AppServices.auth.signInWithGoogle(account);
      if (!mounted) return;
      if (result.needsGarageLink) {
        await AppServices.auth.linkGoogleAccount(result.account, 'FXR2048');
        if (!mounted) return;
      }
      await _afterSignIn();
    } catch (_) {
      if (mounted) setState(() => _error = 'Google sign-in failed. Try again.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  /// First sign-in on this phone → set up the quick-login PIN. Already set up → Home.
  Future<void> _afterSignIn() async {
    final user = AppServices.auth.user;
    final email = (user?.email ?? _idCtrl.text.trim()).toLowerCase();
    final store = QuickLoginStore.instance;
    await store.load();
    if (!mounted) return;
    final needsSetup = !store.enabled || store.email != email;
    context.resetTo(LoadingScreen(
      title: 'Signing you in…',
      subtitle: 'Loading your jobs',
      next: needsSetup ? QuickLoginSetupScreen(email: email, name: user?.fullName ?? 'Mechanic') : const MainShell(),
    ));
  }

  InputDecoration _dec(String hint, IconData icon, String? error, {Widget? suffix}) => InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, color: AppColors.muted),
        suffixIcon: suffix,
        errorText: error,
        filled: true,
        fillColor: AppColors.surfaceAlt,
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.asset(
                'assets/images/login_hero.jpg',
                fit: BoxFit.cover,
                width: double.infinity,
                semanticLabel: 'FIXORA REV — Every job, fixed right',
              ),
            ),
            const SizedBox(height: 18),
            SoftCard(
              padding: const EdgeInsets.all(18),
              radius: 30,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextField(
                      controller: _idCtrl,
                      textCapitalization: TextCapitalization.characters,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.username],
                      onChanged: (_) => setState(() => _idError = null),
                      decoration: _dec('Employee ID', Icons.badge_outlined, _idError),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _secretCtrl,
                      obscureText: _hide,
                      textInputAction: TextInputAction.done,
                      autofillHints: const [AutofillHints.password],
                      inputFormatters: [LengthLimitingTextInputFormatter(64)],
                      onChanged: (_) => setState(() => _secretError = null),
                      onSubmitted: (_) => _signIn(),
                      decoration: _dec(
                        'PIN',
                        Icons.lock_outline_rounded,
                        _secretError,
                        suffix: IconButton(
                          tooltip: _hide ? 'Show' : 'Hide',
                          onPressed: () => setState(() => _hide = !_hide),
                          icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: AppColors.muted),
                        ),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(_error!, style: AppText.label.copyWith(color: AppColors.danger)),
                    ],
                    const SizedBox(height: 16),
                    ArrowPillButton(label: _loading ? 'Signing in…' : 'Start your shift', onPressed: _loading ? null : _signIn),
                    const OrDivider(),
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _google,
                      icon: const GoogleGlyph(),
                      label: const Text('Continue with Google'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                TextButton(
                  onPressed: () => context.push(
                    ForgotPasswordScreen(initialEmail: _idCtrl.text.contains('@') ? _idCtrl.text.trim() : ''),
                  ),
                  child: const Text('Forgot password?'),
                ),
                TextButton(
                  onPressed: () => context.pushRoute(RouteNames.register),
                  child: const Text('New mechanic?'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
