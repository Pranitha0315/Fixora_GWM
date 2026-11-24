import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../app/theme/bronze_colors.dart';
import '../../../../app/theme/bronze_inputs.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/utils/nav.dart';
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

  @override
  void dispose() {
    _name.dispose();
    _pin.dispose();
    super.dispose();
  }

  bool get _tokenMissing => widget.token.trim().isEmpty;

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_tokenMissing) {
      context.go(
        RouteNames.expiredInvitation,
        extra:
            'This invitation link is missing a token. Ask your workshop manager for a new 7-day invite.',
      );
      return;
    }

    final name = _name.text.trim();
    final pin = _pin.text.trim();
    if (name.isEmpty || pin.length != 4) {
      setState(() => _error = 'Enter your name and a 4-digit PIN');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await MechanicBackend.instance.acceptInvitation(
        token: widget.token.trim(),
        name: name,
        pin: pin,
      );
      if (!mounted) return;
      context.go(RouteNames.shell);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (_isExpired(e)) {
        context.go(
          RouteNames.expiredInvitation,
          extra: e.message.isNotEmpty
              ? e.message
              : 'This invitation link has expired or was already used. Ask your workshop manager to send a new 7-day invite.',
        );
        return;
      }
      setState(() {
        _error = e.code == 'connection_error' || e.code == 'timeout'
            ? 'Cannot reach the garage server. Check your connection and try again.'
            : e.message;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool _isExpired(ApiException e) {
    final code = (e.code ?? '').toLowerCase();
    final msg = e.message.toLowerCase();
    return e.statusCode == 410 ||
        e.statusCode == 404 ||
        code.contains('expired') ||
        (code.contains('invite') && code.contains('used')) ||
        msg.contains('expired') ||
        msg.contains('already used');
  }

  @override
  Widget build(BuildContext context) {
    if (_tokenMissing) {
      return AuthScaffold(
        showBack: true,
        onBack: () => context.go(RouteNames.login),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 24),
            Text(
              'Invalid invite',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            const Text(
              'This invitation link is incomplete. Ask your manager for a new one.',
              style: TextStyle(color: BronzeColors.creamMuted),
            ),
            const Spacer(),
            ElevatedButton(
              style: BronzeButtons.elevated,
              onPressed: () => context.go(RouteNames.expiredInvitation),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
    }

    return AuthScaffold(
      showBack: true,
      onBack: () => context.go(RouteNames.login),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 12),
          Text(
            'Accept invitation',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 8),
          const Text(
            'Set your display name and a 4-digit garage PIN to join this workshop.',
            style: TextStyle(color: BronzeColors.creamMuted),
          ),
          const SizedBox(height: 28),
          TextField(
            controller: _name,
            textInputAction: TextInputAction.next,
            textCapitalization: TextCapitalization.words,
            decoration: BronzeInputs.decoration(
              labelText: 'Full name',
              hintText: 'Your name',
              prefixIcon: const Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _pin,
            obscureText: true,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(4),
            ],
            decoration: BronzeInputs.decoration(
              labelText: '4-digit PIN',
              hintText: '••••',
              prefixIcon: const Icon(Icons.pin_outlined),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(color: BronzeColors.danger),
            ),
          ],
          const Spacer(),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.4),
                  )
                : const Text('Join workshop'),
          ),
          const SizedBox(height: 8),
          TextButton(
            style: BronzeButtons.text,
            onPressed: () => context.toast(
              'Ask your manager if you need a fresh 7-day invite link.',
              icon: Icons.info_outline,
            ),
            child: const Text('Need a new invite?'),
          ),
        ],
      ),
    );
  }
}
