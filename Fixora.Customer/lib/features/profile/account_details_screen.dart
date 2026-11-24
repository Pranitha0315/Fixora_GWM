import 'package:flutter/material.dart';

import '../../core/core.dart';
import 'profile_screen.dart';

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

  String? get _nameError => _submitted && _name.text.trim().length < 2 ? 'Enter your full name' : null;

  String? get _emailError {
    if (!_submitted) return null;
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]{2,}$').hasMatch(_email.text.trim()) ? null : 'Enter a valid email address';
  }

  String? get _phoneError {
    if (!_submitted) return null;
    final d = _phone.text.replaceAll(RegExp(r'\D'), '');
    return d.length >= 9 && d.length <= 12 ? null : 'Enter a valid phone number';
  }

  bool get _changed =>
      _name.text.trim() != p.name || _email.text.trim() != p.email || _phone.text.trim() != p.phone;

  Future<void> _changePhoto() async {
    final bytes = await choosePhoto(context);
    if (bytes == null || !mounted) return;
    AppState.instance.updateProfile(photo: bytes);
    setState(() {});
    showFxSnack(context, 'Profile photo updated');
  }

  Future<void> _save() async {
    setState(() => _submitted = true);
    if (_nameError != null || _emailError != null || _phoneError != null) return;
    if (!_changed) {
      showFxSnack(context, 'Nothing to update', icon: Icons.info_outline_rounded);
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
    showFxSnack(context, 'Your details have been updated');
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return FxPage(
      title: 'Account Details',
      subtitle: 'Update your personal information',
      compactHeader: true,
      showNav: false,
      children: [
        FadeSlide(
          child: Container(
            height: 150,
            decoration: BoxDecoration(
              color: AppColors.primarySoft,
              borderRadius: BorderRadius.circular(24),
              boxShadow: AppShadows.card,
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Stack(
                children: [
                  // Car cut-out (no photo background) tucked into the corner.
                  Positioned(
                    right: -10,
                    bottom: 6,
                    width: 104,
                    height: 62,
                    child: const CutOutImage(Img.corollaThumb),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 80, 16),
                    child: Row(
                      children: [
                        GestureDetector(
                          onTap: _changePhoto,
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              const ProfileAvatar(size: 72),
                              Positioned(
                                right: -2,
                                bottom: 2,
                                child: Container(
                                  width: 28,
                                  height: 28,
                                  decoration: BoxDecoration(
                                    gradient: AppColors.primaryGradient,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: AppColors.surface, width: 2.5),
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
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              // Long names shrink to fit instead of being cut off.
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: Text(app.profile.name, maxLines: 1, style: AppText.h1.copyWith(fontSize: 20)),
                              ),
                              const SizedBox(height: 4),
                              Text(app.profile.email, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.muted),
                              Text(app.profile.phone, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.muted),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        FadeSlide(
          index: 1,
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const FxLabel('Full Name'),
                FxInput(
                  controller: _name,
                  hint: 'Your full name',
                  icon: Icons.person_outline_rounded,
                  capitalization: TextCapitalization.words,
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
                  onChanged: (_) => setState(() {}),
                ),
                const FxLabel('Phone Number'),
                FxInput(
                  controller: _phone,
                  hint: '+94 7X XXX XXXX',
                  icon: Icons.call_outlined,
                  keyboardType: TextInputType.phone,
                  errorText: _phoneError,
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        PrimaryButton(
          label: 'Update Details',
          icon: Icons.check_circle_outline_rounded,
          loading: _saving,
          onPressed: _save,
        ),
      ],
    );
  }
}
