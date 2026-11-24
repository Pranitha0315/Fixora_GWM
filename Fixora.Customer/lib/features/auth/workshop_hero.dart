import 'dart:async';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../../core/core.dart';

/// ---------------------------------------------------------------------------
/// Workshop photos for the auth screens (Pastel Garage style): the photos
/// crossfade with a slow Ken Burns zoom inside an ink-brush shaped mask
/// (assets/images/ink_mask.png) on the mint sky. No dots / buttons are
/// shown; tapping the photo pauses or plays the slideshow (also announced
/// to screen readers).
/// ---------------------------------------------------------------------------

/// One slide: a workshop photo. [caption] is a short description (not shown).
///
/// Photos are bundled in assets/images/workshop_1..4.jpg (see CREDITS.md).
/// If one is missing, one of the app's own garage photos is shown instead,
/// and if that fails a plain colour.
@immutable
class WorkshopPhoto {
  const WorkshopPhoto({
    required this.asset,
    required this.fallback,
    required this.caption,
    required this.icon,
    this.focus = Alignment.center,
  });

  final String asset;
  final String fallback;
  final String caption;
  final IconData icon;

  /// Which part of the photo to keep when it is cropped to fit the screen.
  final Alignment focus;
}

const kWorkshopPhotos = <WorkshopPhoto>[
  WorkshopPhoto(
    asset: 'assets/images/workshop_1.jpg',
    fallback: 'assets/images/garage_fixora.jpg',
    caption: 'Live repair status, step by step',
    icon: Icons.car_repair_rounded,
    focus: Alignment(0, -0.15),
  ),
  WorkshopPhoto(
    asset: 'assets/images/workshop_2.jpg',
    fallback: 'assets/images/engine_bay.jpg',
    caption: 'Photo proof of every fix',
    icon: Icons.photo_camera_outlined,
  ),
  WorkshopPhoto(
    asset: 'assets/images/workshop_3.jpg',
    fallback: 'assets/images/live_frame.jpg',
    caption: 'Nothing is fixed until you approve the cost',
    icon: Icons.verified_outlined,
    focus: Alignment(0, -0.4),
  ),
  WorkshopPhoto(
    asset: 'assets/images/workshop_4.jpg',
    fallback: 'assets/images/booking_bay.jpg',
    caption: 'Book a slot without the queue',
    icon: Icons.event_available_outlined,
    focus: Alignment(0, 0.25),
  ),
];

/// Drives the hero photo slideshow.
///
/// Two separate "stop" reasons:
/// - [paused]: the customer pressed pause (or the phone has animations off).
/// - [held]: temporarily stopped while the keyboard is open, so nothing
///   moves behind the form. Released when typing ends.
class SlideshowController extends ChangeNotifier {
  SlideshowController({
    required this.length,
    this.interval = const Duration(seconds: 6),
  });

  final int length;
  final Duration interval;

  int _index = 0;
  bool _paused = false;
  bool _held = false;
  bool _started = false;
  Timer? _timer;

  int get index => _index;
  bool get paused => _paused;
  bool get running => _started && !_paused && !_held && length > 1;

  void start() {
    _started = true;
    _restartTimer();
  }

  void goTo(int i) {
    if (length == 0) return;
    _index = i % length;
    notifyListeners();
    _restartTimer();
  }

  void togglePause() => setPaused(!_paused);

  void setPaused(bool value) {
    if (_paused == value) return;
    _paused = value;
    _restartTimer();
    notifyListeners();
  }

  /// Safe to call during build: never notifies listeners.
  void setHeld(bool value) {
    if (_held == value) return;
    _held = value;
    _restartTimer();
  }

