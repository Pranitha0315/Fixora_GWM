import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/backend/api_client.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/utils/nav.dart';
import 'more_widgets.dart';

/// Changes the 4-digit garage PIN on the server (POST /mechanic/profile/pin).
/// Used while signed in to the garage; the demo build keeps the password screen.
class ChangePinScreen extends StatefulWidget {
  const ChangePinScreen({super.key});

  @override
  State<ChangePinScreen> createState() => _ChangePinScreenState();
}

class _ChangePinScreenState extends State<ChangePinScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  String? _currentError;
  String? _nextError;
  String? _confirmError;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  static bool _isPin(String v) => RegExp(r'^\d{4}$').hasMatch(v);

  Future<void> _save() async {
    FocusScope.of(context).unfocus();
    final current = _current.text.trim();
    final next = _next.text.trim();
    setState(() {
      _currentError = _isPin(current) ? null : 'Enter your current 4-digit PIN';
      _nextError = _isPin(next) ? null : 'New PIN must be 4 digits';
      _confirmError = _confirm.text.trim() == next ? null : 'PINs do not match';
      _error = null;
    });
    if (_currentError != null || _nextError != null || _confirmError != null) return;

    setState(() => _busy = true);
    try {
      await MechanicBackend.instance.changePin(current, next);
      if (!mounted) return;
      context.toast('PIN changed. Use it next time you sign in.', icon: Icons.check_circle_outline_rounded);
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.isNetwork) {
          _error = 'Cannot reach the garage server. Try again.';
        } else if (e.status == 401) {
          _currentError = 'Current PIN is wrong';
        } else {
          _error = e.message;
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(text, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.ink)),
      );

  Widget _field(TextEditingController c, String hint, String? error, {TextInputAction action = TextInputAction.next, VoidCallback? onDone}) {
    return TextField(
      controller: c,
      obscureText: true,
      keyboardType: TextInputType.number,
      maxLength: 4,
      textInputAction: action,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      onSubmitted: onDone == null ? null : (_) => onDone(),
      decoration: InputDecoration(
        hintText: hint,
        counterText: '',
        prefixIcon: Icon(Icons.pin_outlined, color: AppColors.muted),
        errorText: error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MorePage(
      title: 'Change PIN',
      subtitle: 'The 4-digit PIN you use with your employee ID to sign in.',
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
                : const Text('Save new PIN'),
          ),
        ),
      ),
      children: [
        const SizedBox(height: 12),
        _label('Current PIN'),
        _field(_current, 'Current PIN', _currentError),
        const SizedBox(height: 16),
        _label('New PIN'),
        _field(_next, '4 digits', _nextError),
        const SizedBox(height: 16),
        _label('Confirm new PIN'),
        _field(_confirm, 'Type the new PIN again', _confirmError, action: TextInputAction.done, onDone: _save),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(_error!, style: TextStyle(fontSize: 13.5, color: AppColors.danger)),
        ],
      ],
    );
  }
}
