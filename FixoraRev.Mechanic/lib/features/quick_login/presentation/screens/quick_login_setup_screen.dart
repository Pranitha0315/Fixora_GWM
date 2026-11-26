import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/utils/nav.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../data/quick_login_store.dart';
import '../widgets/pin_pad.dart';

/// Create (or change) the 4-digit Mechanic PIN for quick login.
/// Step 1: enter PIN · Step 2: confirm. Shown after the first password
/// login, or from Profile.
class QuickLoginSetupScreen extends StatefulWidget {
  const QuickLoginSetupScreen({
    super.key,
    required this.email,
    required this.name,
    this.fromProfile = false,
  });

  final String email;
  final String name;

  /// From Profile: pop back when done. After login: continue to Home.
  final bool fromProfile;

  @override
  State<QuickLoginSetupScreen> createState() => _QuickLoginSetupScreenState();
}

class _QuickLoginSetupScreenState extends State<QuickLoginSetupScreen> {
  int _step = 0; // 0 enter · 1 confirm
  String _first = '';
  String _pin = '';
  bool _error = false;
  String? _message;
  bool _saving = false;

  static const _weak = {'0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '0123'};

  void _digit(String d) {
    if (_pin.length >= QuickLoginStore.pinLength || _saving) return;
    setState(() {
      _error = false;
      _message = null;
      _pin += d;
    });
    if (_pin.length == QuickLoginStore.pinLength) {
      Future<void>.delayed(const Duration(milliseconds: 160), _complete);
    }
  }

  void _back() {
    if (_pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  void _complete() {
    if (!mounted) return;
    if (_step == 0) {
      if (_weak.contains(_pin)) {
        setState(() {
          _error = true;
          _message = 'Too easy to guess. Try a different PIN.';
          _pin = '';
        });
        return;
      }
      setState(() {
        _first = _pin;
        _pin = '';
        _step = 1;
      });
    } else if (_step == 1) {
      if (_pin != _first) {
        setState(() {
          _error = true;
          _message = 'PINs did not match. Start again.';
          _pin = '';
          _first = '';
          _step = 0;
        });
        return;
      }
      _save();
    }
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    await QuickLoginStore.instance.enable(
      email: widget.email,
      name: widget.name,
      pin: _first,
    );
    if (!mounted) return;
    context.toast('Quick login is on. Next time just enter your PIN.', icon: Icons.check_circle_rounded);
    _finish();
  }

  void _finish() {
    if (widget.fromProfile) {
      Navigator.of(context).pop(true);
    } else {
      context.resetTo(const MainShell());
    }
  }

  @override
  Widget build(BuildContext context) {
    final titles = ['Create your Mechanic PIN', 'Confirm your PIN'];
    final subtitles = [
      'Use 4 digits to sign in quickly on this phone. Don\'t share it with anyone.',
      'Enter the same 4 digits again.',
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Quick login'),
        actions: [
          TextButton(
              onPressed: _saving ? null : _finish,
              child: Text(widget.fromProfile ? 'Cancel' : 'Skip for now'),
            ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) {
            final tight = box.maxHeight < 640;
            return Padding(
              padding: EdgeInsets.fromLTRB(24, tight ? 4 : 8, 24, tight ? 8 : 16),
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        children: [
                          Row(
                            children: [
                              for (var i = 0; i < 2; i++)
                                Expanded(
                                  child: Container(
                                    height: 5,
                                    margin: EdgeInsets.only(right: i == 1 ? 0 : 6),
                                    decoration: BoxDecoration(
                                      color: i <= _step ? AppColors.primary : AppColors.border,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          SizedBox(height: tight ? 14 : 28),
                          Container(
                            width: tight ? 60 : 72,
                            height: tight ? 60 : 72,
                            decoration: BoxDecoration(
                              color: AppColors.primarySoft,
                              borderRadius: BorderRadius.circular(22),
                            ),
                            child: Icon(Icons.pin_rounded,
                                size: tight ? 32 : 38, color: AppColors.primaryStrong),
                          ),
                          SizedBox(height: tight ? 12 : 18),
                          Text(titles[_step], style: AppText.title, textAlign: TextAlign.center),
                          const SizedBox(height: 6),
                          Text(subtitles[_step],
                              style: AppText.body.copyWith(color: AppColors.muted),
                              textAlign: TextAlign.center),
                          SizedBox(height: tight ? 16 : 28),
                          PinDots(
                              length: QuickLoginStore.pinLength,
                              filled: _pin.length,
                              error: _error),
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 22,
                            child: _message == null
                                ? null
                                : Text(_message!,
                                    style: AppText.label.copyWith(color: AppColors.danger)),
                          ),
                        ],
                      ),
                    ),
                  ),
                  PinPad(onDigit: _digit, onBackspace: _back, compact: tight),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
