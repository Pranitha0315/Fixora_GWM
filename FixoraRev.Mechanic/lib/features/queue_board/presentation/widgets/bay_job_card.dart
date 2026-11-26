import 'package:flutter/material.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/rev_common.dart';
import '../../../inventory/domain/part.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/screens/job_detail_screen.dart';

/// Bay job card for Home / queue board (shows [Job.bay]).
class BayJobCard extends StatelessWidget {
  const BayJobCard({super.key, required this.job, this.compact = false});
  final Job job;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final jobs = AppServices.jobs;
    final eta = jobs.etaFor(job);
    final hasPassport = AppServices.passport.openFor(job.vehicle).isNotEmpty;
    final availability = job.estimate == null ? null : AppServices.inventory.jobAvailability(job);

    return AppCard(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      borderColor: job.priority == JobPriority.sos ? AppColors.danger.withValues(alpha: 0.5) : AppColors.border,
      onTap: () => context.push(JobDetailScreen(jobId: job.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.asset(
                  job.vehicle.imageAsset,
                  width: 64,
                  height: 64,
                  fit: BoxFit.cover,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            job.vehicle.title,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                          ),
                        ),
                        const SizedBox(width: 8),
                        _Plate(job.vehicle.plate),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${job.serviceType} · Job ${job.id}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: AppColors.inkSoft, fontSize: 13.5),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${job.bay} · ${job.customer.name}',
                      style: TextStyle(color: AppColors.muted, fontSize: 12.5),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: AppColors.muted),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Pill(label: job.status.label, color: job.status.color, icon: job.status.icon, dense: true),
              if (job.priority != JobPriority.normal)
                Pill(label: job.priority.label, color: job.priority.color, icon: job.priority.icon, dense: true),
              if (hasPassport && job.priority != JobPriority.returning)
                Pill(label: 'Passport', color: AppColors.purple, icon: Icons.history_rounded, dense: true),
              if (availability != null && job.status.isActive) TrafficLight(availability, short: true),
            ],
          ),
          if (!compact) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(Icons.schedule_rounded, size: 15, color: AppColors.muted),
                const SizedBox(width: 5),
                Text(
                  eta != null
                      ? 'ETA ${Fmt.time(eta)} · ${Fmt.minutes(job.estimatedMinutes)}'
                      : job.status == JobStatus.completed && job.completedAt != null
                          ? 'Finished ${Fmt.time(job.completedAt!)}'
                          : 'Slot ${Fmt.time(job.slotTime)} · ${Fmt.minutes(job.estimatedMinutes)}',
                  style: TextStyle(color: AppColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w600),
                ),
                const Spacer(),
                Icon(Icons.garage_outlined, size: 15, color: AppColors.muted),
                const SizedBox(width: 4),
                Text(job.bay, style: TextStyle(color: AppColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: job.status == JobStatus.inProgress ? 0.5 + job.taskProgress * 0.4 : job.status.progress,
                minHeight: 5,
                backgroundColor: AppColors.field,
                color: job.status.color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Old name used by passport / other screens.
typedef JobCard = BayJobCard;

class _Plate extends StatelessWidget {
  const _Plate(this.plate);
  final String plate;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E1),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: const Color(0xFFE6C66A)),
      ),
      child: Text(
        plate,
        style: const TextStyle(
          color: Color(0xFF1F2937),
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

/// Plate badge for other screens.
class PlateBadge extends StatelessWidget {
  const PlateBadge(this.plate, {super.key});
  final String plate;
  @override
  Widget build(BuildContext context) => _Plate(plate);
}
