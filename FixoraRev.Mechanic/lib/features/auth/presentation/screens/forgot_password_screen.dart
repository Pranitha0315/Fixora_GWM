import 'package:flutter/material.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/app_text_field.dart';
import '../../../../core/widgets/buttons.dart';
import '../../domain/auth_entities.dart';
import '../widgets/auth_scaffold.dart';
import 'status_screens.dart';

// ------------------------------------------------------- 1. Forgot password

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail = ''});
  final String initialEmail;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  late final _email = TextEditingController(text: widget.initialEmail);
  String? _error;
  bool _loading = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    FocusScope.of(context).unfocus();
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Email required');
      return;
    }
    if (!Validators.isEmail(email)) {
      setState(() => _error = 'Incorrect email address');
      return;
    }
    setState(() => _loading = true);
    try {
      await AppServices.auth.sendResetLink(email);
      if (!mounted) return;
      context.replaceWith(ResetLinkSentScreen(email: email.toLowerCase()));
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.errors.values.first);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AuthHeading(
            title: 'Forgot Password',
            subtitle: 'Enter your email address to receive a reset link.',
          ),
          const SizedBox(height: 24),
          AppTextField(
            controller: _email,
            hint: 'Enter email address',
            icon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            errorText: _error,
            onChanged: (_) {
              if (_error != null) setState(() => _error = null);
            },
            onSubmitted: (_) => _send(),
          ),
          const SizedBox(height: 22),
          PrimaryButton(
              label: 'Send Reset Link', loading: _loading, onPressed: _send),
          const SizedBox(height: 10),
          Center(
            child: TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text('Back to Login',
                  style: TextStyle(
                      decoration: TextDecoration.underline,
                      decorationColor: AppColors.primary)),
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------- 2. Link sent

class ResetLinkSentScreen extends StatefulWidget {
  const ResetLinkSentScreen({super.key, required this.email});
  final String email;

  @override
  State<ResetLinkSentScreen> createState() => _ResetLinkSentScreenState();
}

class _ResetLinkSentScreenState extends State<ResetLinkSentScreen> {
  bool _resending = false;

  Future<void> _resend() async {
    setState(() => _resending = true);
    await AppServices.auth.sendResetLink(widget.email);
    if (!mounted) return;
    setState(() => _resending = false);
    context.toast('A new reset link was sent to ${widget.email}',
        icon: Icons.mark_email_read_outlined);
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  width: 92,
                  height: 92,
                  decoration: BoxDecoration(
                      color: AppColors.primarySoft, shape: BoxShape.circle),
                  child: Icon(Icons.mark_email_unread_outlined,
                      size: 46, color: AppColors.primary),
                ),
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: BoxDecoration(
                        color: AppColors.surface, shape: BoxShape.circle),
                    child: CircleAvatar(
                      radius: 14,
                      backgroundColor: AppColors.success,
                      child: Icon(Icons.check_rounded,
                          color: AppColors.onPrimary, size: 18),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Text('Reset Link Sent!',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink)),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              text: 'A password reset link has been sent to\n',
              style: TextStyle(
                  color: AppColors.inkSoft, fontSize: 14.5, height: 1.5),
              children: [
                TextSpan(
                  text: widget.email,
                  style: TextStyle(
                      color: AppColors.ink, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          PrimaryButton(
            label: 'Open Email App',
            icon: Icons.mail_outline_rounded,
            onPressed: () =>
                context.push(ResetEmailPreviewScreen(email: widget.email)),
          ),
          const SizedBox(height: 12),
          OutlineButtonX(
            label: 'Resend Link',
            icon: Icons.refresh_rounded,
            loading: _resending,
            onPressed: _resend,
          ),
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => context.popToRoot(),
              child: Text('Back to Login',
                  style: TextStyle(
                      decoration: TextDecoration.underline,
                      decorationColor: AppColors.primary)),
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------- 3. The email

/// Preview of the reset email (in production the link deep-links into
/// the app's Create New Password screen).
class ResetEmailPreviewScreen extends StatelessWidget {
  const ResetEmailPreviewScreen({super.key, required this.email});
  final String email;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    return Scaffold(
      appBar: AppBar(title: const Text('Inbox (demo)')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Fixora Rev – Password Reset Request',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          const SizedBox(height: 14),
          Row(
            children: [
              CircleAvatar(
                backgroundColor: AppColors.primary,
                child: Text('F',
                    style: TextStyle(
                        color: AppColors.onPrimary, fontWeight: FontWeight.w800)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Fixora Rev',
                        style: TextStyle(fontWeight: FontWeight.w700)),
                    Text('to $email',
                        style: TextStyle(
                            color: AppColors.inkSoft, fontSize: 12.5)),
                  ],
                ),
              ),
              Text(Fmt.time(now),
                  style: TextStyle(
                      color: AppColors.inkSoft, fontSize: 12.5)),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  height: 8,
                  decoration:
                      BoxDecoration(gradient: AppColors.primaryGradient),
                ),
                Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Hi Mechanic,',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Text(
                        'We received a request to reset your Fixora Rev password. '
                        'Tap the button below to choose a new one.',
                        style:
                            TextStyle(color: AppColors.inkSoft, height: 1.45),
                      ),
                      const SizedBox(height: 18),
                      PrimaryButton(
                        label: 'Reset Password',
                        icon: Icons.lock_reset_rounded,
                        onPressed: () => context
                            .replaceWith(CreateNewPasswordScreen(email: email)),
                      ),
                      const SizedBox(height: 12),
                      Center(
                        child: Text('This link expires in 15 minutes.',
                            style: TextStyle(
                                color: AppColors.inkSoft, fontSize: 13)),
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.field,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.shield_outlined,
                                color: AppColors.inkSoft),
                            SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                "Didn't request this? You can safely ignore this email. "
                                'Your account is still secure.',
                                style: TextStyle(
                                    fontSize: 13,
                                    color: AppColors.inkSoft,
                                    height: 1.4),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1),
                Padding(
                  padding: EdgeInsets.all(14),
                  child: Column(
                    children: [
                      Text('Fixora Rev',
                          style: TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary)),
                      Text('Your Garage. Our Technology.',
                          style: TextStyle(
                              fontSize: 12, color: AppColors.inkSoft)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------- 4. New password

class CreateNewPasswordScreen extends StatefulWidget {
  const CreateNewPasswordScreen({super.key, required this.email});
  final String email;

  @override
  State<CreateNewPasswordScreen> createState() =>
      _CreateNewPasswordScreenState();
}

class _CreateNewPasswordScreenState extends State<CreateNewPasswordScreen> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String? _passwordError;
  String? _confirmError;
  bool _loading = false;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    FocusScope.of(context).unfocus();
    final p = _password.text;
    final c = _confirm.text;
    String? pe;
    String? ce;
    if (p.isEmpty) {
      pe = 'Password required';
    } else if (!Validators.isStrongPassword(p)) {
      pe = 'Password does not meet all the rules';
    }
    if (c.isEmpty) {
      ce = 'Confirm password required';
    } else if (c != p) {
      ce = 'Passwords do not match';
    }
    setState(() {
      _passwordError = pe;
      _confirmError = ce;
    });
    if (pe != null || ce != null) return;

    setState(() => _loading = true);
    try {
      await AppServices.auth.resetPassword(widget.email, p);
      if (!mounted) return;
      context.replaceWith(ResultScreen(
        title: 'Password Created',
        message:
            'Your password has been created successfully. Log in with your new password.',
        actionLabel: 'Back to Login',
        onAction: (ctx) => ctx.popToRoot(),
      ));
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _passwordError = e.errors.values.first);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AuthHeading(
            title: 'Create New Password',
            subtitle: 'Set a new password for your account.',
          ),
          const SizedBox(height: 22),
          AppTextField(
            controller: _password,
            hint: 'New password',
            icon: Icons.lock_outline_rounded,
            isPassword: true,
            errorText: _passwordError,
            onChanged: (_) => setState(() => _passwordError = null),
          ),
          const SizedBox(height: 12),
          AppTextField(
            controller: _confirm,
            hint: 'Confirm new password',
            icon: Icons.lock_reset_rounded,
            isPassword: true,
            textInputAction: TextInputAction.done,
            errorText: _confirmError,
            onChanged: (_) => setState(() => _confirmError = null),
            onSubmitted: (_) => _create(),
          ),
          const SizedBox(height: 16),
          PasswordRules(password: _password.text),
          const SizedBox(height: 22),
          PrimaryButton(
            label: 'Create password',
            loadingLabel: 'Creating password…',
            loading: _loading,
            onPressed: _create,
          ),
        ],
      ),
    );
  }
}
