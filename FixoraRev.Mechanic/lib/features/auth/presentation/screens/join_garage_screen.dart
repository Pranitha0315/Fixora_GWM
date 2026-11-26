import 'package:flutter/material.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../domain/auth_entities.dart';
import '../widgets/auth_scaffold.dart';
import 'status_screens.dart';

/// First Google sign-in: links the account to the garage automatically
/// (no invitation code). Kept as a thin confirm step if navigated here.
class JoinGarageScreen extends StatefulWidget {
  const JoinGarageScreen({super.key, required this.account});
  final GoogleAccount account;

  @override
  State<JoinGarageScreen> createState() => _JoinGarageScreenState();
}

class _JoinGarageScreenState extends State<JoinGarageScreen> {
  String? _error;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    // Auto-join as soon as this screen opens — no invite code asked.
    WidgetsBinding.instance.addPostFrameCallback((_) => _join());
  }

  Future<void> _join() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      await AppServices.auth.linkGoogleAccount(widget.account, 'FXR2048');
      if (!mounted) return;
      context.resetTo(const LoadingScreen(
        title: 'Processing…',
        subtitle: 'Please wait a moment while we set up your account.',
        next: MainShell(),
        delay: Duration(milliseconds: 1600),
      ));
    } on AuthFailure catch (e) {
      if (mounted) setState(() => _error = e.errors.values.first);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.account;
    return AuthScaffold(
      showBack: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AuthHeading(
            title: 'Join your garage',
            subtitle:
                'This Google account is new to Fixora Rev. '
                'We\'ll link it to your workshop now.',
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.field,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  backgroundColor: Color(a.colorValue),
                  child: Text(a.name[0],
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.name,
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      Text(a.email,
                          style: TextStyle(
                              color: AppColors.inkSoft, fontSize: 13)),
                    ],
                  ),
                ),
                const GoogleGlyph(size: 18),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(_error!, style: TextStyle(color: AppColors.danger)),
          ],
          const SizedBox(height: 22),
          PrimaryButton(
            label: 'Join garage',
            loadingLabel: 'Joining…',
            icon: Icons.garage_outlined,
            loading: _loading,
            onPressed: _join,
          ),
        ],
      ),
    );
  }
}
