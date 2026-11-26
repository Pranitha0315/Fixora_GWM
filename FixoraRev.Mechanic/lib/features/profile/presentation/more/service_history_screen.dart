import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/common.dart' show StatStrip;
import '../../../../core/widgets/rev_ui.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/screens/job_detail_screen.dart';
import 'more_widgets.dart';

class _PastJob {
  const _PastJob(this.date, this.vehicle, this.plate, this.service, this.minutes, this.asset, {this.rating});
  final String date;
  final String vehicle;
  final String plate;
  final String service;
  final int minutes;
  final String asset;
  final double? rating;
}

/// Service history: today's finished jobs (live) plus earlier work.
class ServiceHistoryScreen extends StatefulWidget {
  const ServiceHistoryScreen({super.key});

  @override
  State<ServiceHistoryScreen> createState() => _ServiceHistoryScreenState();
}

class _ServiceHistoryScreenState extends State<ServiceHistoryScreen> {
  int _range = 0; // Today · This week · This month

  static const _earlier = [
    _PastJob('Tue 10 Nov', 'Toyota Premio', 'WP KX-8841', 'Hybrid battery check', 75, 'assets/images/car_toyota_cut.png',
        rating: 5),
    _PastJob('Tue 10 Nov', 'Suzuki Wagon R', 'WP CBA-3344', 'Brake pads · front', 60, 'assets/images/car_hyundai_cut.png',
        rating: 4.5),
    _PastJob('Mon 9 Nov', 'Honda Fit', 'WP CAH-2210', 'A/C gas recharge', 50, 'assets/images/car_honda_cut.png',
        rating: 5),
    _PastJob('Sat 7 Nov', 'Toyota Aqua', 'WP CAB-4521', 'Periodic service', 90, 'assets/images/car_toyota_cut.png'),
    _PastJob('Thu 5 Nov', 'Nissan X-Trail', 'WP CAK-5560', 'Engine mount replace', 140,
        'assets/images/car_honda_cut.png', rating: 4),
    _PastJob('Mon 2 Nov', 'Hyundai Tucson', 'WP CAM-9081', 'OBD fault P0420', 85, 'assets/images/car_hyundai_cut.png',
        rating: 5),
  ];

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.jobs,
      builder: (context, _) {
        final today = AppServices.jobs.finished;
        final earlier = switch (_range) {
          0 => const <_PastJob>[],
          1 => _earlier.take(5).toList(),
          _ => _earlier,
        };
        final total = today.length + earlier.length;
        final minutes = today.fold<int>(0, (s, j) => s + j.estimatedMinutes) +
            earlier.fold<int>(0, (s, j) => s + j.minutes);
        final avg = total == 0 ? 0 : (minutes / total).round();

        return MorePage(
          title: 'Service history',
          children: [
            RevChipRow(
              labels: const ['Today', 'This week', 'This month'],
              selected: _range,
              onSelected: (i) => setState(() => _range = i),
            ),
            const SizedBox(height: 12),
            StatStrip(items: [('$total', 'Jobs finished'), (Fmt.minutes(avg), 'Avg. time'), ('4.8', 'Rating')]),
            RevSection('Today', action: null, top: 20),
            if (today.isEmpty)
              RevCard(
                child: EmptyState(
                  compact: true,
                  icon: Icons.task_alt_rounded,
                  title: 'No finished jobs yet today',
                  message: 'Jobs you hand over appear here with the finish time.',
                  actionLabel: 'Back to my jobs',
                  actionIcon: Icons.handyman_outlined,
                  onAction: () => Navigator.of(context).maybePop(),
                ),
              )
            else
              for (final j in today)
                _HistoryRow(
                  asset: j.vehicle.cutoutAsset,
                  title: j.vehicle.title,
                  line1: '${j.id} · ${j.serviceType}',
                  line2: '${j.vehicle.plate} · '
                      '${j.completedAt != null ? 'Finished ${Fmt.time(j.completedAt!)}' : j.status.label}',
                  trailing: j.status == JobStatus.parked ? 'Parked' : 'Done',
                  parked: j.status == JobStatus.parked,
                  onTap: () => context.push(JobDetailScreen(jobId: j.id)),
                ),
            if (earlier.isNotEmpty) ...[
              const RevSection('Earlier', top: 14),
              for (final p in earlier)
                _HistoryRow(
                  asset: p.asset,
                  title: p.vehicle,
                  line1: '${p.date} · ${p.service}',
                  line2: '${p.plate} · ${Fmt.minutes(p.minutes)}',
                  trailing: p.rating == null ? 'Done' : '★ ${p.rating}',
                  onTap: () => context.toast('${p.vehicle} · ${p.service} · ${p.date}', icon: Icons.history_rounded),
                ),
            ],
          ],
        );
      },
    );
  }
}

class _HistoryRow extends StatelessWidget {
  const _HistoryRow({
    required this.asset,
    required this.title,
    required this.line1,
    required this.line2,
    required this.trailing,
    required this.onTap,
    this.parked = false,
  });

  final String asset;
  final String title;
  final String line1;
  final String line2;
  final String trailing;
  final VoidCallback onTap;
  final bool parked;

  @override
  Widget build(BuildContext context) {
    return RevCard(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
      onTap: onTap,
      child: Row(
        children: [
          CarCutout(asset, width: 72, height: 40),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 15.5, fontWeight: FontWeight.w700, color: AppColors.ink)),
                Text(line1,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 13.5, color: AppColors.body)),
                Text(line2, style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
              ],
            ),
          ),
          const SizedBox(width: 6),
          RevPill(label: trailing, tone: parked ? RevTone.purple : RevTone.green),
        ],
      ),
    );
  }
}
