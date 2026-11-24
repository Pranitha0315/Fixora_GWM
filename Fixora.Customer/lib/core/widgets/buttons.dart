import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'glass.dart';

/// Main call-to-action (Workshop palette): a pill-shaped button. The default
/// is solid – white on the night workshop, deep teal in daylight – like the
/// login "Log in" button. Custom gradients (SOS, success) keep their colour
/// with a glossy highlight (Approve, View Invoice ...).
class PrimaryButton extends StatefulWidget {
  final String label;
  final IconData? icon;
  final IconData? trailingIcon;
  final VoidCallback? onPressed;
  final Gradient gradient;
  final double height;
  final double fontSize;
  final bool loading;

  const PrimaryButton({
    super.key,
    required this.label,
    this.icon,
    this.trailingIcon,
    this.onPressed,
    this.gradient = AppColors.primaryGradient,
    this.height = 54,
    this.fontSize = 16,
    this.loading = false,
  });

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.loading;
    final solid = identical(widget.gradient, AppColors.primaryGradient);
    final fg = solid ? AppColors.buttonFg : Colors.white;
    final r = BorderRadius.circular(widget.height / 2);
    return GestureDetector(
      onTapDown: enabled ? (_) => setState(() => _down = true) : null,
      onTapCancel: enabled ? () => setState(() => _down = false) : null,
      onTapUp: enabled ? (_) => setState(() => _down = false) : null,
      onTap: enabled ? widget.onPressed : null,
      child: AnimatedScale(
        scale: _down && !(MediaQuery.maybeDisableAnimationsOf(context) ?? false) ? 0.96 : 1,
        duration: Duration(milliseconds: _down ? 90 : 240),
        curve: _down ? Curves.easeOut : Curves.easeOutBack,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: enabled || widget.loading ? 1 : 0.5,
          child: Container(
            height: widget.height,
            decoration: BoxDecoration(
              color: solid ? AppColors.buttonBg : null,
              gradient: solid ? null : widget.gradient,
              borderRadius: r,
            ),
            child: DecoratedBox(
              decoration: BoxDecoration(borderRadius: r),
              child: Center(
              child: widget.loading
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2.4, color: fg),
                    )
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (widget.icon != null) ...[
                          Icon(widget.icon, color: fg, size: 21),
                          const SizedBox(width: 10),
                        ],
                        Flexible(
                          child: Text(
                            widget.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: fg,
                              fontSize: widget.fontSize,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        if (widget.trailingIcon != null) ...[
                          const SizedBox(width: 10),
                          Icon(widget.trailingIcon, color: fg, size: 21),
                        ],
                      ],
                    ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Pill-shaped glass outlined button (Cancel, Reject, Pay at Garage ...).
/// Default colour = neutral (white on night / ink on day) like the login's
/// "SMS code" / "Scan job card" buttons; pass a colour for danger etc.
class OutlineButton2 extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final Color color;
  final double height;
  final double fontSize;
  final Color? fill;

  const OutlineButton2({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.color = AppColors.primary,
    this.height = 54,
    this.fontSize = 16,
    this.fill,
  });

  @override
  Widget build(BuildContext context) {
    final neutral = color == AppColors.primary;
    final c = neutral ? AppColors.navy : color;
    final r = height / 2;
    return FxPressable(
      radius: r,
      pressedScale: 0.97,
      onTap: onPressed,
      child: FxGlass(
        radius: r,
        color: fill ?? AppColors.fieldFill,
        borderColor: neutral ? AppColors.edgeLight : c.o(0.85),
        borderWidth: neutral ? 1.2 : 1.4,
        child: SizedBox(
          height: height,
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  Icon(icon, color: c, size: 21),
                  const SizedBox(width: 10),
                ],
                Flexible(
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: c, fontSize: fontSize, fontWeight: neutral ? FontWeight.w600 : FontWeight.w700),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Small glass pill button (Download / Share).
class PillButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback? onTap;
  const PillButton({super.key, required this.label, required this.icon, this.onTap});

  @override
  Widget build(BuildContext context) {
    return FxPressable(
      radius: 30,
      pressedScale: 0.95,
      onTap: onTap,
      child: FxGlass(
        radius: 30,
        shadow: AppShadows.soft,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: AppColors.link),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w600, color: AppColors.navy)),
          ],
        ),
      ),
    );
  }
}

/// Blue underlined text link ("Request Changes").
class LinkButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;
  final Color color;
  const LinkButton({
    super.key,
    required this.label,
    this.icon,
    this.onTap,
    this.color = AppColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    final color = this.color == AppColors.primary ? AppColors.link : this.color;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 19, color: color),
              const SizedBox(width: 7),
            ],
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 15,
                fontWeight: FontWeight.w600,
                decoration: TextDecoration.underline,
                decorationColor: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
