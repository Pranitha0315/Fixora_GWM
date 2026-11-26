import 'package:flutter/material.dart';

import '../../../../app/router/route_names.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/action_sheet.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../../core/widgets/rev_common.dart';
import '../../../../core/widgets/warm_ui.dart';
import '../../../diagnosis/domain/diagnosis_entities.dart';
import '../../../diagnosis/presentation/diagnosis_flow_screen.dart';
import '../../../diagnosis/presentation/diagnosis_report_screen.dart';
import '../../../inventory/domain/part.dart';
import '../../../passport/domain/passport_entities.dart';
import '../../../passport/presentation/passport_detail_screen.dart';
import '../../domain/job_entities.dart';
import 'invoice_screen.dart';
import 'repair_screen.dart';
import '../../../drivesense/presentation/widgets/drivesense_hint_card.dart';
import '../../../fixproof/presentation/widgets/fixproof_job_section.dart';

/// Options for the open job card, in a bottom sheet (thumb zone).
Future<void> _jobOptions(BuildContext context, Job job) {
  final messenger = ScaffoldMessenger.of(context);
  final unread = AppServices.notifications.unread;
  return showActionSheet(
    context,
    title: '${job.vehicle.title} · ${job.vehicle.plate}',
    subtitle: '${job.serviceType} · ${job.customer.name}',
    actions: [
      SheetAction(
        icon: Icons.call_outlined,
        label: 'Call ${job.customer.name}',
        subtitle: job.customer.phone,
        onTap: () => messenger.showSnackBar(SnackBar(content: Text('Calling ${job.customer.name}…'))),
      ),
      SheetAction(
        icon: Icons.menu_book_outlined,
        label: 'Vehicle passport',
        subtitle: 'History and open issues for ${job.vehicle.plate}',
        onTap: () => context.pushRoute(RouteNames.passport),
      ),
      if (job.diagnosis != null)
        SheetAction(
          icon: Icons.description_outlined,
          label: 'Full diagnosis report',
          onTap: () => context.push(DiagnosisReportScreen(jobId: job.id)),
        ),
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
      listenable: Listenable.merge(
          [AppServices.jobs, AppServices.inventory, AppServices.passport, AppServices.notifications]),
      builder: (context, _) {
        final job = AppServices.jobs.byId(jobId);
        final openPassport = AppServices.passport.openFor(job.vehicle);
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
                      Text('Job #${job.token}', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink)),
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
              if (openPassport.isNotEmpty) ...[
                const SizedBox(height: 12),
                for (final e in openPassport) _PassportAlert(entry: e),
              ],
              const SectionTitle('Customer'),
              _CustomerCard(job: job),
              const SectionTitle('Reported by customer'),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (job.reportedSymptoms.isEmpty)
                      Text('The customer did not list any symptoms. Ask them, or note what you find in the diagnosis.',
                          style: TextStyle(color: AppColors.body, height: 1.4))
                    else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final s in job.reportedSymptoms)
                          Pill(
                              label: s,
                              color: AppColors.ink,
                              background: AppColors.field),
                      ],
                    ),
                    if (job.customerNote != null) ...[
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.format_quote_rounded,
                              color: AppColors.primary, size: 20),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(job.customerNote!,
                                style: TextStyle(
                                    color: AppColors.inkSoft,
                                    fontStyle: FontStyle.italic)),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              FixProofJobSection(job: job),
              DriveSenseHintCard(jobId: job.id),
              if (job.diagnosis != null) ...[
                SectionTitle(
                  'Diagnosis',
                  action: 'Full report',
                  onAction: () =>
                      context.push(DiagnosisReportScreen(jobId: job.id)),
                ),
                _DiagnosisSummary(report: job.diagnosis!),
              ],
              if (job.estimate != null) ...[
                const SectionTitle('Parts & estimate'),
                _EstimateCard(job: job),
              ],
              if (job.tasks.isNotEmpty &&
                  job.status.index >= JobStatus.inProgress.index) ...[
                const SectionTitle('Repair checklist'),
                AppCard(
                  child: Column(
                    children: [
                      for (final t in job.tasks)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              Icon(
                                  t.done
                                      ? Icons.check_circle_rounded
                                      : Icons.radio_button_unchecked,
                                  size: 20,
                                  color: t.done
                                      ? AppColors.success
                                      : AppColors.muted),
                              const SizedBox(width: 10),
                              Expanded(child: Text(t.title)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
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
        JobStatus.approved || JobStatus.completed || JobStatus.parked => WarmTone.green,
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
                  Text('${job.bay} · ${Fmt.minutes(job.estimatedMinutes)}', style: TextStyle(fontSize: 12.5, color: AppColors.body)),
                ],
              ),
              const SizedBox(height: 10),
              Text(v.title, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -0.5, height: 1.1, color: AppColors.primaryStrong)),
              const SizedBox(height: 2),
              Text('${v.plate} · ${job.customer.name}', style: TextStyle(fontSize: 13.5, color: AppColors.body)),
              const SizedBox(height: 10),
              Text(about, style: TextStyle(fontSize: 14, height: 1.45, color: AppColors.body)),
              const SizedBox(height: 14),
              Row(
                children: [
                  _Meta(icon: Icons.speed_rounded, label: Fmt.km(v.mileageKm)),
                  _Meta(icon: Icons.local_gas_station_outlined, label: v.fuel),
                  _Meta(icon: Icons.calendar_today_outlined, label: '${v.year}'),
                ],
              ),
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

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Row(
          children: [
            Icon(icon, size: 16, color: AppColors.primary),
            const SizedBox(width: 5),
            Flexible(
              child: Text(label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13)),
            ),
          ],
        ),
      );
}

