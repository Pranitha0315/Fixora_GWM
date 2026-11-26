import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../../core/di/app_services.dart';
import '../../domain/entities/evidence_record.dart';
import '../providers/evidence_provider.dart';

/// Evidence Passport: time-stamped before / inspection / after media
/// tied to this job. Records cannot be edited once saved.
class EvidencePassportScreen extends ConsumerWidget {
  const EvidencePassportScreen({super.key, required this.jobId});
  final String jobId;

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    var phase = EvidencePhase.after;
    var kind = MediaKind.photo;
    final labelCtrl = TextEditingController();

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) {
          Widget choice<T>(String text, T value, T group, void Function(T) set) {
            final selected = value == group;
            return ChoiceChip(
              label: Text(text),
              selected: selected,
              showCheckmark: false,
              selectedColor: AppColors.primarySoft,
              backgroundColor: AppColors.surface,
              labelStyle: TextStyle(
                fontWeight: FontWeight.w700,
                color: selected ? AppColors.primaryStrong : AppColors.body,
              ),
              side: BorderSide(color: selected ? AppColors.primaryBorder : AppColors.border),
              onSelected: (_) => setSheet(() => set(value)),
            );
          }

          return Padding(
            padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(ctx).viewInsets.bottom + 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Add evidence', style: AppText.title),
                const SizedBox(height: 16),
                Text('Stage', style: AppText.label),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    choice('Before', EvidencePhase.before, phase, (v) => phase = v),
                    choice('Inspection', EvidencePhase.inspection, phase, (v) => phase = v),
                    choice('After', EvidencePhase.after, phase, (v) => phase = v),
                  ],
                ),
                const SizedBox(height: 14),
                Text('Type', style: AppText.label),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    choice('Photo', MediaKind.photo, kind, (v) => kind = v),
                    choice('Video', MediaKind.video, kind, (v) => kind = v),
                  ],
                ),
                const SizedBox(height: 14),
                Text('What does it show?', style: AppText.label),
                const SizedBox(height: 8),
                TextField(
                  controller: labelCtrl,
                  decoration: const InputDecoration(hintText: 'e.g. Rear brake shoes fitted'),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () => Navigator.of(ctx).pop(true),
                  icon: Icon(kind == MediaKind.photo ? Icons.photo_camera_rounded : Icons.videocam_rounded),
                  label: Text(kind == MediaKind.photo ? 'Take photo' : 'Record video'),
                ),
              ],
            ),
          );
        },
      ),
    );

    if (ok == true) {
      final label = labelCtrl.text.trim().isEmpty ? 'New ${kind == MediaKind.photo ? 'photo' : 'video'}' : labelCtrl.text.trim();
      ref.read(evidenceProvider.notifier).add(jobId: jobId, label: label, phase: phase, kind: kind);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = AppServices.jobs.byId(jobId);
    final records = ref.watch(evidenceProvider).where((e) => e.jobId == jobId).toList();

    final before = records.where((r) => r.phase == EvidencePhase.before).toList();
    final after = records.where((r) => r.phase == EvidencePhase.after).toList();

    return Scaffold(
      appBar: AppBar(title: const Text('Job evidence · before & after')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context, ref),
        backgroundColor: AppColors.primaryStrong,
        foregroundColor: AppColors.onPrimary,
        icon: const Icon(Icons.add_a_photo_rounded),
        label: const Text('Add evidence', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
        children: [
          Row(
            children: [
              PlateBadge(plate: job.vehicle.plate),
              const SizedBox(width: 10),
              Expanded(child: Text('${job.vehicle.title} ${job.vehicle.year}', style: AppText.bodyStrong)),
            ],
          ),
          const SizedBox(height: 12),
          const InfoBanner(
            text: 'Each photo and video is time-stamped and locked to this job. The customer sees them in their app.',
            icon: Icons.lock_clock_rounded,
          ),

          // Before / after compare
          if (before.isNotEmpty && after.isNotEmpty) ...[
            const SectionHeader(title: 'Before & after'),
            AppCard(
              child: Row(
                children: [
                  Expanded(child: _CompareSide(title: 'Before', record: before.first)),
                  const SizedBox(width: 10),
                  Expanded(child: _CompareSide(title: 'After', record: after.last)),
                ],
              ),
            ),
          ],

          for (final phase in EvidencePhase.values) ...[
            SectionHeader(title: phase.label),
            if (records.where((r) => r.phase == phase).isEmpty)
              AppCard(
                child: EmptyState(
                  compact: true,
                  icon: Icons.add_a_photo_outlined,
                  title: 'No ${phase.label.toLowerCase()} media yet',
                  message: 'Records are time-stamped and locked once saved.',
                  actionLabel: 'Add evidence',
                  actionIcon: Icons.add_rounded,
                  onAction: () => _add(context, ref),
                ),
              )
            else
              // One record per row: one scroll direction, full-width touch area.
              for (final r in records.where((e) => e.phase == phase))
                MediaRow(
                  thumbnail: MediaThumb(isVideo: r.kind == MediaKind.video),
                  title: r.label,
                  subtitle: '${r.kind == MediaKind.video ? 'Video' : 'Photo'} · locked ${r.time}',
                ),
          ],
        ],
      ),
    );
  }
}

class _CompareSide extends StatelessWidget {
  const _CompareSide({required this.title, required this.record});
  final String title;
  final EvidenceRecord record;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppText.label.copyWith(color: title == 'After' ? AppColors.success : AppColors.body)),
        const SizedBox(height: 6),
        AspectRatio(
          aspectRatio: 1,
          child: MediaTile(
            label: record.label,
            isVideo: record.kind == MediaKind.video,
            tint: title == 'After' ? AppColors.successSoft : AppColors.surfaceAlt,
          ),
        ),
        const SizedBox(height: 4),
        Text(record.time, style: AppText.caption),
      ],
    );
  }
}
