import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/repositories/app_state.dart';

void _snack(BuildContext context, String msg, {IconData icon = Icons.info_outline_rounded}) {
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

/// Garage details bottom sheet (Nearest Garages).
void showGarageSheet(BuildContext context, NearbyGarage g) {
  // name, rating, distance, ETA, address, hours, capabilities
  // Call / Directions / Book at this Garage
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.sheet,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: 28 + MediaQuery.paddingOf(ctx).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: AppColors.border,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            Container(
              height: 140,
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Icon(Icons.storefront_rounded, size: 52, color: AppColors.link),
            ),
            const SizedBox(height: 12),
            Text(g.name, style: AppText.h1),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.star_rounded, color: Color(0xFFFFB020), size: 18),
                const SizedBox(width: 3),
                Text('${g.rating} (${g.reviews})', style: AppText.label),
                const SizedBox(width: 10),
                Icon(Icons.location_on_outlined, size: 17, color: AppColors.link),
                const SizedBox(width: 2),
                Text('≈ ${g.distanceKm.toStringAsFixed(1)} km', style: AppText.label),
                const SizedBox(width: 10),
                Icon(Icons.schedule_rounded, size: 16, color: AppColors.link),
                const SizedBox(width: 3),
                Text('${g.etaMin} min', style: AppText.label),
              ],
            ),
            if (g.address.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(g.address, style: AppText.muted),
            ],
            Text(
              g.hours,
              style: AppText.small.copyWith(color: AppColors.success, fontWeight: FontWeight.w700),
            ),
            if (g.capabilities.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final c in g.capabilities)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(c, style: AppText.small.copyWith(fontWeight: FontWeight.w600)),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      _snack(context, 'Calling ${g.name}...', icon: Icons.call_rounded);
                    },
                    icon: const Icon(Icons.call_outlined),
                    label: const Text('Call'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.of(ctx).pop();
                      _snack(context, 'Opening maps to ${g.name}...', icon: Icons.map_outlined);
                    },
                    icon: const Icon(Icons.directions_outlined),
                    label: const Text('Directions'),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 52,
              child: FilledButton.icon(
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _snack(
                    context,
                    'Book at ${g.name} · ${AppState.instance.selectedVehicle.name}',
                    icon: Icons.event_available_rounded,
                  );
                },
                icon: const Icon(Icons.event_available_rounded),
                label: const Text('Book at this Garage'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

void showAllGarages(BuildContext context) {
  final garages = AppState.instance.nearestGarages;
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.sheet,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 16,
        bottom: 28 + MediaQuery.paddingOf(ctx).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          Text('Nearest Garages (${garages.length})', style: AppText.h1),
          Text('Sorted by distance', style: AppText.muted),
          const SizedBox(height: 12),
          for (final g in garages)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () {
                    Navigator.of(ctx).pop();
                    showGarageSheet(context, g);
                  },
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Row(
                      children: [
                        Container(
                          width: 72,
                          height: 56,
                          decoration: BoxDecoration(
                            color: AppColors.primarySoft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Icon(Icons.storefront_rounded, color: AppColors.link),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(g.name, style: AppText.h3),
                              Text(
                                '≈ ${g.distanceKm.toStringAsFixed(1)} km · ★ ${g.rating} (${g.reviews})',
                                style: AppText.small,
                              ),
                              if (g.capabilities.isNotEmpty)
                                Text(
                                  g.capabilities.join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppText.small.copyWith(color: AppColors.link),
                                ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right_rounded),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    ),
  );
}