class _PassportAlert extends StatelessWidget {
  const _PassportAlert({required this.entry});
  final PassportEntry entry;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 8),
      color: AppColors.purpleSoft,
      borderColor: AppColors.purple.withValues(alpha: 0.3),
      onTap: () => context.push(PassportDetailScreen(entryId: entry.id)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.history_rounded, color: AppColors.purple),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Returning issue · ${entry.id} · ${entry.status.label}',
                    style: TextStyle(
                        fontWeight: FontWeight.w800, color: AppColors.purple)),
                const SizedBox(height: 2),
                Text(entry.title,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(
                  'Opened ${Fmt.date(entry.openedAt)} · ${entry.evidenceCount} evidence · review before diagnosing',
                  style:
                      TextStyle(fontSize: 12.5, color: AppColors.inkSoft),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right_rounded, color: AppColors.purple),
        ],
      ),
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
          Avatar(
              initials: Fmt.initials(job.customer.name),
              size: 44,
              color: AppColors.ink),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(job.customer.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
                Text(job.customer.phone,
                    style: TextStyle(color: AppColors.inkSoft)),
              ],
            ),
          ),
          _RoundAction(
            icon: Icons.call_outlined,
            onTap: () => context.toast('Calling ${job.customer.name}…',
                icon: Icons.call),
          ),
          const SizedBox(width: 8),
          _RoundAction(
            icon: Icons.chat_bubble_outline_rounded,
            onTap: () => context.toast('Chat opens in the Customer app thread',
                icon: Icons.chat),
          ),
        ],
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.primarySoft,
        shape: const CircleBorder(),
        child: IconButton(
            constraints: const BoxConstraints.tightFor(width: 48, height: 48),
            onPressed: onTap,
            icon: Icon(icon, color: AppColors.primary, size: 22)),
      );
}

// ------------------------------------------------------------- Diagnosis

class _DiagnosisSummary extends StatelessWidget {
  const _DiagnosisSummary({required this.report});
  final DiagnosisReport report;

