import 'package:flutter/material.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/di/app_services.dart';

class InvoiceScreen extends StatelessWidget {
  const InvoiceScreen({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    final job = AppServices.jobs.byId(jobId);
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('Invoice'),
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.ink,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              job?.vehicleReg ?? 'Job',
              style: TextStyle(
                color: AppColors.ink,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Draft invoice for token ${job?.token ?? '—'}',
              style: TextStyle(color: AppColors.body),
            ),
            const SizedBox(height: 24),
            _line('Labour', '₹1,200'),
            _line('Parts', '₹2,450'),
            const Divider(height: 28),
            _line('Total', '₹3,650', bold: true),
          ],
        ),
      ),
    );
  }

  Widget _line(String k, String v, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              k,
              style: TextStyle(
                color: AppColors.ink,
                fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
          Text(
            v,
            style: TextStyle(
              color: AppColors.ink,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}
