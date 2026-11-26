import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/step_timeline.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/screens/job_detail_screen.dart';

/// Progress note + "running late" report. The job's estimate grows and
/// the queue re-plans every waiting customer's ETA.
class ProgressUpdateScreen extends StatefulWidget {
  const ProgressUpdateScreen({super.key, required this.jobId});
  final String jobId;

  static const steps = [
    TimelineStep(title: 'Pending', subtitle: 'Checked in, waiting for a bay'),
    TimelineStep(title: 'Inspection / diagnosis', subtitle: 'FixProof or 6-step diagnosis'),
    TimelineStep(title: 'Customer approval', subtitle: 'Item-by-item decision'),
    TimelineStep(title: 'Repair', subtitle: 'Approved items only'),
    TimelineStep(title: 'Quality check'),
    TimelineStep(title: 'Completed'),
  ];

  static int stepOf(JobStatus s) {
    switch (s) {
      case JobStatus.waiting:
        return 0;
      case JobStatus.diagnosing:
        return 1;
      case JobStatus.awaitingApproval:
        return 2;
      case JobStatus.approved:
      case JobStatus.inProgress:
        return 3;
      case JobStatus.qualityCheck:
        return 4;
      case JobStatus.completed:
      case JobStatus.parked:
        return 6;
    }
  }

  @override
  State<ProgressUpdateScreen> createState() => _ProgressUpdateScreenState();
}

class _ProgressUpdateScreenState extends State<ProgressUpdateScreen> {
  final _noteCtrl = TextEditingController();
  int _delay = 0;
  String? _reason;

  static const _delays = [0, 15, 30, 60, 120];
  static const _reasons = ['Waiting for parts', 'Extra issue found', 'Customer not reachable', 'Bay busy'];

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  String _delayLabel(int m) => m == 0 ? 'On time' : (m < 60 ? '+$m min' : '+${m ~/ 60} hour${m >= 120 ? 's' : ''}');

  Widget _chip(String text, bool selected, VoidCallback onTap) {
    return ChoiceChip(
      label: Text(text),
      selected: selected,
      showCheckmark: false,
      selectedColor: AppColors.primarySoft,
      backgroundColor: AppColors.surface,
      labelStyle: TextStyle(fontWeight: FontWeight.w700, color: selected ? AppColors.primaryStrong : AppColors.body),
      side: BorderSide(color: selected ? AppColors.primaryBorder : AppColors.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      onSelected: (_) => onTap(),
    );
  }

  void _send(Job job) {
    final note = _noteCtrl.text.trim();
    if (_delay == 0 && note.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Add a note or pick a delay first')),
      );
      return;
    }
    if (_delay > 0) {
      AppServices.jobs.reportDelay(job, _delay, _reason ?? 'Delay', note: note);
    } else {
      AppServices.jobs.sendProgressUpdate(job, note);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Update sent. Queue ETAs refreshed.')),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.jobs,
      builder: (context, _) {
        final job = AppServices.jobs.byId(widget.jobId);
        return Scaffold(
          appBar: AppBar(title: const Text('Update progress')),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
            children: [
              Row(
                children: [
                  PlateBadge(plate: job.vehicle.plate),
                  const SizedBox(width: 10),
                  Expanded(child: Text('${job.vehicle.title} · Token #${job.token}', style: AppText.bodyStrong)),
                ],
              ),
              const SectionHeader(title: 'Where is this job?'),
              AppCard(
                padding: const EdgeInsets.all(18),
                child: StepTimeline(steps: ProgressUpdateScreen.steps, current: ProgressUpdateScreen.stepOf(job.status)),
              ),
              const SizedBox(height: 12),
              AppCard(
                color: AppColors.primarySoft,
                borderColor: AppColors.primaryBorder,
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => JobDetailScreen(jobId: job.id)),
                ),
                child: Row(
                  children: [
                    Icon(Icons.open_in_new_rounded, color: AppColors.primaryStrong),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('Move the job forward from the job screen (diagnosis, repair checklist, quality check).',
                          style: AppText.label.copyWith(color: AppColors.primaryStrong)),
                    ),
                  ],
                ),
              ),
              const SectionHeader(title: 'Running late?'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [for (final d in _delays) _chip(_delayLabel(d), _delay == d, () => setState(() => _delay = d))],
              ),
              if (_delay > 0) ...[
                const SizedBox(height: 14),
                Text('Reason', style: AppText.label),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [for (final r in _reasons) _chip(r, _reason == r, () => setState(() => _reason = r))],
                ),
              ],
              const SectionHeader(title: 'Progress note'),
              TextField(
                controller: _noteCtrl,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(hintText: 'e.g. Pads fitted, test drive pending.'),
              ),
              const SizedBox(height: 10),
              Text('Customers see an estimated time only. The workshop decides the final ETA.', style: AppText.caption),
            ],
          ),
          bottomNavigationBar: BottomActionBar(
            children: [
              FilledButton.icon(
                onPressed: () => _send(job),
                icon: const Icon(Icons.send_rounded),
                label: const Text('Send update'),
              ),
            ],
          ),
        );
      },
    );
  }
}
