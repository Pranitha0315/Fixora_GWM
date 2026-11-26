import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_typography.dart';

/// Building blocks for the four main tabs (Home · Jobs · Alerts · Profile):
/// peach header wash, FIXORA REV wordmark, big title, tinted stat cards,
/// pill chips and section headers. All colours follow light / dark mode.

// ───────────────────────────────── tones ─────────────────────────────────

enum RevTone { orange, amber, green, blue, red, purple, grey }

extension RevToneX on RevTone {
  Color get background => switch (this) {
        RevTone.orange => AppColors.primarySoft,
        RevTone.amber => AppColors.warningSoft,
        RevTone.green => AppColors.successSoft,
        RevTone.blue => AppColors.infoSoft,
        RevTone.red => AppColors.dangerSoft,
        RevTone.purple => AppColors.purpleSoft,
        RevTone.grey => AppColors.surfaceAlt,
      };

  Color get foreground => switch (this) {
        RevTone.orange => AppColors.onPrimarySoft,
        RevTone.amber => AppColors.warning,
        RevTone.green => AppColors.success,
        RevTone.blue => AppColors.info,
        RevTone.red => AppColors.danger,
        RevTone.purple => AppColors.purple,
        RevTone.grey => AppColors.body,
      };
}

/// Rounded square with a tinted background and a coloured icon.
class ToneIcon extends StatelessWidget {
  const ToneIcon({super.key, required this.icon, required this.tone, this.size = 42, this.iconSize});

  final IconData icon;
  final RevTone tone;
  final double size;
  final double? iconSize;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: tone.background, borderRadius: BorderRadius.circular(size * 0.3)),
      child: Icon(icon, color: tone.foreground, size: iconSize ?? size * 0.55),
    );
  }
}

/// Small rounded status label.
class RevPill extends StatelessWidget {
  const RevPill({super.key, required this.label, required this.tone, this.icon});

  final String label;
  final RevTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: tone.background, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: tone.foreground),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            maxLines: 1,
            style: TextStyle(color: tone.foreground, fontSize: 12.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

// ───────────────────────────────── cards ─────────────────────────────────

/// White (or dark) rounded card with a 1.5px hairline border.
class RevCard extends StatelessWidget {
  const RevCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.margin,
    this.onTap,
    this.color,
    this.borderColor,
    this.semanticLabel,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(20);
    Widget card = DecoratedBox(
      decoration: BoxDecoration(borderRadius: radius, boxShadow: AppColors.cardShadow),
      child: Material(
        color: color ?? AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: radius,
          side: BorderSide(color: borderColor ?? AppColors.border, width: 1),
        ),
        clipBehavior: Clip.antiAlias,
        child: onTap == null
            ? Padding(padding: padding, child: child)
            : InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      ),
    );
    if (semanticLabel != null) {
      card = Semantics(button: onTap != null, label: semanticLabel, child: card);
    }
    return margin == null ? card : Padding(padding: margin!, child: card);
  }
}

/// Icon + big number on top, label below (never wraps the number).
class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.icon, required this.tone, required this.value, required this.label});

  final IconData icon;
  final RevTone tone;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return RevCard(
      padding: const EdgeInsets.all(12),
      child: Semantics(
        label: '$value $label',
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ToneIcon(icon: icon, tone: tone, size: 36, iconSize: 20),
                const SizedBox(width: 10),
                Flexible(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      value,
                      style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800, color: AppColors.ink, height: 1),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13, color: AppColors.body),
            ),
          ],
        ),
      ),
    );
  }
}

/// Section title (20 bold) with an optional underlined action on the right.
class RevSection extends StatelessWidget {
  const RevSection(this.title, {super.key, this.action, this.onAction, this.top = 22});

