import 'package:flutter/material.dart';

import '../../data/models/models.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import 'forms.dart';
import 'glass.dart';

/// Liquid-glass card: frosted translucent panel with a specular rim that
/// floats above the garage background (Spatial UI depth shadow). Tappable
/// cards sink slightly when pressed.
class FxCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Gradient? gradient;
  final Color? borderColor;
  final double radius;
  final VoidCallback? onTap;
  final bool shadow;

  const FxCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color,
    this.gradient,
    this.borderColor,
    this.radius = 24,
    this.onTap,
    this.shadow = true,
  });

  @override
  Widget build(BuildContext context) {
    final card = FxGlass(
      radius: radius,
      padding: padding,
      color: gradient == null ? color : null,
      gradient: gradient,
      borderColor: borderColor,
      shadow: shadow ? AppShadows.card : null,
      child: child,
    );
    if (onTap == null) return card;
    return FxPressable(onTap: onTap, radius: radius, child: card);
  }
}

/// Square, softly tinted icon tile.
class IconTile extends StatelessWidget {
  final IconData icon;
  final double size;
  final Color color;
  final Color? background;
  final double radius;
  final double? iconSize;

  const IconTile({
    super.key,
    required this.icon,
    this.size = 52,
    this.color = AppColors.primary,
    this.background,
    this.radius = 14,
    this.iconSize,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: background,
        gradient: background == null
            ? LinearGradient(
                colors: [color.o(0.08), color.o(0.18)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : null,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Icon(icon, color: color, size: iconSize ?? size * 0.52),
    );
  }
}

/// Light blue pill with the job card number.
class JobChip extends StatelessWidget {
  final String text;
  const JobChip(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.link.o(0.28)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: AppColors.dark ? AppColors.primaryLight : AppColors.primaryDark,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.1,
        ),
      ),
    );
  }
}

