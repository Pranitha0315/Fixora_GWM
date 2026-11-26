import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/buttons.dart';
import '../../../core/widgets/rev_common.dart';
import '../../jobs/presentation/screens/job_detail_screen.dart';
import '../domain/sos_entities.dart';

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
                        onTap: () =>
                            context.push(SosDetailScreen(requestId: r.id)),
                        // Press and hold: the same next steps without opening the call.
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
                                onTap: () => AppServices.sos.accept(r),
                              ),
                          ],
                        ),
                        child: Row(
                          children: [
                            IconBadge(
                              icon: Icons.sos_rounded,
                              color:
                                  r.isOpen ? AppColors.danger : AppColors.muted,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      '${r.vehicle.title} · ${r.vehicle.plate}',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800)),
                                  Text(r.issue,
                                      style: TextStyle(
                                          color: AppColors.inkSoft)),
                                  Text(
                                      '${r.status.label} · ${Fmt.ago(r.receivedAt)}',
                                      style: TextStyle(
                                          fontSize: 12,
                                          color: AppColors.muted)),
                                ],
                              ),
                            ),
                            Icon(Icons.chevron_right_rounded,
                                color: AppColors.muted),
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
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: SizedBox(
                  height: 190,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      CustomPaint(
                          painter: _MapPainter(
                              enRoute: r.status == SosStatus.enRoute)),
                      Positioned(
                        left: 12,
                        top: 12,
                        child: Pill(
                          label: r.channel == SosChannel.bleRelay
                              ? 'BLE relay'
                              : 'Online',
                          color: AppColors.onPrimary,
                          background: r.channel == SosChannel.bleRelay
                              ? AppColors.info
                              : AppColors.success,
                          icon: r.channel == SosChannel.bleRelay
                              ? Icons.bluetooth_rounded
                              : Icons.wifi_rounded,
                        ),
                      ),
                      Positioned(
                        right: 12,
                        bottom: 12,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AppColors.surface,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            r.status == SosStatus.arrived
                                ? 'On site'
                                : '${r.distanceKm} km · ETA ${r.etaMinutes} min',
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.issue,
                        style: const TextStyle(
                            fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.place_outlined,
                            size: 16, color: AppColors.primary),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(r.locationLabel,
                              style: TextStyle(color: AppColors.inkSoft)),
                        ),
                      ],
                    ),
                    const Divider(height: 22),
                    InfoRow('Customer', r.customer.name),
                    InfoRow('Phone', r.customer.phone),
                    InfoRow(
                        'Vehicle', '${r.vehicle.title} · ${r.vehicle.plate}'),
                    InfoRow('Received',
                        '${Fmt.time(r.receivedAt)} · ${r.channelLabel}'),
                  ],
                ),
              ),
              if (r.channel == SosChannel.bleRelay) ...[
                const SizedBox(height: 12),
                AppCard(
                  color: AppColors.infoSoft,
                  borderColor: AppColors.info.withValues(alpha: 0.25),
                  child: Text(
                    'The driver had no mobile data. The request hopped through ${r.hops} nearby '
                    'Fixora phones over Bluetooth until one with internet forwarded it.',
                    style: TextStyle(color: AppColors.info, height: 1.4),
                  ),
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
      (SosStatus.converted, 'Fixed or added to queue'),
    ];
    final reached = switch (status) {
      SosStatus.pending || SosStatus.declined => 0,
      SosStatus.accepted => 1,
      SosStatus.enRoute => 2,
      SosStatus.arrived => 3,
      SosStatus.converted || SosStatus.resolvedOnSite => 4,
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
                    backgroundColor:
                        i < reached ? AppColors.primary : AppColors.field,
                    child: i < reached
                        ? Icon(Icons.check_rounded,
                            size: 16, color: AppColors.onPrimary)
                        : Text('${i + 1}',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.inkSoft)),
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

class _SosActions extends StatelessWidget {
  const _SosActions({required this.request});
  final SosRequest request;

  @override
  Widget build(BuildContext context) {
    final sos = AppServices.sos;
    final r = request;
    switch (r.status) {
      case SosStatus.pending:
        return Row(
          children: [
            Expanded(
              child: OutlineButtonX(
                label: 'Decline',
                color: AppColors.danger,
                onPressed: () async {
                  final ok = await confirmDialog(context,
                      title: 'Decline this SOS?',
                      message:
                          'It will be offered to the next nearest mechanic.',
                      confirmLabel: 'Decline',
                      destructive: true);
                  if (ok) sos.decline(r);
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: PrimaryButton(
                  label: 'Accept SOS',
                  icon: Icons.check_rounded,
                  onPressed: () => sos.accept(r)),
            ),
          ],
        );
      case SosStatus.accepted:
        return PrimaryButton(
          label: 'Start navigation',
          icon: Icons.navigation_rounded,
          onPressed: () {
            sos.startNavigation(r);
            context.toast('Customer notified: mechanic on the way',
                icon: Icons.directions_car);
          },
        );
      case SosStatus.enRoute:
        return PrimaryButton(
            label: 'Mark arrived',
            icon: Icons.flag_rounded,
            onPressed: () => sos.arrived(r));
      case SosStatus.arrived:
        return Row(
          children: [
            Expanded(
              child: OutlineButtonX(
                  label: 'Fixed on spot',
                  onPressed: () => sos.resolveOnSite(r)),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: PrimaryButton(
                label: 'Tow & add to queue',
                icon: Icons.local_shipping_outlined,
                onPressed: () {
                  final jobId = sos.convertToJob(r);
                  context.replaceWith(JobDetailScreen(jobId: jobId));
                },
              ),
            ),
          ],
        );
      case SosStatus.converted:
        return PrimaryButton(
          label: 'Open job',
          icon: Icons.assignment_outlined,
          onPressed: () => context.push(JobDetailScreen(jobId: r.jobId!)),
        );
      case SosStatus.resolvedOnSite:
      case SosStatus.declined:
        return Text(
          r.status == SosStatus.declined
              ? 'You declined this request.'
              : 'Closed – fixed at the roadside.',
          textAlign: TextAlign.center,
          style: TextStyle(
              color: AppColors.inkSoft, fontWeight: FontWeight.w600),
        );
    }
  }
}

/// Simple street-map placeholder with a route and pins.
class _MapPainter extends CustomPainter {
  _MapPainter({required this.enRoute});
  final bool enRoute;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(
        Offset.zero & size, Paint()..color = const Color(0xFFF3F1EC));
    final road = Paint()
      ..color = Colors.white
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round;
    final minor = Paint()
      ..color = Colors.white
      ..strokeWidth = 7;
    canvas.drawLine(Offset(0, size.height * 0.7),
        Offset(size.width, size.height * 0.45), road);
    canvas.drawLine(Offset(size.width * 0.35, 0),
        Offset(size.width * 0.42, size.height), road);
    for (var i = 1; i < 6; i++) {
      final x = size.width * i / 6;
      canvas.drawLine(Offset(x, 0), Offset(x + 30, size.height), minor);
    }
    // Sea on the left (Galle Road runs along the coast)
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width * 0.12, size.height),
        Paint()..color = const Color(0xFFCFE6F7));

    final garage = Offset(size.width * 0.78, size.height * 0.3);
    final driver = Offset(size.width * 0.25, size.height * 0.68);
    final path = Path()
      ..moveTo(garage.dx, garage.dy)
      ..quadraticBezierTo(size.width * 0.5, size.height * 0.2, size.width * 0.4,
          size.height * 0.55)
      ..lineTo(driver.dx, driver.dy);
    canvas.drawPath(
      path,
      Paint()
        ..color = AppColors.primary
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round,
    );

    void pin(Offset c, Color color) {
      canvas.drawCircle(c, 14, Paint()..color = color.withValues(alpha: 0.25));
      canvas.drawCircle(c, 8, Paint()..color = color);
      canvas.drawCircle(c, 3, Paint()..color = Colors.white);
    }

    pin(garage, AppColors.ink);
    pin(driver, AppColors.danger);
    if (enRoute) {
      pin(Offset(size.width * 0.47, size.height * 0.38), AppColors.primary);
    }
  }

  @override
  bool shouldRepaint(covariant _MapPainter oldDelegate) =>
      oldDelegate.enRoute != enRoute;
}
