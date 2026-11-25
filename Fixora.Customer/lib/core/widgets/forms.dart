import 'package:flutter/material.dart';

import '../../data/models/models.dart';
import '../../data/repositories/app_state.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import 'glass.dart';

/// Connected segmented tabs (All | Unread | Service | Offer).
class FxPillTabs extends StatelessWidget {
  final List<String> labels;
  final List<IconData?>? icons;
  final int index;
  final ValueChanged<int> onChanged;
  final double height;
  final double fontSize;

  const FxPillTabs({
    super.key,
    required this.labels,
    required this.index,
    required this.onChanged,
    this.icons,
    this.height = 48,
    this.fontSize = 15,
  });

  @override
  Widget build(BuildContext context) {
    return FxGlass(
      radius: height / 2,
      shadow: AppShadows.soft,
      padding: const EdgeInsets.all(3),
      child: SizedBox(
        height: height - 6,
        child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  AppState.instance.feedback();
                  onChanged(i);
                },
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 260),
                  curve: Curves.easeOutCubic,
                  decoration: BoxDecoration(
                    color: i == index ? AppColors.buttonBg : Colors.transparent,
                    borderRadius: BorderRadius.circular(height / 2),
                    boxShadow: i == index ? AppShadows.button : null,
                  ),
                  alignment: Alignment.center,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (icons != null && icons![i] != null) ...[
                        Icon(icons![i], size: 18, color: i == index ? AppColors.buttonFg : AppColors.textMuted),
                        const SizedBox(width: 6),
                      ],
                      Flexible(
                        child: Text(
                          labels[i],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: fontSize,
                            fontWeight: FontWeight.w600,
                            color: i == index ? AppColors.buttonFg : AppColors.textMuted,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
        ),
      ),
    );
  }
}

/// Field label.
class FxLabel extends StatelessWidget {
  final String text;
  final bool required;
  const FxLabel(this.text, {super.key, this.required = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14, bottom: 7),
      child: Text.rich(
        TextSpan(children: [
          TextSpan(text: text),
          if (required)
            TextSpan(text: ' *', style: TextStyle(color: AppColors.dangerText)),
        ]),
        style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.navy),
      ),
    );
  }
}

/// Styled dropdown that matches the text fields.
class FxDropdown<T> extends StatelessWidget {
  final T? value;
  final List<T> items;
  final String hint;
  final IconData? icon;
  final ValueChanged<T?> onChanged;
  final String Function(T)? label;
  final String? errorText;

  const FxDropdown({
    super.key,
    required this.value,
    required this.items,
    required this.hint,
    required this.onChanged,
    this.icon,
    this.label,
    this.errorText,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          height: 54,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: AppColors.fieldFill,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: errorText != null ? AppColors.danger : AppColors.fieldBorder, width: 1.2),
          ),
          child: Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 21, color: AppColors.textMuted),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<T>(
                    value: value,
                    isExpanded: true,
                    borderRadius: BorderRadius.circular(18),
                    dropdownColor: AppColors.surfaceSolid,
                    hint: Text(hint, style: AppText.muted.copyWith(color: AppColors.textFaint, fontSize: 14)),
                    icon: Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.navy),
                    items: [
                      for (final it in items)
                        DropdownMenuItem<T>(
                          value: it,
                          child: Text(label != null ? label!(it) : '$it', style: AppText.body.copyWith(fontSize: 14.5)),
                        ),
                    ],
                    onChanged: onChanged,
                  ),
                ),
              ),
            ],
          ),
        ),
        if (errorText != null)
          Padding(
            padding: const EdgeInsets.only(top: 5, left: 4),
            child: Text(errorText!, style: AppText.small.copyWith(color: AppColors.danger)),
          ),
      ],
    );
  }
}

/// Text field with label-friendly styling and validation message.
class FxInput extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final IconData? icon;
  final TextInputType? keyboardType;
  final String? errorText;
  final bool obscure;
  final int maxLines;
  final ValueChanged<String>? onChanged;
  final Widget? suffix;
  final TextCapitalization capitalization;

  const FxInput({
    super.key,
    required this.controller,
    required this.hint,
    this.icon,
    this.keyboardType,
    this.errorText,
    this.obscure = false,
    this.maxLines = 1,
    this.onChanged,
    this.suffix,
    this.capitalization = TextCapitalization.none,
  });

  @override
  Widget build(BuildContext context) {
    OutlineInputBorder b(Color c, [double w = 1.2]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: BorderSide(color: c, width: w),
        );
    return TextField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscure,
      maxLines: obscure ? 1 : maxLines,
      onChanged: onChanged,
      textCapitalization: capitalization,
      style: AppText.body.copyWith(fontSize: 15),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: AppText.muted.copyWith(color: AppColors.textFaint, fontSize: 14),
        prefixIcon: icon == null ? null : Icon(icon, color: AppColors.textMuted, size: 22),
        suffixIcon: suffix,
        errorText: errorText,
        filled: true,
        fillColor: AppColors.fieldFill,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: b(AppColors.fieldBorder),
        enabledBorder: b(AppColors.fieldBorder),
        focusedBorder: b(AppColors.link, 2),
        errorBorder: b(AppColors.danger, 1.6),
        focusedErrorBorder: b(AppColors.danger, 2.2),
      ),
    );
  }
}

