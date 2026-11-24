import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../plans/offers_plans_screen.dart';

/// ---------------------------------------------------------------------------
/// Home advertisement banner – built like a real promo ad so customers tap it:
/// - full-bleed workshop photo with a dark brand-tone fade (text stays readable),
/// - urgency chip ("Only 4 slots left today", "Flash deal"),
/// - price anchoring: old price struck out next to the new price,
/// - social proof (garage rating + review count),
/// - a pulsing red "SAVE 20%" sticker and a bright yellow CTA with a light sweep,
/// - live "Ends in …" countdown.
/// Slides change on their own; touching the banner holds the current slide.
/// With "reduce motion" on nothing moves by itself.
/// ---------------------------------------------------------------------------

class _Promo {
  const _Promo({
    required this.kicker,
    required this.kickerIcon,
    required this.title,
    required this.sticker,
    required this.price,
    required this.proof,
    required this.cta,
    required this.image,
    required this.tone,
    required this.open,
    this.wasPrice,
    this.priceSuffix = '',
    this.imageAlign = Alignment.center,
    this.proofIcon = Icons.check_circle_rounded,
  });

  /// Urgency / reason-to-act chip.
  final String kicker;
  final IconData kickerIcon;
  final String title;

  /// Sticker text, e.g. "20%".
  final String sticker;

  /// New price (LKR) and optional old price shown struck out.
  final int price;
  final int? wasPrice;
  final String priceSuffix;

  /// Social proof / benefit line.
  final String proof;
  final IconData proofIcon;
  final String cta;
  final String image;
  final Alignment imageAlign;

  /// Dark brand tone used for the fade over the photo (white text ≥ 7:1).
  final Color tone;
  final void Function(BuildContext context) open;
}

ServiceOffer _offer(String id) => MockData.offers.firstWhere((o) => o.id == id, orElse: () => MockData.offers.first);

final List<_Promo> _promos = [
  _Promo(
    kicker: 'ONLY 4 SLOTS LEFT TODAY',
    kickerIcon: Icons.local_fire_department_rounded,
    title: 'Full Car Service',
    sticker: '20%',
    price: 10000,
    wasPrice: 12500,
    proof: '4.7 · 320 reviews at Fixora Garage',
    proofIcon: Icons.star_rounded,
    cta: 'Claim 20% OFF',
    image: 'assets/images/workshop_1.jpg',
    imageAlign: const Alignment(0.2, -0.3),
    tone: const Color(0xFF06302C),
    open: (c) => openOffer(c, _offer('o3')),
  ),
  _Promo(
    kicker: 'FLASH DEAL',
    kickerIcon: Icons.bolt_rounded,
    title: 'Engine Oil Change',
    sticker: '15%',
    price: 6800,
    wasPrice: 8000,
    proof: 'Oil + filter, done in 45 min',
    cta: 'Grab the deal',
    image: Img.oil,
    imageAlign: Alignment.centerRight,
    tone: const Color(0xFF341403),
    open: (c) => openOffer(c, _offer('o1')),
  ),
  _Promo(
    kicker: 'BEST VALUE',
    kickerIcon: Icons.workspace_premium_rounded,
    title: 'Gold Service Plan',
    sticker: '10%',
    price: 375,
    priceSuffix: '/month',
    proof: '4 services/yr + priority booking',
    cta: 'Join Gold',
    image: 'assets/images/workshop_3.jpg',
    imageAlign: const Alignment(0.3, -0.2),
    tone: const Color(0xFF1E0F4D),
    open: (c) => c.push(const OffersPlansScreen(initialTab: 1)),
  ),
  _Promo(
    kicker: 'THIS WEEK ONLY',
    kickerIcon: Icons.event_available_rounded,
    title: 'Wheel Alignment',
    sticker: '12%',
    price: 4400,
    wasPrice: 5000,
    proof: '3D alignment + wheel balancing',
    cta: 'Book 12% OFF',
    image: Img.wheelAlignment,
    imageAlign: Alignment.centerRight,
    tone: const Color(0xFF081E40),
    open: (c) => openOffer(c, _offer('o4')),
  ),
];

