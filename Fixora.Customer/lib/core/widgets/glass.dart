import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// ---------------------------------------------------------------------------
/// Garage Glass building blocks (Liquid Glass + Spatial UI).
///
/// * [FxGlass]      – a frosted glass panel with a specular edge and depth.
/// * [FxPressable]  – spatial press feedback (panel sinks a little, springs
///                    back) plus the normal ink ripple.
/// * [GlassEdgePainter] – the light-catching rim of a glass panel.
///
/// Real backdrop blur is expensive, so it is only switched on for floating
/// chrome (bottom nav, back buttons, sheets). Content cards stay cheap: the
/// garage background is already made of soft blurred lights, so a
/// translucent panel over it reads as frosted glass without a blur pass.
///
/// When the phone asks for high contrast, glass falls back to solid panels.
/// ---------------------------------------------------------------------------

/// Paints the rim of a glass panel: bright on the lit top-left side, faint
/// along the middle and a soft reflection again at the bottom-right corner.
class GlassEdgePainter extends CustomPainter {
  final double radius;
  final Color light;
  final Color shade;
  final double width;
  final BoxShape shape;

  const GlassEdgePainter({
    required this.radius,
    required this.light,
    required this.shade,
    this.width = 1.2,
    this.shape = BoxShape.rectangle,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (size.isEmpty) return;
    final rect = Offset.zero & size;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [light, shade, shade, Color.lerp(shade, light, 0.55)!],
        stops: const [0, 0.42, 0.78, 1],
      ).createShader(rect);
    final inner = rect.deflate(width / 2);
    if (shape == BoxShape.circle) {
      canvas.drawOval(inner, paint);
    } else {
      final r = (radius - width / 2).clamp(0.0, 999.0).toDouble();
      canvas.drawRRect(RRect.fromRectAndRadius(inner, Radius.circular(r)), paint);
    }
  }

  @override
  bool shouldRepaint(covariant GlassEdgePainter old) =>
      old.radius != radius ||
      old.light != light ||
      old.shade != shade ||
      old.width != width ||
      old.shape != shape;
}

/// Frosted glass panel.
class FxGlass extends StatelessWidget {
  final Widget child;
  final double radius;

  /// Backdrop blur sigma. 0 = no blur (cheap, use for content cards).
  final double blur;
  final EdgeInsetsGeometry? padding;

  /// Flat fill. When both [color] and [gradient] are null the standard
  /// glass gradient (sheen → surface) is used.
  final Color? color;
  final Gradient? gradient;
  final List<BoxShadow>? shadow;

  /// Solid border instead of the specular rim (selected states).
  final Color? borderColor;
  final double borderWidth;

  /// Draw the specular rim.
  final bool edge;
  final BoxShape shape;

  /// Always clip the child to the rounded shape (e.g. a hazard stripe on top).
  final bool clip;

  const FxGlass({
    super.key,
    required this.child,
    this.radius = 22,
    this.blur = 0,
    this.padding,
    this.color,
    this.gradient,
    this.shadow,
    this.borderColor,
    this.borderWidth = 1.3,
    this.edge = true,
    this.shape = BoxShape.rectangle,
    this.clip = false,
  });

  @override
  Widget build(BuildContext context) {
    final solid = MediaQuery.maybeHighContrastOf(context) ?? false;
    final circle = shape == BoxShape.circle;
    final borderRadius = circle ? null : BorderRadius.circular(radius);

    Color? fill = color;
    Gradient? grad = gradient;
    if (solid) {
      fill = AppColors.surfaceSolid;
      grad = null;
    } else if (fill == null && grad == null) {
      grad = AppColors.glassGradient;
    }

    Widget panel = DecoratedBox(
      decoration: BoxDecoration(
        shape: shape,
        borderRadius: borderRadius,
        color: grad == null ? fill : null,
        gradient: grad,
        border: borderColor != null
            ? Border.all(color: borderColor!, width: borderWidth)
            : (solid ? Border.all(color: AppColors.border) : null),
      ),
      child: padding == null ? child : Padding(padding: padding!, child: child),
    );

    if (edge && borderColor == null && !solid) {
      panel = CustomPaint(
        foregroundPainter: GlassEdgePainter(
          radius: radius,
          light: AppColors.edgeLight,
          shade: AppColors.edgeShade,
          shape: shape,
        ),
        child: panel,
      );
    }

    final doBlur = blur > 0 && !solid;
    if (doBlur) {
      panel = BackdropFilter(
        filter: ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: panel,
      );
    }
    if (doBlur || clip) {
      panel = circle
          ? ClipOval(child: panel)
          : ClipRRect(borderRadius: borderRadius!, child: panel);
    }

    final s = shadow;
    if (s == null || s.isEmpty) return panel;
    return DecoratedBox(
      decoration: BoxDecoration(shape: shape, borderRadius: borderRadius, boxShadow: s),
      child: panel,
    );
  }
}

/// Spatial press: the panel sinks slightly while pressed and springs back,
/// with the usual ink ripple. Honours the system "reduce motion" setting.
class FxPressable extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final double radius;
  final double pressedScale;
  final ShapeBorder? customBorder;

  const FxPressable({
    super.key,
    required this.child,
    required this.onTap,
    this.radius = 22,
    this.pressedScale = 0.975,
    this.customBorder,
  });

  @override
  State<FxPressable> createState() => _FxPressableState();
}

class _FxPressableState extends State<FxPressable> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onTap == null) return widget.child;
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return AnimatedScale(
      scale: _down && !still ? widget.pressedScale : 1,
      duration: Duration(milliseconds: _down ? 90 : 260),
      curve: _down ? Curves.easeOut : Curves.easeOutBack,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: widget.customBorder == null ? BorderRadius.circular(widget.radius) : null,
          customBorder: widget.customBorder,
          onHighlightChanged: _set,
          onTap: widget.onTap,
          child: widget.child,
        ),
      ),
    );
  }
}

/// Thin yellow / black diagonal stripe, like the safety markings on a
/// workshop floor or vehicle lift. Purely decorative.
class HazardStripe extends StatelessWidget {
  final double height;
  final double stripeWidth;
  const HazardStripe({super.key, this.height = 7, this.stripeWidth = 12});

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _HazardPainter(
            colorA: AppColors.hazard,
            colorB: AppColors.hazardDark,
            stripeWidth: stripeWidth,
          ),
        ),
      ),
    );
  }
}

class _HazardPainter extends CustomPainter {
  final Color colorA;
  final Color colorB;
  final double stripeWidth;
  const _HazardPainter({required this.colorA, required this.colorB, required this.stripeWidth});

  @override
  void paint(Canvas canvas, Size size) {
    canvas.clipRect(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, Paint()..color = colorB);
    final paint = Paint()..color = colorA;
    final h = size.height;
    for (double x = -h; x < size.width + h; x += stripeWidth * 2) {
      final path = Path()
        ..moveTo(x, h)
        ..lineTo(x + h, 0)
        ..lineTo(x + h + stripeWidth, 0)
        ..lineTo(x + stripeWidth, h)
        ..close();
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _HazardPainter old) =>
      old.colorA != colorA || old.colorB != colorB || old.stripeWidth != stripeWidth;
}
