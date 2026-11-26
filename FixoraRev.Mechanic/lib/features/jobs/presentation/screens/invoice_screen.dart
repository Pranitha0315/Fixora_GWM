import 'package:flutter/material.dart';

import '../../../../core/di/app_services.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/buttons.dart';
import '../../../../core/widgets/rev_common.dart';
import '../../../../core/widgets/fixora_logo.dart';

/// Invoice generated on completion (FR-17); the customer pays in the
/// Customer app or at the counter.
class InvoiceScreen extends StatelessWidget {
  const InvoiceScreen(
      {super.key, required this.jobId, this.justCompleted = false});
  final String jobId;
  final bool justCompleted;

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(jobId);
    final estimate = job.estimate;
    final completed = job.completedAt ?? DateTime.now();

    return Scaffold(
      appBar: AppBar(title: const Text('Invoice')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          if (justCompleted)
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.successSoft,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Icon(Icons.check_circle_rounded, color: AppColors.success),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                        'Job completed. Invoice sent to the customer for payment.',
                        style: TextStyle(
                            color: AppColors.success,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: AppColors.softGradient,
                    borderRadius:
                        BorderRadius.vertical(top: Radius.circular(18)),
                  ),
                  child: Row(
                    children: [
                      const FixoraLogo(size: 18, showTagline: false),
                      const Spacer(),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('INV-${job.id.replaceAll('JOB-', '')}',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w800)),
                          Text(Fmt.date(completed),
                              style: TextStyle(
                                  color: AppColors.inkSoft, fontSize: 12.5)),
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      InfoRow('Customer', job.customer.name),
                      InfoRow('Vehicle',
                          '${job.vehicle.title} · ${job.vehicle.plate}'),
                      InfoRow('Mileage', Fmt.km(job.vehicle.mileageKm)),
                      InfoRow('Service', job.serviceType),
                      const Divider(height: 26),
                      if (estimate == null)
                        const EmptyState(
                          compact: true,
                          icon: Icons.receipt_long_outlined,
                          title: 'No billable items',
                          message: 'This job has no estimate, so there is nothing to bill yet.',
                        )
                      else ...[
                        for (final l in estimate.lines)
                          InfoRow('${l.name} ×${l.qty}', Fmt.lkr(l.total)),
                        InfoRow('Labour ${Fmt.hours(estimate.labourHours)}',
                            Fmt.lkr(estimate.labourTotal)),
                        const Divider(height: 26),
                        InfoRow('Total', Fmt.lkr(estimate.total),
                            bold: true, valueColor: AppColors.primaryDark),
                      ],
                      const SizedBox(height: 12),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Pill(
                          label: 'Awaiting payment · Customer app',
                          color: AppColors.warning,
                          icon: Icons.payments_outlined,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: BottomActionBar(
        child: PrimaryButton(
          label: 'Back to queue',
          icon: Icons.format_list_numbered_rounded,
          onPressed: () => context.popToRoot(),
        ),
      ),
    );
  }
}
