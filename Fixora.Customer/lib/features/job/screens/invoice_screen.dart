import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../../rewards/my_rewards_screen.dart';
import 'pay_cash_sheet.dart';
import 'view_photos_screen.dart';

/// "Invoice" - service invoice with evidence and cash payment.
class InvoiceScreen extends StatelessWidget {
  const InvoiceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([store, LoyaltyStore.instance]),
      builder: (context, _) {
        final paid = store.status == JobStatus.paid;
        final photos = store.media.where((m) => m.kind == MediaKind.photo).toList();
        return FxPage(
          title: 'Invoice',
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              PillButton(
                label: 'Download',
                icon: Icons.download_rounded,
                onTap: () => showFxSnack(context, 'Invoice PDF saved to Downloads'),
              ),
              const SizedBox(width: 8),
              PillButton(
                label: 'Share',
                icon: Icons.share_outlined,
                onTap: () => showFxSnack(context, 'Share link copied', icon: Icons.link_rounded),
              ),
            ],
          ),
          children: [
            FadeSlide(
              child: FxCard(
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const IconTile(icon: Icons.description_outlined),
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
                            StatusPill(paid ? 'Paid' : 'Completed',
                                color: AppColors.success, icon: Icons.check_circle_rounded),
                            const SizedBox(height: 6),
                            Text('27 Aug 2026, 02:10 PM', style: AppText.small.copyWith(fontSize: 10.5)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    VehicleStrip(
                      vehicle: store.vehicle,
                      compact: true,
                      trailing: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _miniInfo(Icons.build_outlined, 'Service Type', 'Diagnosis & Repair'),
                          const SizedBox(height: 4),
                          _miniInfo(Icons.speed_rounded, 'Mileage', '${groupDigits(store.vehicle.mileageKm)} km'),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text('Service Details', style: AppText.h2),
                    const SizedBox(height: 10),
                    _InvoiceTable(items: store.items),
                    const SizedBox(height: 12),
                    LayoutBuilder(
                      builder: (context, c) {
                        final note = Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.primarySofter,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Icon(Icons.sticky_note_2_outlined, size: 18, color: AppColors.link),
                                  SizedBox(width: 6),
                                  Text('Service Note', style: AppText.label),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Replaced thermostat, coolant and front brake pads. '
                                'Completed wheel alignment. Test drive OK.',
                                style: AppText.muted.copyWith(fontSize: 12),
                              ),
                            ],
                          ),
                        );
                        final totals = Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: AppColors.surfaceSolid,
                            borderRadius: BorderRadius.circular(14),
                          ),
                          child: Column(
                            children: [
                              KVRow('Subtotal', lkr(store.invoiceSubtotal ?? store.subtotal, decimals: true),
                                  labelStyle: AppText.small.copyWith(color: AppColors.text),
                                  valueStyle: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w700)),
                              if (store.loyaltyDiscount > 0)
                                KVRow('Loyalty points', '− ${lkr(store.loyaltyDiscount, decimals: true)}',
                                    labelStyle: AppText.small.copyWith(color: AppColors.text),
                                    valueStyle: AppText.small.copyWith(color: AppColors.successText, fontWeight: FontWeight.w700)),
                              KVRow('Tax (VAT 15%)', lkr(store.tax, decimals: true),
                                  labelStyle: AppText.small.copyWith(color: AppColors.text),
                                  valueStyle: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w700)),
                              const SizedBox(height: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                                decoration: BoxDecoration(
                                  color: AppColors.primarySoft,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text('Total Amount',
                                          style: TextStyle(
                                              fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.link)),
                                    ),
                                    Text(lkr(store.total, decimals: true),
                                        style: TextStyle(
                                            fontSize: 14.5, fontWeight: FontWeight.w800, color: AppColors.navy)),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        );
                        if (c.maxWidth < 360) {
                          return Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [totals, const SizedBox(height: 10), note],
                          );
                        }
                        return IntrinsicHeight(
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Expanded(child: note),
                              const SizedBox(width: 10),
                              Expanded(child: totals),
                            ],
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 10),
                    _PointsStrip(store: store, paid: paid),
                    SectionTitle(
                      'Media (Service Evidence)',
                      icon: Icons.photo_library_outlined,
                      action: 'View All (${store.media.length})',
                      onAction: () => context.push(const ViewPhotosScreen()),
                    ),
                    SizedBox(
                      height: 64,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        itemCount: photos.length,
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
                    const SizedBox(height: 16),
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
                                'Paid ${lkr(store.paidAmount ?? store.total, decimals: true)} by ${store.paymentMethod ?? 'card'} at the garage.',
                                style: AppText.label,
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      PrimaryButton(
                        label: 'Pay at Garage',
                        icon: Icons.payments_outlined,
                        onPressed: () => showPayCashSheet(context),
                      ),
                  ],
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  static Widget _miniInfo(IconData icon, String label, String value) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppColors.navy),
        const SizedBox(width: 6),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.navy)),
            Text(value, style: TextStyle(fontSize: 10.5, color: AppColors.textMuted)),
          ],
        ),
      ],
    );
  }
}