/// Vehicle photo: user photo, demo asset or a type icon.
class VehicleImage extends StatelessWidget {
  final Vehicle vehicle;
  final double radius;
  final BoxFit fit;
  final Color? background;

  const VehicleImage(
    this.vehicle, {
    super.key,
    this.radius = 14,
    this.fit = BoxFit.cover,
    this.background,
  });

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (vehicle.photo != null) {
      child = Image.memory(vehicle.photo!, fit: fit, gaplessPlayback: true);
    } else if (vehicle.image != null) {
      // Background-free cut-out (`<image>_cut.png`) so only the vehicle
      // shows on the tile; falls back to the normal photo.
      final image = vehicle.image!;
      final cut = image.replaceFirst(RegExp(r'\.(jpe?g|png)$'), '_cut.png');
      child = Padding(
        padding: const EdgeInsets.all(4),
        child: Image.asset(
          cut,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => Image.asset(image, fit: fit),
        ),
      );
    } else {
      child = Container(
        decoration: BoxDecoration(gradient: AppColors.softGradient),
        child: Center(child: Icon(vehicle.type.icon, size: 40, color: AppColors.link)),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Container(
        color: background ?? AppColors.surfaceSolid,
        child: SizedBox.expand(child: child),
      ),
    );
  }
}

/// Vehicle photo without its background: shows `<asset>_cut.png` and falls
/// back to the original photo if the cut-out is missing.
class CutOutImage extends StatelessWidget {
  final String asset;
  final BoxFit fit;
  final Alignment alignment;
  const CutOutImage(this.asset, {super.key, this.fit = BoxFit.contain, this.alignment = Alignment.center});

  @override
  Widget build(BuildContext context) {
    final cut = asset.replaceFirst(RegExp(r'\.(jpe?g|png)$'), '_cut.png');
    return Image.asset(
      cut,
      fit: fit,
      alignment: alignment,
      errorBuilder: (context, error, stackTrace) => Image.asset(asset, fit: fit, alignment: alignment),
    );
  }
}

/// Icon-size picture of a vehicle (same size and shape as the round-cornered
/// icon tiles). Uses the customer's own photo if they added one, otherwise a
/// background-free cut-out (`<image>_cut.png`) so the whole car fits, and
/// falls back to the normal photo, then to the vehicle-type icon.
class VehicleIcon extends StatelessWidget {
  final Vehicle vehicle;
  final double size;
  final double radius;

  const VehicleIcon(this.vehicle, {super.key, this.size = 44, this.radius = 13});

  @override
  Widget build(BuildContext context) {
    final image = vehicle.image;
    Widget child;
    if (vehicle.photo != null) {
      child = Image.memory(vehicle.photo!, fit: BoxFit.cover, gaplessPlayback: true);
    } else if (image != null) {
      final cut = image.replaceFirst(RegExp(r'\.(jpe?g|png)$'), '_cut.png');
      child = Padding(
        padding: EdgeInsets.all(size * 0.06),
        child: Image.asset(
          cut,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => Image.asset(image, fit: BoxFit.cover),
        ),
      );
    } else {
      child = Icon(vehicle.type.icon, size: size * 0.5, color: AppColors.link);
    }
    return Semantics(
      label: vehicle.name,
      image: true,
      excludeSemantics: true,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(radius)),
        clipBehavior: Clip.antiAlias,
        alignment: Alignment.center,
        child: child,
      ),
    );
  }
}

/// Medal used for Silver / Gold / Platinum plans.
class PlanMedal extends StatelessWidget {
  final PlanTier tier;
  final double size;
  const PlanMedal(this.tier, {super.key, this.size = 56});

  static List<Color> colorsFor(PlanTier t) {
    switch (t) {
      case PlanTier.silver:
        return const [Color(0xFFF2F7F7), Color(0xFF9AA6B8)];
      case PlanTier.gold:
        return const [Color(0xFFFFE27A), Color(0xFFF2A516)];
      case PlanTier.platinum:
        return const [Color(0xFFD9CCFF), Color(0xFF7B5CFF)];
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = colorsFor(tier);
    return SizedBox(
      width: size,
      height: size * 1.18,
      child: Stack(
        alignment: Alignment.topCenter,
        children: [
          Positioned(
            bottom: 0,
            left: size * 0.22,
            child: Transform.rotate(
              angle: 0.28,
              child: Container(width: size * 0.2, height: size * 0.42, color: c[1].o(0.85)),
            ),
          ),
          Positioned(
            bottom: 0,
            right: size * 0.22,
            child: Transform.rotate(
              angle: -0.28,
              child: Container(width: size * 0.2, height: size * 0.42, color: c[1]),
            ),
          ),
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(colors: c, begin: Alignment.topLeft, end: Alignment.bottomRight),
              border: Border.all(color: AppColors.surfaceSolid, width: size * 0.06),
              boxShadow: [BoxShadow(color: c[1].o(0.4), blurRadius: size * 0.25, offset: Offset(0, size * 0.08))],
            ),
            child: Icon(Icons.star_rounded, color: Colors.white, size: size * 0.6),
          ),
        ],
      ),
    );
  }
}