  void _restartTimer() {
    _timer?.cancel();
    _timer = null;
    if (!running) return;
    _timer = Timer.periodic(interval, (_) {
      _index = (_index + 1) % length;
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

/// Ink-brush mask used to shape the photo (white + alpha PNG).
const kInkMaskAsset = 'assets/images/ink_mask.png';

/// Workshop photos cut into an ink-brush shape. Photos crossfade with a slow
/// zoom. Tap = pause / play (no visible controls).
class WorkshopPhotoCard extends StatefulWidget {
  const WorkshopPhotoCard({
    super.key,
    required this.controller,
    this.photos = kWorkshopPhotos,
    required this.animate,
    this.height = 210,
  });

  final SlideshowController controller;
  final List<WorkshopPhoto> photos;

  /// False when the phone asks for reduced motion: instant swaps, no zoom.
  final bool animate;
  final double height;

  @override
  State<WorkshopPhotoCard> createState() => _WorkshopPhotoCardState();
}

class _WorkshopPhotoCardState extends State<WorkshopPhotoCard> {
  ui.Image? _mask;

  /// If the mask can't be loaded, fall back to a plain rounded card.
  bool _maskFailed = false;

  /// Big pause / play icon that flashes in the middle after a tap, so the
  /// customer sees that tapping the photo controls the slideshow.
  bool _flash = false;
  Timer? _flashTimer;

  void _toggle() {
    widget.controller.togglePause();
    _flashTimer?.cancel();
    setState(() => _flash = true);
    _flashTimer = Timer(const Duration(milliseconds: 700), () {
      if (mounted) setState(() => _flash = false);
    });
  }

  @override
  void initState() {
    super.initState();
    _loadMask();
  }

  Future<void> _loadMask() async {
    try {
      final data = await rootBundle.load(kInkMaskAsset);
      final codec = await ui.instantiateImageCodec(data.buffer.asUint8List());
      final frame = await codec.getNextFrame();
      if (!mounted) {
        frame.image.dispose();
        return;
      }
      setState(() => _mask = frame.image);
    } catch (_) {
      if (mounted) setState(() => _maskFailed = true);
    }
  }

  @override
  void dispose() {
    _flashTimer?.cancel();
    _mask?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photos = ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final i = widget.controller.index;
        return AnimatedSwitcher(
          duration: widget.animate ? const Duration(milliseconds: 800) : Duration.zero,
          switchInCurve: Curves.easeOut,
          switchOutCurve: Curves.easeIn,
          layoutBuilder: (current, previous) => Stack(
            fit: StackFit.expand,
            children: [...previous, if (current != null) current],
          ),
          child: _Slide(
            key: ValueKey(i),
            photo: widget.photos[i],
            zoom: widget.animate,
            zoomDuration: widget.controller.interval + const Duration(seconds: 2),
          ),
        );
      },
    );

    final mask = _mask;
    final Widget shaped;
    if (mask != null) {
      // Keep the photo only where the ink mask is painted.
      shaped = ShaderMask(
        blendMode: BlendMode.dstIn,
        shaderCallback: (rect) => ImageShader(
          mask,
          TileMode.clamp,
          TileMode.clamp,
          Matrix4.diagonal3Values(rect.width / mask.width, rect.height / mask.height, 1).storage,
          filterQuality: FilterQuality.medium,
        ),
        child: photos,
      );
    } else if (_maskFailed) {
      shaped = ClipRRect(borderRadius: BorderRadius.circular(28), child: photos);
    } else {
      // Mask still loading (a few milliseconds): show nothing yet.
      shaped = const SizedBox.shrink();
    }

    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, child) {
        final paused = widget.controller.paused;
        return Semantics(
          button: true,
          label: paused ? 'Workshop photos, paused. Double tap to play' : 'Workshop photos. Double tap to pause',
          excludeSemantics: true,
          onTap: _toggle,
          child: child,
        );
      },
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _toggle,
        child: SizedBox(
          height: widget.height,
          width: double.infinity,
          child: Stack(
            fit: StackFit.expand,
            children: [
              AnimatedOpacity(
                opacity: mask != null || _maskFailed ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 250),
                child: shaped,
              ),
              // Feedback after a tap: big icon in the middle, fades out.
              IgnorePointer(
                child: Center(
                  child: AnimatedOpacity(
                    opacity: _flash ? 1 : 0,
                    duration: Duration(milliseconds: widget.animate ? 200 : 0),
                    child: ListenableBuilder(
                      listenable: widget.controller,
                      builder: (context, _) => _RoundGlyph(
                        icon: widget.controller.paused ? Icons.pause_rounded : Icons.play_arrow_rounded,
                        size: 52,
                      ),
                    ),
                  ),
                ),
              ),
              // While paused, a small pause mark stays on the photo so the
              // state is visible (no icon at all while it plays).
              IgnorePointer(
                child: Align(
                  alignment: const Alignment(0.72, -0.5),
                  child: ListenableBuilder(
                    listenable: widget.controller,
                    builder: (context, _) => AnimatedOpacity(
                      opacity: widget.controller.paused && !_flash ? 1 : 0,
                      duration: Duration(milliseconds: widget.animate ? 200 : 0),
                      child: const _RoundGlyph(icon: Icons.pause_rounded, size: 30),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// White translucent circle with a dark icon (slideshow feedback).
class _RoundGlyph extends StatelessWidget {
  const _RoundGlyph({required this.icon, required this.size});

  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white.o(0.9),
        shape: BoxShape.circle,
        boxShadow: AppShadows.float,
      ),
      child: Icon(icon, size: size * 0.55, color: AppColors.ink),
    );
  }
}

class _Slide extends StatelessWidget {
  const _Slide({
    super.key,
    required this.photo,
    required this.zoom,
    required this.zoomDuration,
  });

  final WorkshopPhoto photo;
  final bool zoom;
  final Duration zoomDuration;

  @override
  Widget build(BuildContext context) {
    final image = _PhotoImage(photo: photo);
    if (!zoom) return image;
    // Slow "Ken Burns" push-in while the slide is on screen.
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1.0, end: 1.08),
      duration: zoomDuration,
      curve: Curves.easeOut,
      child: image,
      builder: (context, scale, child) => ClipRect(
        child: Transform.scale(scale: scale, alignment: photo.focus, child: child),
      ),
    );
  }
}

/// Bundled photo → app's own garage photo → plain colour. Never throws.
class _PhotoImage extends StatelessWidget {
  const _PhotoImage({required this.photo});

  final WorkshopPhoto photo;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final cacheWidth = (width * MediaQuery.devicePixelRatioOf(context)).round();
    return Image.asset(
      photo.asset,
      fit: BoxFit.cover,
      alignment: photo.focus,
      cacheWidth: cacheWidth,
      excludeFromSemantics: true,
      errorBuilder: (context, error, stackTrace) => Image.asset(
        photo.fallback,
        fit: BoxFit.cover,
        alignment: photo.focus,
        excludeFromSemantics: true,
        errorBuilder: (context, error, stackTrace) => const SizedBox.expand(),
      ),
    );
  }
}

/// Centred heading at the top of the white auth sheet.
class AuthHeroHeading extends StatelessWidget {
  const AuthHeroHeading({super.key, required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Semantics(
          header: true,
          child: Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.navy, fontSize: 23, height: 1.25, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textMuted, fontSize: 13.5, height: 1.5),
        ),
      ],
    );
  }
}
