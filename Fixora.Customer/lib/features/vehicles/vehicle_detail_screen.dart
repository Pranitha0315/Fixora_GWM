import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';
import '../bookings/book_service_screen.dart';
import 'add_vehicle_screen.dart';
import 'evidence_passport_screen.dart';
import 'service_history_screen.dart';

/// Vehicle Details: overview, information grid and quick actions.
class VehicleDetailScreen extends StatelessWidget {
  final String vehicleId;
  const VehicleDetailScreen({super.key, required this.vehicleId});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final v = app.vehicleById(vehicleId);
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('Vehicle Details'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
            actions: [_menu(context, v)],
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Text('Your vehicle overview', style: AppText.muted),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: LinearGradient(
                    colors: [AppColors.surface, AppColors.adapt(const Color(0xFFECFDFC))],
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 112,
                      height: 80,
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(v.type.icon, size: 40, color: AppColors.link),
                    ),
                    Container(
                      width: 1.4,
                      height: 80,
                      margin: const EdgeInsets.symmetric(horizontal: 12),
                      color: AppColors.border,
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(v.name, style: AppText.h1.copyWith(fontSize: 20)),
                          const SizedBox(height: 4),
                          Text(v.plate, style: AppText.body.copyWith(fontSize: 15)),
                          const SizedBox(height: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                            decoration: BoxDecoration(
                              color: v.active ? AppColors.success : AppColors.textMuted,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              v.active ? 'Active' : 'Inactive',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                                fontSize: 12.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('Vehicle Information', style: AppText.h2),
                    const SizedBox(height: 12),
                    _grid([
                      _InfoCell(Icons.calendar_today_outlined, 'Year', '${v.year}'),
                      _InfoCell(Icons.palette_outlined, 'Color', v.color),
                      _InfoCell(Icons.local_gas_station_outlined, 'Fuel Type', v.fuel),
                      _InfoCell(Icons.settings_outlined, 'Transmission', v.transmission),
                      _InfoCell(v.type.icon, 'Body Type', v.bodyType),
                      _InfoCell(Icons.miscellaneous_services_outlined, 'Engine Capacity', '${v.engineCc} cc'),
                      _InfoCell(Icons.speed_rounded, 'Mileage', '${v.mileageKm} km'),
                      _InfoCell(
                        Icons.favorite_border_rounded,
                        'Health',
                        '${(v.healthScore * 100).round()}%',
                      ),
                    ]),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: () => context.push(ServiceHistoryScreen(vehicleId: v.id)),
                  icon: const Icon(Icons.history_rounded),
                  label: const Text('View Service History'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.navy,
                    side: BorderSide(color: AppColors.border),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: () => context.push(EvidencePassportScreen(vehicle: v)),
                  icon: const Icon(Icons.shield_outlined),
                  label: const Text('Evidence Passport'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.navy,
                    side: BorderSide(color: AppColors.border),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: () => context.push(AddVehicleScreen(editId: v.id)),
                  icon: const Icon(Icons.edit_outlined),
                  label: const Text('Edit details'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.navy,
                    side: BorderSide(color: AppColors.border),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: 54,
                child: FilledButton.icon(
                  onPressed: () {
                    if (!v.active) {
                      _snack(context, 'Set this vehicle to Active to book a service',
                          icon: Icons.info_outline_rounded);
                      return;
                    }
                    context.push(BookServiceScreen(vehicleId: v.id));
                  },
                  icon: const Icon(Icons.event_available_rounded),
                  label: const Text('Book a Service'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _grid(List<Widget> cells) {
    return Column(
      children: [
        for (var i = 0; i < cells.length; i += 2)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Expanded(child: cells[i]),
                const SizedBox(width: 10),
                Expanded(child: i + 1 < cells.length ? cells[i + 1] : const SizedBox()),
              ],
            ),
          ),
      ],
    );
  }

  Widget _menu(BuildContext context, Vehicle v) {
    return PopupMenuButton<String>(
      icon: Icon(Icons.more_vert_rounded, color: AppColors.navy),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      onSelected: (value) async {
        final app = AppState.instance;
        switch (value) {
          case 'edit':
            context.push(AddVehicleScreen(editId: v.id));
          case 'status':
            app.updateVehicle(v.copyWith(active: !v.active));
            _snack(
              context,
              v.active ? '${v.name} set to Inactive' : '${v.name} is Active again',
            );
          case 'default':
            app.selectVehicle(v.id);
            _snack(context, '${v.name} will show on Home');
          case 'remove':
            final ok = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                title: const Text('Remove vehicle?'),
                content: Text('${v.name} (${v.plate}) will be removed from My Vehicles.'),
                actions: [
                  TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
                  TextButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: Text('Remove', style: TextStyle(color: AppColors.dangerText)),
                  ),
                ],
              ),
            );
            if (ok == true && context.mounted) {
              Navigator.of(context).pop();
              app.removeVehicle(v.id);
              _snack(context, '${v.name} removed');
            }
        }
      },
      itemBuilder: (_) => [
        const PopupMenuItem(value: 'edit', child: Text('Edit details')),
        PopupMenuItem(value: 'status', child: Text(v.active ? 'Set as Inactive' : 'Set as Active')),
        const PopupMenuItem(value: 'default', child: Text('Show on Home')),
        PopupMenuItem(
          value: 'remove',
          child: Text('Remove vehicle', style: TextStyle(color: AppColors.dangerText)),
        ),
      ],
    );
  }

  void _snack(BuildContext context, String msg, {IconData icon = Icons.check_circle_outline_rounded}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(icon, color: Colors.white, size: 18),
            const SizedBox(width: 10),
            Expanded(child: Text(msg)),
          ],
        ),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

class _InfoCell extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoCell(this.icon, this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppColors.link, size: 22),
          Container(
            width: 1,
            height: 30,
            margin: const EdgeInsets.symmetric(horizontal: 9),
            color: AppColors.border,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.small.copyWith(fontSize: 11.5)),
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
