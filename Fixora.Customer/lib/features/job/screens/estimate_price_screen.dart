import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../widgets/job_widgets.dart';
import 'approval_request_screen.dart';

/// "Estimate Price" - repair estimate breakdown.
class EstimatePriceScreen extends StatelessWidget {
  const EstimatePriceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    final awaiting = store.status == JobStatus.awaitingApproval ||
        store.status == JobStatus.changesRequested;
    return FxPage(
      title: 'Estimate Price',
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  icon: Icons.calculate_outlined,
                  title: 'Repair Estimate',
                  subtitle: 'Detailed cost estimate for the recommended fix.',
                  chip: JobChip(store.jobId),
                ),
                const SizedBox(height: 16),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 18),
                  child: HorizontalProgress(
                    titles: ['Diagnosis\nCompleted', 'Issue\nAnalysis', 'Estimate &\nApproval'],
                    subtitles: [null, null, null],
                    current: 2,
                    dot: 28,
                  ),
                ),
                const SizedBox(height: 16),
                Text('Estimate Breakdown', style: AppText.h2),
                const SizedBox(height: 10),
                EstimateTable(items: store.items),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.primarySofter,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.schedule_rounded, color: AppColors.link, size: 30),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Estimated Time', style: AppText.h3),
                            Text('Approximately 2.5 - 3 hours after approval',
                                style: AppText.muted.copyWith(fontSize: 13)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.successSoft,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.verified_user_outlined, color: AppColors.success, size: 28),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Price locked. Any extra work needs your approval in the app first.',
                          style: AppText.muted.copyWith(color: AppColors.text, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (awaiting)
                  PrimaryButton(
                    label: 'Proceed to Approval',
                    icon: Icons.check_rounded,
                    trailingIcon: Icons.arrow_forward_rounded,
                    onPressed: () => context.push(const ApprovalRequestScreen()),
                  )
                else
                  const Center(
                    child: StatusPill('Estimate already approved',
                        color: AppColors.success, icon: Icons.check_circle_rounded),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
