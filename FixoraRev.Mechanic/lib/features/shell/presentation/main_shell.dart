import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../home/presentation/screens/home_screen.dart';
import '../../fixproof/presentation/screens/fixproof_hub_screen.dart';
import '../../queue_board/presentation/screens/queue_board_screen.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../profile/presentation/profile_screen.dart';

/// Current bottom-nav tab. autoDispose: once the shell leaves the screen (logout or
/// expired session) the tab resets, so the next sign-in always opens on Home.
final shellTabProvider = StateProvider.autoDispose<int>((ref) => 0);

/// Floating pill bar — icon above label on every tab.
/// Light: white bar · orange selected · Dark: black bar · orange selected.
class MainShell extends ConsumerWidget {
  const MainShell({super.key});

  static const home = 0, jobs = 1, fixProof = 2, profile = 3;

  /// Space under scroll content so the last card is not hidden by the pill bar.
  static const contentBottomGap = 28.0;

  /// Lets inner screens switch tabs (e.g. "View all" → Jobs).
  static void switchTab(BuildContext context, int index) =>
      ProviderScope.containerOf(context, listen: false).read(shellTabProvider.notifier).state = index;

  /// Alerts are a full screen pushed over the tabs.
  static void openAlerts(BuildContext context) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()));

  static final _tabs = [
    _TabSpec('Home', Icons.home_outlined, Icons.home_rounded),
    _TabSpec('Jobs', Icons.handyman_outlined, Icons.handyman_rounded),
    _TabSpec('Proof', Icons.photo_camera_outlined, Icons.photo_camera_rounded),
    _TabSpec('Profile', Icons.person_outline_rounded, Icons.person_rounded),
  ];

  static const _accent = Color(0xFFFF6300);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);
    void go(int i) => ref.read(shellTabProvider.notifier).state = i;

    final barBg = AppColors.isDark ? const Color(0xFF000000) : Colors.white;
    final idle = AppColors.isDark ? const Color(0xFF8A8A8A) : const Color(0xFF9E9E9E);

    // System back on another tab returns to Home first, like most mobile apps.
    return PopScope(
      canPop: index == home,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) go(home);
      },
      child: Scaffold(
        // Keep body above the bar so cards like Wheel Alignment stay fully visible.
        extendBody: false,
        body: IndexedStack(
          index: index,
          children: const [
            HomeScreen(),
            QueueBoardScreen(asTab: true),
            FixProofHubScreen(),
            ProfileScreen(),
          ],
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          minimum: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Container(
            height: 70,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: barBg,
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: AppColors.isDark ? 0.45 : 0.12),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  _PillNavItem(
                    spec: _tabs[i],
                    selected: index == i,
                    accent: _accent,
                    idleColor: idle,
                    onTap: () => go(i),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TabSpec {
  const _TabSpec(this.label, this.icon, this.activeIcon);
  final String label;
  final IconData icon;
  final IconData activeIcon;
}

class _PillNavItem extends StatelessWidget {
  const _PillNavItem({
    required this.spec,
    required this.selected,
    required this.accent,
    required this.idleColor,
    required this.onTap,
  });

  final _TabSpec spec;
  final bool selected;
  final Color accent;
  final Color idleColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? accent : idleColor;

    return Expanded(
      child: Semantics(
        selected: selected,
        button: true,
        label: spec.label,
        excludeSemantics: true,
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    selected ? spec.activeIcon : spec.icon,
                    size: 22,
                    color: color,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    spec.label,
                    maxLines: 1,
                    style: TextStyle(
                      color: color,
                      fontSize: 11,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      height: 1.1,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
