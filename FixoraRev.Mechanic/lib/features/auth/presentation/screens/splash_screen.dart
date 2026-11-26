import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/utils/nav.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../../authentication/presentation/screens/login_screen.dart';
import '../../../quick_login/data/quick_login_store.dart';
import '../../../quick_login/presentation/screens/quick_login_screen.dart';

/// Full-bleed brand splash matching the FIXORA REV garage artwork.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat();

  @override
  void initState() {
    super.initState();
    // Full screen splash: hide the phone status bar (time, Wi-Fi, signal,
    // battery) and the navigation bar while the brand screen shows.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    final quick = QuickLoginStore.instance;
    Future.wait<void>([
      quick.load(),
      Future<void>.delayed(const Duration(milliseconds: 2800)),
    ]).then((_) {
      if (!mounted) return;
      context.resetTo(
        AppServices.auth.isLoggedIn
            ? const MainShell()
            : (quick.enabled ? const QuickLoginScreen() : const LoginScreen()),
      );
    });
  }

  @override
  void dispose() {
    // Bring the status bar back for the rest of the app.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    _spin.dispose();
    super.dispose();
  }

  // splash_art.jpg is 682×1024; solid white footer starts ~83.5% from top.
  static const _artW = 682.0;
  static const _artH = 1024.0;
  static const _whiteTopFrac = 0.835;
  static const _topOrange = Color(0xFFE85A1A);

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Status bar is hidden here; light style only matters if a user swipes it in.
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: Scaffold(
        // Match art top so no white letterbox line shows at edges.
        backgroundColor: _topOrange,
        body: LayoutBuilder(
          builder: (context, constraints) {
            final screenW = constraints.maxWidth;
            final screenH = constraints.maxHeight;

            // BoxFit.cover + top-center: fill screen edge-to-edge, no white gaps.
            final scale = math.max(screenW / _artW, screenH / _artH);
            final dispW = _artW * scale;
            final dispH = _artH * scale;
            final left = (screenW - dispW) / 2;
            const top = 0.0;

            // Map white footer from art coords into the covered image rect,
            // then clamp to the visible screen so loader stays on-screen.
            final whiteTopRaw = top + dispH * _whiteTopFrac;
            final whiteBottomRaw = top + dispH;
            final whiteTop = whiteTopRaw.clamp(0.0, screenH);
            final whiteBottom = whiteBottomRaw.clamp(0.0, screenH);
            final whiteH = math.max(0.0, whiteBottom - whiteTop);

            return ClipRect(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Positioned(
                    left: left,
                    top: top,
                    width: dispW,
                    height: dispH,
                    child: Image.asset(
                      'assets/images/splash_art.jpg',
                      fit: BoxFit.fill,
                      filterQuality: FilterQuality.high,
                      semanticLabel: 'Fixora Rev – Your Garage. Our Technology.',
                    ),
                  ),
                  // Welcome loader ONLY inside the white footer of the art.
                  if (whiteH > 0)
                    Positioned(
                      left: 0,
                      top: whiteTop,
                      width: screenW,
                      height: whiteH,
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                AnimatedBuilder(
                                  animation: _spin,
                                  builder: (_, __) => SizedBox(
                                    width: 36,
                                    height: 36,
                                    child: CustomPaint(
                                      painter: _DotRingPainter(
                                        progress: _spin.value,
                                        color: const Color(0xFFEA580C),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text.rich(
                                  TextSpan(
                                    style: const TextStyle(
                                      color: Color(0xFF5C1A2A),
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                    children: const [
                                      TextSpan(text: 'Welcome to '),
                                      TextSpan(
                                        text: 'FIXORA REV',
                                        style: TextStyle(
                                          color: Color(0xFFC2410C),
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ],
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 5),
                                Container(
                                  width: 90,
                                  height: 2.5,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFEA580C),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                ),
                                const SizedBox(height: 5),
                                const Text(
                                  'Preparing your garage…',
                                  style: TextStyle(
                                    color: Color(0xFF64748B),
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DotRingPainter extends CustomPainter {
  _DotRingPainter({required this.progress, required this.color});

  final double progress;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    const count = 10;
    for (var i = 0; i < count; i++) {
      final t = (i / count + progress) % 1.0;
      final angle = t * math.pi * 2 - math.pi / 2;
      final opacity = 0.25 + 0.75 * ((i / count));
      final paint = Paint()
        ..color = color.withValues(alpha: opacity)
        ..style = PaintingStyle.fill;
      final dx = center.dx + radius * math.cos(angle);
      final dy = center.dy + radius * math.sin(angle);
      canvas.drawCircle(Offset(dx, dy), 3.4, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _DotRingPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
