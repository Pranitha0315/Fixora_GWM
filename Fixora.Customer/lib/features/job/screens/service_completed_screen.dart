import 'package:flutter/material.dart';

import '../../../core/core.dart';
import 'invoice_screen.dart';
import 'pay_cash_sheet.dart';

/// "Service Completed" - vehicle ready + pay options.
class ServiceCompletedScreen extends StatelessWidget {
  const ServiceCompletedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final paid = store.status == JobStatus.paid;
        return FxPage(
          title: 'Service Completed',
          children: [
            FadeSlide(
              child: FxCard(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
                child: Column(
                  children: [
                    SizedBox(
                      height: 230,
                      child: Stack(
                        alignment: Alignment.topCenter,
                        children: [
                          Positioned(
                            top: 70,
                            left: 0,
                            right: 0,
                            child: TweenAnimationBuilder<double>(
                              tween: Tween(begin: 40, end: 0),
                              duration: const Duration(milliseconds: 900),
                              curve: Curves.easeOutCubic,
                              builder: (_, v, child) => Transform.translate(
                                offset: Offset(v, 0),
                                child: Opacity(opacity: (1 - v / 40).clamp(0.0, 1.0).toDouble(), child: child),
                              ),
                              child: Container(
                                height: 160,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(18),
                                  gradient: RadialGradient(
                                    colors: [AppColors.adapt(Color(0xFFE0FCFA)), Color(0x00FFFFFF)],
                                    radius: 0.75,
                                  ),
                                ),
                                child: const CutOutImage(Img.carHero),
                              ),
                            ),
                          ),
                          const Positioned(top: 0, child: SuccessBurst(size: 62)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(paid ? 'Thank you for your payment!' : 'Your vehicle is ready!',
                        textAlign: TextAlign.center,
                        style: AppText.pageTitle.copyWith(fontSize: 25)),
                    const SizedBox(height: 6),
                    Text('The service has been completed successfully.',
                        textAlign: TextAlign.center,
                        style: AppText.muted.copyWith(fontSize: 14.5)),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 34, vertical: 12),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                            colors: [AppColors.adapt(Color(0xFFECFDFC)), AppColors.adapt(Color(0xFFE0FCFA))]),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        children: [
                          Text(paid ? 'Amount Paid' : 'Total Amount',
                              style: AppText.muted.copyWith(fontSize: 14, color: AppColors.navy)),
                          const SizedBox(height: 2),
                          TweenAnimationBuilder<double>(
                            tween: Tween(begin: 0, end: store.total),
                            duration: const Duration(milliseconds: 1100),
                            curve: Curves.easeOutCubic,
                            builder: (_, v, __) => Text(lkr(v),
                                style: TextStyle(
                                    fontSize: 28,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.link)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    VehicleStrip(
                      vehicle: store.vehicle,
                      trailing: Icon(Icons.chevron_right_rounded, color: AppColors.navy),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _MiniStat(icon: Icons.timer_outlined, label: 'Time taken', value: '2h 45m')),
                        const SizedBox(width: 8),
                        Expanded(child: _MiniStat(icon: Icons.photo_library_outlined, label: 'Evidence', value: '${store.media.length} files')),
                        const SizedBox(width: 8),
                        const Expanded(child: _MiniStat(icon: Icons.verified_outlined, label: 'Warranty', value: '6 months')),
                      ],
                    ),
                    const SizedBox(height: 16),
                    PrimaryButton(
                      label: 'View Invoice',
                      icon: Icons.description_outlined,
                      onPressed: () => context.push(const InvoiceScreen()),
                    ),
                    const SizedBox(height: 10),
                    if (!paid)
                      OutlineButton2(
                        label: 'Pay at Garage',
                        icon: Icons.payments_outlined,
                        onPressed: () => showPayCashSheet(context),
                      )
                    else
                      const StatusPill('Paid · Thank you!', color: AppColors.success, icon: Icons.check_circle_rounded),
                    const SizedBox(height: 14),
                    const _RateService(),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _MiniStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _MiniStat({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: AppColors.primarySofter,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Icon(icon, color: AppColors.link, size: 20),
          const SizedBox(height: 4),
          Text(value, style: AppText.h3.copyWith(fontSize: 13.5)),
          Text(label, style: AppText.small.copyWith(fontSize: 10.5)),
        ],
      ),
    );
  }
}

class _RateService extends StatefulWidget {
  const _RateService();

  @override
  State<_RateService> createState() => _RateServiceState();
}

class _RateServiceState extends State<_RateService> {
  int _stars = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(_stars == 0 ? 'How was your service?' : 'Thanks for rating us!',
            style: AppText.label),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (i) {
            final on = i < _stars;
            return GestureDetector(
              onTap: () => setState(() => _stars = i + 1),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 3),
                child: AnimatedScale(
                  scale: on ? 1.12 : 1,
                  duration: const Duration(milliseconds: 180),
                  child: Icon(on ? Icons.star_rounded : Icons.star_outline_rounded,
                      size: 32, color: on ? const Color(0xFFFFB020) : AppColors.textFaint),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }
}
