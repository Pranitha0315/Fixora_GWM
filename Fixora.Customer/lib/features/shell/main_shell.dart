import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../data/repositories/job_store.dart';
import '../bookings/bookings_screen.dart';
import '../home/home_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';
import '../vehicles/my_vehicles_screen.dart';

/// Root after login. IndexedStack keeps every tab alive.
class MainShell extends StatelessWidget {
  const MainShell({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: NavController.tab,
      builder: (context, index, _) => Scaffold(
        backgroundColor: AppColors.bg,
        body: IndexedStack(
          index: index,
          children: const [
            // 0 HomeScreen
            HomeScreen(),
            // 1 BookingsScreen
            BookingsScreen(),
            // 2 MyVehiclesScreen
            MyVehiclesScreen(),
            // 3 NotificationsScreen
            NotificationsScreen(),
            // 4 ProfileScreen
            ProfileScreen(),
          ],
        ),
        bottomNavigationBar: const _ShellBottomNav(),
      ),
    );
  }
}

class _ShellBottomNav extends StatelessWidget {
  const _ShellBottomNav();

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
    return ColoredBox(
      color: AppColors.bg,
      child: Padding(
        padding: EdgeInsets.only(top: 8, bottom: bottomInset > 0 ? bottomInset : 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.surfaceSolid,
                borderRadius: BorderRadius.circular(40),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.o(0.08),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
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
                      children: [
                        for (var i = 0; i < _items.length; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => NavController.tab.value = i,
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 220),
                              curve: Curves.easeOutCubic,
                              width: i == current ? 54 : 48,
                              height: i == current ? 54 : 48,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: i == current ? AppColors.primary : AppColors.surface,
                              ),
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  Icon(
                                    i == current ? _items[i].$2 : _items[i].$1,
                                    size: 23,
                                    color: i == current ? Colors.white : AppColors.navy,
                                  ),
                                  if (i == 3 && unread > 0)
                                    Positioned(
                                      top: 8,
                                      right: 8,
                                      child: Container(
                                        width: 8,
                                        height: 8,
                                        decoration: const BoxDecoration(
                                          color: AppColors.danger,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                    ),
                                ],
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