  final String title;
  final String? action;
  final VoidCallback? onAction;
  final double top;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(2, top, 0, 10),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              header: true,
              child: Text(title, style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.ink)),
            ),
          ),
          if (action != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                foregroundColor: AppColors.primaryStrong,
              ),
              child: Text(
                action!,
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  decoration: TextDecoration.underline,
                  decorationColor: AppColors.primaryStrong,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Filter chip: outlined, solid orange when selected.
class RevChip extends StatelessWidget {
  const RevChip({super.key, required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? AppColors.primaryStrong : AppColors.surface,
        shape: StadiumBorder(
          side: BorderSide(color: selected ? AppColors.primaryStrong : AppColors.border, width: 1.5),
        ),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: onTap,
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            alignment: Alignment.center,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.onPrimary : AppColors.body,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Horizontal scrolling row of [RevChip]s.
class RevChipRow extends StatelessWidget {
  const RevChipRow({super.key, required this.labels, required this.selected, required this.onSelected});

  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: labels.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) => Center(
          child: RevChip(label: labels[i], selected: i == selected, onTap: () => onSelected(i)),
        ),
      ),
    );
  }
}

/// Primary action button (full width, 52 high).
class RevButton extends StatelessWidget {
  const RevButton({super.key, required this.label, required this.onPressed, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(label),
            if (icon != null) ...[const SizedBox(width: 8), Icon(icon, size: 20)],
          ],
        ),
      ),
    );
  }
}

/// Car picture cut out of its background.
class CarCutout extends StatelessWidget {
  const CarCutout(this.asset, {super.key, this.width = 84, this.height});

  final String asset;
  final double width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Image.asset(
        asset,
        width: width,
        height: height ?? width * 0.5,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => SizedBox(
          width: width,
          height: height ?? width * 0.5,
          child: Icon(Icons.directions_car_filled_rounded, color: AppColors.muted, size: width * 0.4),
        ),
      ),
    );
  }
}

// ───────────────────────────────── page ─────────────────────────────────

/// Scrolling tab page with the peach header wash, the FIXORA REV wordmark,
/// an action icon on the right, then a big title + subtitle.
class RevTabPage extends StatelessWidget {
  const RevTabPage({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.belowTitle,
    this.action,
    this.controller,
  });

  final String title;
  final String? subtitle;
  final Widget? belowTitle;

  /// Top-right widget (bell, settings…).
  final Widget? action;
  final List<Widget> children;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return ColoredBox(
      color: AppColors.background,
      child: Stack(
        children: [
          // Peach wash + swoosh stay put behind the scrolling list.
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: top + 260,
            child: IgnorePointer(
              child: DecoratedBox(
                decoration: BoxDecoration(gradient: AppColors.headerGradient),
                child: Align(
                  alignment: Alignment.topRight,
                  child: Padding(
                    padding: EdgeInsets.only(top: top + 96),
                    child: const SizedBox(width: 150, height: 60),
                  ),
                ),
              ),
            ),
          ),
          ListView(
            controller: controller,
            physics: const AlwaysScrollableScrollPhysics(), // pull-to-refresh works on short lists too
            padding: EdgeInsets.fromLTRB(16, top + 14, 16, 28),
            children: [
              Row(
                children: [
                  Expanded(
                    child: Semantics(
                      label: 'Fixora Rev',
                      excludeSemantics: true,
                      child: Text('FIXORA REV', style: AppText.brand),
                    ),
                  ),
                  if (action != null) action!,
                ],
              ),
              if (title.isNotEmpty) ...[
              const SizedBox(height: 6),
              Semantics(
                header: true,
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.4,
                    height: 1.15,
                    color: AppColors.ink,
                  ),
                ),
              ),
              ],
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!, style: TextStyle(fontSize: 16, color: AppColors.body, height: 1.3)),
              ],
              if (belowTitle != null) belowTitle!,
              ...children,
            ],
          ),
          // Status-bar strip so scrolled content never sits under the clock/icons.
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: top,
            child: ColoredBox(color: AppColors.headerTop),
          ),
        ],
      ),
    );
  }
}

/// Bell with a small orange dot when there is something unread.
class RevBell extends StatelessWidget {
  const RevBell({super.key, required this.unread, required this.onTap});

  final int unread;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: unread > 0 ? 'Alerts, $unread unread' : 'Alerts',
      onPressed: onTap,
      constraints: const BoxConstraints.tightFor(width: 48, height: 48),
      icon: Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(Icons.notifications_none_rounded, size: 28, color: AppColors.body),
          if (unread > 0)
            Positioned(
              right: 1,
              top: 1,
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                  border: Border.all(color: AppColors.background, width: 1.5),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

