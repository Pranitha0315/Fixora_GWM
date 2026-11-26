import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/buttons.dart';
import '../../../core/widgets/rev_common.dart';
import '../domain/diagnosis_entities.dart';
import 'widgets/evidence_thumb.dart';
import 'widgets/vehicle_diagram.dart';

/// The customer diagnostic report as the mechanic sent it.
class DiagnosisReportScreen extends StatelessWidget {
  const DiagnosisReportScreen({super.key, required this.jobId});
  final String jobId;

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(jobId);
    final report = job.diagnosis!;
    final estimate = job.estimate;
    final codes = report.scan?.codes ?? const <DtcCode>[];

    return Scaffold(
      appBar: AppBar(title: const Text('Diagnostic report')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          AppCard(
            color: AppColors.primarySoft,
            borderColor: AppColors.primaryBorder,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${job.vehicle.title} · ${job.vehicle.plate}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 16)),
                Text('${job.customer.name} · ${Fmt.dateTime(report.createdAt)}',
                    style: TextStyle(color: AppColors.inkSoft)),
                const SizedBox(height: 12),
                Text(report.cause,
                    style: const TextStyle(
                        fontSize: 19, fontWeight: FontWeight.w900)),
                const SizedBox(height: 6),
                Text(report.causeDetail,
                    style:
                        TextStyle(color: AppColors.inkSoft, height: 1.4)),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    Pill(
                        label: 'Severity: ${report.severity.label}',
                        color: report.severity.color,
                        dense: true),
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
          ),
          const SectionTitle('Problem location'),
          AppCard(
            child: Column(
              children: [
                VehicleDiagram(selectedZoneId: report.zoneId, height: 300),
                const SizedBox(height: 8),
                Text(zoneById(report.zoneId).label,
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.primaryDark)),
              ],
            ),
          ),
          const SectionTitle('Symptoms'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in report.symptoms)
                Pill(label: s, color: AppColors.ink, background: AppColors.surface),
            ],
          ),
          if (report.mechanicNotes.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text('Mechanic notes: ${report.mechanicNotes}',
                style: TextStyle(color: AppColors.inkSoft)),
          ],
          const SectionTitle('OBD-II fault codes'),
          if (report.scan == null)
            const AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.bluetooth_disabled_rounded,
                title: 'OBD scan was skipped',
                message: 'This car was diagnosed from symptoms and evidence only.',
              ),
            )
          else if (codes.isEmpty)
            const AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.check_circle_outline_rounded,
                title: 'No fault codes stored',
                message: 'The engine computer had nothing to report. That is good news for the customer.',
              ),
            )
          else
            for (final c in codes)
              AppCard(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.code,
                        style: TextStyle(
                            fontWeight: FontWeight.w900,
                            color: c.severity.color)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(c.plainMeaning,
                          style: const TextStyle(height: 1.35)),
                    ),
                  ],
                ),
              ),
          SectionTitle('Evidence (${report.evidence.length})'),
          if (report.evidence.isEmpty)
            const AppCard(
              child: EmptyState(
                compact: true,
                icon: Icons.photo_camera_outlined,
                title: 'No evidence attached',
                message: 'Photos build trust. Add them next time in the Evidence step of the diagnosis.',
              ),
            )
          else
            SizedBox(
              height: 128,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: report.evidence.length,
                separatorBuilder: (_, __) => const SizedBox(width: 10),
                itemBuilder: (_, i) {
                  final e = report.evidence[i];
                  return SizedBox(
                    width: 120,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                            height: 90,
                            width: 120,
                            child: EvidenceThumb(type: e.type, seed: i)),
                        const SizedBox(height: 4),
                        Text(e.caption,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 11.5, color: AppColors.inkSoft)),
                      ],
                    ),
                  );
                },
              ),
            ),
          if (estimate != null) ...[
            const SectionTitle('Recommended repair & cost'),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (estimate.recommendedRepair.isNotEmpty) ...[
                    Text(estimate.recommendedRepair,
                        style: const TextStyle(height: 1.4)),
                    const Divider(height: 22),
                  ],
                  for (final l in estimate.lines)
                    InfoRow('${l.name} ×${l.qty}', Fmt.lkr(l.total)),
                  InfoRow('Labour ${Fmt.hours(estimate.labourHours)}',
                      Fmt.lkr(estimate.labourTotal)),
                  const Divider(height: 18),
                  InfoRow('Estimated total', Fmt.lkr(estimate.total),
                      bold: true, valueColor: AppColors.primaryDark),
                ],
              ),
            ),
          ],
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        child: OutlineButtonX(
          label: 'Share as PDF',
          icon: Icons.picture_as_pdf_outlined,
          color: AppColors.primary,
          borderColor: AppColors.primaryBorder,
          onPressed: () => context.toast(
              'PDF is generated by the backend (QuestPDF) and shared with the customer',
              icon: Icons.picture_as_pdf),
        ),
      ),
    );
  }
}
