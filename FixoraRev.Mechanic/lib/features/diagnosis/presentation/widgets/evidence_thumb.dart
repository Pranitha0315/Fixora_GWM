import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../domain/diagnosis_entities.dart';

/// Placeholder image for captured evidence (photo / endoscope / thermal).
/// In production these are the real captures uploaded to blob storage.
class EvidenceThumb extends StatelessWidget {
  const EvidenceThumb({super.key, required this.type, this.seed = 0, this.showLabel = true});
  final EvidenceType type;
  final int seed;

  /// Off for small thumbnails (a list row already names the type), so the badge never overflows.
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: CustomPaint(
        painter: _EvidencePainter(type, seed),
        child: !showLabel ? const SizedBox.expand() : Align(
          alignment: Alignment.topLeft,
          child: Container(
            margin: const EdgeInsets.all(6),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.45),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(type.icon, size: 11, color: Colors.white),
                const SizedBox(width: 3),
                Text(type.label,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EvidencePainter extends CustomPainter {
  _EvidencePainter(this.type, this.seed);
  final EvidenceType type;
  final int seed;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final shift = (seed % 5) / 10;
    switch (type) {
      case EvidenceType.photo:
        canvas.drawRect(
          rect,
          Paint()
            ..shader = LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: const [Color(0xFF6B6F78), Color(0xFF2E3138)],
              stops: [0.1 + shift, 1],
            ).createShader(rect),
        );
        final metal = Paint()..color = const Color(0xFF9EA3AD);
        canvas.drawRRect(
            RRect.fromRectAndRadius(
                Rect.fromLTWH(size.width * 0.2, size.height * 0.45,
                    size.width * 0.6, size.height * 0.25),
                const Radius.circular(6)),
            metal);
        canvas.drawCircle(
            Offset(size.width * (0.3 + shift), size.height * 0.35),
            size.width * 0.1,
            Paint()..color = AppColors.primary.withValues(alpha: 0.8));
      case EvidenceType.endoscope:
        canvas.drawRect(rect, Paint()..color = Colors.black);
        final c = rect.center;
        canvas.drawCircle(
          c,
          size.shortestSide * 0.42,
          Paint()
            ..shader = RadialGradient(colors: const [
              Color(0xFFD9A066),
              Color(0xFF7A4A22),
              Color(0xFF1A0E05),
            ], stops: [
              0.0,
              0.6 + shift / 2,
              1.0
            ]).createShader(
                Rect.fromCircle(center: c, radius: size.shortestSide * 0.42)),
        );
        final cross = Paint()
          ..color = Colors.white54
          ..strokeWidth = 1;
        canvas.drawLine(
            Offset(c.dx - 10, c.dy), Offset(c.dx + 10, c.dy), cross);
        canvas.drawLine(
            Offset(c.dx, c.dy - 10), Offset(c.dx, c.dy + 10), cross);
      case EvidenceType.thermal:
        canvas.drawRect(rect, Paint()..color = const Color(0xFF1B1464));
        void blob(double x, double y, double r, List<Color> colors) {
          final center = Offset(size.width * x, size.height * y);
          canvas.drawCircle(
            center,
            size.shortestSide * r,
            Paint()
              ..shader = RadialGradient(colors: colors).createShader(
                  Rect.fromCircle(
                      center: center, radius: size.shortestSide * r)),
          );
        }

        blob(0.35 + shift, 0.45, 0.55,
            const [Color(0xFFFFF176), Color(0xFFFF7043), Color(0x00E53935)]);
        blob(0.75, 0.75 - shift, 0.35,
            const [Color(0xFFFFA726), Color(0x003949AB)]);
        final tp = TextPainter(
          text: TextSpan(
            text: '${96 + seed % 12}°C',
            style: const TextStyle(
                color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800),
          ),
          textDirection: TextDirection.ltr,
        )..layout();
        tp.paint(canvas,
            Offset(size.width - tp.width - 6, size.height - tp.height - 4));
    }
  }

  @override
  bool shouldRepaint(covariant _EvidencePainter old) =>
      old.type != type || old.seed != seed;
}
