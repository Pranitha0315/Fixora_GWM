import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme/app_colors.dart';

/// Four dots that fill as the PIN is typed. Shakes when [error] is set.
class PinDots extends StatelessWidget {
  const PinDots({super.key, required this.length, required this.filled, this.error = false});

  final int length;
  final int filled;
  final bool error;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '$filled of $length digits entered',
      child: TweenAnimationBuilder<double>(
        key: ValueKey(error),
        tween: Tween(begin: error ? 1 : 0, end: 0),
        duration: const Duration(milliseconds: 420),
        builder: (_, t, child) => Transform.translate(
          offset: Offset(error ? math.sin(t * math.pi * 6) * 10 * t : 0, 0),
          child: child,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (var i = 0; i < length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                margin: const EdgeInsets.symmetric(horizontal: 6),
                width: 54,
                height: 58,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(
                    color: error ? AppColors.dangerBright : (i == filled ? AppColors.primaryStrong : Colors.transparent),
                    width: 2,
                  ),
                  boxShadow: AppColors.cardShadow,
                ),
                child: AnimatedScale(
                  scale: i < filled ? 1 : 0,
                  duration: const Duration(milliseconds: 150),
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: error ? AppColors.dangerBright : AppColors.primaryStrong,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Keypad on a white card: big cream keys (easy with gloves), delete key bottom right.
class PinPad extends StatelessWidget {
  const PinPad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
    this.compact = false,
  });

  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;

  /// Shorter keys for short screens so the pad fits without overflow.
  final bool compact;

  Widget _key({String? digit, IconData? icon, VoidCallback? onTap, String? label}) {
    final keyH = compact ? 52.0 : 60.0;
    return Expanded(
      child: Padding(
        padding: EdgeInsets.all(compact ? 3 : 4),
        child: onTap == null
            ? SizedBox(height: keyH)
            : Semantics(
                button: true,
                label: label ?? digit,
                excludeSemantics: true,
                child: Material(
                  color: digit != null ? AppColors.surfaceAlt : Colors.transparent,
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: () {
                      HapticFeedback.selectionClick();
                      onTap();
                    },
                    child: SizedBox(
                      height: keyH,
                      child: Center(
                        child: digit != null
                            ? Text(digit,
                                style: TextStyle(
                                  fontSize: compact ? 22 : 24,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.ink,
                                ))
                            : Icon(icon, size: compact ? 24 : 26, color: AppColors.ink),
                      ),
                    ),
                  ),
                ),
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    Widget d(String n) => _key(digit: n, onTap: () => onDigit(n));
    return Container(
      padding: EdgeInsets.all(compact ? 8 : 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(28),
        boxShadow: AppColors.cardShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(children: [d('1'), d('2'), d('3')]),
          Row(children: [d('4'), d('5'), d('6')]),
          Row(children: [d('7'), d('8'), d('9')]),
          Row(children: [
            _key(),
            d('0'),
            _key(icon: Icons.backspace_outlined, onTap: onBackspace, label: 'Delete last digit'),
          ]),
        ],
      ),
    );
  }
}
