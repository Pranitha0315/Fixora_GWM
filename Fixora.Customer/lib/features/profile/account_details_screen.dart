import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/app_state.dart';
import '../auth/auth_widgets.dart';

/// Account Details: edit name, email, phone and photo.
class AccountDetailsScreen extends StatefulWidget {
  const AccountDetailsScreen({super.key});

  @override
  State<AccountDetailsScreen> createState() => _AccountDetailsScreenState();
}

class _AccountDetailsScreenState extends State<AccountDetailsScreen> {
  final p = AppState.instance.profile;
  late final _name = TextEditingController(text: p.name);
  late final _email = TextEditingController(text: p.email);
  late final _phone = TextEditingController(text: p.phone);
  bool _submitted = false;
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  String? get _nameError => _submitted ? validateFullName(_name.text) : null;

  String? get _emailError => _submitted ? validateEmail(_email.text) : null;

  String? get _phoneError {
    if (!_submitted) return null;
    final d = _phone.text.replaceAll(RegExp(r'\D'), '');
    if (d.length >= 9 && d.length <= 12) return null;
    return 'Enter a valid phone number';
  }

  bool get _changed =>
      _name.text.trim() != p.name ||
      _email.text.trim() != p.email ||
      _phone.text.trim() != p.phone;

  void _snack(String msg, {IconData icon = Icons.check_circle_outline_rounded}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 10),
            Expanded(child: Text(msg)),
          ],
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  Future<void> _changePhoto() async {
    _snack('Photo picker is not wired yet', icon: Icons.info_outline_rounded);
  }

  Future<void> _save() async {
    setState(() => _submitted = true);
    if (_nameError != null || _emailError != null || _phoneError != null) return;
    if (!_changed) {
      _snack('Nothing to update', icon: Icons.info_outline_rounded);
      return;
    }
    setState(() => _saving = true);
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    AppState.instance.updateProfile(
      name: _name.text.trim(),
      email: _email.text.trim(),
      phone: _phone.text.trim(),
    );
    setState(() => _saving = false);
    _snack('Your details have been updated');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Account Details'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListenableBuilder(
        listenable: app,
        builder: (context, _) {
          final profile = app.profile;
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Text('Update your personal information', style: AppText.muted),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: _changePhoto,
                      child: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          CircleAvatar(
                            radius: 36,
                            backgroundColor: AppColors.surfaceSolid,
                            child: Text(
                              profile.initials,
                              style: AppText.h2.copyWith(color: AppColors.link),
                            ),
                          ),
                          Positioned(
                            right: -2,
                            bottom: 2,
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                shape: BoxShape.circle,
                                border: Border.all(color: AppColors.surfaceSolid, width: 2.5),
                              ),
                              child: const Icon(Icons.photo_camera_rounded, size: 14, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(profile.name, maxLines: 1, style: AppText.h1.copyWith(fontSize: 20)),
                          ),
                          const SizedBox(height: 4),
                          Text(profile.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.muted),
                          Text(profile.phone, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.muted),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 18),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _label('Full Name'),
                    TextField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: _decoration(
                        hint: 'Your full name',
                        icon: Icons.person_outline_rounded,
                        errorText: _nameError,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    _label('Email Address'),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: _decoration(
                        hint: 'you@example.com',
                        icon: Icons.mail_outline_rounded,
                        errorText: _emailError,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    _label('Phone Number'),
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: _decoration(
                        hint: '+94 7X XXX XXXX',
                        icon: Icons.call_outlined,
                        errorText: _phoneError,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                height: 54,
                child: FilledButton.icon(
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.check_circle_outline_rounded),
                  label: Text(_saving ? 'Saving…' : 'Update Details'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: AppText.label),
      );

  InputDecoration _decoration({
    required String hint,
    required IconData icon,
    String? errorText,
  }) {
    return InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon),
      errorText: errorText,
      filled: true,
      fillColor: AppColors.fieldFill,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: AppColors.fieldBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: AppColors.fieldBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: AppColors.link, width: 1.4),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide(color: AppColors.danger),
      ),
    );
  }
}
