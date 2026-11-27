import 'package:flutter/material.dart';

import '../../app/theme/app_colors.dart';
import '../../features/fixproof/domain/entities/inspection_issue.dart';
import '../../features/jobs/domain/job_entities.dart';
import '../../features/repair_proposal/domain/entities/repair_item.dart';

enum ChipTone { orange, success, warning, danger, info, neutral }

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, this.tone = ChipTone.neutral, this.icon});

  final String label;
  final ChipTone tone;
  final IconData? icon;

  factory StatusChip.job(JobStatus s) => StatusChip(label: s.label, tone: _jobTone(s));
  factory StatusChip.decision(ApprovalDecision d) => StatusChip(label: d.label, tone: _decisionTone(d));
  factory StatusChip.severity(IssueSeverity s, {bool tamil = false}) =>
      StatusChip(label: tamil ? s.labelTa : s.label, tone: _severityTone(s));

  static ChipTone _jobTone(JobStatus s) {
    switch (s) {
      case JobStatus.waiting:
        return ChipTone.info;
      case JobStatus.diagnosing:
      case JobStatus.inProgress:
        return ChipTone.orange;
      case JobStatus.awaitingApproval:
        return ChipTone.warning;
      case JobStatus.completed:
        return ChipTone.success;
    }
  }

  static ChipTone _decisionTone(ApprovalDecision d) {
    switch (d) {
      case ApprovalDecision.notSent:
        return ChipTone.neutral;
      case ApprovalDecision.pending:
        return ChipTone.warning;
      case ApprovalDecision.approved:
        return ChipTone.success;
      case ApprovalDecision.declined:
        return ChipTone.danger;
    }
  }

  static ChipTone _severityTone(IssueSeverity s) {
    switch (s) {
      case IssueSeverity.critical:
        return ChipTone.danger;
      case IssueSeverity.soon:
        return ChipTone.warning;
      case IssueSeverity.ok:
        return ChipTone.success;
    }
  }

  (Color, Color) get _colors {
    switch (tone) {
      case ChipTone.orange:
        return (AppColors.primarySoft, AppColors.primaryStrong);
      case ChipTone.success:
        return (AppColors.successSoft, AppColors.success);
      case ChipTone.warning:
        return (AppColors.warningSoft, AppColors.warning);
      case ChipTone.danger:
        return (AppColors.dangerSoft, AppColors.danger);
      case ChipTone.info:
        return (AppColors.infoSoft, AppColors.info);
      case ChipTone.neutral:
        return (AppColors.surfaceAlt, AppColors.body);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg, height: 1.2),
          ),
        ],
      ),
    );
  }
}
