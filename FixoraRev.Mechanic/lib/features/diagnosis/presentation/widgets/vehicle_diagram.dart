import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/diagnosis_entities.dart';

/// Top-down car with tappable hotspots. The selected zone pulses orange
/// (BRD USP 1 – "Problem location view").
class VehicleDiagram extends StatefulWidget {
  const VehicleDiagram(
      {super.key,
      required this.selectedZoneId,
      this.onZoneTap,
      this.height = 380});

  final String? selectedZoneId;
  final ValueChanged<String>? onZoneTap;
  final double height;

  @override
  State<VehicleDiagram> createState() => _VehicleDiagramState();
}

class _VehicleDiagramState extends State<VehicleDiagram>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1300))
    ..repeat();

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  void _handleTap(Offset local, Size size) {
    final onTap = widget.onZoneTap;
    if (onTap == null) return;
    final radius = size.width * 0.06;
    String? best;
    var bestDistance = double.infinity;
    for (final zone in vehicleZones) {
      for (final p in zone.points) {
        final center = Offset(p.dx * size.width, p.dy * size.height);
        final d = (center - local).distance;
        if (d < radius * 1.8 && d < bestDistance) {
          bestDistance = d;
          best = zone.id;
        }
      }
    }
    if (best != null) onTap(best);
  }

  @override
  Widget build(BuildContext context) {
    final height = widget.height;
    final width = height * 0.5;
    final size = Size(width, height);
    return Center(
      child: GestureDetector(
        onTapUp: (d) => _handleTap(d.localPosition, size),
        child: AnimatedBuilder(
          animation: _pulse,
          builder: (_, __) => CustomPaint(
            size: size,
            painter: _CarPainter(
                selected: widget.selectedZoneId, pulse: _pulse.value),
          ),
        ),
      ),
    );
  }
}

class _CarPainter extends CustomPainter {
  _CarPainter({required this.selected, required this.pulse});
  final String? selected;
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    Offset p(double x, double y) => Offset(x * w, y * h);

    final outline = Paint()
      ..color = AppColors.ink
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    // Wheels
    final tyre = Paint()..color = const Color(0xFF2B2B33);
    for (final r in [
      Rect.fromLTRB(0.04 * w, 0.17 * h, 0.2 * w, 0.33 * h),
      Rect.fromLTRB(0.8 * w, 0.17 * h, 0.96 * w, 0.33 * h),
      Rect.fromLTRB(0.04 * w, 0.68 * h, 0.2 * w, 0.84 * h),
      Rect.fromLTRB(0.8 * w, 0.68 * h, 0.96 * w, 0.84 * h),
    ]) {
      canvas.drawRRect(
          RRect.fromRectAndRadius(r, Radius.circular(w * 0.04)), tyre);
    }

    // Mirrors
    final mirror = Paint()..color = const Color(0xFFD9D9E0);
    canvas.drawOval(
        Rect.fromCenter(
            center: p(0.12, 0.37), width: w * 0.12, height: h * 0.025),
        mirror);
    canvas.drawOval(
        Rect.fromCenter(
            center: p(0.88, 0.37), width: w * 0.12, height: h * 0.025),
        mirror);

    // Body
    final body = RRect.fromRectAndRadius(
        Rect.fromLTRB(0.15 * w, 0.02 * h, 0.85 * w, 0.98 * h),
        Radius.circular(w * 0.2));
    canvas.drawRRect(body, Paint()..color = Colors.white);
    canvas.drawRRect(
      body,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x14F26B1D), Color(0x00F26B1D), Color(0x0A1E1E26)],
        ).createShader(body.outerRect),
    );
    canvas.drawRRect(body, outline);

    // Hood line
    final hood = Path()
      ..moveTo(0.2 * w, 0.29 * h)
      ..quadraticBezierTo(0.5 * w, 0.26 * h, 0.8 * w, 0.29 * h);
    canvas.drawPath(hood, outline..strokeWidth = 1.2);

    // Windshield
    final glass = Paint()..color = const Color(0xFFDDE7F2);
    final windshield = Path()
      ..moveTo(0.23 * w, 0.31 * h)
      ..lineTo(0.77 * w, 0.31 * h)
      ..lineTo(0.71 * w, 0.4 * h)
      ..lineTo(0.29 * w, 0.4 * h)
      ..close();
    canvas.drawPath(windshield, glass);

    // Roof
    canvas.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTRB(0.27 * w, 0.42 * h, 0.73 * w, 0.7 * h),
          Radius.circular(w * 0.06)),
      Paint()..color = const Color(0xFFF2F2F5),
    );

    // Rear window
    final rear = Path()
      ..moveTo(0.29 * w, 0.72 * h)
      ..lineTo(0.71 * w, 0.72 * h)
      ..lineTo(0.75 * w, 0.8 * h)
      ..lineTo(0.25 * w, 0.8 * h)
      ..close();
    canvas.drawPath(rear, glass);

    // Lights
    final head = Paint()..color = const Color(0xFFFFC890);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTRB(0.2 * w, 0.035 * h, 0.36 * w, 0.055 * h),
            const Radius.circular(4)),
        head);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTRB(0.64 * w, 0.035 * h, 0.8 * w, 0.055 * h),
            const Radius.circular(4)),
        head);
    final tail = Paint()..color = const Color(0xFFF08A8A);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTRB(0.2 * w, 0.945 * h, 0.36 * w, 0.962 * h),
            const Radius.circular(4)),
        tail);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTRB(0.64 * w, 0.945 * h, 0.8 * w, 0.962 * h),
            const Radius.circular(4)),
        tail);

    // FRONT label
    final tp = TextPainter(
      text: TextSpan(
        text: 'FRONT',
        style: TextStyle(
            color: AppColors.muted,
            fontSize: 9,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.2),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset((w - tp.width) / 2, 0.105 * h));

    // Hotspots
    final r = w * 0.055;
    for (final zone in vehicleZones) {
      final isSelected = zone.id == selected;
      for (final pt in zone.points) {
        final c = p(pt.dx, pt.dy);
        if (isSelected) {
          canvas.drawCircle(
            c,
            r * (1 + pulse * 1.3),
            Paint()
              ..color = AppColors.primary.withValues(alpha: (1 - pulse) * 0.35),
          );
          canvas.drawCircle(c, r, Paint()..color = AppColors.primary);
          canvas.drawCircle(c, r * 0.38, Paint()..color = Colors.white);
        } else {
          canvas.drawCircle(c, r * 0.75, Paint()..color = Colors.white);
          canvas.drawCircle(
            c,
            r * 0.75,
            Paint()
              ..color = AppColors.primary.withValues(alpha: 0.7)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 1.6,
          );
          canvas.drawCircle(c, r * 0.22,
              Paint()..color = AppColors.primary.withValues(alpha: 0.7));
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _CarPainter old) =>
      old.selected != selected || old.pulse != pulse;
}
