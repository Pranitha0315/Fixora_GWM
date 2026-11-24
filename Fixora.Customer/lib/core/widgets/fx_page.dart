import 'package:flutter/material.dart';

import '../../data/repositories/job_store.dart';
import '../navigation/nav.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Plain screen background (Pastel Garage: clean white / deep slate).
class FxBackground extends StatelessWidget {
  final Widget child;

  /// Kept for older call sites (splash / onboarding / auth).
  final bool strong;
  const FxBackground({super.key, required this.child, this.strong = false});

  @override
  Widget build(BuildContext context) => ColoredBox(color: AppColors.bg, child: child);
}

/// Round icon button (back, bell, scan, more …): soft grey circle, ink icon.
/// Set [onPhoto] when it sits on a picture: white circle with a soft shadow.
class FxRoundButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final String? tooltip;
  final bool onPhoto;
  final double size;
  final bool badge;
  final Color? color;
  final Color? iconColor;
  const FxRoundButton({
    super.key,
    required this.icon,
    this.onTap,
    this.tooltip,
    this.onPhoto = false,
    this.size = 44,
    this.badge = false,
    this.color,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    final bg = color ?? (onPhoto ? AppColors.chrome : AppColors.iconButton);
    Widget b = Material(
      color: bg,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: size,
          height: size,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Icon(icon, size: size * 0.45, color: iconColor ?? AppColors.navy),
              if (badge)
                Positioned(
                  right: size * 0.24,
                  top: size * 0.22,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      shape: BoxShape.circle,
                      border: Border.all(color: bg, width: 1.6),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (onPhoto) {
      b = DecoratedBox(
        decoration: BoxDecoration(shape: BoxShape.circle, boxShadow: AppShadows.float),
        child: b,
      );
    }
    return Semantics(button: true, label: tooltip, child: Tooltip(message: tooltip ?? '', child: b));
  }
}

/// Round back button used on every inner screen.
class FxBackButton extends StatelessWidget {
  final VoidCallback? onTap;
  final IconData icon;
  final bool onPhoto;
  const FxBackButton({super.key, this.onTap, this.icon = Icons.arrow_back_rounded, this.onPhoto = false});

  @override
  Widget build(BuildContext context) => FxRoundButton(
        icon: icon,
        tooltip: 'Back',
        onPhoto: onPhoto,
        onTap: onTap ?? () => Navigator.of(context).maybePop(),
      );
}

class _RoundBack extends StatelessWidget {
  const _RoundBack();

  @override
  Widget build(BuildContext context) => const FxBackButton();
}

/// Standard inner page: back button, big title, optional trailing widget,
/// scrollable body and the floating bottom navigation.
class FxPage extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final Widget? topRight;
  final List<Widget> children;
  final bool showNav;
  final bool showBack;
  final EdgeInsets padding;
  final Widget? stickyBottom;
  final ScrollController? controller;

  /// Big icon tile left of the title (Notifications / My Vehicles style).
  final IconData? headerIcon;
  final bool headerBadge;

  /// Back arrow on the same line as the title (Offers & Plans style).
  final bool compactHeader;

  const FxPage({
    super.key,
    required this.title,
    required this.children,
    this.subtitle,
    this.trailing,
    this.topRight,
    this.showNav = true,
    this.showBack = true,
    this.padding = const EdgeInsets.fromLTRB(16, 4, 16, 0),
    this.stickyBottom,
    this.controller,
    this.headerIcon,
    this.headerBadge = false,
    this.compactHeader = false,
  });

  Widget _titleBlock() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppText.pageTitle),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(subtitle!, style: AppText.muted.copyWith(fontSize: 13.5, color: AppColors.text)),
        ],
      ],
    );
  }

  Widget _header(BuildContext context) {
    if (compactHeader) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 16, 14),
        child: Row(
          children: [
            if (showBack) ...[
              const _RoundBack(),
              const SizedBox(width: 12),
            ],
            Expanded(child: _titleBlock()),
            if (trailing != null) ...[const SizedBox(width: 8), trailing!],
          ],
        ),
      );
    }
    final titleRow = Row(
      crossAxisAlignment: headerIcon != null ? CrossAxisAlignment.center : CrossAxisAlignment.end,
      children: [
        if (headerIcon != null) ...[
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle),
                child: Icon(headerIcon, color: AppColors.link, size: 26),
              ),
              if (headerBadge)
                Positioned(
                  right: 4,
                  top: 4,
                  child: Container(
                    width: 11,
                    height: 11,
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.surfaceSolid, width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
        ],
        Expanded(child: _titleBlock()),
        if (trailing != null) ...[const SizedBox(width: 8), trailing!],
      ],
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showBack || topRight != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Row(
              children: [
                if (showBack) const FxBackButton() else const SizedBox(height: 44),
                const Spacer(),
                if (topRight != null) topRight!,
              ],
            ),
          ),
        Padding(
          padding: EdgeInsets.fromLTRB(headerIcon != null ? 16 : 20, showBack || topRight != null ? 18 : 22, 16, 14),
          child: titleRow,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    // The nav bar has its own strip at the bottom, so the page ends above it
    // (nothing scrolls underneath). The Scaffold already handles the safe area
    // when the nav is shown.
    final navSpace = showNav ? 20.0 : 24.0 + bottomInset;
    return Scaffold(
      backgroundColor: AppColors.bg,
      bottomNavigationBar: showNav ? const FxBottomNav() : null,
      body: FxBackground(
        child: SafeArea(
          bottom: false,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _header(context),
              Expanded(
                child: ListView(
                  controller: controller,
                  padding: padding.copyWith(
                    bottom: padding.bottom + (stickyBottom == null ? navSpace : 16),
                  ),
                  physics: const BouncingScrollPhysics(),
                  children: children,
                ),
              ),
              if (stickyBottom != null)
                Padding(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, navSpace - 6),
                  child: stickyBottom,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Floating round-icon bottom navigation (Home, Bookings, My Vehicles,
/// Notifications, Profile): a white pill with circle buttons; the selected
/// tab is a filled teal circle. Used on the shell and on every inner page.
class FxBottomNav extends StatelessWidget {
  final ValueChanged<int>? onTap;
  const FxBottomNav({super.key, this.onTap});

  static const _items = [
    (Icons.home_outlined, Icons.home_rounded, 'Home'),
    (Icons.calendar_month_outlined, Icons.calendar_month_rounded, 'Bookings'),
    (Icons.directions_car_outlined, Icons.directions_car_rounded, 'My Vehicles'),
    (Icons.notifications_none_rounded, Icons.notifications_rounded, 'Notifications'),
    (Icons.person_outline_rounded, Icons.person_rounded, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    // Solid strip in the page colour: content stops at its top edge and is
    // never visible behind or below the nav pill.
    return ColoredBox(
      color: AppColors.bg,
      child: Padding(
        padding: EdgeInsets.only(top: 8, bottom: bottomInset > 0 ? bottomInset : 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.chrome,
                borderRadius: BorderRadius.circular(40),
                boxShadow: AppShadows.float,
              ),
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: AnimatedBuilder(
                  animation: Listenable.merge([NavController.tab, JobStore.instance]),
                  builder: (context, _) {
                    final current = NavController.tab.value;
                    final unread = JobStore.instance.unreadCount;
                    return Row(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        for (var i = 0; i < _items.length; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          Semantics(
                            button: true,
                            selected: i == current,
                            label: _items[i].$3,
                            excludeSemantics: true,
                            child: Tooltip(
                              message: _items[i].$3,
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () {
                                  if (onTap != null) {
                                    onTap!(i);
                                  } else {
                                    NavController.goToTab(context, i);
                                  }
                                },
                                child: AnimatedContainer(
                                  duration: still ? Duration.zero : const Duration(milliseconds: 220),
                                  curve: Curves.easeOutCubic,
                                  width: i == current ? 54 : 48,
                                  height: i == current ? 54 : 48,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: i == current ? AppColors.primary : AppColors.iconButton,
                                  ),
                                  child: Stack(
                                    alignment: Alignment.center,
                                    children: [
                                      Icon(
                                        i == current ? _items[i].$2 : _items[i].$1,
                                        size: 23,
                                        color: i == current ? Colors.white : AppColors.text,
                                      ),
                                      if (i == 3 && unread > 0)
                                        Positioned(
                                          right: 12,
                                          top: 11,
                                          child: Container(
                                            width: 9,
                                            height: 9,
                                            decoration: BoxDecoration(
                                              color: AppColors.danger,
                                              shape: BoxShape.circle,
                                              border: Border.all(color: AppColors.iconButton, width: 1.5),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
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
