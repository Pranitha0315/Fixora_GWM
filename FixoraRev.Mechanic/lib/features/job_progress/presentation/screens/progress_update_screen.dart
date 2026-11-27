import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../../core/widgets/step_timeline.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../jobs/presentation/screens/job_detail_screen.dart';

/// Progress note for the manager and the customer (backend action "progress").
class ProgressUpdateScreen extends StatefulWidget {
  const ProgressUpdateScreen({super.key, required this.jobId});
  final String jobId;

  static const steps = [
    TimelineStep(title: 'Pending', subtitle: 'Checked in, waiting for a bay'),
    TimelineStep(title: 'In progress', subtitle: 'Inspection and repair'),
    TimelineStep(title: 'Awaiting review', subtitle: 'With the manager'),
    TimelineStep(title: 'Completed'),
  ];

  static int stepOf(JobStatus s) {
    switch (s) {
      case JobStatus.waiting:
        return 0;
      case JobStatus.diagnosing:
      case JobStatus.inProgress:
        return 1;
      case JobStatus.awaitingApproval:
        return 2;
      case JobStatus.completed:
        return 3;
    }
  }

  @override
  State<ProgressUpdateScreen> createState() => _ProgressUpdateScreenState();
}

class _ProgressUpdateScreenState extends State<ProgressUpdateScreen> {
  final _noteCtrl = TextEditingController();

  @override
  void dispose() {
    _noteCtrl.dispose();
    super.dispose();
  }

  void _send(Job job) {
    final note = _noteCtrl.text.trim();
    if (note.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Write a short note first')),
      );
      return;
    }
    AppServices.jobs.sendProgressUpdate(job, note);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Update sent.')),
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
                      child: Text('Back to the job card',
                          style: AppText.label.copyWith(color: AppColors.primaryStrong)),
                    ),
                  ],
                ),
              ),
              const SectionHeader(title: 'Progress note'),
              TextField(
                controller: _noteCtrl,
                minLines: 3,
                maxLines: 5,
                decoration: const InputDecoration(hintText: 'e.g. Pads fitted, test drive pending.'),
              ),
              const SizedBox(height: 10),
              Text('The manager and the customer see this note.', style: AppText.caption),
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
