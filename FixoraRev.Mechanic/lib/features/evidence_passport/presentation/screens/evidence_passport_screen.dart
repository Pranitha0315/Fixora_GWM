import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/theme/app_colors.dart';
import '../../domain/evidence_record.dart';
import '../providers/evidence_provider.dart';

class EvidencePassportScreen extends ConsumerWidget {
  const EvidencePassportScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final evidence =
        ref.watch(evidenceProvider)[jobId] ?? const EvidenceState();

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Evidence passport'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('Job $jobId', style: TextStyle(color: AppColors.body)),
          const SizedBox(height: 16),
          for (final phase in EvidencePhase.values) ...[
            Text(
              phase.label,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
            const SizedBox(height: 8),
            if (evidence.forPhase(phase).isEmpty)
              Text('No ${phase.label.toLowerCase()} evidence',
                  style: TextStyle(color: AppColors.body))
            else
              for (final record in evidence.forPhase(phase))
                _EvidenceTile(
                  record: record,
                  onRetry: () =>
                      ref.read(evidenceProvider.notifier).retry(jobId, record.id),
                ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => ref.read(evidenceProvider.notifier).add(
                    jobId,
                    phase: phase,
                  ),
              icon: const Icon(Icons.add_a_photo_outlined),
              label: Text('Add ${phase.label.toLowerCase()} photo'),
            ),
            const SizedBox(height: 20),
          ],
        ],
      ),
    );
  }
}

class _EvidenceTile extends StatelessWidget {
  const _EvidenceTile({required this.record, required this.onRetry});

  final EvidenceRecord record;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(Icons.image_outlined, color: AppColors.primary),
        title: Text(record.caption, style: TextStyle(color: AppColors.ink)),
        subtitle: Text(
          record.localPath.split(RegExp(r'[/\\]')).last,
          style: TextStyle(color: AppColors.body, fontSize: 12),
        ),
        trailing: record.status == EvidenceUploadStatus.failed
            ? TextButton(onPressed: onRetry, child: const Text('Retry'))
            : Text(
                record.status.name,
                style: TextStyle(color: AppColors.body, fontSize: 11),
              ),
      ),
    );
  }
}