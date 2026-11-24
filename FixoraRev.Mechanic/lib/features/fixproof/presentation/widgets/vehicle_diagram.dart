import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';

typedef VehicleZoneTap = void Function(String componentId, String label);

/// Top-down schematic with tappable zones for common vehicle areas.
class VehicleDiagram extends StatelessWidget {
  const VehicleDiagram({super.key, required this.onZoneTap, this.selectedId});

  final VehicleZoneTap onZoneTap;
  final String? selectedId;

  static const _zones = <String, Rect>{
    'hood': Rect.fromLTWH(0.32, 0.08, 0.36, 0.14),
    'windshield': Rect.fromLTWH(0.30, 0.22, 0.40, 0.10),
    'roof': Rect.fromLTWH(0.28, 0.32, 0.44, 0.26),
    'engine': Rect.fromLTWH(0.34, 0.58, 0.32, 0.10),
    'front_bumper': Rect.fromLTWH(0.26, 0.00, 0.48, 0.08),
    'rear_bumper': Rect.fromLTWH(0.26, 0.92, 0.48, 0.08),
    'lf_wheel': Rect.fromLTWH(0.10, 0.18, 0.14, 0.22),
    'rf_wheel': Rect.fromLTWH(0.76, 0.18, 0.14, 0.22),
    'lr_wheel': Rect.fromLTWH(0.10, 0.62, 0.14, 0.22),
    'rr_wheel': Rect.fromLTWH(0.76, 0.62, 0.14, 0.22),
    'lf_door': Rect.fromLTWH(0.22, 0.36, 0.12, 0.22),
    'rf_door': Rect.fromLTWH(0.66, 0.36, 0.12, 0.22),
    'underbody': Rect.fromLTWH(0.30, 0.70, 0.40, 0.18),
  };

  static const _labels = <String, String>{
    'hood': 'Hood',
    'windshield': 'Windshield',
    'roof': 'Roof',
    'engine': 'Engine',
    'front_bumper': 'Front bumper',
    'rear_bumper': 'Rear bumper',
    'lf_wheel': 'LF wheel',
    'rf_wheel': 'RF wheel',
    'lr_wheel': 'LR wheel',
    'rr_wheel': 'RR wheel',
    'lf_door': 'LF door',
    'rf_door': 'RF door',
    'underbody': 'Underbody',
  };

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 0.55,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final w = constraints.maxWidth;
          final h = constraints.maxHeight;
          return Stack(
            fit: StackFit.expand,
            children: [
              DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.surfaceElevated,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.outline),
                ),
                child: CustomPaint(painter: _CarOutlinePainter()),
              ),
              for (final entry in _zones.entries)
                Positioned(
                  left: entry.value.left * w,
                  top: entry.value.top * h,
                  width: entry.value.width * w,
                  height: entry.value.height * h,
                  child: Material(
                    color: selectedId == entry.key
                        ? AppColors.primary.withValues(alpha: 0.35)
                        : AppColors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => onZoneTap(
                        entry.key,
                        _labels[entry.key] ?? entry.key,
                      ),
                      child: Center(
                        child: Text(
                          _labels[entry.key] ?? entry.key,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: AppColors.ink,
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _CarOutlinePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.body.withValues(alpha: 0.4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final path = Path()
      ..moveTo(size.width * 0.35, size.height * 0.05)
      ..quadraticBezierTo(
        size.width * 0.5,
        0,
        size.width * 0.65,
        size.height * 0.05,
      )
      ..lineTo(size.width * 0.78, size.height * 0.35)
      ..lineTo(size.width * 0.78, size.height * 0.75)
      ..lineTo(size.width * 0.65, size.height * 0.98)
      ..lineTo(size.width * 0.35, size.height * 0.98)
      ..lineTo(size.width * 0.22, size.height * 0.75)
      ..lineTo(size.width * 0.22, size.height * 0.35)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}