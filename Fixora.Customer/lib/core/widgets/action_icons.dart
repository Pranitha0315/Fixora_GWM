import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Hand-drawn icons for the two big Home actions. Material has no siren and its
/// calendar is a thin outline, so these are painted (crisp at any size, both themes).

/// Red emergency siren: dome light on a dark base, with light rays that pulse.
/// The pulse stops when the phone asks for less motion.
class SirenIcon extends StatefulWidget {
  const SirenIcon({super.key, this.size = 30, this.animate = true});

  final double size;
  final bool animate;

  @override
  State<SirenIcon> createState() => _SirenIconState();
}

class _SirenIconState extends State<SirenIcon> with SingleTickerProviderStateMixin {
  late final AnimationController _pulse =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (widget.animate && !still) {
      if (!_pulse.isAnimating) _pulse.repeat(reverse: true);
    } else {
      _pulse
        ..stop()
        ..value = 1;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, _) => CustomPaint(
          size: Size.square(widget.size),
          painter: _SirenPainter(rays: 0.35 + 0.65 * Curves.easeInOut.transform(_pulse.value), base: AppColors.navy),
        ),
      ),
    );
  }
}

class _SirenPainter extends CustomPainter {
  _SirenPainter({required this.rays, required this.base});

  /// 0..1 opacity of the light rays.
  final double rays;
  final Color base;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.scale(s);

    final ray = Paint()
      ..color = AppColors.danger.withValues(alpha: rays)
      ..strokeWidth = 1.7
      ..strokeCap = StrokeCap.round;
    canvas
      ..drawLine(const Offset(12, 1.3), const Offset(12, 3.6), ray)
      ..drawLine(const Offset(4.4, 4.2), const Offset(6.0, 5.8), ray)
      ..drawLine(const Offset(19.6, 4.2), const Offset(18.0, 5.8), ray)
      ..drawLine(const Offset(1.2, 10.8), const Offset(3.4, 10.8), ray)
      ..drawLine(const Offset(20.6, 10.8), const Offset(22.8, 10.8), ray);

    // Dome.
    final dome = Path()
      ..moveTo(6, 18)
      ..lineTo(6, 12.5)
      ..arcToPoint(const Offset(18, 12.5), radius: const Radius.circular(6))
      ..lineTo(18, 18)
      ..close();
    canvas.drawPath(dome, Paint()..color = AppColors.danger);

    // Lamp inside and a shine on the glass.
    canvas.drawCircle(const Offset(12, 14.4), 1.8, Paint()..color = const Color(0xFFFFD54F));
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(8.0, 9.6, 1.9, 4.6), const Radius.circular(1)),
      Paint()..color = Colors.white.withValues(alpha: 0.7),
    );

    // Base.
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(3.8, 17.6, 16.4, 3.8), const Radius.circular(1.4)),
      Paint()..color = base,
    );
  }

  @override
  bool shouldRepaint(_SirenPainter old) => old.rays != rays || old.base != base;
}

/// Booking: calendar page with a teal header, binder rings, day dots and a green tick.
class BookingIcon extends StatelessWidget {
  const BookingIcon({super.key, this.size = 30});

  final double size;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: CustomPaint(
          size: Size.square(size),
          painter: _BookingPainter(page: AppColors.surfaceSolid, ink: AppColors.navy, header: AppColors.link),
        ),
      );
}

class _BookingPainter extends CustomPainter {
  _BookingPainter({required this.page, required this.ink, required this.header});

  final Color page;
  final Color ink;
  final Color header;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 24;
    canvas.scale(s);

    const body = Rect.fromLTWH(2.6, 4.6, 18.8, 16.6);
    final rrect = RRect.fromRectAndRadius(body, const Radius.circular(3));
    canvas.drawRRect(rrect, Paint()..color = page);

    // Header band (top of the page).
    canvas.save();
    canvas.clipRRect(rrect);
    canvas.drawRect(const Rect.fromLTWH(2.6, 4.6, 18.8, 5.2), Paint()..color = header);
    canvas.restore();
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = header
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5,
    );

    // Binder rings.
    final ring = Paint()..color = ink;
    canvas
      ..drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(6.6, 2.4, 2.2, 4.6), const Radius.circular(1.1)), ring)
      ..drawRRect(RRect.fromRectAndRadius(const Rect.fromLTWH(15.2, 2.4, 2.2, 4.6), const Radius.circular(1.1)), ring);

    // Day dots.
    final dot = Paint()..color = header.withValues(alpha: 0.55);
    for (final o in const [Offset(7, 13.2), Offset(12, 13.2), Offset(17, 13.2), Offset(7, 17.4), Offset(12, 17.4)]) {
      canvas.drawCircle(o, 1.15, dot);
    }

    // Booked: green tick badge.
    canvas.drawCircle(const Offset(18.2, 18.2), 4.4, Paint()..color = page);
    canvas.drawCircle(const Offset(18.2, 18.2), 3.7, Paint()..color = AppColors.success);
    final tick = Path()
      ..moveTo(16.4, 18.3)
      ..lineTo(17.7, 19.6)
      ..lineTo(20.1, 17.0);
    canvas.drawPath(
      tick,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.5
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_BookingPainter old) => old.page != page || old.ink != ink || old.header != header;
}