/// 12500 -> "12,500"
String _lkr(int v) {
  final s = v.toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

/// Offers end at the end of this month (shown as a live countdown).
DateTime _promoEnds() {
  final now = DateTime.now();
  return DateTime(now.year, now.month + 1, 1).subtract(const Duration(seconds: 1));
}

class PromoBanner extends StatefulWidget {
  const PromoBanner({super.key, this.height = 196});

  final double height;

  @override
  State<PromoBanner> createState() => _PromoBannerState();
}

class _PromoBannerState extends State<PromoBanner> with SingleTickerProviderStateMixin {
  static const _interval = Duration(milliseconds: 4500);

  // Big starting page so the carousel can loop both ways.
  static const _loopStart = 1000;
  late final PageController _page = PageController(initialPage: _loopStart * _promos.length);
  late final AnimationController _progress = AnimationController(vsync: this, duration: _interval);

  int _index = 0;
  bool _held = false;
  bool _animate = true;

  @override
  void initState() {
    super.initState();
    _progress.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted && !_held && _animate) _next();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _animate = !(MediaQuery.maybeDisableAnimationsOf(context) ?? false);
    if (_animate && !_held) {
      _progress.forward(from: 0);
    } else {
      _progress.stop();
    }
  }

  @override
  void dispose() {
    _progress.dispose();
    _page.dispose();
    super.dispose();
  }

  void _next() {
    if (!_page.hasClients) return;
    _page.nextPage(duration: const Duration(milliseconds: 650), curve: Curves.easeInOutCubic);
  }

  void _onPage(int raw) {
    setState(() => _index = raw % _promos.length);
    if (_animate && !_held) _progress.forward(from: 0);
  }

  void _hold(bool v) {
    if (_held == v) return;
    _held = v;
    if (v) {
      _progress.stop();
    } else if (_animate) {
      _progress.forward();
    }
  }

  @override
  Widget build(BuildContext context) {
    final ends = _promoEnds();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Listener(
          // Finger on the banner = hold the slide.
          onPointerDown: (_) => _hold(true),
          onPointerUp: (_) => _hold(false),
          onPointerCancel: (_) => _hold(false),
          child: SizedBox(
            height: widget.height,
            child: PageView.builder(
              controller: _page,
              onPageChanged: _onPage,
              itemBuilder: (context, raw) {
                final p = _promos[raw % _promos.length];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: _PromoCard(promo: p, ends: ends, zoom: _animate),
                );
              },
            ),
          ),
        ),
        const SizedBox(height: 10),
        AnimatedBuilder(
          animation: _progress,
          builder: (context, _) => Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < _promos.length; i++)
                _Dot(
                  active: i == _index,
                  fill: i == _index ? (_animate ? _progress.value : 1) : 0,
                  label: 'Show offer ${i + 1} of ${_promos.length}',
                  onTap: () {
                    final cur = _page.page?.round() ?? _loopStart * _promos.length;
                    final base = cur - (cur % _promos.length);
                    _page.animateToPage(base + i,
                        duration: const Duration(milliseconds: 500), curve: Curves.easeInOutCubic);
                  },
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PromoCard extends StatefulWidget {
  const _PromoCard({required this.promo, required this.ends, required this.zoom});

  final _Promo promo;
  final DateTime ends;
  final bool zoom;

  @override
  State<_PromoCard> createState() => _PromoCardState();
}

class _PromoCardState extends State<_PromoCard> with SingleTickerProviderStateMixin {
  // One loop drives the sticker pulse and the light sweep over the CTA.
  late final AnimationController _loop = AnimationController(vsync: this, duration: const Duration(milliseconds: 2600));

  @override
  void initState() {
    super.initState();
    if (widget.zoom) _loop.repeat();
  }

  @override
  void didUpdateWidget(covariant _PromoCard old) {
    super.didUpdateWidget(old);
    if (widget.zoom && !_loop.isAnimating) _loop.repeat();
    if (!widget.zoom && _loop.isAnimating) _loop.stop();
  }

  @override
  void dispose() {
    _loop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.promo;
    final was = p.wasPrice == null ? '' : ', was LKR ${_lkr(p.wasPrice!)}';
    return Semantics(
      button: true,
      label: '${p.kicker.toLowerCase()}. ${p.title}, save ${p.sticker}. '
          'LKR ${_lkr(p.price)}${p.priceSuffix}$was. ${p.proof}. ${p.cta}',
      excludeSemantics: true,
      child: FxPressable(
        radius: 24,
        pressedScale: 0.97,
        onTap: () {
          AppState.instance.feedback();
          p.open(context);
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Full-bleed photo with a slow push-in.
              _Zoom(
                zoom: widget.zoom,
                child: Image.asset(
                  p.image,
                  fit: BoxFit.cover,
                  alignment: p.imageAlign,
                  filterQuality: FilterQuality.medium,
                  errorBuilder: (context, error, stackTrace) => ColoredBox(color: p.tone),
                ),
              ),
              // Brand-tone fade: solid behind the text, clear over the photo.
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    colors: [p.tone.o(0.97), p.tone.o(0.9), p.tone.o(0.35), p.tone.o(0.0)],
                    stops: const [0, 0.48, 0.78, 1],
                  ),
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.center,
                    colors: [p.tone.o(0.55), p.tone.o(0)],
                  ),
                ),
              ),
              // Pulsing discount sticker.
              Positioned(
                top: 12,
                right: 12,
                child: AnimatedBuilder(
                  animation: _loop,
                  builder: (context, child) {
                    final t = _loop.value;
                    final s = 1 + 0.07 * math.sin(t * math.pi * 4).abs();
                    return Transform.scale(scale: widget.zoom ? s : 1, child: child);
                  },
                  child: _Sticker(text: p.sticker),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: LayoutBuilder(
                  builder: (context, c) => Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _Kicker(text: p.kicker, icon: p.kickerIcon),
                      const SizedBox(height: 9),
                      SizedBox(
                        width: c.maxWidth * 0.66,
                        child: Text(p.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 19,
                                height: 1.15,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -0.3)),
                      ),
                      const SizedBox(height: 3),
                      SizedBox(
                        width: c.maxWidth * 0.66,
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: _PriceLine(promo: p),
                        ),
                      ),
                      const SizedBox(height: 4),
                      SizedBox(
                        width: c.maxWidth * 0.7,
                        child: Row(
                          children: [
                            Icon(p.proofIcon, size: 14, color: _yellow),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(p.proof,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      color: Colors.white.o(0.88), fontSize: 11.5, fontWeight: FontWeight.w600)),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      Row(
                        children: [
                          _Cta(label: p.cta, shine: _loop, animate: widget.zoom),
                          const SizedBox(width: 8),
                          Flexible(child: _Countdown(ends: widget.ends)),
                        ],
                      ),
                    ],
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

const _yellow = Color(0xFFFFD84D);

/// "LKR 10,000  ~~12,500~~"
class _PriceLine extends StatelessWidget {
  const _PriceLine({required this.promo});
  final _Promo promo;

  @override
  Widget build(BuildContext context) {
    final p = promo;
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text.rich(
          TextSpan(children: [
            const TextSpan(text: 'LKR ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
            TextSpan(
                text: _lkr(p.price),
                style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
            if (p.priceSuffix.isNotEmpty)
              TextSpan(text: p.priceSuffix, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          ]),
          style: const TextStyle(color: _yellow, height: 1.1),
        ),
        if (p.wasPrice != null) ...[
          const SizedBox(width: 8),
          Text(_lkr(p.wasPrice!),
              style: TextStyle(
                  color: Colors.white.o(0.75),
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  decoration: TextDecoration.lineThrough,
                  decorationColor: Colors.white.o(0.85),
                  decorationThickness: 2)),
        ],
      ],
    );
  }
}

/// Yellow urgency chip.
class _Kicker extends StatelessWidget {
  const _Kicker({required this.text, required this.icon});
  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 3, 9, 3),
      decoration: BoxDecoration(color: _yellow, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: const Color(0xFF2A1A00)),
          const SizedBox(width: 3),
          Text(text,
              maxLines: 1,
              style: const TextStyle(
                  color: Color(0xFF2A1A00), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
        ],
      ),
    );
  }
}

/// Tilted red "SAVE 20%" sticker.
class _Sticker extends StatelessWidget {
  const _Sticker({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Transform.rotate(
      angle: -0.21,
      child: Container(
        width: 62,
        height: 62,
        decoration: BoxDecoration(
          color: const Color(0xFFE5292B),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2.5),
          boxShadow: [BoxShadow(color: Colors.black.o(0.3), blurRadius: 12, offset: const Offset(0, 4))],
        ),
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('SAVE',
                style: TextStyle(color: Colors.white, fontSize: 9, height: 1, fontWeight: FontWeight.w900, letterSpacing: 0.8)),
            const SizedBox(height: 1),
            Text(text,
                style: const TextStyle(
                    color: Colors.white, fontSize: 19, height: 1.05, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
          ],
        ),
      ),
    );
  }
}

/// Yellow call-to-action pill with a light sweep every few seconds.
class _Cta extends StatelessWidget {
  const _Cta({required this.label, required this.shine, required this.animate});
  final String label;
  final Animation<double> shine;
  final bool animate;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: Container(
        height: 38,
        padding: const EdgeInsets.fromLTRB(16, 0, 12, 0),
        color: _yellow,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    maxLines: 1,
                    style: const TextStyle(color: Color(0xFF1B1300), fontSize: 13.5, fontWeight: FontWeight.w900)),
                const SizedBox(width: 4),
                const Icon(Icons.arrow_forward_rounded, size: 17, color: Color(0xFF1B1300)),
              ],
            ),
            if (animate)
              Positioned.fill(
                child: IgnorePointer(
                  child: AnimatedBuilder(
                    animation: shine,
                    builder: (context, _) {
                      // Sweep during the first 35% of the loop, then rest.
                      final t = (shine.value / 0.35).clamp(0.0, 1.0).toDouble();
                      if (t >= 1) return const SizedBox.shrink();
                      return FractionalTranslation(
                        translation: Offset(-1.2 + 2.4 * t, 0),
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [Colors.white.o(0), Colors.white.o(0.75), Colors.white.o(0)],
                              stops: const [0.3, 0.5, 0.7],
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// "Ends in 3d 05:12:09" – ticks every second.
class _Countdown extends StatefulWidget {
  const _Countdown({required this.ends});
  final DateTime ends;

  @override
  State<_Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<_Countdown> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    var left = widget.ends.difference(DateTime.now());
    if (left.isNegative) left = Duration.zero;
    String two(int n) => n.toString().padLeft(2, '0');
    final d = left.inDays;
    final text = '${d > 0 ? '${d}d ' : ''}${two(left.inHours % 24)}:${two(left.inMinutes % 60)}:${two(left.inSeconds % 60)}';
    return Semantics(
      label: 'Offer ends in $text',
      excludeSemantics: true,
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 9),
        decoration: BoxDecoration(color: Colors.black.o(0.32), borderRadius: BorderRadius.circular(999)),
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.timer_outlined, size: 13, color: Colors.white),
              const SizedBox(width: 4),
              Text(text,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      fontFeatures: [FontFeature.tabularFigures()])),
            ],
          ),
        ),
      ),
    );
  }
}

