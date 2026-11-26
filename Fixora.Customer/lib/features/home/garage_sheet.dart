import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../bookings/book_service_screen.dart';

/// Garage details bottom sheet (Nearest Garages).
void showGarageSheet(BuildContext context, NearbyGarage g) {
  final app = AppState.instance;
  showFxSheet<void>(
    context,
    builder: (ctx) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (g.image != null)
          SizedBox(height: 150, child: AssetPhoto(g.image!, radius: 18)),
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
            Text('≈ ${app.distanceShort(g.distanceKm)}', style: AppText.label),
            const SizedBox(width: 10),
            Icon(Icons.schedule_rounded, size: 16, color: AppColors.link),
            const SizedBox(width: 3),
            Text('${g.etaMin} min', style: AppText.label),
          ],
        ),
        const SizedBox(height: 6),
        Text(g.address, style: AppText.muted),
        Text(g.hours, style: AppText.small.copyWith(color: AppColors.success, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [for (final c in g.capabilities) ValueChip(c)],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlineButton2(
                label: 'Call',
                icon: Icons.call_outlined,
                height: 48,
                fontSize: 14.5,
                onPressed: () {
                  Navigator.of(ctx).pop();
                  showFxSnack(context, 'Calling ${g.name}...', icon: Icons.call_rounded);
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlineButton2(
                label: 'Directions',
                icon: Icons.directions_outlined,
                height: 48,
                fontSize: 14.5,
                onPressed: () {
                  Navigator.of(ctx).pop();
                  showFxSnack(context, 'Opening maps to ${g.name}...', icon: Icons.map_outlined);
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        PrimaryButton(
          label: 'Book at this Garage',
          icon: Icons.event_available_rounded,
          onPressed: () {
            Navigator.of(ctx).pop();
            context.push(BookServiceScreen(vehicleId: app.selectedVehicle.id, garage: g.name));
          },
        ),
      ],
    ),
  );
}

void showAllGarages(BuildContext context) {
  showFxSheet<void>(
    context,
    builder: (ctx) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Nearest Garages (${MockData.garages.length})', style: AppText.h1),
        Text('Sorted by distance', style: AppText.muted),
        const SizedBox(height: 12),
        for (final g in MockData.garages)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: FxCard(
              padding: const EdgeInsets.all(10),
              shadow: false,
              onTap: () {
                Navigator.of(ctx).pop();
                showGarageSheet(context, g);
              },
              child: Row(
                children: [
                  SizedBox(width: 92, height: 62, child: AssetPhoto(g.image ?? Img.garageFixora, radius: 12)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(g.name, style: AppText.h3),
                        Text('≈ ${AppState.instance.distanceShort(g.distanceKm)} · ★ ${g.rating} (${g.reviews})',
                            style: AppText.small),
                        Text(g.capabilities.join(' · '), style: AppText.small.copyWith(color: AppColors.link)),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ),
          ),
      ],
    ),
  );
}