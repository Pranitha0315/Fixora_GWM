import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/common.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../repair_proposal/domain/entities/repair_item.dart';
import '../../../repair_proposal/presentation/providers/proposal_provider.dart';
import '../providers/fixproof_provider.dart';

/// "Customer proof" block shown on the job screen: FixProof report,
/// item-by-item approval, before/after evidence and delay updates.
class FixProofJobSection extends ConsumerWidget {
  const FixProofJobSection({super.key, required this.job});
  final Job job;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final report = ref.watch(reportStateProvider)[job.id] ?? ReportState.notStarted;
    final items = ref.watch(proposalProvider)[job.id] ?? const <RepairItem>[];
    final approved = items.where((i) => i.decision == ApprovalDecision.approved).length;
    final pending = items.where((i) => i.decision == ApprovalDecision.pending).length;
    final notSent = items.where((i) => i.decision == ApprovalDecision.notSent).length;

    void open(String route) => context.pushRoute(route, extra: job.id);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Customer proof'),
        _Row(
          icon: Icons.photo_camera_rounded,
          title: 'FixProof inspection',
          subtitle: report.label,
          done: report == ReportState.published,
          onTap: () => open(report == ReportState.draft ? RouteNames.reportReview : RouteNames.inspectionCapture),
        ),
        _Row(
          icon: Icons.request_quote_rounded,
          title: 'Item-by-item approval',
          subtitle: items.isEmpty
              ? 'No items yet'
              : '$approved approved · $pending waiting${notSent > 0 ? ' · $notSent not sent' : ''}',
          done: items.isNotEmpty && pending == 0 && notSent == 0,
          onTap: () => open(RouteNames.repairProposal),
        ),
        _Row(
          icon: Icons.update_rounded,
          title: 'Progress note',
          subtitle: 'Sent to the manager and customer',
          done: false,
          onTap: () => open(RouteNames.progressUpdate),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.subtitle, required this.done, required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: onTap,
        child: Row(
          children: [
            IconBox(icon: icon),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: AppText.bodyStrong),
                  const SizedBox(height: 2),
                  Text(subtitle, style: AppText.caption),
                ],
              ),
            ),
            Icon(done ? Icons.check_circle_rounded : Icons.chevron_right_rounded,
                color: done ? const Color(0xFF16A34A) : AppColors.muted),
          ],
        ),
      ),
    );
  }
}
