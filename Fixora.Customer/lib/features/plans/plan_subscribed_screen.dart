import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/core.dart';
import 'my_subscription_screen.dart';
import 'plan_widgets.dart';

/// "Plan Subscribed Successfully!"
class PlanSubscribedScreen extends StatelessWidget {
  const PlanSubscribedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final sub = app.subscription;
    if (sub == null) {
      return const FxPage(title: 'Subscription', children: [SizedBox()]);
    }
    final bottom = MediaQuery.of(context).padding.bottom;
    return Scaffold(
      body: FxBackground(
        child: SafeArea(
          child: ListView(
            padding: EdgeInsets.fromLTRB(16, 8, 16, 20 + bottom),
            children: [
              const Center(child: SuccessBurst(size: 80)),
              const SizedBox(height: 6),
              Text('Plan Subscribed\nSuccessfully!', textAlign: TextAlign.center, style: AppText.pageTitle),
              const SizedBox(height: 8),
              Text('You have successfully subscribed to the ${sub.plan.name}.',
                  textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 15, color: AppColors.text)),
              const SizedBox(height: 18),
              FadeSlide(child: PlanHeaderCard(plan: sub.plan, showPopular: false)),
              const SizedBox(height: 14),
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
                      DetailRow(
                        icon: Icons.receipt_long_outlined,
                        label: 'Transaction ID',
                        value: sub.transactionId,
                        last: true,
                        trailing: GestureDetector(
                          onTap: () {
                            Clipboard.setData(ClipboardData(text: sub.transactionId));
                            showFxSnack(context, 'Transaction ID copied');
                          },
                          child: Icon(Icons.copy_rounded, size: 17, color: AppColors.link),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.successSoft,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.success.o(0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.mark_email_read_outlined, color: AppColors.success, size: 28),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text.rich(
                        TextSpan(children: [
                          const TextSpan(text: 'Plan details have been sent to your email\n'),
                          TextSpan(text: app.profile.email, style: const TextStyle(fontWeight: FontWeight.w700)),
                        ]),
                        style: AppText.body.copyWith(fontSize: 13.5),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              PrimaryButton(
                label: 'Go to Home',
                icon: Icons.home_outlined,
                onPressed: () => NavController.goToTab(context, 0),
              ),
              const SizedBox(height: 10),
              OutlineButton2(
                label: 'View Subscription',
                icon: Icons.description_outlined,
                onPressed: () => Navigator.of(context).pushReplacement(fxRoute(const MySubscriptionScreen())),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
