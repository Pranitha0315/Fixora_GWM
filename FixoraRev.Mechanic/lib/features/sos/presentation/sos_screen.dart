import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:url_launcher/url_launcher.dart';

import '../../../core/backend/api_client.dart';
import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/buttons.dart';
import '../../../core/widgets/osm_map.dart';
import '../../../core/widgets/rev_common.dart';
import '../domain/sos_entities.dart';

/// Runs a backend-backed SOS step and tells the mechanic if the server refused it.
Future<void> _runSosStep(BuildContext context, Future<void> Function() step) async {
  try {
    await step();
  } on ApiException catch (e) {
    if (context.mounted) context.toast(e.message, icon: Icons.error_outline_rounded);
  } on StateError catch (e) {
    if (context.mounted) context.toast(e.message, icon: Icons.lock_outline_rounded);
  }
}

class SosListScreen extends StatelessWidget {
  const SosListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.sos,
      builder: (context, _) {
        final all = AppServices.sos.all;
        return Scaffold(
          appBar: AppBar(title: const Text('Roadside SOS')),
          body: all.isEmpty
              ? EmptyState(
                  icon: Icons.sos_outlined,
                  title: 'No roadside calls',
                  message: 'When a customer presses SOS in the Fixora app, the call appears here with the location.',
                  actionLabel: 'Back to jobs',
                  actionIcon: Icons.handyman_outlined,
                  onAction: () => Navigator.of(context).maybePop(),
                )
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    for (final r in all)
                      AppCard(
                        margin: const EdgeInsets.only(bottom: 10),
                        onTap: () => context.push(SosDetailScreen(requestId: r.id)),
                        // Press and hold: the same next step without opening the call.
                        onLongPress: () => showActionSheet(
                          context,
                          title: '${r.vehicle.title} · ${r.vehicle.plate}',
                          subtitle: r.issue,
                          actions: [
                            SheetAction(
                              icon: Icons.open_in_new_rounded,
                              label: 'Open call details',
                              onTap: () => context.push(SosDetailScreen(requestId: r.id)),
                            ),
                            if (r.status == SosStatus.pending)
                              SheetAction(
                                icon: Icons.check_rounded,
                                label: 'Accept SOS',
                                onTap: () => _runSosStep(context, () => AppServices.sos.accept(r)),
                              ),
                          ],
                        ),
                        child: Row(
                          children: [
                            IconBadge(
                              icon: Icons.sos_rounded,
                              color: r.isOpen ? AppColors.danger : AppColors.muted,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('${r.vehicle.title} · ${r.vehicle.plate}',
                                      style: const TextStyle(fontWeight: FontWeight.w800)),
                                  Text(r.issue, style: TextStyle(color: AppColors.inkSoft)),
                                  Text('${r.status.label} · ${Fmt.ago(r.receivedAt)}',
                                      style: TextStyle(fontSize: 12, color: AppColors.muted)),
                                ],
                              ),
                            ),
                            Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                          ],
                        ),
                      ),
                  ],
                ),
        );
      },
    );
  }
}

class SosDetailScreen extends StatelessWidget {
  const SosDetailScreen({super.key, required this.requestId});
  final String requestId;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.sos,
      builder: (context, _) {
        final r = AppServices.sos.all.firstWhere((x) => x.id == requestId);
        return Scaffold(
          appBar: AppBar(title: Text('SOS · ${r.id}')),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.issue, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.place_outlined, size: 16, color: AppColors.primary),
                        const SizedBox(width: 4),
                        Expanded(child: Text(r.locationLabel, style: TextStyle(color: AppColors.inkSoft))),
                      ],
                    ),
                    const Divider(height: 22),
                    InfoRow('Customer', r.customer.name),
                    InfoRow('Phone', r.customer.phone),
                    InfoRow('Vehicle', '${r.vehicle.title} · ${r.vehicle.plate}'),
                    InfoRow('Received', Fmt.time(r.receivedAt)),
                  ],
                ),
              ),
              if (r.hasLocation) ...[
                const SizedBox(height: 12),
                FxOsmMap(
                  center: LatLng(r.lat!, r.lng!),
                  height: 200,
                  pins: [
                    FxMapPin(
                      LatLng(r.lat!, r.lng!),
                      color: AppColors.danger,
                      pulse: r.isOpen,
                      label: 'Customer',
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: () => openDirections(r.lat!, r.lng!),
                        icon: const Icon(Icons.navigation_rounded),
                        label: const Text('Navigate'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: r.customer.phone.isEmpty
                            ? null
                            : () => launchUrl(Uri.parse('tel:${r.customer.phone}')),
                        icon: const Icon(Icons.call_rounded),
                        label: const Text('Call'),
                      ),
                    ),
                  ],
                ),
              ],
              const SectionTitle('Progress'),
              _SosStepper(status: r.status),
            ],
          ),
          bottomNavigationBar: BottomActionBar(child: _SosActions(request: r)),
        );
      },
    );
  }
}

class _SosStepper extends StatelessWidget {
  const _SosStepper({required this.status});
  final SosStatus status;

  @override
  Widget build(BuildContext context) {
    const steps = [
      (SosStatus.accepted, 'Accepted'),
      (SosStatus.enRoute, 'On the way'),
      (SosStatus.arrived, 'Arrived'),
      (SosStatus.resolvedOnSite, 'Fixed on the spot'),
    ];
    final reached = switch (status) {
      SosStatus.pending => 0,
      SosStatus.accepted => 1,
      SosStatus.enRoute => 2,
      SosStatus.arrived => 3,
      SosStatus.resolvedOnSite => 4,
    };
    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 13,
                    backgroundColor: i < reached ? AppColors.primary : AppColors.field,
                    child: i < reached
                        ? Icon(Icons.check_rounded, size: 16, color: AppColors.onPrimary)
                        : Text('${i + 1}',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.inkSoft)),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    steps[i].$2,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: i < reached ? AppColors.ink : AppColors.muted,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// The next backend status for the request: Acknowledged → Dispatched → OnSite → Resolved.
class _SosActions extends StatelessWidget {
  const _SosActions({required this.request});
  final SosRequest request;

  @override
  Widget build(BuildContext context) {
    final sos = AppServices.sos;
    final r = request;
    switch (r.status) {
      case SosStatus.pending:
        return PrimaryButton(
          label: 'Accept SOS',
          icon: Icons.check_rounded,
          onPressed: () => _runSosStep(context, () => sos.accept(r)),
        );
      case SosStatus.accepted:
        return PrimaryButton(
          label: 'Start navigation',
          icon: Icons.navigation_rounded,
          onPressed: () => _runSosStep(context, () async {
            await sos.startNavigation(r);
            if (context.mounted) context.toast('Customer notified: mechanic on the way', icon: Icons.directions_car);
          }),
        );
      case SosStatus.enRoute:
        return PrimaryButton(
          label: 'Mark arrived',
          icon: Icons.flag_rounded,
          onPressed: () => _runSosStep(context, () => sos.arrived(r)),
        );
      case SosStatus.arrived:
        return PrimaryButton(
          label: 'Fixed on the spot',
          icon: Icons.task_alt_rounded,
          onPressed: () => _runSosStep(context, () => sos.resolveOnSite(r)),
        );
      case SosStatus.resolvedOnSite:
        return Text(
          'Closed – fixed at the roadside.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.inkSoft, fontWeight: FontWeight.w600),
        );
    }
  }
}