  @override
  Widget build(BuildContext context) {
    final codes = report.scan?.codes ?? const <DtcCode>[];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(report.cause,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
              ),
              Pill(
                  label: report.severity.label,
                  color: report.severity.color,
                  dense: true),
            ],
          ),
          const SizedBox(height: 6),
          Text(report.causeDetail,
              style: TextStyle(color: AppColors.inkSoft, height: 1.35)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Pill(
                  label: zoneById(report.zoneId).label,
                  color: AppColors.primary,
                  icon: Icons.place_outlined,
                  dense: true),
              for (final c in codes)
                Pill(label: c.code, color: c.severity.color, dense: true),
              Pill(
                label: '${report.evidence.length} evidence',
                color: AppColors.info,
                icon: Icons.photo_library_outlined,
                dense: true,
              ),
              if (report.aiAssisted && report.aiConfidence != null)
                Pill(
                  label:
                      'AI ${(report.aiConfidence! * 100).round()}% · mechanic verified',
                  color: AppColors.purple,
                  icon: Icons.auto_awesome,
                  dense: true,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- Estimate

class _EstimateCard extends StatelessWidget {
  const _EstimateCard({required this.job});
  final Job job;

  bool get _canSwap =>
      job.status == JobStatus.awaitingApproval ||
      job.status == JobStatus.approved ||
      job.status == JobStatus.inProgress;

  @override
  Widget build(BuildContext context) {
    final inv = AppServices.inventory;
    final estimate = job.estimate!;
    return AppCard(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Text('Parts availability',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const Spacer(),
              if (job.status.isActive) TrafficLight(inv.jobAvailability(job)),
            ],
          ),
          const Divider(height: 22),
          for (final line in estimate.lines) ...[
            _LineRow(
                job: job, line: line, canSwap: _canSwap && job.status.isActive),
            const SizedBox(height: 10),
          ],
          InfoRow(
              'Labour (${Fmt.hours(estimate.labourHours)} × ${Fmt.lkr(estimate.labourRate)})',
              Fmt.lkr(estimate.labourTotal)),
          InfoRow('Parts', Fmt.lkr(estimate.partsTotal)),
          const Divider(height: 18),
          InfoRow('Estimated total', Fmt.lkr(estimate.total),
              bold: true, valueColor: AppColors.primaryDark),
          if (job.partsReserved && job.status.isActive)
            Padding(
              padding: EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Icon(Icons.lock_outline_rounded,
                      size: 15, color: AppColors.success),
                  SizedBox(width: 6),
                  Text('Stock reserved for this job',
                      style: TextStyle(
                          color: AppColors.success,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow(
      {required this.job, required this.line, required this.canSwap});
  final Job job;
  final EstimateLine line;
  final bool canSwap;

  @override
  Widget build(BuildContext context) {
    final inv = AppServices.inventory;
    final availability = inv.lineAvailability(line);
    final part = inv.byId(line.partId);
    final subs = availability == PartAvailability.ready
        ? const <Part>[]
        : inv.substitutesFor(line.partId, qty: line.qty - line.reservedQty);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 5),
              child: TrafficLight(availability, showLabel: false),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${line.name} ×${line.qty}',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text(
                    availability == PartAvailability.partial &&
                            part?.incomingEta != null
                        ? 'Arriving ${Fmt.date(part!.incomingEta!)}'
                        : line.reservedQty >= line.qty
                            ? 'Reserved'
                            : availability.short,
                    style: TextStyle(
                        fontSize: 12,
                        color: availability.color,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            Text(Fmt.lkr(line.total),
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        if (canSwap && subs.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 20, top: 6),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () async {
                final ok = await confirmDialog(
                  context,
                  title: 'Use substitute part?',
                  message:
                      '${subs.first.name} (${subs.first.brand}) is compatible and in stock '
                      'at ${Fmt.lkr(subs.first.unitPrice)} each.',
                  confirmLabel: 'Use substitute',
                );
                if (ok) {
                  AppServices.jobs.swapToSubstitute(job, line, subs.first);
                }
              },
              child: Container(
                constraints: const BoxConstraints(minHeight: 44),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.successSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.swap_horiz_rounded,
                        size: 16, color: AppColors.success),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text('Substitute in stock: ${subs.first.name}',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppColors.success,
                              fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ),
          ),
      ],
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
          message: 'Each step you take — diagnosis, proposal, repair — is logged here with the time.',
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
                          color: i == 0
                              ? AppColors.primary
                              : AppColors.primarySoft,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(job.timeline[i].icon,
                            size: 16,
                            color: i == 0 ? AppColors.onPrimary : AppColors.primary),
                      ),
                      if (i != job.timeline.length - 1)
                        Expanded(
                            child: Container(
                                width: 2, color: AppColors.primaryBorder)),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 14, top: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(job.timeline[i].title,
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                          if (job.timeline[i].detail != null)
                            Text(job.timeline[i].detail!,
                                style: TextStyle(
                                    color: AppColors.inkSoft, fontSize: 13)),
                          Text(Fmt.dateTime(job.timeline[i].time),
                              style: TextStyle(
                                  color: AppColors.muted, fontSize: 12)),
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

// ------------------------------------------------------------- Main action

class _JobAction extends StatelessWidget {
  const _JobAction({required this.job});
  final Job job;

  Future<void> _startRepair(BuildContext context) async {
    if (job.status == JobStatus.awaitingApproval) {
      context.toast('Waiting for customer approval before repair can start',
          icon: Icons.hourglass_top_rounded);
      return;
    }
    final availability = AppServices.inventory.jobAvailability(job);
    if (availability == PartAvailability.blocked) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppColors.surface,
          surfaceTintColor: Colors.transparent,
          title: const Text('Parts blocked'),
          content: const Text(
            'At least one part is out of stock and not on order. Use the suggested substitute '
            'in Parts & estimate, or ask the stock room to reorder before starting.',
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx), child: const Text('OK'))
          ],
        ),
      );
      return;
    }
    if (availability == PartAvailability.partial) {
      final ok = await confirmDialog(
        context,
        title: 'Some parts are still incoming',
        message:
            'You can start with the parts in hand. The job will wait at the missing part.',
        confirmLabel: 'Start anyway',
      );
      if (!ok) return;
    }
    AppServices.jobs.startRepair(job);
    if (context.mounted) context.push(RepairScreen(jobId: job.id));
  }

  @override
  Widget build(BuildContext context) {
    final jobs = AppServices.jobs;
    switch (job.status) {
      case JobStatus.waiting:
        return PrimaryButton(
          label: 'Start Diagnosis',
          icon: Icons.troubleshoot_rounded,
          onPressed: () {
            jobs.startDiagnosis(job);
            context.push(DiagnosisFlowScreen(jobId: job.id));
          },
        );
      case JobStatus.diagnosing:
        return PrimaryButton(
          label: 'Continue Diagnosis',
          icon: Icons.troubleshoot_rounded,
          onPressed: () => context.push(DiagnosisFlowScreen(jobId: job.id)),
        );
      case JobStatus.awaitingApproval:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: AppColors.warning),
                ),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                      'Waiting for the customer to approve in the Fixora app',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            if (!MechanicBackend.instance.live) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlineButtonX(
                label: 'Simulate customer approval (demo)',
                icon: Icons.thumb_up_alt_outlined,
                color: AppColors.primary,
                borderColor: AppColors.primaryBorder,
                onPressed: () {
                  jobs.customerApproved(job);
                  context.toast('Customer approved · parts reserved',
                      icon: Icons.check_circle);
                },
              ),
            ),
            ],
          ],
        );
      case JobStatus.approved:
        return PrimaryButton(
          label: 'Start Repair',
          icon: Icons.build_circle_outlined,
          onPressed: () => _startRepair(context),
        );
      case JobStatus.inProgress:
        return PrimaryButton(
          label: 'Open repair checklist',
          icon: Icons.checklist_rounded,
          onPressed: () => context.push(RepairScreen(jobId: job.id)),
        );
      case JobStatus.qualityCheck:
        return PrimaryButton(
          label: 'Open quality check',
          icon: Icons.fact_check_outlined,
          onPressed: () => context.push(QualityCheckScreen(jobId: job.id)),
        );
      case JobStatus.completed:
        return PrimaryButton(
          label: 'View invoice',
          icon: Icons.receipt_long_outlined,
          onPressed: () => context.push(InvoiceScreen(jobId: job.id)),
        );
      case JobStatus.parked:
        return PrimaryButton(
          label: 'Open Passport entry',
          icon: Icons.menu_book_outlined,
          onPressed: job.passportEntryId == null
              ? null
              : () => context
                  .push(PassportDetailScreen(entryId: job.passportEntryId!)),
        );
    }
  }
}
