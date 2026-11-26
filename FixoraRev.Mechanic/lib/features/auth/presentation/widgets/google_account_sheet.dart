import 'package:flutter/material.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/buttons.dart';
import '../../domain/auth_entities.dart';

/// Account chooser + consent step for "Continue with Google".
///
/// Demo only: on a real phone the `google_sign_in` package shows Google's
/// own system chooser and Google handles the password – the app never
/// sees it. This sheet simulates that hand-off with the device accounts.
Future<GoogleAccount?> showGoogleAccountSheet(BuildContext context) {
  return showModalBottomSheet<GoogleAccount>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
    ),
    builder: (_) => const _GoogleAccountSheet(),
  );
}

class _GoogleAccountSheet extends StatefulWidget {
  const _GoogleAccountSheet();

  @override
  State<_GoogleAccountSheet> createState() => _GoogleAccountSheetState();
}

class _GoogleAccountSheetState extends State<_GoogleAccountSheet> {
  GoogleAccount? _selected;
  bool _addingAccount = false;
  final _name = TextEditingController();
  final _email = TextEditingController();
  String? _nameError;
  String? _emailError;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  void _continueWithAddedAccount() {
    final name = _name.text.trim();
    final email = _email.text.trim();
    setState(() {
      _nameError = name.isEmpty ? 'Enter the account name' : null;
      _emailError =
          !Validators.isEmail(email) ? 'Enter a valid email address' : null;
    });
    if (_nameError != null || _emailError != null) return;
    setState(() {
      _selected = AppServices.auth.addGoogleAccount(name, email);
      _addingAccount = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 0, 22, 20),
        child: AnimatedSize(
          duration: const Duration(milliseconds: 220),
          child: SingleChildScrollView(
            child: _selected != null
                ? _consent(_selected!)
                : _addingAccount
                    ? _addAccountForm()
                    : _chooser(),
          ),
        ),
      ),
    );
  }

  Widget _header() => Row(
        children: [
          const GoogleGlyph(size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text('Sign in with Google',
                style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.inkSoft)),
          ),
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(Icons.close_rounded, color: AppColors.inkSoft),
          ),
        ],
      );

  Widget _title(String title, String suffix) => Padding(
        padding: const EdgeInsets.only(top: 6, bottom: 16),
        child: Column(
          children: [
            Text(title,
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                    color: AppColors.ink)),
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(
                text: suffix,
                style:
                    TextStyle(color: AppColors.inkSoft, fontSize: 14.5),
                children: [
                  TextSpan(
                    text: 'Fixora Rev',
                    style: TextStyle(
                        color: AppColors.primary, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _avatar(GoogleAccount a, {double size = 38}) => CircleAvatar(
        radius: size / 2,
        backgroundColor: Color(a.colorValue),
        child: Text(a.name[0],
            style: TextStyle(
                color: AppColors.surface,
                fontWeight: FontWeight.w700,
                fontSize: size * 0.42)),
      );

  Widget _chooser() {
    final accounts = AppServices.auth.googleAccounts;
    return Column(
      key: const ValueKey('chooser'),
      mainAxisSize: MainAxisSize.min,
      children: [
        _header(),
        _title('Choose an account', 'to continue to '),
        for (final a in accounts)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Material(
              color: AppColors.field,
              borderRadius: BorderRadius.circular(14),
              child: ListTile(
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                leading: _avatar(a),
                title: Text(a.name,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(a.email),
                onTap: () => setState(() => _selected = a),
              ),
            ),
          ),
        ListTile(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          leading: CircleAvatar(
            radius: 19,
            backgroundColor: AppColors.primarySoft,
            child:
                Icon(Icons.person_add_alt_1_outlined, color: AppColors.primary),
          ),
          title: const Text('Use another account',
              style: TextStyle(fontWeight: FontWeight.w600)),
          onTap: () => setState(() => _addingAccount = true),
        ),
        const Divider(height: 24),
        Text(
          'Demo account picker · Live Google sign-in needs an OAuth client configuration.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.4),
        ),
      ],
    );
  }

  Widget _addAccountForm() => Column(
        key: const ValueKey('add-google-account'),
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _header(),
          _title('Add another account', 'to continue to '),
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Name',
              prefixIcon: const Icon(Icons.person_outline_rounded),
              errorText: _nameError,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _continueWithAddedAccount(),
            decoration: InputDecoration(
              labelText: 'Google email address',
              prefixIcon: const Icon(Icons.mail_outline_rounded),
              errorText: _emailError,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Demo sign-in: this adds the account to the chooser without asking for a Google password.',
            style:
                TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.4),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlineButtonX(
                  label: 'Back',
                  onPressed: () => setState(() => _addingAccount = false),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: PrimaryButton(
                  label: 'Continue',
                  height: 52,
                  onPressed: _continueWithAddedAccount,
                ),
              ),
            ],
          ),
        ],
      );

  Widget _consent(GoogleAccount a) {
    Widget permission(IconData icon, String text) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 21, color: AppColors.inkSoft),
              const SizedBox(width: 14),
              Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
            ],
          ),
        );

    return Column(
      key: const ValueKey('consent'),
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _header(),
        _title('Continue to Fixora Rev?', 'Signing in to '),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.border),
            borderRadius: BorderRadius.circular(30),
          ),
          child: Row(
            children: [
              _avatar(a, size: 32),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(a.name,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text(a.email,
                        style: TextStyle(
                            fontSize: 12.5, color: AppColors.inkSoft)),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Change account',
                onPressed: () => setState(() => _selected = null),
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text('Fixora Rev will use this account to:',
            style: TextStyle(
                color: AppColors.inkSoft, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        permission(
            Icons.person_outline_rounded, 'Set your mechanic profile name'),
        permission(Icons.mail_outline_rounded,
            'Create your account with this email address'),
        permission(Icons.info_outline_rounded,
            'Create and sign in to your account on Fixora Rev'),
        const SizedBox(height: 2),
        Text(
          'Demo flow · No Google password is requested or stored.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppColors.muted),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: OutlineButtonX(
                  label: 'Cancel', onPressed: () => Navigator.pop(context)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: PrimaryButton(
                label: 'Continue',
                height: 52,
                onPressed: () => Navigator.pop(context, a),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
