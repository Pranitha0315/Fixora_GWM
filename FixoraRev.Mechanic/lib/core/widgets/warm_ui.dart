import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_typography.dart';

/// Building blocks of the "Lilac Soft" style: round soft buttons on a lavender page,
/// small status pills, plum pill buttons with a round arrow, and the phone frame used
/// when the app runs in a wide browser window.

/// Round soft icon button (menu, bell, parts…) with an optional count badge.
class WarmIconButton extends StatelessWidget {
  const WarmIconButton({super.key, required this.icon, required this.label, this.onTap, this.badge = 0, this.size = 46});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final int badge;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: badge > 0 ? '$label, $badge new' : label,
      excludeSemantics: true,
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(shape: BoxShape.circle, boxShadow: AppColors.cardShadow),
                child: Material(
                  color: AppColors.surface,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: onTap,
                    child: Icon(icon, color: AppColors.ink, size: 22),
                  ),
                ),
              ),
            ),
            if (badge > 0)
              Positioned(
                top: 2,
                right: 2,
                child: IgnorePointer(
                  child: Container(
                    constraints: const BoxConstraints(minWidth: 17),
                    height: 17,
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: AppColors.primaryStrong, borderRadius: BorderRadius.circular(9)),
                    child: Text(badge > 9 ? '9+' : '$badge',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Tone for [WarmBadge].
enum WarmTone { green, amber, red, neutral }

/// Small uppercase status pill: APPROVED, NEXT, WAITING…
class WarmBadge extends StatelessWidget {
  const WarmBadge(this.text, {super.key, this.tone = WarmTone.neutral});

  final String text;
  final WarmTone tone;

  @override
  Widget build(BuildContext context) {
    final dark = AppColors.isDark;
    final (bg, fg) = switch (tone) {
      WarmTone.green => (dark ? const Color(0xFF12301C) : const Color(0xFFE3F4E6), dark ? const Color(0xFF86EFAC) : const Color(0xFF1D6B33)),
      WarmTone.amber => (dark ? const Color(0xFF33270A) : const Color(0xFFFDEBD3), dark ? const Color(0xFFFCD34D) : const Color(0xFF8A4A0A)),
      WarmTone.red => (dark ? const Color(0xFF3A1418) : const Color(0xFFFBE1DC), dark ? const Color(0xFFFCA5A5) : const Color(0xFF9A2A16)),
      WarmTone.neutral => (AppColors.surfaceAlt, AppColors.body),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(text.toUpperCase(),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, letterSpacing: 0.4, color: fg)),
    );
  }
}

/// Red pill button with a white round arrow (or play) on the right.
class ArrowPillButton extends StatelessWidget {
  const ArrowPillButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon = Icons.arrow_forward_rounded,
    this.height = 54,
    this.compact = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData icon;
  final double height;

  /// Hugs its text (used inside banners) instead of filling the width.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final bg = enabled ? AppColors.primaryStrong : AppColors.border;
    final fg = enabled ? Colors.white : AppColors.muted;
    final knob = height - 14;
    final button = Material(
      color: bg,
      shape: const StadiumBorder(),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: onPressed,
        child: SizedBox(
          height: height,
          child: Padding(
            padding: EdgeInsets.only(left: compact ? 16 : 22, right: 7),
            child: Row(
              mainAxisSize: compact ? MainAxisSize.min : MainAxisSize.max,
              children: [
                compact
                    ? Text(label, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 14))
                    : Expanded(
                        child: Text(label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 16))),
                SizedBox(width: compact ? 10 : 8),
                Container(
                  width: knob,
                  height: knob,
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: Icon(icon, size: knob * 0.5, color: enabled ? AppColors.primaryStrong : AppColors.muted),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    return Semantics(button: true, enabled: enabled, label: label, excludeSemantics: true, child: button);
  }
}

/// Section header: bold title + optional "View all →".
class WarmSection extends StatelessWidget {
  const WarmSection(this.title, {super.key, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 18, bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink)),
            ),
          ),
          if (action != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
              child: Text('$action →'),
            ),
        ],
      ),
    );
  }
}

