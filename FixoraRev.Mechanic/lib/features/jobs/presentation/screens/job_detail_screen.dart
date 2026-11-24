import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../core/di/app_services.dart';
import '../../domain/job_entities.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
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

  Future<void> _runAction(Job job) async {
    final jobs = AppServices.jobs;
    switch (job.status) {
      case JobStatus.waiting:
        jobs.setStatus(job.id, JobStatus.diagnosing);
        if (mounted) {
          context.toastish('Diagnosis started');
        }
      case JobStatus.diagnosing:
        jobs.setStatus(job.id, JobStatus.awaitingApproval);
        if (mounted) {
          context.push(RouteNames.repairProposalPath(job.id));
        }
      case JobStatus.awaitingApproval:
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Waiting for the customer to approve the proposal.'),
            ),
          );
        }
      case JobStatus.approved:
        jobs.setStatus(job.id, JobStatus.inProgress);
        if (mounted) context.push(RouteNames.repairPath(job.id));
      case JobStatus.inProgress:
        if (mounted) context.push(RouteNames.repairPath(job.id));
      case JobStatus.qualityCheck:
        jobs.setStatus(job.id, JobStatus.completed);
        if (mounted) context.push(RouteNames.invoicePath(job.id));
      case JobStatus.completed:
        if (mounted) context.push(RouteNames.invoicePath(job.id));
      case JobStatus.parked:
        if (mounted) context.push(RouteNames.passport);
    }
  }

  String _actionLabel(JobStatus status) => switch (status) {
        JobStatus.waiting => 'Start Diagnosis',
        JobStatus.diagnosing => 'Continue Diagnosis',
        JobStatus.awaitingApproval => 'Wait for customer approve',
        JobStatus.approved => 'Start Repair',
        JobStatus.inProgress => 'Open repair checklist',
        JobStatus.qualityCheck => 'Open quality check',
        JobStatus.completed => 'View invoice',
        JobStatus.parked => 'Open Passport entry',
      };

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(widget.jobId);
    if (job == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Job details')),
        body: const Center(child: Text('Job not found')),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: Text('Token ${job.token}'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            job.vehicleReg,
            style: TextStyle(
              color: AppColors.ink,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(job.vehicleModel, style: TextStyle(color: AppColors.body)),
          const SizedBox(height: 16),
          _row('Customer', job.customerName),
          _row('Status', job.status.label),
          _row('Priority', job.priority.label),
          if (job.bay != null) _row('Bay', job.bay!),
          const SizedBox(height: 12),
          Text('Summary', style: TextStyle(color: AppColors.body)),
          const SizedBox(height: 6),
          Text(job.summary, style: TextStyle(color: AppColors.ink, height: 1.4)),
          const SizedBox(height: 28),
          ElevatedButton(
            style: BronzeButtons.elevated,
            onPressed: () => _runAction(job),
            child: Text(_actionLabel(job.status)),
          ),
          if (job.status == JobStatus.inProgress) ...[
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () =>
                  context.push(RouteNames.additionalRepairPath(job.id)),
              child: const Text('Request additional repair'),
            ),
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: () {
                AppServices.jobs.setStatus(job.id, JobStatus.qualityCheck);
              },
              child: const Text('Send to quality check'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _row(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(k, style: TextStyle(color: AppColors.body)),
          ),
          Expanded(
            child: Text(
              v,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

extension on BuildContext {
  void toastish(String message) {
    ScaffoldMessenger.of(this).showSnackBar(SnackBar(content: Text(message)));
  }
}