class _InvoiceTable extends StatelessWidget {
  final List<EstimateItem> items;
  const _InvoiceTable({required this.items});

  @override
  Widget build(BuildContext context) {
    final head = TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: AppColors.navy);
    final cell = TextStyle(fontSize: 11, color: AppColors.text);
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Container(
              color: AppColors.primarySoft,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
              child: Row(
                children: [
                  SizedBox(width: 18, child: Text('#', style: head)),
                  Expanded(flex: 9, child: Text('Description', style: head)),
                  Expanded(flex: 3, child: Text('Qty', textAlign: TextAlign.center, style: head)),
                  Expanded(flex: 5, child: Text('Unit (LKR)', textAlign: TextAlign.right, style: head)),
                  Expanded(flex: 5, child: Text('Amount', textAlign: TextAlign.right, style: head)),
                ],
              ),
            ),
            for (var i = 0; i < items.length; i++)
              Container(
                color: i.isOdd ? AppColors.primarySofter : AppColors.surface,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
                child: Row(
                  children: [
                    SizedBox(width: 18, child: Text('${i + 1}', style: cell)),
                    Expanded(
                        flex: 9,
                        child: Text(items[i].name,
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: cell)),
                    Expanded(
                        flex: 3,
                        child: Text(items[i].name.contains('Pads') ? '1 Set' : '${items[i].qty}',
                            textAlign: TextAlign.center, style: cell)),
                    Expanded(
                        flex: 5,
                        child: Text(groupDigits(items[i].unitPrice, decimals: true),
                            textAlign: TextAlign.right, style: cell)),
                    Expanded(
                        flex: 5,
                        child: Text(groupDigits(items[i].amount, decimals: true),
                            textAlign: TextAlign.right,
                            style: cell.copyWith(fontWeight: FontWeight.w700, color: AppColors.navy))),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// One line about loyalty points on this bill: the discount already applied, the
/// discount the points will give when the garage issues it, or the points this bill earns.
class _PointsStrip extends StatelessWidget {
  final JobStore store;
  final bool paid;
  const _PointsStrip({required this.store, required this.paid});

  @override
  Widget build(BuildContext context) {
    final l = LoyaltyStore.instance;
    final IconData icon;
    final String text;
    if (paid) {
      final earned = ((store.paidAmount ?? store.total) / 100).floor();
      if (earned <= 0) return const SizedBox.shrink();
      icon = Icons.stars_rounded;
      text = store.loyaltyDiscount > 0
          ? 'You saved ${lkr(store.loyaltyDiscount)} with points, and this bill earns $earned new points.'
          : 'This bill earns $earned points for your next service.';
    } else if (store.loyaltyDiscount > 0) {
      icon = Icons.redeem_rounded;
      text = '${(store.loyaltyDiscount / l.rupeesPerPoint).round()} points took ${lkr(store.loyaltyDiscount)} off this invoice.';
    } else if (store.invoiceIssued) {
      return const SizedBox.shrink();
    } else {
      final base = store.invoiceSubtotal ?? store.subtotal;
      final off = l.discountFor(base);
      if (off <= 0) return const SizedBox.shrink();
      icon = Icons.redeem_rounded;
      text = 'Your ${groupDigits(l.pointsFor(base))} points will take ${lkr(off)} off this bill when the garage issues it. '
          'You pay about ${lkr(store.total - off * (1 + (store.isLive ? 0 : MockData.vatRate)))}.';
    }
    return Semantics(
      button: true,
      label: '$text Open My Rewards',
      excludeSemantics: true,
      child: FxPressable(
        radius: 14,
        onTap: () => context.push(const MyRewardsScreen()),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.successSoft, borderRadius: BorderRadius.circular(14)),
          child: Row(
            children: [
              Icon(icon, color: AppColors.successText, size: 22),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: AppText.label.copyWith(fontSize: 12.5))),
              Icon(Icons.chevron_right_rounded, color: AppColors.successText),
            ],
          ),
        ),
      ),
    );
  }
}
