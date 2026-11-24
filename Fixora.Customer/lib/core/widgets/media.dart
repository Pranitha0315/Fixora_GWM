import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../data/models/models.dart';
import '../navigation/nav.dart';
import '../theme/app_colors.dart';
import 'common.dart';

String stageLabel(MediaStage s) {
  switch (s) {
    case MediaStage.before:
      return 'Before';
    case MediaStage.during:
      return 'During';
    case MediaStage.after:
      return 'After';
  }
}

Color stageColor(MediaStage s) {
  switch (s) {
    case MediaStage.before:
      return AppColors.danger;
    case MediaStage.during:
      return AppColors.primary;
    case MediaStage.after:
      return AppColors.success;
  }
}

/// Small coloured label on top of a photo (Before / During / After / LIVE).
class PhotoBadge extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;
  const PhotoBadge(this.text, {super.key, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(7)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 8, color: Colors.white),
            const SizedBox(width: 4),
          ],
          Text(text,
              style: const TextStyle(
                  color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Photo / video tile with badge, expand icon and play overlay.
class MediaTile extends StatelessWidget {
  final MediaItem item;
  final double radius;
  final bool showBadge;
  final bool showExpand;
  final VoidCallback? onTap;
  final VoidCallback? onRemove;

  const MediaTile({
    super.key,
    required this.item,
    this.radius = 14,
    this.showBadge = true,
    this.showExpand = true,
    this.onTap,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (item.bytes != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: Image.memory(item.bytes!, fit: BoxFit.cover),
            )
          else
            AssetPhoto(item.asset, radius: radius),
          if (item.kind == MediaKind.video) ...[
            DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(radius),
                color: Colors.black.o(0.22),
              ),
            ),
            Center(
              child: Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  color: Colors.black.o(0.45),
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 2),
                ),
                child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 30),
              ),
            ),
            if (item.duration != null)
              Positioned(
                left: 8,
                bottom: 8,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.o(0.55),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(item.duration!,
                      style: const TextStyle(
                          color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ),
          ],
          if (showBadge && item.kind == MediaKind.photo)
            Positioned(
              left: 8,
              top: 8,
              child: PhotoBadge(stageLabel(item.stage), color: stageColor(item.stage)),
            ),
          if (showExpand && onRemove == null)
            Positioned(
              right: 7,
              top: 7,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: Colors.black.o(0.35),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: const Icon(Icons.open_in_full_rounded, color: Colors.white, size: 14),
              ),
            ),
          if (onRemove != null)
            Positioned(
              right: 6,
              top: 6,
              child: GestureDetector(
                onTap: onRemove,
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: AppColors.surface,
                    shape: BoxShape.circle,
                    boxShadow: AppShadows.soft,
                  ),
                  child: Icon(Icons.close_rounded, size: 16, color: AppColors.navy),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Full-screen swipeable photo viewer with pinch zoom.
class PhotoViewerScreen extends StatefulWidget {
  final List<MediaItem> items;
  final int initial;
  const PhotoViewerScreen({super.key, required this.items, this.initial = 0});

  static void open(BuildContext context, List<MediaItem> items, int index) {
    context.push(PhotoViewerScreen(items: items, initial: index));
  }

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final PageController _pc = PageController(initialPage: widget.initial);
  late int _i = widget.initial;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.items[_i];
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                  const Spacer(),
                  PhotoBadge(stageLabel(item.stage), color: stageColor(item.stage)),
                  const SizedBox(width: 10),
                  Text('${_i + 1} / ${widget.items.length}',
                      style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pc,
                itemCount: widget.items.length,
                onPageChanged: (v) => setState(() => _i = v),
                itemBuilder: (_, i) => InteractiveViewer(
                  minScale: 1,
                  maxScale: 4,
                  child: Center(
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        if (widget.items[i].bytes != null)
                          Image.memory(widget.items[i].bytes!, fit: BoxFit.contain)
                        else
                          Image.asset(widget.items[i].asset, fit: BoxFit.contain),
                        if (widget.items[i].kind == MediaKind.video)
                          const Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 72),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
              child: Text(item.caption,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Animated success check with confetti sparkles.
class SuccessBurst extends StatefulWidget {
  final double size;
  final IconData icon;
  final Gradient gradient;
  const SuccessBurst({
    super.key,
    this.size = 84,
    this.icon = Icons.check_rounded,
    this.gradient = AppColors.successGradient,
  });

  @override
  State<SuccessBurst> createState() => _SuccessBurstState();
}

class _SuccessBurstState extends State<SuccessBurst> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return SizedBox(
      width: s * 2.2,
      height: s * 1.6,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final pop = Curves.elasticOut.transform((_c.value * 1.4).clamp(0.0, 1.0).toDouble());
          final spread = Curves.easeOutCubic.transform(_c.value);
          return CustomPaint(
            painter: _ConfettiPainter(spread),
            child: Center(
              child: Transform.scale(
                scale: pop,
                child: Container(
                  width: s,
                  height: s,
                  decoration: BoxDecoration(
                    gradient: widget.gradient,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 5),
                    boxShadow: [
                      BoxShadow(
                        color: widget.gradient.colors.last.o(0.35),
                        blurRadius: 22,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Icon(widget.icon, color: Colors.white, size: s * 0.55),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  final double t;
  _ConfettiPainter(this.t);

  static const _colors = [
    Color(0xFF3FEFE1),
    Color(0xFF34C77B),
    Color(0xFFFFB020),
    Color(0xFFFF5F8A),
    Color(0xFF7B5CFF),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    final rnd = math.Random(7);
    for (var i = 0; i < 18; i++) {
      final ang = (i / 18) * math.pi * 2 + rnd.nextDouble() * 0.3;
      final dist = (size.shortestSide * 0.45 + rnd.nextDouble() * size.shortestSide * 0.35) * t;
      final p = c + Offset(math.cos(ang) * dist * 1.3, math.sin(ang) * dist);
      final paint = Paint()..color = _colors[i % _colors.length].o((1 - t * 0.35));
      canvas.save();
      canvas.translate(p.dx, p.dy);
      canvas.rotate(ang + t * 2);
      if (i % 3 == 0) {
        canvas.drawCircle(Offset.zero, 2.6, paint);
      } else if (i % 3 == 1) {
        canvas.drawRRect(
            RRect.fromRectAndRadius(const Rect.fromLTWH(-5, -1.5, 10, 3), const Radius.circular(2)),
            paint);
      } else {
        _star(canvas, paint);
      }
      canvas.restore();
    }
  }

  void _star(Canvas canvas, Paint paint) {
    final path = Path()
      ..moveTo(0, -5)
      ..quadraticBezierTo(0.8, -0.8, 5, 0)
      ..quadraticBezierTo(0.8, 0.8, 0, 5)
      ..quadraticBezierTo(-0.8, 0.8, -5, 0)
      ..quadraticBezierTo(-0.8, -0.8, 0, -5)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter old) => old.t != t;
}

/// Demo QR code drawn with a painter (no package needed).
/// Replace with the `qr_flutter` package when real share links exist.
class DemoQr extends StatelessWidget {
  final String data;
  final double size;
  const DemoQr({super.key, required this.data, this.size = 180});

  @override
  Widget build(BuildContext context) {
    // Always dark modules on a white tile with a quiet zone, in light AND
    // dark mode – scanners (and eyes) need that contrast.
    final quiet = size * 0.07;
    return Semantics(
      label: 'QR code',
      image: true,
      child: Container(
        width: size,
        height: size,
        padding: EdgeInsets.all(quiet),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(size * 0.08)),
        child: CustomPaint(size: Size.square(size - quiet * 2), painter: _QrPainter(data)),
      ),
    );
  }
}

class _QrPainter extends CustomPainter {
  final String data;
  _QrPainter(this.data);

  @override
  void paint(Canvas canvas, Size size) {
    const n = 29;
    final cell = size.width / n;
    final paint = Paint()..color = const Color(0xFF111417);
    final rnd = math.Random(data.hashCode);

    bool inFinder(int x, int y) {
      bool box(int ox, int oy) => x >= ox && x < ox + 8 && y >= oy && y < oy + 8;
      return box(0, 0) || box(n - 8, 0) || box(0, n - 8);
    }

    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (inFinder(x, y)) continue;
        if (rnd.nextDouble() < 0.47) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(x * cell + 0.4, y * cell + 0.4, cell - 0.8, cell - 0.8),
              Radius.circular(cell * 0.25),
            ),
            paint,
          );
        }
      }
    }

    void finder(double ox, double oy) {
      final outer = RRect.fromRectAndRadius(
          Rect.fromLTWH(ox, oy, cell * 7, cell * 7), Radius.circular(cell * 1.6));
      canvas.drawRRect(outer, paint);
      canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(ox + cell, oy + cell, cell * 5, cell * 5),
              Radius.circular(cell * 1.1)),
          Paint()..color = Colors.white);
      canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(ox + cell * 2, oy + cell * 2, cell * 3, cell * 3),
              Radius.circular(cell * 0.8)),
          Paint()..color = AppColors.primaryDark);
    }

    finder(0, 0);
    finder(size.width - cell * 7, 0);
    finder(0, size.height - cell * 7);
  }

  @override
  bool shouldRepaint(covariant _QrPainter old) => old.data != data;
}

/// Fixora logo mark (gradient tile + car-repair icon).
class FixoraLogo extends StatelessWidget {
  final double size;
  final bool light;
  const FixoraLogo({super.key, this.size = 64, this.light = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        gradient: light
            ? const LinearGradient(colors: [Colors.white, Color(0xFFE8FDFB)])
            : AppColors.primaryGradient,
        borderRadius: BorderRadius.circular(size * 0.3),
        boxShadow: [
          BoxShadow(
            color: (light ? Colors.black : AppColors.primary).o(0.25),
            blurRadius: size * 0.35,
            offset: Offset(0, size * 0.12),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.directions_car_filled_rounded,
              size: size * 0.52, color: light ? AppColors.primary : Colors.white),
          Positioned(
            right: size * 0.14,
            top: size * 0.12,
            child: Container(
              padding: EdgeInsets.all(size * 0.04),
              decoration: BoxDecoration(
                color: light ? AppColors.primary : Colors.white,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.build_rounded,
                  size: size * 0.16, color: light ? Colors.white : AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}

