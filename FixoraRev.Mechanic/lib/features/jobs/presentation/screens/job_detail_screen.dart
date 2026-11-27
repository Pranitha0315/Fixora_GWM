import 'package:flutter/material.dart';

import '../../../../app/router/route_names.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/action_sheet.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../../core/widgets/rev_common.dart';
import '../../../../core/widgets/warm_ui.dart';
import '../../domain/job_entities.dart';
import '../../../drivesense/presentation/widgets/drivesense_hint_card.dart';
import '../../../fixproof/presentation/widgets/fixproof_job_section.dart';

/// Options for the open job card, in a bottom sheet (thumb zone).
Future<void> _jobOptions(BuildContext context, Job job) {
  final unread = AppServices.notifications.unread;
  return showActionSheet(
    context,
    title: '${job.vehicle.title} · ${job.vehicle.plate}',
    subtitle: '${job.serviceType} · ${job.customer.name}',
    actions: [
      SheetAction(
        icon: Icons.notifications_none_rounded,
        label: unread > 0 ? 'Alerts · $unread new' : 'Alerts',
        onTap: () => context.pushRoute(RouteNames.notifications),
      ),
    ],
  );
}

class JobDetailScreen extends StatelessWidget {
  const JobDetailScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([AppServices.jobs, AppServices.notifications]),
      builder: (context, _) {
        final job = AppServices.jobs.byId(jobId);
        return Scaffold(
          appBar: AppBar(
            toolbarHeight: 68,
            automaticallyImplyLeading: false,
            titleSpacing: 16,
            title: Row(
              children: [
                WarmIconButton(
                  icon: Icons.arrow_back_rounded,
                  label: 'Back',
                  onTap: () => Navigator.of(context).maybePop(),
                ),
                Expanded(
                  child: Column(
                    children: [
                      Text('Job card', style: TextStyle(fontSize: 12, color: AppColors.body)),
                      Text('Job #${job.token}',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
                    ],
                  ),
                ),
                // ⋯ opens the same options sheet as a long-press on the job in the lists.
                WarmIconButton(
                  icon: Icons.more_horiz_rounded,
                  label: 'Job options',
                  badge: AppServices.notifications.unread,
                  onTap: () => _jobOptions(context, job),
                ),
              ],
            ),
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              _VehicleHeader(job: job),
              const SectionTitle('Customer'),
              _CustomerCard(job: job),
              const SectionTitle('Reported by customer'),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (job.reportedSymptoms.isEmpty)
                      Text('The customer did not list any symptoms.',
                          style: TextStyle(color: AppColors.body, height: 1.4))
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final s in job.reportedSymptoms)
                            Pill(label: s, color: AppColors.ink, background: AppColors.field),
                        ],
                      ),
                    if (job.customerNote != null) ...[
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.format_quote_rounded, color: AppColors.primary, size: 20),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(job.customerNote!,
                                style: TextStyle(color: AppColors.inkSoft, fontStyle: FontStyle.italic)),
                          ),
                        ],
                      ),
                    ],
                    if (job.managerNote != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppColors.field,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppColors.primary.withValues(alpha: 0.35)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.assignment_ind_outlined, color: AppColors.primary, size: 20),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Manager note',
                                      style: TextStyle(
                                          color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 12)),
                                  const SizedBox(height: 2),
                                  Text(job.managerNote!, style: TextStyle(color: AppColors.ink)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              FixProofJobSection(job: job),
              DriveSenseHintCard(jobId: job.id),
              const SectionTitle('Timeline'),
              _Timeline(job: job),
            ],
          ),
          bottomNavigationBar: BottomActionBar(child: _JobAction(job: job)),
        );
      },
    );
  }
}

// ------------------------------------------------------------- Header

class _VehicleHeader extends StatelessWidget {
  const _VehicleHeader({required this.job});
  final Job job;

  WarmTone get _tone => switch (job.status) {
        JobStatus.completed => WarmTone.green,
        JobStatus.awaitingApproval => WarmTone.red,
        JobStatus.waiting => WarmTone.neutral,
        _ => WarmTone.amber,
      };

