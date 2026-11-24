import 'package:flutter/material.dart';

import '../../core/core.dart';
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
        final passport = app.passportFor(v.id);
        final open = passport
            .where((e) => e.status == PassportStatus.unresolved || e.status == PassportStatus.stillUnresolved)
            .length;
        return FxPage(
          title: 'Vehicle Details',
          subtitle: 'Your vehicle overview',
          compactHeader: true,
          trailing: _menu(context, v),
          children: [
            FadeSlide(
              child: FxCard(
                padding: const EdgeInsets.all(12),
                gradient: LinearGradient(colors: [AppColors.surface, AppColors.adapt(Color(0xFFECFDFC))]),
                child: Row(
                  children: [
                    SizedBox(width: 138, height: 96, child: VehicleImage(v, radius: 14)),
                    Container(width: 1.4, height: 80, margin: const EdgeInsets.symmetric(horizontal: 12), color: AppColors.border),
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
                            child: Text(v.active ? 'Active' : 'Inactive',
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            FadeSlide(
              index: 1,
              child: FxCard(
                padding: const EdgeInsets.all(14),
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
                      _InfoCell(Icons.miscellaneous_services_outlined, 'Engine Capacity', '${groupDigits(v.engineCc)} cc'),
                      _InfoCell(Icons.speed_rounded, 'Mileage', app.distance(v.mileageKm)),
                      _InfoCell(Icons.favorite_border_rounded, 'Health', '${(v.healthScore * 100).round()}%'),
                    ]),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            FadeSlide(
              index: 2,
              child: OutlineButton2(
                label: 'View Service History',
                icon: Icons.history_rounded,
                onPressed: () => context.push(ServiceHistoryScreen(vehicleId: v.id)),
              ),
            ),
            const SizedBox(height: 12),
            FadeSlide(
              index: 3,
              child: FxCard(
                onTap: () => context.push(EvidencePassportScreen(vehicle: v)),
                gradient: const LinearGradient(
                  colors: [Color(0xFF7B5CFF), Color(0xFF4F3BD6)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderColor: Colors.transparent,
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(color: Colors.white.o(0.18), borderRadius: BorderRadius.circular(14)),
                      child: const Icon(Icons.qr_code_2_rounded, color: Colors.white, size: 28),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Evidence Passport',
                              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 2),
                          Text(
                            passport.isEmpty
                                ? 'No suspected causes recorded'
                                : '$open open suspected cause${open == 1 ? '' : 's'} · ${passport.length} total',
                            style: TextStyle(color: Colors.white.o(0.85), fontSize: 12.5),
                          ),
                        ],
                      ),
                    ),
                    const Icon(Icons.chevron_right_rounded, color: Colors.white),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            FadeSlide(
              index: 4,
              child: PrimaryButton(
                label: 'Book a Service',
                icon: Icons.event_available_rounded,
                onPressed: v.active
                    ? () => context.push(BookServiceScreen(vehicleId: v.id))
                    : () => showFxSnack(context, 'Set this vehicle to Active to book a service',
                        icon: Icons.info_outline_rounded),
              ),
            ),
          ],
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
            showFxSnack(context, v.active ? '${v.name} set to Inactive' : '${v.name} is Active again');
          case 'default':
            app.selectVehicle(v.id);
            showFxSnack(context, '${v.name} will show on Home');
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
              showFxSnack(context, '${v.name} removed');
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
          Container(width: 1, height: 30, margin: const EdgeInsets.symmetric(horizontal: 9), color: AppColors.border),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.small.copyWith(fontSize: 11.5)),
                const SizedBox(height: 2),
                Text(value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
