import 'package:flutter/material.dart';

import '../../core/core.dart';
import 'add_vehicle_screen.dart';
import 'vehicle_detail_screen.dart';

class MyVehiclesScreen extends StatefulWidget {
  const MyVehiclesScreen({super.key});

  @override
  State<MyVehiclesScreen> createState() => _MyVehiclesScreenState();
}

class _MyVehiclesScreenState extends State<MyVehiclesScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final list = _tab == 0 ? app.vehicles : app.activeVehicles;
        return FxPage(
          title: 'My Vehicles',
          subtitle: 'Manage all your vehicles in one place',
          headerIcon: Icons.directions_car_outlined,
          showBack: false,
          stickyBottom: PrimaryButton(
            label: 'Add New Vehicle',
            icon: Icons.add_rounded,
            fontSize: 17,
            onPressed: () => context.push(const AddVehicleScreen()),
          ),
          children: [
            FxPillTabs(
              labels: ['All Vehicles (${app.vehicles.length})', 'Active (${app.activeVehicles.length})'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            const SizedBox(height: 14),
            if (list.isEmpty)
              EmptyState(
                icon: Icons.directions_car_outlined,
                title: 'No vehicles yet',
                message: 'Add your car or bike to book services and track repairs.',
                action: SizedBox(
                  width: 200,
                  child: PrimaryButton(
                    label: 'Add Vehicle',
                    icon: Icons.add_rounded,
                    height: 48,
                    onPressed: () => context.push(const AddVehicleScreen()),
                  ),
                ),
              ),
            for (var i = 0; i < list.length; i++)
              FadeSlide(
                index: i,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: VehicleListCard(vehicle: list[i]),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Vehicle row card (My Vehicles list).
class VehicleListCard extends StatelessWidget {
  final Vehicle vehicle;
  final VoidCallback? onTap;
  const VehicleListCard({super.key, required this.vehicle, this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = vehicle;
    return FxCard(
      padding: const EdgeInsets.all(10),
      radius: 20,
      onTap: onTap ?? () => context.push(VehicleDetailScreen(vehicleId: v.id)),
      child: Row(
        children: [
          SizedBox(width: 112, height: 80, child: VehicleImage(v, radius: 14)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(v.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.h2.copyWith(fontSize: 17)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Expanded(
                      child: Text(v.plate,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.body.copyWith(fontSize: 14, color: AppColors.text)),
                    ),
                    StatusPill(
                      v.active ? 'Active' : 'Inactive',
                      color: v.active ? AppColors.success : AppColors.textMuted,
                      icon: v.active ? Icons.check_circle_rounded : Icons.pause_circle_outline_rounded,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(v.type.icon, size: 16, color: AppColors.navy),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text(v.type.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.small.copyWith(fontSize: 12, color: AppColors.text)),
                    ),
                    Container(width: 1, height: 14, margin: const EdgeInsets.symmetric(horizontal: 8), color: AppColors.border),
                    Icon(Icons.calendar_today_outlined, size: 14, color: AppColors.navy),
                    const SizedBox(width: 4),
                    Text('${v.year}', style: AppText.small.copyWith(fontSize: 12, color: AppColors.text)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
