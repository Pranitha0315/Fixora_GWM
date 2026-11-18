import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';
import 'add_vehicle_screen.dart';
import 'vehicle_detail_screen.dart';

class MyVehiclesScreen extends StatefulWidget {
  const MyVehiclesScreen({super.key});

  @override
  State<MyVehiclesScreen> createState() => _MyVehiclesScreenState();
}

class _MyVehiclesScreenState extends State<MyVehiclesScreen> {
  int _tab = 0; // 0 All, 1 Active

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final list = _tab == 0 ? app.vehicles : app.activeVehicles;
        return Scaffold(
          backgroundColor: AppColors.bg,
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
                    children: [
                      Text('My Vehicles', style: AppText.pageTitle),
                      const SizedBox(height: 4),
                      Text('Manage all your vehicles in one place', style: AppText.muted),
                      const SizedBox(height: 16),
                      _tabs(app),
                      const SizedBox(height: 14),
                      if (list.isEmpty)
                        _empty(context)
                      else
                        for (var i = 0; i < list.length; i++)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: VehicleListCard(vehicle: list[i]),
                          ),
                    ],
                  ),
                ),
                // stickyBottom: Add New Vehicle → AddVehicleScreen()
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: FilledButton.icon(
                      onPressed: () => context.push(const AddVehicleScreen()),
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('Add New Vehicle', style: TextStyle(fontSize: 17)),
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _tabs(AppState app) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          _tabChip(0, 'All Vehicles (${app.vehicles.length})'),
          _tabChip(1, 'Active (${app.activeVehicles.length})'),
        ],
      ),
    );
  }

  Widget _tabChip(int index, String label) {
    final selected = _tab == index;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tab = index),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: AppText.small.copyWith(
              fontWeight: FontWeight.w700,
              color: selected ? Colors.white : AppColors.navy,
            ),
          ),
        ),
      ),
    );
  }

  Widget _empty(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        children: [
          Icon(Icons.directions_car_outlined, size: 56, color: AppColors.textMuted),
          const SizedBox(height: 12),
          Text('No vehicles yet', style: AppText.h2),
          const SizedBox(height: 6),
          Text(
            'Add your car or bike to book services and track repairs.',
            textAlign: TextAlign.center,
            style: AppText.muted,
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: 200,
            height: 48,
            child: FilledButton.icon(
              onPressed: () => context.push(const AddVehicleScreen()),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add Vehicle'),
              style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            ),
          ),
        ],
      ),
    );
  }
}

/// Vehicle row card (My Vehicles list) → VehicleDetailScreen.
class VehicleListCard extends StatelessWidget {
  final Vehicle vehicle;
  final VoidCallback? onTap;
  const VehicleListCard({super.key, required this.vehicle, this.onTap});

  @override
  Widget build(BuildContext context) {
    final v = vehicle;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap ?? () => context.push(VehicleDetailScreen(vehicleId: v.id)),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              Container(
                width: 112,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(v.type.icon, size: 36, color: AppColors.link),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      v.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.h2.copyWith(fontSize: 17),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            v.plate,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.body.copyWith(fontSize: 14),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: (v.active ? AppColors.success : AppColors.textMuted).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                v.active ? Icons.check_circle_rounded : Icons.pause_circle_outline_rounded,
                                size: 14,
                                color: v.active ? AppColors.success : AppColors.textMuted,
                              ),
                              const SizedBox(width: 4),
                              Text(
                                v.active ? 'Active' : 'Inactive',
                                style: AppText.small.copyWith(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: v.active ? AppColors.success : AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(v.type.icon, size: 16, color: AppColors.navy),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            v.type.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.small.copyWith(fontSize: 12),
                          ),
                        ),
                        Container(
                          width: 1,
                          height: 14,
                          margin: const EdgeInsets.symmetric(horizontal: 8),
                          color: AppColors.border,
                        ),
                        Icon(Icons.calendar_today_outlined, size: 14, color: AppColors.navy),
                        const SizedBox(width: 4),
                        Text('${v.year}', style: AppText.small.copyWith(fontSize: 12)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
