import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Orange gradient call-to-action with a built-in loading state.
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.loadingLabel,
    this.icon,
    this.height = 54,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final String? loadingLabel;
  final IconData? icon;
  final double height;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: onPressed == null && !loading ? 0.45 : 1,
      child: Container(
        height: height,
        decoration: BoxDecoration(
          gradient: AppColors.primaryGradient,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.28),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: enabled ? onPressed : null,
            child: Center(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (loading)
                    SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        color: AppColors.onPrimary,
                      ),
                    )
                  else if (icon != null)
                    Icon(icon, color: AppColors.onPrimary, size: 20),
                  if (loading || icon != null) const SizedBox(width: 10),
                  Text(
                    loading ? (loadingLabel ?? label) : label,
                    style: TextStyle(
                      color: AppColors.onPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// White outlined button (secondary actions, "Continue with Google", etc.)
class OutlineButtonX extends StatelessWidget {
  const OutlineButtonX({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.leading,
    this.loading = false,
    this.color,
    this.borderColor,
    this.height = 52,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Widget? leading;
  final bool loading;
  final Color? color;
  final Color? borderColor;
  final double height;

  @override
  Widget build(BuildContext context) {
    final color = this.color ?? AppColors.ink;
    final borderColor = this.borderColor ?? AppColors.border;
    return SizedBox(
      height: height,
      child: OutlinedButton(
        onPressed: loading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          backgroundColor: AppColors.surface,
          side: BorderSide(color: borderColor, width: 1.2),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (loading)
              SizedBox(
                width: 18,
                height: 18,
                child:
                    CircularProgressIndicator(strokeWidth: 2.2, color: color),
              )
            else if (leading != null)
              leading!
            else if (icon != null)
              Icon(icon, size: 19, color: color),
            if (loading || leading != null || icon != null)
              const SizedBox(width: 10),
            Flexible(
              child: Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: color)),
            ),
          ],
        ),
      ),
    );
  }
}

/// The four-colour "G" mark used on the Continue with Google button.
class GoogleGlyph extends StatelessWidget {
  const GoogleGlyph({super.key, this.size = 20});
  final double size;

  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _GooglePainter());
}

class _GooglePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.2;
    final rect = Offset(stroke / 2, stroke / 2) &
        Size(size.width - stroke, size.height - stroke);
    Paint p(Color c) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    const deg = 3.1415926535 / 180;
    canvas.drawArc(
        rect, -40 * deg, -100 * deg, false, p(const Color(0xFFEA4335)));
    canvas.drawArc(
        rect, -140 * deg, -90 * deg, false, p(const Color(0xFFFBBC05)));
    canvas.drawArc(
        rect, 130 * deg, -90 * deg, false, p(const Color(0xFF34A853)));
    canvas.drawArc(
        rect, 40 * deg, -40 * deg, false, p(const Color(0xFF4285F4)));
    final bar = Paint()..color = const Color(0xFF4285F4);
    canvas.drawRect(
      Rect.fromLTWH(size.width * 0.5, size.height * 0.5 - stroke / 2,
          size.width * 0.5, stroke),
      bar,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
