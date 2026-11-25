import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../core/di/app_services.dart';
import '../../domain/job_entities.dart';

class RepairScreen extends StatefulWidget {
  const RepairScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<RepairScreen> createState() => _RepairScreenState();
}

class _RepairScreenState extends State<RepairScreen> {
  @override
  void initState() {
    super.initState();
    AppServices.jobs.addListener(_refresh);
  }

  @override
  void dispose() {
    AppServices.jobs.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(widget.jobId);
    final paused = job?.paused ?? false;

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Repair checklist'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            job?.vehicleReg ?? widget.jobId,
            style: TextStyle(
              color: AppColors.ink,
              fontWeight: FontWeight.w700,
              fontSize: 18,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            job?.summary ?? 'Repair work',
            style: TextStyle(color: AppColors.body),
          ),
          if (job != null) ...[
            const SizedBox(height: 8),
            Text(
              'Progress ${job.progressPercent}%',
              style: TextStyle(color: AppColors.body),
            ),
          ],
          const SizedBox(height: 20),
          const _CheckItem('Confirm parts on bay'),
          const _CheckItem('Complete assigned steps'),
          const _CheckItem('Capture FixProof photos'),
          const _CheckItem('Mark ready for QC'),
          if (job != null &&
              (job.status == JobStatus.inProgress ||
                  job.status == JobStatus.diagnosing)) ...[
            const SizedBox(height: 24),
            if (!paused)
              ElevatedButton(
                style: BronzeButtons.elevated,
                onPressed: () => AppServices.jobs.pauseJob(job),
                child: const Text('Pause repair'),
              )
            else
              ElevatedButton(
                style: BronzeButtons.elevated,
                onPressed: () => AppServices.jobs.resumeJob(job),
                child: const Text('Resume repair'),
              ),
          ],
        ],
      ),
    );
  }
}

class _CheckItem extends StatefulWidget {
  const _CheckItem(this.label);
  final String label;

  @override
  State<_CheckItem> createState() => _CheckItemState();
}

class _CheckItemState extends State<_CheckItem> {
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    return CheckboxListTile(
      value: _done,
      onChanged: (v) => setState(() => _done = v ?? false),
      title: Text(widget.label, style: TextStyle(color: AppColors.ink)),
      activeColor: AppColors.primary,
      contentPadding: EdgeInsets.zero,
    );
  }
}