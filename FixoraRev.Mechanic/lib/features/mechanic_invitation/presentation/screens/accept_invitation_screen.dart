import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../auth/presentation/screens/status_screens.dart';
import '../../../auth/presentation/widgets/auth_scaffold.dart';
/// Opens from a manager's 7-day invitation link: name + 4-digit PIN → session.
class AcceptInvitationScreen extends StatefulWidget {
  const AcceptInvitationScreen({super.key, required this.token});

  final String token;

  @override
  State<AcceptInvitationScreen> createState() => _AcceptInvitationScreenState();
}

class _AcceptInvitationScreenState extends State<AcceptInvitationScreen> {
  final _name = TextEditingController();
  final _pin = TextEditingController();
  bool _loading = false;
  String? _error;
  String? _validUntil;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  /// Looks the invitation up first, so an expired or used link is caught before the form is filled in.
  Future<void> _check() async {
    final backend = MechanicBackend.instance;
    if (widget.token.isEmpty) return;
    try {
      final info = await backend.checkInvitation(widget.token);
      if (!mounted) return;
      final name = (info['name'] as String?) ?? '';
      final until = DateTime.tryParse((info['expiresAt'] as String?) ?? '')?.toLocal();
      setState(() {
        if (_name.text.isEmpty && name.isNotEmpty) _name.text = name;
        if (until != null) _validUntil = 'Invitation valid until ${Fmt.date(until)}';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (_isExpired(e)) context.goRoute(RouteNames.expiredInvitation, extra: e.message);
      // Network trouble: keep the form; accepting will report the real problem.
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _pin.dispose();
    super.dispose();
  }

  bool _isExpired(ApiException e) {
    final code = e.code.toLowerCase();
    final msg = e.message.toLowerCase();
    return e.status == 410 ||
        e.status == 404 ||
        code.contains('expir') ||
        (code.contains('invite') && (code.contains('invalid') || code.contains('used'))) ||
        msg.contains('expir') ||
        msg.contains('already used') ||
        msg.contains('invite expired') ||
        msg.contains('invitation expired');
  }

  Future<void> _accept() async {
    FocusScope.of(context).unfocus();
    final name = _name.text.trim();
    final pin = _pin.text.trim();
    if (name.length < 2 || pin.length != 4) {
      setState(() => _error = 'Enter your name and a 4-digit PIN');
      return;
    }
    if (widget.token.isEmpty) {
      if (!mounted) return;
      context.goRoute(
        RouteNames.expiredInvitation,
        extra: 'This invitation link is missing or invalid. Ask your manager for a new 7-day invite.',
      );
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await MechanicBackend.instance.acceptInvitation(widget.token, name, pin);
      if (!mounted) return;
      // First sign-in: show the employee ID the server gave this mechanic, so they can write it down.
      final employeeId = AppServices.auth.user?.employeeId ?? '';
      if (employeeId.isNotEmpty) {
        await _showEmployeeIdDialog(employeeId);
        if (!mounted) return;
      }
      context.goRoute(
        RouteNames.loading,
        extra: const LoadingArgs(
          title: 'Welcome to the garage…',
          subtitle: 'Setting up your mechanic session',
          nextRoute: RouteNames.shell,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      if (_isExpired(e)) {
        context.goRoute(RouteNames.expiredInvitation, extra: e.message);
        return;
      }
      setState(() => _error = e.isNetwork
          ? 'Cannot reach the garage server. Check your connection and try again.'
          : e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _showEmployeeIdDialog(String employeeId) => showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          title: const Text('Your employee ID'),
          content: Text(
            'Write this down. You sign in with it and your PIN:\n\n$employeeId',
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Continue')),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      showBack: true,
      onBack: () => context.goRoute(RouteNames.login),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Accept invitation', style: AppText.title),
          const SizedBox(height: 8),
          Text(
            'This manager invite is valid for 7 days. Set your name and a 4-digit garage PIN to join.',
            style: AppText.body,
          ),
          if (_validUntil != null) ...[
            const SizedBox(height: 6),
            Text(_validUntil!, style: AppText.caption),
          ],
          const SizedBox(height: 20),
          Text('Full name', style: AppText.label),
          const SizedBox(height: 6),
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(hintText: 'Your name'),
          ),
          const SizedBox(height: 14),
          Text('Garage PIN', style: AppText.label),
          const SizedBox(height: 6),
          TextField(
            controller: _pin,
            obscureText: true,
            keyboardType: TextInputType.number,
            maxLength: 4,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(hintText: '4 digits', counterText: ''),
            onSubmitted: (_) => _accept(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: AppText.caption.copyWith(color: AppColors.danger)),
          ],
          const SizedBox(height: 22),
          PrimaryButton(
            label: 'Join garage',
            loadingLabel: 'Joining…',
            icon: Icons.garage_outlined,
            loading: _loading,
            onPressed: _loading ? null : _accept,
          ),
        ],
      ),
    );
  }
}