/// Slow push-in on the picture (restarts each time the card is built).
class _Zoom extends StatelessWidget {
  const _Zoom({required this.zoom, required this.child});
  final bool zoom;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!zoom) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 1.0, end: 1.08),
      duration: const Duration(seconds: 6),
      curve: Curves.easeOut,
      child: child,
      builder: (context, s, child) => Transform.scale(scale: s, child: child),
    );
  }
}

/// Page dot; the active one is a pill that fills up until the next slide.
class _Dot extends StatelessWidget {
  const _Dot({required this.active, required this.fill, required this.label, required this.onTap});

  final bool active;
  final double fill;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: active,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          width: active ? 34 : 18,
          height: 24,
          child: Center(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: active ? 26 : 7,
              height: 7,
              decoration: BoxDecoration(
                  color: active ? AppColors.border : AppColors.textFaint, borderRadius: BorderRadius.circular(4)),
              alignment: Alignment.centerLeft,
              child: active
                  ? FractionallySizedBox(
                      widthFactor: fill.clamp(0.0, 1.0).toDouble(),
                      heightFactor: 1,
                      child: DecoratedBox(
                        decoration: BoxDecoration(color: AppColors.link, borderRadius: BorderRadius.circular(4)),
                      ),
                    )
                  : null,
            ),
          ),
        ),
      ),
    );
  }
}
