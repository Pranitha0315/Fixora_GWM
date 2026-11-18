import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/vehicle.dart';
import '../../data/remote/customer_backend.dart';
import '../../data/repositories/app_state.dart';
import '../profile/profile_screen.dart';
import '../vehicles/add_vehicle_screen.dart';
import '../vehicles/my_vehicles_screen.dart';
import '../vehicles/vehicle_detail_screen.dart';
import 'garage_sheet.dart';

/// Home – Pastel Garage style: vehicle "location" row, two big pastel
/// action cards, four quick tiles, the current service
/// with progress dots, next service, nearest garages and bookings.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: Listenable.merge([app, CustomerBackend.instance]),
          builder: (context, _) {
            final v = app.selectedVehicle;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
              physics: const BouncingScrollPhysics(),
              children: [
                // Header (greeting + selected vehicle)
                _Header(vehicle: v, unread: true),
                if (CustomerBackend.instance.enabled && !CustomerBackend.instance.live) ...[
                  const SizedBox(height: 12),
                  const _DemoBanner(),
                ],
                const SizedBox(height: 18),
                // Book Service / Roadside SOS
                Row(
                  children: [
                    Expanded(
                      child: _BigActionCard(
                        title: 'Book\nService',
                        icon: Icons.event_available_rounded,
                        color: AppColors.primarySoft,
                        onTap: () => _soon(context, 'Book Service'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _BigActionCard(
                        title: 'Roadside\nSOS',
                        icon: Icons.sos_rounded,
                        color: AppColors.dangerSoft,
                        onTap: () => _soon(context, 'Roadside SOS'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Quick tiles + PromoBanner
                _QuickTiles(vehicle: v),
                const SizedBox(height: 16),
                const _PromoBanner(),
                const SizedBox(height: 12),
                // Current Service + Next Service
                _sectionTitle('Current Service'),
                _CurrentServiceCard(app: app),
                const SizedBox(height: 12),
                _NextServiceCard(vehicle: v),
                // Nearest Garages → _GarageCard
                _sectionTitle(
                  'Nearest Garages',
                  action: 'See all',
                  onAction: () => showAllGarages(context),
                ),
                Row(
                  children: [
                    for (var i = 0; i < 2 && i < app.nearestGarages.length; i++) ...[
                      if (i > 0) const SizedBox(width: 12),
                      Expanded(child: _GarageCard(garage: app.nearestGarages[i])),
                    ],
                  ],
                ),
                // Upcoming / Recent Bookings
                _sectionTitle(app.nextUpcoming != null ? 'Upcoming Booking' : 'Recent Bookings'),
                _RecentBooking(app: app),
              ],
            );
          },
        ),
      ),
    );
  }

  static Widget _sectionTitle(
    String title, {
    String? action,
    VoidCallback? onAction,
  }) =>
      Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 10),
        child: Row(
          children: [
            Expanded(child: Text(title, style: AppText.h2)),
            if (action != null && onAction != null)
              TextButton(
                onPressed: onAction,
                child: Text(action, style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.link)),
              ),
          ],
        ),
      );

  static void _soon(BuildContext context, String label) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('$label coming next'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}

/// "My Garage" title, vehicle row (tap to switch), bell + avatar.
class _Header extends StatelessWidget {
  final Vehicle vehicle;
  final bool unread;
  const _Header({required this.vehicle, required this.unread});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${app.greeting}, ${app.firstName}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.navy),
              ),
              const SizedBox(height: 4),
              // vehicle.name · vehicle.plate — tap → _showVehicleSwitcher (vehicle cards list)
              Semantics(
                button: true,
                label: 'Selected vehicle ${vehicle.name}. Tap to switch',
                excludeSemantics: true,
                child: InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => _showVehicleSwitcher(context, vehicle),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.directions_car_outlined, size: 15, color: AppColors.textMuted),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            '${vehicle.name} · ${vehicle.plate}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.textMuted,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                        Icon(Icons.keyboard_arrow_down_rounded, size: 18, color: AppColors.textMuted),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Stack(
          clipBehavior: Clip.none,
          children: [
            IconButton(
              tooltip: 'Notifications',
              onPressed: () => HomeScreen._soon(context, 'Notifications'),
              icon: Icon(Icons.notifications_none_rounded, color: AppColors.navy),
            ),
            if (unread)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  width: 9,
                  height: 9,
                  decoration: const BoxDecoration(color: AppColors.danger, shape: BoxShape.circle),
                ),
              ),
          ],
        ),
        const SizedBox(width: 4),
        GestureDetector(
          onTap: () => context.push(const ProfileScreen()),
          child: CircleAvatar(
            radius: 22,
            backgroundColor: AppColors.primarySoft,
            child: Text(app.profile.initials, style: AppText.label.copyWith(color: AppColors.link)),
          ),
        ),
      ],
    );
  }
}