  @override
  Widget build(BuildContext context) {
    final v = job.vehicle;
    final percent = (job.status.progress * 100).round();
    final about = [
      job.serviceType,
      if (job.reportedSymptoms.isNotEmpty) 'Customer reports: ${job.reportedSymptoms.join(', ').toLowerCase()}.',
    ].join('. ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CarOnPedestal(asset: v.cutoutAsset, height: 210, semanticLabel: v.title),
        const SizedBox(height: 14),
        SoftCard(
          radius: 30,
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  WarmBadge(job.status.label, tone: _tone),
                  const Spacer(),
                  Text('${job.bay} · ${Fmt.minutes(job.estimatedMinutes)}',
                      style: TextStyle(fontSize: 12.5, color: AppColors.body)),
                ],
              ),
              const SizedBox(height: 10),
              Text(v.title,
                  style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                      height: 1.1,
                      color: AppColors.primaryStrong)),
              const SizedBox(height: 2),
              Text('${v.plate} · ${job.customer.name}', style: TextStyle(fontSize: 13.5, color: AppColors.body)),
              const SizedBox(height: 10),
              Text(about, style: TextStyle(fontSize: 14, height: 1.45, color: AppColors.body)),
              const SizedBox(height: 14),
              Row(
                children: [
                  Text('$percent%', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: AppColors.ink)),
                  const SizedBox(width: 8),
                  Text('done', style: TextStyle(fontSize: 14, color: AppColors.muted)),
                  const SizedBox(width: 14),
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: job.status.progress,
                        minHeight: 8,
                        color: AppColors.primaryStrong,
                        backgroundColor: AppColors.primarySoft,
                      ),
                    ),
                  ),
                ],
              ),
              if (job.priority != JobPriority.normal) ...[
                const SizedBox(height: 12),
                Pill(label: job.priority.label, color: job.priority.color, icon: job.priority.icon, dense: true),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.job});
  final Job job;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      child: Row(
        children: [
          Avatar(initials: Fmt.initials(job.customer.name), size: 44, color: AppColors.ink),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(job.customer.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                if (job.customer.phone.isNotEmpty)
                  Text(job.customer.phone, style: TextStyle(color: AppColors.inkSoft)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- Timeline

class _Timeline extends StatelessWidget {
  const _Timeline({required this.job});
  final Job job;

  @override
  Widget build(BuildContext context) {
    if (job.timeline.isEmpty) {
      return const AppCard(
        child: EmptyState(
          compact: true,
          icon: Icons.timeline_rounded,
          title: 'No activity yet',
          message: 'Each step you take — start, pause, progress, complete — is logged here with the time.',
        ),
      );
    }
    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < job.timeline.length; i++)
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      Container(
                        width: 30,
                        height: 30,
                        decoration: BoxDecoration(
                          color: i == 0 ? AppColors.primary : AppColors.primarySoft,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(job.timeline[i].icon,
                            size: 16, color: i == 0 ? AppColors.onPrimary : AppColors.primary),
                      ),
                      if (i != job.timeline.length - 1)
                        Expanded(child: Container(width: 2, color: AppColors.primaryBorder)),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 14, top: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(job.timeline[i].title, style: const TextStyle(fontWeight: FontWeight.w700)),
                          if (job.timeline[i].detail != null)
                            Text(job.timeline[i].detail!,
                                style: TextStyle(color: AppColors.inkSoft, fontSize: 13)),
                          Text(Fmt.dateTime(job.timeline[i].time),
                              style: TextStyle(color: AppColors.muted, fontSize: 12)),
                        ],
                      ),
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

// ------------------------------------------------------------- Main action (backend actions only)

class _JobAction extends StatelessWidget {
  const _JobAction({required this.job});
  final Job job;

  @override
  Widget build(BuildContext context) {
    final jobs = AppServices.jobs;
    switch (job.status) {
      case JobStatus.waiting:
      case JobStatus.diagnosing:
        return PrimaryButton(
          label: 'Start repair',
          icon: Icons.build_circle_outlined,
          onPressed: () => jobs.startRepair(job),
        );
      case JobStatus.awaitingApproval:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.warning),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Text('Waiting for the manager to review and release the work',
                  style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        );
      case JobStatus.inProgress:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: OutlineButtonX(
                    label: job.paused ? 'Resume' : 'Pause',
                    icon: job.paused ? Icons.play_arrow_rounded : Icons.pause_rounded,
                    onPressed: () => job.paused ? jobs.resumeJob(job) : jobs.pauseJob(job),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlineButtonX(
                    label: 'Send update',
                    icon: Icons.chat_bubble_outline_rounded,
                    onPressed: () => context.pushRoute(RouteNames.progressUpdate, extra: job.id),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            PrimaryButton(
              label: 'Complete job',
              icon: Icons.check_circle_outline_rounded,
              onPressed: () => jobs.completeJob(job),
            ),
          ],
        );
      case JobStatus.completed:
        return const SizedBox.shrink();
    }
  }
}