/// Photo banner with a dark scrim on the left so white text stays readable.
class PhotoBanner extends StatelessWidget {
  const PhotoBanner({super.key, required this.image, required this.child, this.height = 196, this.alignment = const Alignment(0.4, 0)});

  final String image;
  final Widget child;
  final double height;
  final Alignment alignment;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: SizedBox(
        height: height,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: AppColors.heroInk),
            Image.asset(image, fit: BoxFit.cover, alignment: alignment, excludeFromSemantics: true),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xF01E0E08), Color(0xC71E0E08), Color(0x0D1E0E08)],
                  stops: [0, 0.5, 0.9],
                ),
              ),
            ),
            child,
          ],
        ),
      ),
    );
  }
}

/// On a wide screen (browser, tablet, desktop) the app is shown as a phone:
/// 430 px wide, centred, with the page colour around it. On a phone it does nothing.
class PhoneFrame extends StatelessWidget {
  const PhoneFrame({super.key, required this.child});

  final Widget child;
  static const maxWidth = 430.0;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final size = media.size;
    if (size.width <= 600) return child;
    final height = size.height < 940 ? size.height : 900.0;
    final radius = size.height < 940 ? 0.0 : 36.0;
    return ColoredBox(
      color: AppColors.isDark ? const Color(0xFF0B0A0D) : const Color(0xFFD9CCE5),
      child: Center(
        child: Container(
          width: maxWidth,
          height: height,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(radius),
            boxShadow: const [BoxShadow(color: Color(0x554B2160), blurRadius: 50, spreadRadius: -12, offset: Offset(0, 24))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(radius),
            child: MediaQuery(
              data: media.copyWith(size: Size(maxWidth, height), padding: EdgeInsets.zero, viewPadding: EdgeInsets.zero),
              child: child,
            ),
          ),
        ),
      ),
    );
  }
}

/// Brand word mark.
class FixoraRevWordmark extends StatelessWidget {
  const FixoraRevWordmark({super.key, this.color, this.size = 22});

  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Fixora Rev',
        excludeSemantics: true,
        child: Text('FIXORA REV', style: AppText.brand.copyWith(fontSize: size, color: color)),
      );
}

/// A car cut-out standing on a soft lavender disc (Login, Job, job cards).
class CarOnPedestal extends StatelessWidget {
  const CarOnPedestal({super.key, required this.asset, this.height = 200, this.semanticLabel});

  final String asset;
  final double height;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: LayoutBuilder(
        builder: (context, box) {
          final w = box.maxWidth;
          return Stack(
            alignment: Alignment.bottomCenter,
            children: [
              Positioned(
                bottom: height * 0.02,
                child: Container(
                  width: w * 0.78,
                  height: height * 0.22,
                  decoration: BoxDecoration(
                    color: AppColors.pedestal,
                    borderRadius: BorderRadius.all(Radius.elliptical(w * 0.39, height * 0.11)),
                    boxShadow: [BoxShadow(color: AppColors.shadow, blurRadius: 24, offset: const Offset(0, 10))],
                  ),
                ),
              ),
              Positioned(
                bottom: height * 0.1,
                left: w * 0.06,
                right: w * 0.06,
                top: 0,
                child: Image.asset(asset, fit: BoxFit.contain, semanticLabel: semanticLabel, excludeFromSemantics: semanticLabel == null),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Soft raised surface used for cards in the Lilac Soft style.
class SoftCard extends StatelessWidget {
  const SoftCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(14), this.radius = 26, this.color});

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(radius), boxShadow: AppColors.cardShadow),
      child: Material(
        color: color ?? AppColors.surface,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          borderRadius: BorderRadius.circular(radius),
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}