void _showVehicleSwitcher(BuildContext context, Vehicle vehicle) {
  final app = AppState.instance;
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: AppColors.sheet,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (ctx) => Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Choose vehicle', style: AppText.h1),
          const SizedBox(height: 12),
          for (final v in app.vehicles)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                child: InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () {
                    app.selectVehicle(v.id);
                    Navigator.of(ctx).pop();
                  },
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: v.id == vehicle.id ? AppColors.primary : Colors.transparent,
                        width: 1.4,
                      ),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          backgroundColor: AppColors.primarySoft,
                          child: Icon(v.type.icon, color: AppColors.link, size: 20),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(v.name, style: AppText.h3),
                              Text(
                                '${v.plate} · ${v.active ? 'Active' : 'Inactive'}',
                                style: AppText.small,
                              ),
                            ],
                          ),
                        ),
                        if (v.id == vehicle.id) Icon(Icons.check_circle_rounded, color: AppColors.link),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    context.push(VehicleDetailScreen(vehicleId: vehicle.id));
                  },
                  icon: const Icon(Icons.info_outline_rounded),
                  label: const Text('Details'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    context.push(const AddVehicleScreen());
                  },
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add Vehicle'),
                  style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );
}

/// Big pastel card (Book Service / Roadside SOS) with a round icon.
class _BigActionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  const _BigActionCard({
    required this.title,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: SizedBox(
          height: 122,
          child: Stack(
            children: [
              Positioned(
                left: 14,
                top: 14,
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    height: 1.25,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
              ),
              Positioned(
                right: 12,
                bottom: 12,
                child: Container(
                  width: 56,
                  height: 56,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.surfaceSolid, shape: BoxShape.circle),
                  child: Icon(icon, color: AppColors.link, size: 28),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Four small tiles: Diagnosis, History, Plans, Offers.
class _QuickTiles extends StatelessWidget {
  final Vehicle vehicle;
  const _QuickTiles({required this.vehicle});

  @override
  Widget build(BuildContext context) {
    final items = <(String, IconData, VoidCallback)>[
      ('Diagnosis', Icons.health_and_safety_outlined, () => HomeScreen._soon(context, 'Diagnosis')),
      ('History', Icons.manage_history_rounded, () => HomeScreen._soon(context, 'Service History')),
      ('Plans', Icons.workspace_premium_outlined, () => HomeScreen._soon(context, 'Plans')),
      ('Offers', Icons.local_offer_outlined, () => HomeScreen._soon(context, 'Offers')),
    ];
    return Row(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: Material(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(18),
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: items[i].$3,
                child: SizedBox(
                  height: 92,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(color: AppColors.surfaceSolid, shape: BoxShape.circle),
                        child: Icon(items[i].$2, size: 22, color: AppColors.link),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        items[i].$1,
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.navy),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _PromoBanner extends StatelessWidget {
  const _PromoBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: AppColors.primaryGradient,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '15% off Full Service',
                  style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                ),
                const SizedBox(height: 4),
                Text(
                  'This week only · book from Home',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5),
                ),
              ],
            ),
          ),
          Icon(Icons.local_offer_rounded, color: Colors.white.withValues(alpha: 0.95), size: 32),
        ],
      ),
    );
  }
}

/// Mint card: vehicle, job, progress dots, now / status.
class _CurrentServiceCard extends StatelessWidget {
  final AppState app;
  const _CurrentServiceCard({required this.app});

  @override
  Widget build(BuildContext context) {
    final v = app.selectedVehicle;
    return Material(
      color: AppColors.primarySoft,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: () => HomeScreen._soon(context, 'Job Tracker'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.surfaceSolid,
                    child: Icon(v.type.icon, color: AppColors.link),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          v.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.navy),
                        ),
                        Text(
                          'Job: ${app.currentJobId}',
                          style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _DotsProgress(current: app.currentJobStep),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _LabelValue(
                      icon: Icons.build_outlined,
                      label: 'Now',
                      value: app.currentStepLabel,
                    ),
                  ),
                  _LabelValue(
                    icon: Icons.info_outline_rounded,
                    label: 'Status',
                    value: app.currentStatusLabel,
                    end: true,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DotsProgress extends StatelessWidget {
  final int current;
  const _DotsProgress({required this.current});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < 5; i++) ...[
          if (i > 0)
            Expanded(
              child: Container(
                height: 2,
                color: i <= current ? AppColors.primary : AppColors.border,
              ),
            ),
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i <= current ? AppColors.primary : AppColors.border,
            ),
          ),
        ],
      ],
    );
  }
}