/// Status pill with optional leading icon.
class StatusPill extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;
  final bool dot;
  const StatusPill(this.text, {super.key, required this.color, this.icon, this.dot = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: color.o(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (dot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 5),
          ],
          if (icon != null) ...[
            Icon(icon, size: 14, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: TextStyle(color: AppColors.readable(color), fontSize: 11.5, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Card header: icon tile + title + subtitle + job chip (top-right).
class CardHeader extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? chip;
  final Widget? trailing;
  final Color color;

  const CardHeader({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.chip,
    this.trailing,
    this.color = AppColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        IconTile(icon: icon, color: color),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(title, style: AppText.h2.copyWith(fontSize: 19)),
                    ),
                  ),
                  if (chip != null) chip!,
                ],
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!, style: AppText.muted),
              ],
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

/// Section heading with optional "View All" action.
class SectionTitle extends StatelessWidget {
  final String text;
  final String? action;
  final VoidCallback? onAction;
  final IconData? icon;
  final Widget? trailing;
  final EdgeInsetsGeometry padding;

  const SectionTitle(
    this.text, {
    super.key,
    this.action,
    this.onAction,
    this.icon,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(2, 18, 2, 10),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 20, color: AppColors.link),
            const SizedBox(width: 8),
          ],
          Expanded(child: Text(text, style: AppText.h3.copyWith(fontSize: 16.5))),
          if (trailing != null) trailing!,
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Row(
                children: [
                  Text(action!,
                      style: TextStyle(
                          color: AppColors.link, fontSize: 13, fontWeight: FontWeight.w600)),
                  const SizedBox(width: 2),
                  Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.link),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Rounded image from assets with optional overlay badge.
class AssetPhoto extends StatelessWidget {
  final String asset;
  final double? width;
  final double? height;
  final double radius;
  final BoxFit fit;
  final Alignment alignment;

  const AssetPhoto(
    this.asset, {
    super.key,
    this.width,
    this.height,
    this.radius = 14,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.asset(
        asset,
        width: width,
        height: height,
        fit: fit,
        alignment: alignment,
        errorBuilder: (_, __, ___) => Container(
          width: width,
          height: height,
          color: AppColors.primarySoft,
          child: const Icon(Icons.image_outlined, color: AppColors.primary),
        ),
      ),
    );
  }
}

/// Car thumbnail + name/plate + optional status / current step block.
class VehicleStrip extends StatelessWidget {
  final Vehicle vehicle;
  final Widget? trailing;
  final bool compact;
  final VoidCallback? onTap;

  const VehicleStrip({
    super.key,
    required this.vehicle,
    this.trailing,
    this.compact = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return FxCard(
      onTap: onTap,
      shadow: false,
      radius: 18,
      padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
      child: Row(
        children: [
          Container(
            width: compact ? 72 : 98,
            height: compact ? 46 : 58,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              boxShadow: AppShadows.soft,
            ),
            child: VehicleImage(vehicle, radius: 12, fit: BoxFit.contain),
          ),
          SizedBox(width: compact ? 10 : 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  vehicle.name,
                  maxLines: compact ? 2 : 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.h3.copyWith(fontSize: compact ? 14.5 : 16.5, height: 1.2),
                ),
                const SizedBox(height: 3),
                Text(vehicle.plate, style: AppText.muted.copyWith(fontSize: compact ? 12 : 13)),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 6), trailing!],
        ],
      ),
    );
  }
}

/// "Current Step | Parts Installation" block used next to the vehicle.
class CurrentStepBadge extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  const CurrentStepBadge({
    super.key,
    this.label = 'Current Step',
    required this.value,
    this.icon = Icons.build_outlined,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: AppColors.primarySofter,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.o(0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 17, color: AppColors.link),
          const SizedBox(width: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 90),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.navy)),
                Text(value,
                    maxLines: 2,
                    style: TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.link)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Label / value row (totals etc.).
class KVRow extends StatelessWidget {
  final String label;
  final String value;
  final TextStyle? labelStyle;
  final TextStyle? valueStyle;
  final EdgeInsetsGeometry padding;

  const KVRow(
    this.label,
    this.value, {
    super.key,
    this.labelStyle,
    this.valueStyle,
    this.padding = const EdgeInsets.symmetric(vertical: 4),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(child: Text(label, style: labelStyle ?? AppText.body.copyWith(fontSize: 13.5))),
          const SizedBox(width: 12),
          // Long values (addresses, garage names) wrap instead of overflowing.
          Flexible(
            child: Text(value,
                textAlign: TextAlign.end,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: valueStyle ?? AppText.body.copyWith(fontSize: 13.5)),
          ),
        ],
      ),
    );
  }
}

/// Highlighted "Total" bar.
class TotalBar extends StatelessWidget {
  final String label;
  final String value;
  final double fontSize;
  const TotalBar({super.key, this.label = 'Total', required this.value, this.fontSize = 22});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.primarySoft,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: fontSize - 3, fontWeight: FontWeight.w800, color: AppColors.navy)),
          ),
          const SizedBox(width: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value,
                style: TextStyle(
                    fontSize: fontSize, fontWeight: FontWeight.w800, color: AppColors.link)),
          ),
        ],
      ),
    );
  }
}

/// Mechanic update card with avatar.
class MechanicUpdateCard extends StatelessWidget {
  final String name;
  final String message;
  final String time;
  final List<String> photos;
  final VoidCallback? onViewAll;
  final int totalPhotos;

  const MechanicUpdateCard({
    super.key,
    required this.name,
    required this.message,
    required this.time,
    this.photos = const [],
    this.onViewAll,
    this.totalPhotos = 0,
  });

