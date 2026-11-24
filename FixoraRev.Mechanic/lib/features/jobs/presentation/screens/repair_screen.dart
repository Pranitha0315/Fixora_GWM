import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';

class RepairScreen extends StatelessWidget {
  const RepairScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(jobId);
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
            job?.vehicleReg ?? jobId,
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
          const SizedBox(height: 20),
          const _CheckItem('Confirm parts on bay'),
          const _CheckItem('Complete assigned steps'),
          const _CheckItem('Capture FixProof photos'),
          const _CheckItem('Mark ready for QC'),
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
