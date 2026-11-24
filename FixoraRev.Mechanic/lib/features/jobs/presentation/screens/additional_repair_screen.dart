import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/bronze_buttons.dart';
import '../../../../core/di/app_services.dart';
import '../../domain/job_entities.dart';

class AdditionalRepairScreen extends StatefulWidget {
  const AdditionalRepairScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<AdditionalRepairScreen> createState() => _AdditionalRepairScreenState();
}

class _AdditionalRepairScreenState extends State<AdditionalRepairScreen> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(widget.jobId);
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Additional repair'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              job?.vehicleReg ?? widget.jobId,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Describe the extra work needed…',
                filled: true,
                fillColor: AppColors.surfaceElevated,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            const Spacer(),
            ElevatedButton(
              style: BronzeButtons.elevated,
              onPressed: () {
                AppServices.jobs
                    .setStatus(widget.jobId, JobStatus.awaitingApproval);
                Navigator.of(context).pop();
              },
              child: const Text('Send for customer approval'),
            ),
          ],
        ),
      ),
    );
  }
}
