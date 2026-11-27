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
import '../../../../core/widgets/warm_ui.dart';
import '../../../auth/presentation/screens/status_screens.dart';

/// Garage PIN login: employee ID + PIN goes straight to Home.
/// Accounts are created by the manager's invitation link, not from this screen.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.initialEmail = ''});
  final String initialEmail;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  /// Every employee ID starts with this; the mechanic types only the 3 digits.
  static const _idPrefix = 'EMP-';

  late final _idCtrl = TextEditingController(
    text: widget.initialEmail.contains('@') ? '' : widget.initialEmail.replaceAll(RegExp(r'\D'), ''),
  );
  final _secretCtrl = TextEditingController();
  bool _hide = true;
  bool _loading = false;
  String? _idError;
  String? _secretError;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Sent back here because the server ended the session: say why, once.
    final auth = AppServices.auth;
    if (auth.sessionExpired) {
      auth.sessionExpired = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) context.toast('Your session expired. Please sign in again.', icon: Icons.info_outline_rounded);
      });
    }
  }

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
      _idError = id.isEmpty ? 'Enter the 3 digits of your employee ID' : null;
      _secretError = secret.isEmpty ? 'Enter your PIN' : null;
      _error = null;
    });
    if (_idError != null || _secretError != null) return;

    setState(() => _loading = true);
    try {
      await MechanicBackend.instance.pinLogin('$_idPrefix${id.padLeft(3, '0')}', secret.trim());
      if (!mounted) return;
      _afterSignIn();
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

  /// Employee ID + PIN → Home (the PIN just typed is the garage PIN).
  void _afterSignIn() {
    context.goRoute(
      RouteNames.loading,
      extra: const LoadingArgs(
        title: 'Signing you in…',
        subtitle: 'Loading your jobs',
        nextRoute: RouteNames.shell,
      ),
    );
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
                      keyboardType: TextInputType.number,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.username],
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
                      onChanged: (_) => setState(() => _idError = null),
                      decoration: _dec('001', Icons.badge_outlined, _idError).copyWith(
                        prefixIcon: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const SizedBox(width: 12),
                            Icon(Icons.badge_outlined, color: AppColors.muted),
                            const SizedBox(width: 8),
                            Text(_idPrefix, style: AppText.body.copyWith(fontWeight: FontWeight.w700)),
                          ],
                        ),
                        prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
                      ),
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
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
