import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../app/theme/bronze_colors.dart';

/// Numeric PIN pad — digits + backspace.
class PinPad extends StatelessWidget {
  const PinPad({
    super.key,
    required this.onDigit,
    required this.onBackspace,
  });

  final ValueChanged<String> onDigit;
  final VoidCallback onBackspace;

  @override
  Widget build(BuildContext context) {
    Widget key(String label, {VoidCallback? onTap, IconData? icon}) {
      return Expanded(
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Material(
            color: BronzeColors.surfaceElevated,
            borderRadius: BorderRadius.circular(16),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () {
                HapticFeedback.selectionClick();
                onTap?.call();
              },
              child: SizedBox(
                height: 64,
                child: Center(
                  child: icon != null
                      ? Icon(icon, color: BronzeColors.cream)
                      : Text(
                          label,
                          style: Theme.of(context).textTheme.headlineMedium,
                        ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Column(
      children: [
        Row(children: [
          key('1', onTap: () => onDigit('1')),
          key('2', onTap: () => onDigit('2')),
          key('3', onTap: () => onDigit('3')),
        ]),
        Row(children: [
          key('4', onTap: () => onDigit('4')),
          key('5', onTap: () => onDigit('5')),
          key('6', onTap: () => onDigit('6')),
        ]),
        Row(children: [
          key('7', onTap: () => onDigit('7')),
          key('8', onTap: () => onDigit('8')),
          key('9', onTap: () => onDigit('9')),
        ]),
        Row(children: [
          const Expanded(child: SizedBox(height: 64)),
          key('0', onTap: () => onDigit('0')),
          key('', icon: Icons.backspace_outlined, onTap: onBackspace),
        ]),
      ],
    );
  }
}

class PinDots extends StatelessWidget {
  const PinDots({
    super.key,
    required this.length,
    this.max = 4,
    this.error = false,
  });

  final int length;
  final int max;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final fill = error ? BronzeColors.danger : BronzeColors.bronze;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(max, (i) {
        final on = i < length;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          margin: const EdgeInsets.symmetric(horizontal: 8),
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: on ? fill : Colors.transparent,
            border: Border.all(
              color: error ? BronzeColors.danger : BronzeColors.outline,
              width: 1.5,
            ),
          ),
        );
      }),
    );
  }
}