class _LabelValue extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool end;
  const _LabelValue({
    required this.icon,
    required this.label,
    required this.value,
    this.end = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: end ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: AppColors.textMuted),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(fontSize: 11.5, color: AppColors.textMuted)),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: end ? TextAlign.end : TextAlign.start,
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.navy),
        ),
      ],
    );
  }
}

/// Sky pastel card: next service for the selected vehicle.
class _NextServiceCard extends StatelessWidget {
  final Vehicle vehicle;
  const _NextServiceCard({required this.vehicle});

  @override
  Widget build(BuildContext context) {
    // vehicle card with Next Service + Book Now
    final app = AppState.instance;
    final up = app.upcomingFor(vehicle.id);
    final title = up.isNotEmpty ? up.first.service : 'General Service';
    final due = up.isNotEmpty
        ? '${up.first.date.day}/${up.first.date.month}/${up.first.date.year}'
        : vehicle.nextServiceNote;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.sky, borderRadius: BorderRadius.circular(24)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(13)),
                child: Icon(Icons.event_note_outlined, size: 22, color: AppColors.link),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Next Service',
                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.navy),
                    ),
                    Text(
                      vehicle.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: _LabelValue(
                  icon: Icons.build_outlined,
                  label: 'Service',
                  value: title,
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: _LabelValue(
                  icon: Icons.schedule_rounded,
                  label: 'Due',
                  value: due,
                  end: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 46,
            child: FilledButton(
              onPressed: () => HomeScreen._soon(context, 'Book Now · $title'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Book Now', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
                  SizedBox(width: 8),
                  Icon(Icons.arrow_forward_rounded, size: 18),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GarageCard extends StatelessWidget {
  final NearbyGarage garage;
  const _GarageCard({required this.garage});

  @override
  Widget build(BuildContext context) {
    final g = garage;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        // tap → showGarageSheet(context, g)
        onTap: () => showGarageSheet(context, g),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 84,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(Icons.storefront_rounded, color: AppColors.link, size: 36),
              ),
              const SizedBox(height: 8),
              Text(g.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.h3.copyWith(fontSize: 13.5)),
              const SizedBox(height: 3),
              Row(
                children: [
                  Icon(Icons.location_on_rounded, size: 14, color: AppColors.link),
                  const SizedBox(width: 2),
                  Flexible(
                    child: Text(
                      '≈ ${g.distanceKm.toStringAsFixed(1)} km',
                      maxLines: 1,
                      style: AppText.small.copyWith(color: AppColors.text),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.star_rounded, size: 14, color: Color(0xFFFFB020)),
                  const SizedBox(width: 2),
                  Text(
                    '${g.rating}',
                    style: AppText.small.copyWith(color: AppColors.text, fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentBooking extends StatelessWidget {
  final AppState app;
  const _RecentBooking({required this.app});

  @override
  Widget build(BuildContext context) {
    final next = app.nextUpcoming;
    final b = next ?? (app.bookings.isNotEmpty ? app.bookings.last : null);
    if (b == null) {
      return Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => context.push(const MyVehiclesScreen()),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(Icons.event_available_rounded, color: AppColors.link),
                const SizedBox(width: 10),
                Expanded(child: Text('No bookings yet. Book your first service.', style: AppText.label)),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      );
    }
    final v = app.vehicleById(b.vehicleId);
    final upcoming = b.upcoming;
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => HomeScreen._soon(context, upcoming ? 'Live Queue' : 'Bookings'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 64,
                height: 54,
                decoration: BoxDecoration(
                  color: AppColors.primarySoft,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.garage_outlined, color: AppColors.link),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            v.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppText.h3.copyWith(fontSize: 14),
                          ),
                        ),
                        Text(
                          upcoming ? 'Confirmed' : 'Completed',
                          style: AppText.small.copyWith(
                            fontWeight: FontWeight.w700,
                            color: upcoming ? AppColors.link : AppColors.success,
                          ),
                        ),
                      ],
                    ),
                    Text('Service: ${b.service}', style: AppText.small),
                    Text(
                      '${b.date.day}/${b.date.month}/${b.date.year}',
                      style: AppText.small.copyWith(color: AppColors.text),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: AppColors.navy),
            ],
          ),
        ),
      ),
    );
  }
}

/// Demo session in a server build: bookings, approvals and SOS stay on this phone.
class _DemoBanner extends StatelessWidget {
  const _DemoBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.warning.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.cloud_off_rounded, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Demo mode: not connected to the garage',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy),
                ),
                const SizedBox(height: 3),
                Text(
                  'Bookings, approvals and SOS stay on this phone until you log in live.',
                  style: TextStyle(fontSize: 12.5, height: 1.35, color: AppColors.text),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
