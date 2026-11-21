import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/models.dart';
import '../../../data/repositories/job_store.dart';

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
        final total = store.items.fold<double>(0, (s, i) => s + i.amount);
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('Service Completed'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(16, 24, 16, 18),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSolid,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: const BoxDecoration(
                        gradient: AppColors.successGradient,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.check_rounded, color: Colors.white, size: 40),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      paid ? 'Thank you for your payment!' : 'Your vehicle is ready!',
                      textAlign: TextAlign.center,
                      style: AppText.pageTitle.copyWith(fontSize: 24),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'The service has been completed successfully.',
                      textAlign: TextAlign.center,
                      style: AppText.muted.copyWith(fontSize: 14.5),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      decoration: BoxDecoration(
                        color: AppColors.primarySofter,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        children: [
                          Text(
                            paid ? 'Amount Paid' : 'Total Amount',
                            style: AppText.muted.copyWith(fontSize: 14, color: AppColors.navy),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'LKR ${total.toStringAsFixed(0)}',
                            style: AppText.h1.copyWith(fontSize: 28),
                          ),
                          Text(
                            '${store.vehicle.name} · ${store.jobId}',
                            style: AppText.small,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (!paid)
                SizedBox(
                  height: 50,
                  child: FilledButton.icon(
                    onPressed: () {
                      store.advance();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Payment recorded (demo)'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    },
                    icon: const Icon(Icons.payments_outlined),
                    label: const Text('Pay at counter'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
