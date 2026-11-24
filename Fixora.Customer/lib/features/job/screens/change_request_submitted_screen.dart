import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/core.dart';

/// "Change Request Submitted" confirmation.
class ChangeRequestSubmittedScreen extends StatelessWidget {
  final ChangeRequest request;
  const ChangeRequestSubmittedScreen({super.key, required this.request});

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return FxPage(
      title: 'Change Request Submitted',
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  icon: Icons.send_rounded,
                  title: 'Request Submitted Successfully',
                  subtitle: 'Your change request has been received and sent for review.',
                  chip: JobChip(store.jobId),
                ),
                const SizedBox(height: 8),
                const Center(child: _ClipboardArt()),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.successSoft,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.success.o(0.2)),
                  ),
                  child: IntrinsicHeight(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Change Request No.', style: AppText.small.copyWith(color: AppColors.navy)),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Flexible(
                                    child: FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: Text(request.id,
                                          style: TextStyle(
                                              fontSize: 21,
                                              fontWeight: FontWeight.w800,
                                              color: AppColors.successText)),
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  GestureDetector(
                                    onTap: () {
                                      Clipboard.setData(ClipboardData(text: request.id));
                                      showFxSnack(context, 'Request number copied');
                                    },
                                    child: Icon(Icons.copy_rounded, size: 18, color: AppColors.navy),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        Container(width: 1, color: AppColors.success.o(0.25), margin: const EdgeInsets.symmetric(horizontal: 12)),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Status', style: AppText.small.copyWith(color: AppColors.navy)),
                            const SizedBox(height: 6),
                            StatusPill(request.status, color: AppColors.primary, icon: Icons.schedule_rounded),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                VehicleStrip(
                  vehicle: store.vehicle,
                  compact: true,
                  trailing: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('Estimate Amount', style: AppText.small.copyWith(color: AppColors.navy)),
                      Text(lkr(store.total),
                          style: TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.link)),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text('Requested Changes', style: AppText.h2),
                const SizedBox(height: 10),
                for (final c in request.changes)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.primarySofter,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.settings_suggest_outlined, color: AppColors.link),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(c, style: AppText.h3.copyWith(fontSize: 14.5)),
                              const SizedBox(height: 2),
                              Text(request.details, style: AppText.muted.copyWith(fontSize: 12.5)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSolid,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.info_outline_rounded, color: AppColors.link),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Next Step', style: AppText.h3.copyWith(fontSize: 14.5)),
                            const SizedBox(height: 2),
                            Text(
                              'Our service team will review your request and update the estimate. '
                              'You will be notified once the revised estimate is ready.',
                              style: AppText.muted.copyWith(fontSize: 12.5),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: OutlineButton2(
                        label: 'View Request',
                        icon: Icons.visibility_outlined,
                        height: 50,
                        fontSize: 14.5,
                        onPressed: () => _showRequest(context),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: PrimaryButton(
                        label: 'Back to Dashboard',
                        icon: Icons.home_outlined,
                        height: 50,
                        fontSize: 14,
                        onPressed: () => NavController.goToTab(context, 0),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _showRequest(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(24)),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(request.id, style: AppText.h1)),
                  StatusPill(request.status, color: AppColors.primary),
                ],
              ),
              const SizedBox(height: 4),
              Text('Submitted ${dayTime(request.createdAt)}', style: AppText.muted),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final c in request.changes)
                    Chip(
                      label: Text(c),
                      backgroundColor: AppColors.primarySoft,
                      side: BorderSide.none,
                      labelStyle: const TextStyle(color: AppColors.primaryDark, fontWeight: FontWeight.w600),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Text(request.details, style: AppText.body),
              const SizedBox(height: 16),
              Row(
                children: [
                  const CircleAvatar(radius: 18, backgroundImage: AssetImage(Img.mechanic)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text('Assigned to ${MockData.advisorName} (Service Advisor)',
                        style: AppText.label),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClipboardArt extends StatelessWidget {
  const _ClipboardArt();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 210,
      height: 150,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            bottom: 10,
            child: Container(
              width: 190,
              height: 70,
              decoration: BoxDecoration(
                color: AppColors.primarySoft,
                borderRadius: BorderRadius.circular(60),
              ),
            ),
          ),
          TweenAnimationBuilder<double>(
            tween: Tween(begin: 0.6, end: 1),
            duration: const Duration(milliseconds: 700),
            curve: Curves.elasticOut,
            builder: (_, v, child) => Transform.scale(scale: v, child: child),
            child: Container(
              width: 92,
              height: 112,
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.primary, width: 3),
                boxShadow: AppShadows.card,
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < 3; i++)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 5, horizontal: 14),
                      child: Row(
                        children: [
                          Icon(Icons.check_rounded, size: 16, color: AppColors.link),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Container(
                              height: 5,
                              decoration: BoxDecoration(
                                color: AppColors.primary.o(0.35),
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
          const Positioned(
            right: 48,
            bottom: 14,
            child: SuccessBurst(size: 40),
          ),
        ],
      ),
    );
  }
}
