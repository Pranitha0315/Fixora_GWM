import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';

/// Quick links from job detail into FixProof / proposal / evidence flows.
class FixproofJobSection extends StatelessWidget {
  const FixproofJobSection({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'FixProof',
          style: TextStyle(
            color: AppColors.ink,
            fontWeight: FontWeight.w700,
            fontSize: 16,
          ),
        ),
        const SizedBox(height: 10),
        _LinkTile(
          icon: Icons.photo_camera_outlined,
          label: 'Inspection capture',
          onTap: () => context.push(RouteNames.inspectionCapturePath(jobId)),
        ),
        _LinkTile(
          icon: Icons.description_outlined,
          label: 'Report review',
          onTap: () => context.push(RouteNames.reportReviewPath(jobId)),
        ),
        _LinkTile(
          icon: Icons.request_quote_outlined,
          label: 'Repair proposal',
          onTap: () => context.push(RouteNames.repairProposalPath(jobId)),
        ),
        _LinkTile(
          icon: Icons.verified_outlined,
          label: 'Evidence passport',
          onTap: () => context.push(RouteNames.evidencePassportPath(jobId)),
        ),
        _LinkTile(
          icon: Icons.timeline_outlined,
          label: 'Progress update',
          onTap: () => context.push(RouteNames.progressUpdatePath(jobId)),
        ),
      ],
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: AppColors.primary),
        title: Text(label, style: TextStyle(color: AppColors.ink)),
        trailing: Icon(Icons.chevron_right, color: AppColors.body),
        onTap: onTap,
      ),
    );
  }
}