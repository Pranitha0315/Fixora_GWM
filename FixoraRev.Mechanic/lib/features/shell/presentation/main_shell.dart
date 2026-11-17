import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../app/theme/bronze_colors.dart';
import '../../fixproof/presentation/screens/fixproof_screen.dart';
import '../../home/presentation/screens/home_screen.dart';
import '../../inventory/presentation/inventory_screen.dart';
import '../../jobs/presentation/screens/jobs_screen.dart';
import '../../profile/presentation/screens/profile_screen.dart';

final shellTabProvider = NotifierProvider<ShellTabNotifier, int>(ShellTabNotifier.new);

class ShellTabNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void setIndex(int index) => state = index;
}

/// Floating pill bar — icon above label on every tab.
/// Dark: charcoal bar · bronze selected.
class MainShell extends ConsumerWidget {
  const MainShell({super.key});

  static const _tabs = <_ShellTab>[
    _ShellTab(label: 'Home', icon: Icons.home_outlined, selectedIcon: Icons.home),
    _ShellTab(label: 'Jobs', icon: Icons.assignment_outlined, selectedIcon: Icons.assignment),
    _ShellTab(label: 'Proof', icon: Icons.verified_outlined, selectedIcon: Icons.verified),
    _ShellTab(label: 'Parts', icon: Icons.inventory_2_outlined, selectedIcon: Icons.inventory_2),
    _ShellTab(label: 'Profile', icon: Icons.person_outline, selectedIcon: Icons.person),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabProvider);

    final pages = const <Widget>[
      HomeScreen(),
      JobsScreen(),
      FixproofScreen(),
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
          decoration: BoxDecoration(
            color: BronzeColors.surfaceElevated,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: BronzeColors.outline),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.35),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              for (var i = 0; i < _tabs.length; i++)
                Expanded(
                  child: _PillNavItem(
                    tab: _tabs[i],
                    selected: index == i,
                    onTap: () => ref.read(shellTabProvider.notifier).setIndex(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ShellTab {
  const _ShellTab({
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

class _PillNavItem extends StatelessWidget {
  const _PillNavItem({
    required this.tab,
    required this.selected,
    required this.onTap,
  });

  final _ShellTab tab;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? BronzeColors.bronze : BronzeColors.creamMuted;

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(selected ? tab.selectedIcon : tab.icon, color: color, size: 22),
          const SizedBox(height: 4),
          Text(
            tab.label,
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