  @override
  Widget build(BuildContext context) {
    return FxCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                children: [
                  const AssetPhoto('assets/images/mechanic.jpg', width: 54, height: 58, radius: 14),
                  Positioned(
                    right: 2,
                    bottom: 2,
                    child: Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: AppColors.success,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.surfaceSolid, width: 2),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('Mechanic Update', style: AppText.h3)),
                        Text(time, style: AppText.small),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(name,
                        style: TextStyle(
                            fontSize: 12, color: AppColors.link, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(message, style: AppText.muted.copyWith(fontSize: 13, color: AppColors.text)),
                  ],
                ),
              ),
            ],
          ),
          if (photos.isNotEmpty) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                for (final p in photos.take(3)) ...[
                  Expanded(child: AspectRatio(aspectRatio: 1.15, child: AssetPhoto(p, radius: 12))),
                  const SizedBox(width: 8),
                ],
                Expanded(
                  child: AspectRatio(
                    aspectRatio: 1.15,
                    child: InkWell(
                      onTap: onViewAll,
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        decoration: BoxDecoration(
                          color: AppColors.primarySofter,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.photo_library_rounded, color: AppColors.primary, size: 22),
                            const SizedBox(height: 4),
                            Text('View All\nPhotos ($totalPhotos)',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700,
                                    color: AppColors.navy)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Pulsing green "Live" pill.
class LivePill extends StatefulWidget {
  final String text;
  final Color color;
  const LivePill({super.key, this.text = 'Live', this.color = AppColors.success});

  @override
  State<LivePill> createState() => _LivePillState();
}

class _LivePillState extends State<LivePill> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))
        ..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: widget.color.o(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: Tween<double>(begin: 0.35, end: 1).animate(_c),
            child: Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
            ),
          ),
          const SizedBox(width: 5),
          Text(widget.text,
              style: TextStyle(color: AppColors.readable(widget.color), fontSize: 11, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Simple staggered fade + slide-in.
class FadeSlide extends StatelessWidget {
  final Widget child;
  final int index;
  const FadeSlide({super.key, required this.child, this.index = 0});

  @override
  Widget build(BuildContext context) {
    final delay = (index * 60).clamp(0, 480).toInt();
    final total = 420 + delay;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: Duration(milliseconds: total),
      curve: Interval(delay / total, 1, curve: Curves.easeOutCubic),
      builder: (context, v, c) => Opacity(
        opacity: v,
        child: Transform.translate(offset: Offset(0, (1 - v) * 18), child: c),
      ),
      child: child,
    );
  }
}

/// Dashed rounded border (upload drop zones).
class DashedBorder extends StatelessWidget {
  final Widget child;
  final Color color;
  final double radius;
  final Color? fill;
  const DashedBorder({
    super.key,
    required this.child,
    this.color = const Color(0xFF95EDE6),
    this.radius = 16,
    this.fill,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _DashedPainter(color: color, radius: radius, fill: fill),
      child: child,
    );
  }
}

class _DashedPainter extends CustomPainter {
  final Color color;
  final double radius;
  final Color? fill;
  _DashedPainter({required this.color, required this.radius, this.fill});

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius));
    if (fill != null) canvas.drawRRect(rrect, Paint()..color = fill!);
    final path = Path()..addRRect(rrect);
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        canvas.drawPath(metric.extractPath(d, d + 6), paint);
        d += 11;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedPainter old) =>
      old.color != color || old.radius != radius || old.fill != fill;
}

/// Text field styled like the reference ("Add a note for the service team...").
class FxTextField extends StatelessWidget {
  final String hint;
  final int maxLines;
  final TextEditingController? controller;
  final TextInputType? keyboardType;
  final Widget? prefix;
  final ValueChanged<String>? onChanged;
  final bool enabled;
  final TextStyle? style;

  const FxTextField({
    super.key,
    required this.hint,
    this.maxLines = 1,
    this.controller,
    this.keyboardType,
    this.prefix,
    this.onChanged,
    this.enabled = true,
    this.style,
  });

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      onChanged: onChanged,
      enabled: enabled,
      style: style ?? AppText.body,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppText.muted.copyWith(color: AppColors.textFaint),
        prefixIcon: prefix,
        filled: true,
        fillColor: AppColors.fieldFill,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: AppColors.fieldBorder, width: 1.2),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: AppColors.fieldBorder, width: 1.2),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: AppColors.fieldBorder, width: 1.2),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: AppColors.link, width: 2),
        ),
      ),
    );
  }
}

/// Shows a short floating snack bar.
void showFxSnack(BuildContext context, String message, {IconData icon = Icons.check_circle_rounded}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink.o(0.92),
        elevation: 0,
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: Colors.white.o(0.14)),
        ),
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Expanded(child: Text(message, style: const TextStyle(color: Colors.white))),
          ],
        ),
      ),
    );
}
