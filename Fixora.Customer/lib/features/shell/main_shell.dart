import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../bookings/bookings_screen.dart';
import '../home/home_screen.dart';
import '../notifications/notifications_screen.dart';
import '../profile/profile_screen.dart';
import '../vehicles/my_vehicles_screen.dart';

/// Root after login. Every tab page draws the floating bottom nav itself,
/// so inner pages can show the same nav bar (as in the reference designs).
class MainShell extends StatelessWidget {
  const MainShell({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: NavController.tab,
      builder: (context, index, _) => IndexedStack(
        index: index,
        children: const [
          HomeScreen(),
          BookingsScreen(),
          MyVehiclesScreen(),
          NotificationsScreen(),
          ProfileScreen(),
        ],
      ),
    );
  }
}
