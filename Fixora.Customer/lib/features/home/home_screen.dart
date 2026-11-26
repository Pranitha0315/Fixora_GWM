import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../bookings/book_service_screen.dart';
import '../bookings/live_queue_screen.dart';
import '../diagnosis/instant_diagnosis_screen.dart';
import '../job/screens/job_tracker_screen.dart';
import '../plans/offers_plans_screen.dart';
import '../profile/profile_screen.dart';
import '../rewards/points_card.dart';
import '../sos/sos_screen.dart';
import '../vehicles/add_vehicle_screen.dart';
import '../vehicles/service_history_screen.dart';
import '../vehicles/vehicle_detail_screen.dart';
import 'garage_sheet.dart';
import 'promo_banner.dart';
import '../../core/backend/fixora_config.dart';
import '../../data/remote/customer_backend.dart';

/// Home – Pastel Garage style: vehicle "location" row, two big pastel
/// action cards, four quick tiles, the current service
/// with progress dots, next service, nearest garages and bookings.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final store = JobStore.instance;
    return Scaffold(
      backgroundColor: AppColors.bg,
      // Nav bar sits in its own strip; the list ends above it.
      bottomNavigationBar: const FxBottomNav(),
      body: FxBackground(
        child: SafeArea(
          bottom: false,
          child: ListenableBuilder(
            listenable: Listenable.merge([app, store, CustomerBackend.instance]),
            builder: (context, _) {
              final v = app.selectedVehicle;
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                physics: const BouncingScrollPhysics(),
                children: [
                  _Header(vehicle: v, unread: store.unreadCount > 0),
                  if (CustomerBackend.instance.enabled && !CustomerBackend.instance.live) ...[
                    const SizedBox(height: 12),
                    const _DemoBanner(),
                  ],
                  const SizedBox(height: 18),
                  FadeSlide(
                    child: Row(
                      children: [
                        Expanded(
                          child: _BigActionCard(
                            title: 'Book\nService',
                            icon: const BookingIcon(size: 32),
                            color: AppColors.primarySoft,
                            onTap: () => context.push(BookServiceScreen(vehicleId: v.id)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _BigActionCard(
                            title: 'Roadside\nSOS',
                            icon: const SirenIcon(size: 32),
                            // Emergency = soft red, so it stands apart from Book Service.
                            color: AppColors.dangerSoft,
                            onTap: () => context.push(const SosScreen()),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  FadeSlide(index: 1, child: _QuickTiles(vehicle: v)),
                  const SizedBox(height: 16),
                  // Auto-changing offers banner (tap = book the offer).
                  const FadeSlide(index: 2, child: PromoBanner()),
                  const SizedBox(height: 12),
                  // Loyalty points: balance and what the next invoice saves.
                  const FadeSlide(index: 2, child: PointsBalanceCard()),
                  SectionTitle('Current Service', action: 'See all', onAction: () => context.push(const JobTrackerScreen())),
                  FadeSlide(index: 2, child: _CurrentServiceCard(store: store)),
                  const SizedBox(height: 12),
                  FadeSlide(index: 3, child: _NextServiceCard(vehicle: v)),
                  SectionTitle('Nearest Garages', action: 'See all', onAction: () => showAllGarages(context)),
                  FadeSlide(
                    index: 4,
                    child: Row(
                      children: [
                        for (var i = 0; i < 2 && i < MockData.garages.length; i++) ...[
                          if (i > 0) const SizedBox(width: 12),
                          Expanded(child: _GarageCard(garage: MockData.garages[i])),
                        ],
                      ],
                    ),
                  ),
                  SectionTitle(
                    app.nextUpcoming != null ? 'Upcoming Booking' : 'Recent Bookings',
                    action: 'See all',
                    onAction: () => NavController.goToTab(context, 1),
                  ),
                  FadeSlide(index: 5, child: _RecentBooking(app: app)),
                ],
              );
            },
          ),
        ),
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
              Text('${app.greeting}, ${app.firstName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: AppColors.navy)),
              const SizedBox(height: 4),
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
                          child: Text('${vehicle.name} · ${vehicle.plate}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, color: AppColors.textMuted, fontWeight: FontWeight.w500)),
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
        FxRoundButton(
          icon: Icons.notifications_none_rounded,
          tooltip: 'Notifications',
          badge: unread,
          onTap: () => NavController.goToTab(context, 3),
        ),
        const SizedBox(width: 10),
        GestureDetector(
          onTap: () => NavController.goToTab(context, 4),
          child: const ProfileAvatar(size: 44),
        ),
      ],
    );
  }
}

/// Big pastel card (Book Service / Roadside SOS) with a round icon.
class _BigActionCard extends StatelessWidget {
  final String title;
  /// Painted icon: [BookingIcon] or [SirenIcon].
  final Widget icon;
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
    return Semantics(
      button: true,
      label: title.replaceAll('\n', ' '),
      excludeSemantics: true,
      child: FxPressable(
        radius: 22,
        pressedScale: 0.96,
        onTap: () {
          AppState.instance.feedback();
          onTap();
        },
        child: Container(
          height: 122,
          decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(22)),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              Positioned(
                left: 14,
                top: 14,
                child: Text(title,
                    style: TextStyle(fontSize: 15, height: 1.25, fontWeight: FontWeight.w700, color: AppColors.navy)),
              ),
              Positioned(
                right: 12,
                bottom: 12,
                child: Container(
                  width: 56,
                  height: 56,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.surfaceSolid, shape: BoxShape.circle),
                  child: icon,
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
      ('Diagnosis', Icons.health_and_safety_outlined, () => context.push(InstantDiagnosisScreen(vehicleId: vehicle.id))),
      ('History', Icons.manage_history_rounded, () => context.push(ServiceHistoryScreen(vehicleId: vehicle.id))),
      ('Plans', Icons.workspace_premium_outlined, () => context.push(const OffersPlansScreen(initialTab: 1))),
      ('Offers', Icons.local_offer_outlined, () => context.push(const OffersPlansScreen())),
    ];
    return Row(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: Semantics(
              button: true,
              label: items[i].$1,
              excludeSemantics: true,
              child: FxPressable(
                radius: 18,
                pressedScale: 0.94,
                onTap: () {
                  AppState.instance.feedback();
                  items[i].$3();
                },
                child: Container(
                  height: 92,
                  decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18)),
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
                      // Shrinks a little instead of clipping on narrow phones /
                      // "Extra Large" text size.
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(items[i].$1,
                              maxLines: 1,
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.navy)),
                        ),
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

/// Mint card: vehicle, job, progress dots, now / status.
class _CurrentServiceCard extends StatelessWidget {
  final JobStore store;
  const _CurrentServiceCard({required this.store});

  @override
  Widget build(BuildContext context) {
    final s = store.status;
    final awaiting = s == JobStatus.awaitingApproval || s == JobStatus.changesRequested;
    final current = jobStep(s);
    return FxPressable(
      radius: 24,
      pressedScale: 0.98,
      onTap: () => context.push(const JobTrackerScreen()),
      child: Container(
        decoration: BoxDecoration(color: AppColors.primarySoft, borderRadius: BorderRadius.circular(24)),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      // Real picture of the customer's car, same size as an icon tile.
                      VehicleIcon(store.vehicle),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(store.vehicle.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.navy)),
                            Text('Job: ${store.jobId}', style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  DotsProgress(current: current),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: _LabelValue(icon: Icons.build_outlined, label: 'Now', value: store.currentStepLabel)),
                      _LabelValue(
                        icon: Icons.info_outline_rounded,
                        label: 'Status',
                        value: store.statusLabel,
                        end: true,
                      ),
                    ],
                  ),
                  if (awaiting) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
                      decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(16)),
                      child: Row(
                        children: [
                          const Icon(Icons.receipt_long_outlined, color: AppColors.warning),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text('Estimate ${lkr(store.total)} needs your approval',
                                style: AppText.label.copyWith(fontSize: 12.5)),
                          ),
                          SizedBox(
                            width: 92,
                            child: PrimaryButton(
                              label: 'Review',
                              height: 38,
                              fontSize: 13,
                              onPressed: () => context.push(const JobTrackerScreen()),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IconSquare extends StatelessWidget {
  final IconData icon;
  const _IconSquare({required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(13)),
      child: Icon(icon, size: 22, color: AppColors.link),
    );
  }
}

class _LabelValue extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool end;
  const _LabelValue({required this.icon, required this.label, required this.value, this.end = false});

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
        Text(value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: end ? TextAlign.end : TextAlign.start,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: AppColors.navy)),
      ],
    );
  }
}

/// "Fixora" wordmark with a gear "o".
class FixoraWordmark extends StatelessWidget {
  const FixoraWordmark({super.key});

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: AppColors.navy, letterSpacing: -0.5, height: 1);
    return Column(
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text('Fix', style: style),
            Container(
              width: 24,
              height: 24,
              margin: const EdgeInsets.symmetric(horizontal: 1),
              decoration: const BoxDecoration(color: Color(0xFFFF8A1F), shape: BoxShape.circle),
              child: const Icon(Icons.settings_rounded, size: 18, color: Colors.white),
            ),
            ShaderMask(
              shaderCallback: (r) => AppColors.primaryGradient.createShader(r),
              child: const Text('ra', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Colors.white, height: 1)),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text('Your Vehicle. Our Experts.',
            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppColors.navy)),
      ],
    );
  }
}

void _showVehicleSwitcher(BuildContext context, Vehicle vehicle) {
    final app = AppState.instance;
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Choose vehicle', style: AppText.h1),
          const SizedBox(height: 12),
          for (final v in app.vehicles)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: FxCard(
                padding: const EdgeInsets.all(8),
                shadow: false,
                borderColor: v.id == vehicle.id ? AppColors.primary : null,
                onTap: () {
                  app.selectVehicle(v.id);
                  Navigator.of(ctx).pop();
                },
                child: Row(
                  children: [
                    SizedBox(width: 74, height: 48, child: VehicleImage(v, radius: 10)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(v.name, style: AppText.h3),
                          Text('${v.plate} · ${v.active ? 'Active' : 'Inactive'}', style: AppText.small),
                        ],
                      ),
                    ),
                    if (v.id == vehicle.id) Icon(Icons.check_circle_rounded, color: AppColors.link),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: OutlineButton2(
                  label: 'Details',
                  icon: Icons.info_outline_rounded,
                  height: 48,
                  fontSize: 14.5,
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    context.push(VehicleDetailScreen(vehicleId: vehicle.id));
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: PrimaryButton(
                  label: 'Add Vehicle',
                  icon: Icons.add_rounded,
                  height: 48,
                  fontSize: 14.5,
                  onPressed: () {
                    Navigator.of(ctx).pop();
                    context.push(const AddVehicleScreen());
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
}

/// Sky pastel card: next service for the selected vehicle.
class _NextServiceCard extends StatelessWidget {
  final Vehicle vehicle;
  const _NextServiceCard({required this.vehicle});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final up = app.upcomingFor(vehicle.id);
    final title = up.isNotEmpty ? up.first.title : 'General Service';
    final service = up.isNotEmpty ? up.first.service : 'General Service';
    final due = up.isNotEmpty ? dayMonthYear(up.first.date) : vehicle.nextServiceNote;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: AppColors.sky, borderRadius: BorderRadius.circular(24)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const _IconSquare(icon: Icons.event_note_outlined),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Next Service',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.navy)),
                    Text(vehicle.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(child: _LabelValue(icon: Icons.build_outlined, label: 'Service', value: title)),
              const SizedBox(width: 8),
              Flexible(child: _LabelValue(icon: Icons.schedule_rounded, label: 'Due', value: due, end: true)),
            ],
          ),
          const SizedBox(height: 14),
          PrimaryButton(
            label: 'Book Now',
            trailingIcon: Icons.arrow_forward_rounded,
            height: 46,
            fontSize: 14.5,
            onPressed: () => context.push(BookServiceScreen(vehicleId: vehicle.id, service: service)),
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
    return FxPressable(
      radius: 22,
      onTap: () => showGarageSheet(context, g),
      child: FxGlass(
        radius: 22,
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(height: 84, width: double.infinity, child: AssetPhoto(g.image ?? Img.garageFixora, radius: 16)),
            const SizedBox(height: 8),
            Text(g.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.h3.copyWith(fontSize: 13.5)),
            const SizedBox(height: 3),
            Row(
              children: [
                Icon(Icons.location_on_rounded, size: 14, color: AppColors.link),
                const SizedBox(width: 2),
                Flexible(
                  child: Text('≈ ${AppState.instance.distanceShort(g.distanceKm)}',
                      maxLines: 1, style: AppText.small.copyWith(color: AppColors.text)),
                ),
                const SizedBox(width: 8),
                const Icon(Icons.star_rounded, size: 14, color: Color(0xFFFFB020)),
                const SizedBox(width: 2),
                Text('${g.rating}', style: AppText.small.copyWith(color: AppColors.text, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
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
    final b = next ??
        (app.bookingsIn({BookingState.completed}).isNotEmpty ? app.bookingsIn({BookingState.completed}).first : null);
    if (b == null) {
      return FxCard(
        padding: const EdgeInsets.all(14),
        onTap: () => context.push(BookServiceScreen(vehicleId: app.selectedVehicle.id)),
        child: Row(
          children: [
            Icon(Icons.event_available_rounded, color: AppColors.link),
            SizedBox(width: 10),
            Expanded(child: Text('No bookings yet. Book your first service.', style: AppText.label)),
            Icon(Icons.chevron_right_rounded),
          ],
        ),
      );
    }
    final v = app.vehicleById(b.vehicleId);
    final upcoming = b.state == BookingState.upcoming;
    return FxCard(
      padding: const EdgeInsets.all(8),
      onTap: () {
        if (upcoming) {
          context.push(LiveQueueScreen(bookingId: b.id));
        } else {
          NavController.goToTab(context, 1);
        }
      },
      child: Row(
        children: [
          SizedBox(width: 104, height: 66, child: AssetPhoto(Img.bookingBay, radius: 12)),
          Container(width: 1.2, height: 50, margin: const EdgeInsets.symmetric(horizontal: 10), color: AppColors.border),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: Text(v.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.h3.copyWith(fontSize: 14))),
                    StatusPill(upcoming ? 'Confirmed' : 'Completed',
                        color: upcoming ? AppColors.primary : AppColors.success, icon: Icons.check_circle_rounded),
                  ],
                ),
                Text('Service: ${b.service}', maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.small.copyWith(color: AppColors.text)),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Icon(Icons.calendar_today_outlined, size: 13, color: AppColors.navy),
                    const SizedBox(width: 4),
                    Flexible(
                      child: Text('${weekdayShort(b.date)}, ${dayMonthYear(b.date)}${upcoming ? ' · ${time12(b.date)}' : ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.small.copyWith(color: AppColors.text)),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: AppColors.navy),
        ],
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
      decoration: BoxDecoration(color: AppColors.warning.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(18)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.cloud_off_rounded, color: AppColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Demo mode: not connected to the garage',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.navy)),
                const SizedBox(height: 3),
                Text('Bookings, approvals and SOS stay on this phone. Log out, start the garage server '
                    '(${FixoraConfig.apiBase}) and log in with your garage account.',
                    style: TextStyle(fontSize: 12.5, height: 1.35, color: AppColors.text)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