/// Group of settings rows inside a white card.
class FxSettingsGroup extends StatelessWidget {
  final List<Widget> children;
  const FxSettingsGroup({super.key, required this.children});

  @override
  Widget build(BuildContext context) {
    return FxGlass(
      radius: 22,
      shadow: AppShadows.card,
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, indent: 70, color: AppColors.divider),
            children[i],
          ],
        ],
      ),
    );
  }
}

/// One settings row: icon | title + subtitle | trailing.
class FxSettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool danger;
  final bool chevron;

  const FxSettingsTile({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.danger = false,
    this.chevron = true,
  });

  @override
  Widget build(BuildContext context) {
    final color = danger ? AppColors.danger : AppColors.navy;
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap == null
          ? null
          : () {
              AppState.instance.feedback();
              onTap!();
            },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            SizedBox(width: 32, child: Icon(icon, color: danger ? AppColors.danger : AppColors.link, size: 26)),
            Container(width: 1.2, height: 34, margin: const EdgeInsets.symmetric(horizontal: 11), color: AppColors.border),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: color)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!, style: AppText.small.copyWith(fontSize: 12, color: AppColors.textMuted)),
                  ],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
            if (chevron && onTap != null) ...[
              const SizedBox(width: 4),
              Icon(Icons.chevron_right_rounded, color: AppColors.navy),
            ],
          ],
        ),
      ),
    );
  }
}

/// Soft blue value chip ("English", "Private", "Default").
class ValueChip extends StatelessWidget {
  final String text;
  final Color color;
  const ValueChip(this.text, {super.key, this.color = AppColors.primary});

  @override
  Widget build(BuildContext context) {
    final color = this.color == AppColors.primary ? AppColors.link : this.color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.o(AppColors.dark ? 0.16 : 0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.o(0.22)),
      ),
      child: Text(text, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

/// Switch that also plays tap feedback.
class FxSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const FxSwitch({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Switch.adaptive(
      value: value,
      activeTrackColor: AppColors.primary,
      onChanged: (v) {
        AppState.instance.feedback();
        onChanged(v);
      },
    );
  }
}

/// Empty state block.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;
  final Widget? action;
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 20),
      child: Column(
        children: [
          FxGlass(
            shape: BoxShape.circle,
            gradient: AppColors.softGradient,
            shadow: AppShadows.glow(AppColors.primary, 0.7),
            child: SizedBox(
              width: 88,
              height: 88,
              child: Icon(icon, size: 40, color: AppColors.link),
            ),
          ),
          const SizedBox(height: 14),
          Text(title, textAlign: TextAlign.center, style: AppText.h2),
          const SizedBox(height: 6),
          Text(message, textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 13.5)),
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    );
  }
}

/// Bottom sheet shell with rounded corners and a drag handle.
Future<T?> showFxSheet<T>(BuildContext context, {required Widget Function(BuildContext) builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: Container(
        margin: const EdgeInsets.all(12),
        constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.85),
        child: FxGlass(
          radius: 30,
          clip: true,
          color: AppColors.sheet,
          shadow: AppShadows.float,
          child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    margin: const EdgeInsets.fromLTRB(0, 12, 0, 14),
                    decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4)),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: builder(ctx),
                ),
              ],
            ),
          ),
        ),
        ),
      ),
    ),
  );
}

/// Pick one option from a list in a bottom sheet.
Future<String?> pickOption(
  BuildContext context, {
  required String title,
  required List<String> options,
  required String selected,
  Map<String, String>? subtitles,
}) {
  return showFxSheet<String>(
    context,
    builder: (ctx) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: AppText.h1),
        const SizedBox(height: 10),
        for (final o in options)
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(o, style: AppText.label.copyWith(fontSize: 15)),
            subtitle: subtitles?[o] == null ? null : Text(subtitles![o]!, style: AppText.small),
            trailing: o == selected
                ? Icon(Icons.check_circle_rounded, color: AppColors.link)
                : Icon(Icons.radio_button_unchecked_rounded, color: AppColors.textFaint),
            onTap: () => Navigator.of(ctx).pop(o),
          ),
      ],
    ),
  );
}
