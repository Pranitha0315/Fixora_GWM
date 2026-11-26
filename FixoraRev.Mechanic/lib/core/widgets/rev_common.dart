import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

/// Rounded white card with a hairline border.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.onTap,
    this.onLongPress,
    this.color,
    this.borderColor,
    this.radius = 20,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final VoidCallback? onTap;

  /// Press and hold: opens the item's options sheet (same actions as its ⋯ menu).
  final VoidCallback? onLongPress;
  final Color? color;
  final Color? borderColor;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final color = this.color ?? AppColors.surface;
    final borderColor = this.borderColor ?? AppColors.border;
    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(radius), boxShadow: AppColors.cardShadow),
        child: Material(
        color: color,
        borderRadius: BorderRadius.circular(radius),
        child: InkWell(
          borderRadius: BorderRadius.circular(radius),
          onTap: onTap,
          onLongPress: onLongPress,
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius),
              border: Border.all(color: borderColor),
            ),
            child: child,
          ),
        ),
      ),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 22, bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 16.5,
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
          ),
          if (action != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                minimumSize: const Size(44, 44),
                padding: const EdgeInsets.symmetric(horizontal: 10),
                foregroundColor: AppColors.primary,
              ),
              child: Text(
                action!,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
            ),
        ],
      ),
    );
  }
}

/// Small coloured pill (status, priority, tags).
class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.label,
    required this.color,
    this.background,
    this.icon,
    this.dense = false,
  });

  final String label;
  final Color color;
  final Color? background;
  final IconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
          horizontal: dense ? 8 : 10, vertical: dense ? 3 : 5),
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(30),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: dense ? 12 : 14, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: dense ? 11 : 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

/// Round icon in a soft tinted square.
class IconBadge extends StatelessWidget {
  const IconBadge({
    super.key,
    required this.icon,
    this.color,
    this.background,
    this.size = 44,
  });

  final IconData icon;
  final Color? color;
  final Color? background;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = this.color ?? AppColors.primary;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: Icon(icon, color: color, size: size * 0.5),
    );
  }
}

class Avatar extends StatelessWidget {
  const Avatar(
      {super.key,
      required this.initials,
      this.size = 44,
      this.color,
      this.image});
  final String initials;
  final double size;
  final Color? color;
  final ImageProvider? image;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient:
            image == null && color == null ? AppColors.primaryGradient : null,
        color: color,
        image: image == null
            ? null
            : DecorationImage(image: image!, fit: BoxFit.cover),
      ),
      child: image == null
          ? Text(
              initials,
              style: TextStyle(
                color: AppColors.onPrimary,
                fontWeight: FontWeight.w800,
                fontSize: size * 0.36,
              ),
            )
          : null,
    );
  }
}

/// Label / value row used on detail screens.
class InfoRow extends StatelessWidget {
  const InfoRow(this.label, this.value,
      {super.key, this.valueColor, this.bold = false});
  final String label;
  final String value;
  final Color? valueColor;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style: TextStyle(color: AppColors.inkSoft, fontSize: 14)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: valueColor ?? AppColors.ink,
                fontSize: bold ? 16 : 14,
                fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Fixed bottom area holding the main action of a screen.
class BottomActionBar extends StatelessWidget {
  const BottomActionBar({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // Floating white card on the cream page (Warm Cards style).
    return ColoredBox(
      color: AppColors.background,
      child: SafeArea(
        top: false,
        child: Container(
          margin: const EdgeInsets.fromLTRB(12, 8, 12, 12),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(26),
            boxShadow: [BoxShadow(color: AppColors.shadow, blurRadius: 30, spreadRadius: -12, offset: const Offset(0, 10))],
          ),
          child: child,
        ),
      ),
    );
  }
}

/// Never a blank screen: a soft illustration, what is going on, and what to do next.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.actionLabel,
    this.actionIcon,
    this.onAction,
    this.secondaryLabel,
    this.onSecondary,
    this.compact = false,
  });

  final IconData icon;
  final String title;
  final String? message;

  /// One clear next step (Clear filters, Refresh, Go to jobs…).
  final String? actionLabel;
  final IconData? actionIcon;
  final VoidCallback? onAction;

  /// Optional quieter second step.
  final String? secondaryLabel;
  final VoidCallback? onSecondary;

  /// Smaller version for an empty section inside a longer page.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final art = compact ? 76.0 : 116.0;
    return Semantics(
      container: true,
      child: Padding(
        padding: EdgeInsets.symmetric(vertical: compact ? 20 : 40, horizontal: compact ? 8 : 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ExcludeSemantics(child: _EmptyArt(icon: icon, size: art)),
            SizedBox(height: compact ? 12 : 18),
            Text(title,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: compact ? 15.5 : 18, fontWeight: FontWeight.w800, color: AppColors.ink)),
            if (message != null) ...[
              const SizedBox(height: 6),
              Text(message!,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, height: 1.4, color: AppColors.body)),
            ],
            if (actionLabel != null && onAction != null) ...[
              SizedBox(height: compact ? 14 : 20),
              // A whole empty screen gets the solid button (it is the screen's one main action).
              // Inside a longer page the page keeps its own main action, so the empty
              // section only gets a quieter outlined button.
              if (compact)
                OutlinedButton.icon(
                  onPressed: onAction,
                  style: OutlinedButton.styleFrom(minimumSize: const Size(180, 48)),
                  icon: Icon(actionIcon ?? Icons.arrow_forward_rounded, size: 20),
                  label: Text(actionLabel!),
                )
              else
                FilledButton.icon(
                  onPressed: onAction,
                  style: FilledButton.styleFrom(minimumSize: const Size(180, 48)),
                  icon: Icon(actionIcon ?? Icons.arrow_forward_rounded, size: 20),
                  label: Text(actionLabel!),
                ),
            ],
            if (secondaryLabel != null && onSecondary != null) ...[
              const SizedBox(height: 4),
              TextButton(onPressed: onSecondary, child: Text(secondaryLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Layered lilac circles with the icon in the middle (no image files needed).
class _EmptyArt extends StatelessWidget {
  const _EmptyArt({required this.icon, required this.size});
  final IconData icon;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size * 1.35,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(color: AppColors.primarySoft.withValues(alpha: 0.55), shape: BoxShape.circle),
          ),
          Container(
            width: size * 0.7,
            height: size * 0.7,
            decoration: BoxDecoration(color: AppColors.surface, shape: BoxShape.circle, boxShadow: AppColors.cardShadow),
            child: Icon(icon, size: size * 0.32, color: AppColors.primaryStrong),
          ),
          Positioned(left: size * 0.06, top: size * 0.16, child: _dot(size * 0.09)),
          Positioned(right: size * 0.04, top: size * 0.30, child: _dot(size * 0.06)),
          Positioned(right: size * 0.14, bottom: size * 0.06, child: _dot(size * 0.11)),
        ],
      ),
    );
  }

  Widget _dot(double d) => Container(
        width: d,
        height: d,
        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.35), shape: BoxShape.circle),
      );
}

/// Generic yes/no dialog styled for the app.
Future<bool> confirmDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Confirm',
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.surface,
      surfaceTintColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      content: Text(message, style: TextStyle(color: AppColors.inkSoft)),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(ctx, false),
          style: TextButton.styleFrom(foregroundColor: AppColors.inkSoft),
          child: Text(cancelLabel),
        ),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          style: TextButton.styleFrom(
            foregroundColor: destructive ? AppColors.danger : AppColors.primary,
          ),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result ?? false;
}
