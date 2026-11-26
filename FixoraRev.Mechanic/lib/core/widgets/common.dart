import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../app/theme/app_typography.dart';

/// Section title with an optional trailing action.
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 10),
      child: Row(
        children: [
          Expanded(child: Text(title, style: AppText.heading)),
          if (action != null) TextButton(onPressed: onAction, child: Text(action!)),
        ],
      ),
    );
  }
}

/// Rounded square holding an icon, used across lists and quick actions.
class IconBox extends StatelessWidget {
  const IconBox({
    super.key,
    required this.icon,
    this.size = 44,
    this.background,
    this.foreground,
  });

  final IconData icon;
  final double size;
  final Color? background;
  final Color? foreground;

  @override
  Widget build(BuildContext context) {
    final background = this.background ?? AppColors.primarySoft;
    final foreground = this.foreground ?? AppColors.primaryStrong;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(size * 0.3)),
      child: Icon(icon, color: foreground, size: size * 0.5),
    );
  }
}

/// Sri Lankan number-plate style badge.
class PlateBadge extends StatelessWidget {
  const PlateBadge({super.key, required this.plate});
  final String plate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: AppColors.ink, width: 1.4),
      ),
      child: Text(plate, style: AppText.mono.copyWith(fontSize: 12)),
    );
  }
}

/// Placeholder for a captured photo / video until real media is wired.
class MediaTile extends StatelessWidget {
  const MediaTile({
    super.key,
    required this.label,
    this.isVideo = false,
    this.size,
    this.onRemove,
    this.tint,
  });

  final String label;
  final bool isVideo;
  final double? size;
  final VoidCallback? onRemove;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final tint = this.tint ?? AppColors.surfaceAlt;
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        children: [
          Positioned.fill(
            child: Container(
              decoration: BoxDecoration(
                color: tint,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              padding: const EdgeInsets.all(8),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isVideo ? Icons.play_circle_fill_rounded : Icons.photo_camera_back_rounded,
                    color: AppColors.muted,
                    size: 26,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.caption.copyWith(color: AppColors.body),
                  ),
                ],
              ),
            ),
          ),
          if (isVideo)
            Positioned(
              left: 8,
              top: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: AppColors.ink, borderRadius: BorderRadius.circular(6)),
                child: const Text('VIDEO', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
              ),
            ),
          if (onRemove != null)
            Positioned(
              right: 0,
              top: 0,
              child: IconButton(
                tooltip: 'Remove $label',
                onPressed: onRemove,
                icon: Container(
                  decoration: BoxDecoration(color: AppColors.surface, shape: BoxShape.circle),
                  child: Icon(Icons.close_rounded, size: 18, color: AppColors.ink),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Inline banner for guidance / warnings.
class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.text,
    this.icon = Icons.info_outline_rounded,
    this.background,
    this.foreground,
  });

  final String text;
  final IconData icon;
  final Color? background;
  final Color? foreground;

  @override
  Widget build(BuildContext context) {
    final background = this.background ?? AppColors.infoSoft;
    final foreground = this.foreground ?? AppColors.info;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(14)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: foreground, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: AppText.label.copyWith(color: foreground, fontWeight: FontWeight.w600, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

/// Sticky bottom action area with safe-area padding.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: SafeArea(
        top: false,
        child: Column(mainAxisSize: MainAxisSize.min, children: children),
      ),
    );
  }
}

String formatLkr(int amount) {
  final s = amount.toString();
  final buf = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    final fromEnd = s.length - i;
    buf.write(s[i]);
    if (fromEnd > 1 && fromEnd % 3 == 1) buf.write(',');
  }
  return 'Rs. $buf';
}

/// One photo / video per row: thumbnail, what it shows, and a 44px remove button.
/// Used instead of 3-column photo grids so evidence lists scroll in one direction
/// and every control is big enough for a thumb.
class MediaRow extends StatelessWidget {
  const MediaRow({
    super.key,
    required this.thumbnail,
    required this.title,
    this.subtitle,
    this.onTap,
    this.onLongPress,
    this.onRemove,
  });

  /// Shown in a 64 x 64 rounded box.
  final Widget thumbnail;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          onLongPress: onLongPress,
          child: Container(
            padding: const EdgeInsets.fromLTRB(8, 8, 4, 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                SizedBox.square(
                  dimension: 64,
                  child: ClipRRect(borderRadius: BorderRadius.circular(12), child: thumbnail),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.bodyStrong),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle!, style: AppText.caption),
                      ],
                    ],
                  ),
                ),
                if (onRemove != null)
                  IconButton(
                    tooltip: 'Remove $title',
                    onPressed: onRemove,
                    constraints: const BoxConstraints.tightFor(width: 48, height: 48),
                    icon: Icon(Icons.delete_outline_rounded, color: AppColors.danger),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Three numbers in one card (instead of three small cards side by side).
class StatStrip extends StatelessWidget {
  const StatStrip({super.key, required this.items});

  /// (value, label) pairs; two to four of them.
  final List<(String, String)> items;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppColors.cardShadow,
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) VerticalDivider(width: 1, thickness: 1, color: AppColors.border, indent: 4, endIndent: 4),
              Expanded(
                child: Semantics(
                  label: '${items[i].$2}: ${items[i].$1}',
                  excludeSemantics: true,
                  child: Column(
                    children: [
                      Text(items[i].$1,
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink)),
                      const SizedBox(height: 2),
                      Text(items[i].$2, textAlign: TextAlign.center, style: AppText.caption),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Small square thumbnail for [MediaRow]: camera or play icon on a soft tile.
class MediaThumb extends StatelessWidget {
  const MediaThumb({super.key, this.isVideo = false});
  final bool isVideo;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(color: AppColors.surfaceAlt),
      child: Center(
        child: Icon(
          isVideo ? Icons.play_circle_fill_rounded : Icons.photo_camera_back_rounded,
          color: AppColors.muted,
          size: 28,
        ),
      ),
    );
  }
}
