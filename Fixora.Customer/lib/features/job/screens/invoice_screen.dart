import 'package:flutter/material.dart';

import '../../../core/navigation/nav.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/media.dart';
import '../../../data/models/models.dart';
import '../../../data/repositories/job_store.dart';
import '../../../data/repositories/loyalty_store.dart';
import '../../rewards/my_rewards_screen.dart';
import 'pay_cash_sheet.dart';
import 'view_photos_screen.dart';

/// Service invoice with Paid / Completed status and evidence.
class InvoiceScreen extends StatelessWidget {
  const InvoiceScreen({super.key});

  static String _lkr(num value) {
    final n = value.toStringAsFixed(value % 1 == 0 ? 0 : 2);
    final parts = n.split('.');
    final buf = StringBuffer();
    final s = parts[0];
    for (var i = 0; i < s.length; i++) {
      final fromEnd = s.length - i;
      if (i > 0 && fromEnd % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    if (parts.length > 1) buf.write('.${parts[1]}');
    return 'LKR $buf';
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([store, LoyaltyStore.instance]),
      builder: (context, _) {
        final paid = store.status == JobStatus.paid;
        final photos = store.media.where((m) => m.kind == MediaKind.photo).toList();
        final subtotal = store.subtotal;
        final tax = store.tax;
        final total = store.total;
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('Invoice'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
            actions: [
              TextButton.icon(
                onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Invoice PDF saved to Downloads'), behavior: SnackBarBehavior.floating),
                ),
                icon: const Icon(Icons.download_rounded, size: 18),
                label: const Text('Download'),
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
                decoration: BoxDecoration(
                  color: AppColors.surfaceSolid,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.description_outlined, color: AppColors.link, size: 28),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Service Invoice', style: AppText.h2.copyWith(fontSize: 19)),
                              const SizedBox(height: 3),
                              Text(store.jobId, style: AppText.muted.copyWith(fontSize: 13)),
                            ],
                          ),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: AppColors.success.o(0.12),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.check_circle_rounded, size: 14, color: AppColors.success),
                                  const SizedBox(width: 4),
                                  Text(
                                    paid ? 'Paid' : 'Completed',
                                    style: const TextStyle(
                                      color: AppColors.success,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 11.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text('27 Aug 2026, 02:10 PM', style: AppText.small.copyWith(fontSize: 10.5)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(store.vehicle.type.icon, color: AppColors.link),
                      title: Text(store.vehicle.name, style: AppText.label),
                      subtitle: Text('${store.vehicle.plate} · ${store.vehicle.mileageKm} km', style: AppText.small),
                    ),
                    const SizedBox(height: 8),
                    Text('Service Details', style: AppText.h2),
                    const SizedBox(height: 10),
                    for (final it in store.items)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          children: [
                            Expanded(child: Text(it.name, style: AppText.label)),
                            Text(_lkr(it.amount), style: AppText.label),
                          ],
                        ),
                      ),
                    const Divider(),
                    _kv('Subtotal', _lkr(subtotal)),
                    _kv('Tax (VAT 15%)', _lkr(tax)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          Expanded(child: Text('Total Amount', style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.link))),
                          Text(_lkr(total), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.navy)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text('Media (Service Evidence)', style: AppText.h2.copyWith(fontSize: 15)),
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 64,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: photos.isEmpty ? 0 : photos.length.clamp(0, 6),
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (_, i) => SizedBox(
                          width: 76,
                          child: MediaTile(
                            item: photos[i],
                            radius: 10,
                            showBadge: false,
                            showExpand: false,
                            onTap: () => PhotoViewerScreen.open(context, photos, i),
                          ),
                        ),
                      ),
                    ),
                    if (photos.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => context.push(const ViewPhotosScreen()),
                        child: Text('View All (${store.media.length})'),
                      ),
                    ],
                    const SizedBox(height: 12),
                    if (paid)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppColors.successSoft,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.verified_rounded, color: AppColors.success, size: 28),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                'Paid ${_lkr(store.paidAmount ?? total)} by ${store.paymentMethod ?? 'card'} at the garage.',
                                style: AppText.label,
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      SizedBox(
                        height: 50,
                        child: FilledButton.icon(
                          onPressed: () => showPayCashSheet(context),
                          icon: const Icon(Icons.payments_outlined),
                          label: const Text('Pay at Garage'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                          ),
                        ),
                      ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => context.push(const MyRewardsScreen()),
                      child: const Text('View rewards points'),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Row(
          children: [
            Expanded(child: Text(k, style: AppText.small)),
            Text(v, style: AppText.small.copyWith(fontWeight: FontWeight.w700, color: AppColors.navy)),
          ],
        ),
      );
}
