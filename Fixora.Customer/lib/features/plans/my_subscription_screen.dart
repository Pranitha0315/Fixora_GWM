import 'package:flutter/material.dart';

import '../../core/core.dart';
import 'confirm_plan_screen.dart';
import 'offers_plans_screen.dart';
import 'plan_widgets.dart';

/// My Subscription: active plan and past plans.
class MySubscriptionScreen extends StatefulWidget {
  const MySubscriptionScreen({super.key});

  @override
  State<MySubscriptionScreen> createState() => _MySubscriptionScreenState();
}

class _MySubscriptionScreenState extends State<MySubscriptionScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    return ListenableBuilder(
      listenable: app,
      builder: (context, _) {
        final sub = app.subscription;
        return FxPage(
          title: 'My Subscription',
          subtitle: 'View your active and past plans',
          compactHeader: true,
          children: [
            FxPillTabs(
              labels: const ['Active Plan', 'Past Plans'],
              index: _tab,
              onChanged: (i) => setState(() => _tab = i),
            ),
            const SizedBox(height: 14),
            if (_tab == 0) ...[
              if (sub == null || !sub.isActive)
                EmptyState(
                  icon: Icons.workspace_premium_outlined,
                  title: 'No active plan',
                  message: 'Subscribe to a Fixora service plan to save on every service and get priority booking.',
                  action: SizedBox(
                    width: 220,
                    child: PrimaryButton(
                      label: 'Browse Plans',
                      height: 48,
                      onPressed: () => context.push(const OffersPlansScreen(initialTab: 1)),
                    ),
                  ),
                )
              else ...[
                FadeSlide(
                  child: PlanHeaderCard(
                    plan: sub.plan,
                    topRight: const StatusPill('Active', color: AppColors.success, icon: Icons.check_circle_rounded),
                  ),
                ),
                const SizedBox(height: 12),
                FadeSlide(
                  index: 1,
                  child: FxCard(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                    child: Column(
                      children: [
                        DetailRow(icon: Icons.calendar_month_outlined, label: 'Plan Duration', value: planDuration(sub.plan)),
                        DetailRow(icon: Icons.event_available_outlined, label: 'Start Date', value: dayMonthYear(sub.start)),
                        DetailRow(icon: Icons.event_busy_outlined, label: 'Expiry Date', value: dayMonthYear(sub.end)),
                        DetailRow(icon: Icons.credit_card_rounded, label: 'Payment Method', value: sub.paymentMethod),
                        DetailRow(icon: Icons.receipt_long_outlined, label: 'Transaction ID', value: sub.transactionId, last: true),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                FadeSlide(
                  index: 2,
                  child: FxCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Plan Benefits', style: AppText.h2),
                        const SizedBox(height: 10),
                        for (final f in sub.plan.features) FeatureLine(f, size: 14.5),
                        const SizedBox(height: 6),
                        _usage(sub),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                PrimaryButton(
                  label: 'Renew Plan',
                  icon: Icons.autorenew_rounded,
                  onPressed: () => context.push(ConfirmPlanScreen(plan: sub.plan)),
                ),
                const SizedBox(height: 10),
                OutlineButton2(
                  label: sub.plan.tier == PlanTier.platinum ? 'Change Plan' : 'Upgrade Plan',
                  icon: Icons.upgrade_rounded,
                  onPressed: () => context.push(const OffersPlansScreen(initialTab: 1)),
                ),
              ],
            ] else ...[
              if (app.pastSubscriptions.isEmpty)
                const EmptyState(
                  icon: Icons.history_rounded,
                  title: 'No past plans',
                  message: 'Expired plans will appear here.',
                ),
              for (var i = 0; i < app.pastSubscriptions.length; i++)
                FadeSlide(index: i, child: _PastPlanCard(sub: app.pastSubscriptions[i])),
            ],
          ],
        );
      },
    );
  }

  Widget _usage(Subscription sub) {
    final total = sub.end.difference(sub.start).inDays.clamp(1, 100000).toInt();
    final used = DateTime.now().difference(sub.start).inDays.clamp(0, total).toInt();
    final left = total - used;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text('Time left', style: AppText.label),
            const Spacer(),
            Text('$left days', style: AppText.label.copyWith(color: AppColors.link)),
          ],
        ),
        const SizedBox(height: 6),
        FxProgressBar(value: used / total, height: 8),
      ],
    );
  }
}

class _PastPlanCard extends StatelessWidget {
  final Subscription sub;
  const _PastPlanCard({required this.sub});

  @override
  Widget build(BuildContext context) {
    final st = PlanStyle.of(sub.plan.tier);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: AppShadows.soft,
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: st.bg),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Row(
                children: [
                  PlanMedal(sub.plan.tier, size: 46),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                          decoration: BoxDecoration(color: st.accent, borderRadius: BorderRadius.circular(16)),
                          child: Text(sub.plan.name,
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                        ),
                        const SizedBox(height: 6),
                        Text('${lkr(sub.plan.price)} / ${planDuration(sub.plan)}',
                            style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy, fontSize: 15)),
                      ],
                    ),
                  ),
                  const StatusPill('Expired', color: AppColors.danger, icon: Icons.schedule_rounded),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
              child: Row(
                children: [
                  _cell(Icons.calendar_month_outlined, 'Duration', planDuration(sub.plan)),
                  _cell(Icons.event_available_outlined, 'Start Date', dayMonthYear(sub.start)),
                  _cell(Icons.event_busy_outlined, 'End Date', dayMonthYear(sub.end)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cell(IconData icon, String label, String value) {
    return Expanded(
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.link),
          const SizedBox(width: 5),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppText.small.copyWith(fontSize: 10.5)),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(value, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
