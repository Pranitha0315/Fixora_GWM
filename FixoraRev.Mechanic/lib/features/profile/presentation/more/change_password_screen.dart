import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/app_text_field.dart';
import '../../../../core/widgets/rev_ui.dart';
import '../../../auth/domain/auth_entities.dart';
import 'more_widgets.dart';

/// Change password while signed in: current password, new password
/// (same rules as sign-up) and confirm.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  Map<AuthField, String> _errors = const {};
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  bool get _strong {
    final p = _next.text;
    return p.length >= 8 &&
        RegExp(r'[A-Z]').hasMatch(p) &&
        RegExp(r'[0-9]').hasMatch(p) &&
        RegExp(r'[^A-Za-z0-9\s]').hasMatch(p);
  }

  Future<void> _save() async {
    final errors = <AuthField, String>{};
    if (_current.text.isEmpty) errors[AuthField.password] = 'Enter your current password';
    if (!_strong) errors[AuthField.general] = 'New password does not meet all the rules below';
    if (_confirm.text != _next.text) errors[AuthField.confirmPassword] = 'Passwords do not match';
    if (errors.isNotEmpty) {
      setState(() => _errors = errors);
      return;
    }
    setState(() {
      _errors = const {};
      _busy = true;
    });
    try {
      await AppServices.auth.changePassword(_current.text, _next.text);
      if (!mounted) return;
      context.toast('Password changed. Use it next time you sign in.', icon: Icons.check_circle_outline_rounded);
      Navigator.of(context).pop();
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _errors = e.errors);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MorePage(
      title: 'Change password',
      subtitle: 'Your Mechanic PIN on this phone keeps working after you change your password.',
      bottom: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _busy ? null : _save,
            child: _busy
                ? SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.6, color: AppColors.muted),
                  )
                : const Text('Save new password'),
          ),
        ),
      ),
      children: [
        const SizedBox(height: 12),
        _label('Current password'),
        AppTextField(
          controller: _current,
          hint: 'Current password',
          icon: Icons.lock_outline_rounded,
          isPassword: true,
          errorText: _errors[AuthField.password],
        ),
        const SizedBox(height: 16),
        _label('New password'),
        AppTextField(
          controller: _next,
          hint: 'New password',
          icon: Icons.lock_reset_rounded,
          isPassword: true,
          errorText: _errors[AuthField.general],
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        PasswordRules(password: _next.text),
        const SizedBox(height: 16),
        _label('Confirm new password'),
        AppTextField(
          controller: _confirm,
          hint: 'Type the new password again',
          icon: Icons.lock_outline_rounded,
          isPassword: true,
          textInputAction: TextInputAction.done,
          errorText: _errors[AuthField.confirmPassword],
          onSubmitted: (_) => _save(),
        ),
        const SizedBox(height: 16),
        const RevCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ToneIcon(icon: Icons.info_outline_rounded, tone: RevTone.blue, size: 36),
              SizedBox(width: 12),
              Expanded(child: _Note()),
            ],
          ),
        ),
      ],
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
      );
}

class _Note extends StatelessWidget {
  const _Note();

  @override
  Widget build(BuildContext context) => Text(
        'Forgot your current password? Log out and use "Forgot password" on the sign-in screen.',
        style: TextStyle(fontSize: 13.5, color: AppColors.body, height: 1.4),
      );
}
