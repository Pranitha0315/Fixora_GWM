import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/app_colors.dart';
import '../../fixproof/presentation/screens/fixproof_hub_screen.dart';
import '../../home/presentation/screens/home_screen.dart';
import '../../inventory/presentation/inventory_screen.dart';
import '../../notifications/presentation/notifications_screen.dart';
import '../../profile/presentation/profile_screen.dart';
import '../../queue_board/presentation/screens/queue_board_screen.dart';


/// Current bottom-nav tab.
class ShellTabNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void setIndex(int index) => state = index;
}

final shellTabProvider =
    NotifierProvider<ShellTabNotifier, int>(ShellTabNotifier.new);

/// Floating pill bar — icon above label on every tab.
class MainShell extends ConsumerWidget {
  const MainShell({super.key});

  static const Color _accent = Color(0xFFFF6300);

  static void openAlerts(BuildContext context) =>
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const NotificationsScreen(),
        ),
      );

  static const _tabs = <_TabSpec>[
    _TabSpec('Home', Icons.home_outlined, Icons.home_rounded),
    _TabSpec('Jobs', Icons.handyman_outlined, Icons.handyman_rounded),
    _TabSpec('Proof', Icons.photo_camera_outlined, Icons.photo_camera_rounded),
    _TabSpec('Parts', Icons.inventory_2_outlined, Icons.inventory_2_rounded),
    _TabSpec('Profile', Icons.person_outline_rounded, Icons.person_rounded),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);
    final barBg = AppColors.navBar;
    final idle = AppColors.body;

    void go(int i) => ref.read(shellTabProvider.notifier).setIndex(i);

    const pages = <Widget>[
      HomeScreen(),
      QueueBoardScreen(asTab: true),
      FixproofHubScreen(),
      InventoryScreen(),
      ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(index: index, children: pages),
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
                color: Colors.black.withValues(
                  alpha: AppColors.isDark ? 0.45 : 0.12,
                ),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              for (var i = 0; i < _tabs.length; i++)
                Expanded(
                  child: _PillNavItem(
                    spec: _tabs[i],
                    selected: index == i,
                    accent: _accent,
                    idleColor: idle,
                    onTap: () => go(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TabSpec {
  const _TabSpec(this.label, this.icon, this.selectedIcon);

  final String label;
  final IconData icon;
  final IconData selectedIcon;
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

    return InkWell(
      borderRadius: BorderRadius.circular(28),
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            selected ? spec.selectedIcon : spec.icon,
            color: color,
            size: 22,
          ),
          const SizedBox(height: 4),
          Text(
            spec.label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
