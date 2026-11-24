import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../../data/remote/customer_backend.dart';

/// My Rewards: points balance, what the next invoice saves, the ledger and how to earn.
class MyRewardsScreen extends StatefulWidget {
  const MyRewardsScreen({super.key});

  @override
  State<MyRewardsScreen> createState() => _MyRewardsScreenState();
}

class _MyRewardsScreenState extends State<MyRewardsScreen> {
  int _tab = 0;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _refresh(silent: true);
  }

  Future<void> _refresh({bool silent = false}) async {
    final backend = CustomerBackend.instance;
    if (!backend.live) {
      if (!silent) showFxSnack(context, 'Demo mode: showing sample points', icon: Icons.info_outline_rounded);
      return;
    }
    setState(() => _refreshing = true);
    try {
      await backend.refreshLoyalty();
    } catch (_) {
      if (mounted && !silent) showFxSnack(context, 'Could not reach the garage. Showing saved points.', icon: Icons.wifi_off_rounded);
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = LoyaltyStore.instance;
    final store = JobStore.instance;
    return ListenableBuilder(
      listenable: Listenable.merge([l, store]),
      builder: (context, _) {
        final list = switch (_tab) {
          1 => l.history.where((e) => e.earned).toList(),
          2 => l.history.where((e) => !e.earned).toList(),
          _ => l.history,
        };
        return FxPage(
          title: 'My Rewards',
          subtitle: 'Garage points that come off your bills',
          headerIcon: Icons.stars_rounded,
          trailing: PillButton(
            label: _refreshing ? 'Updating' : 'Refresh',
            icon: Icons.refresh_rounded,
            onTap: _refreshing ? null : () => _refresh(),
          ),
          children: [
            FadeSlide(child: _BalanceHero(l: l)),
            const SizedBox(height: 12),
            FadeSlide(index: 1, child: _NextInvoiceCard(l: l, store: store)),
            const SizedBox(height: 12),
            FadeSlide(
              index: 2,
              child: Row(
                children: [
                  _stat(groupDigits(l.totalEarned), 'Earned', AppColors.successText),
                  _stat(groupDigits(l.totalUsed), 'Used', AppColors.link),
                  _stat(groupDigits(l.totalExpired), 'Expired', AppColors.textMuted),
                ],
              ),
            ),
            const SectionTitle('Points history', icon: Icons.receipt_long_outlined),
            FxChipTabs(labels: const ['All', 'Earned', 'Used'], index: _tab, onChanged: (i) => setState(() => _tab = i)),
            const SizedBox(height: 10),
            if (list.isEmpty)
              EmptyState(
                icon: Icons.stars_outlined,
                title: _tab == 2 ? 'No points used yet' : 'No points yet',
                message: _tab == 2
                    ? 'Points come off your bill automatically when the garage issues the invoice.'
                    : 'Pay a service bill or turn on DriveSense to start earning.',
              )
            else
              FxCard(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                child: Column(
                  children: [
                    for (var i = 0; i < list.length; i++) ...[
                      if (i > 0) Divider(height: 1, color: AppColors.divider),
                      _EntryRow(e: list[i]),
                    ],
                  ],
                ),
              ),
            const SectionTitle('How to earn', icon: Icons.lightbulb_outline_rounded),
            FadeSlide(index: 3, child: _HowToEarn(l: l)),
            const SizedBox(height: 10),
            if (l.updatedAt != null)
              Center(child: Text('Updated ${dayTime(l.updatedAt!)}', style: AppText.small)),
            const SizedBox(height: 16),
          ],
        );
      },
    );
  }

  Widget _stat(String value, String label, Color color) => Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 4),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16)),
          child: Column(
            children: [
              FittedBox(child: Text(value, style: AppText.h2.copyWith(color: color))),
              const SizedBox(height: 2),
              Text('$label pts', style: AppText.small),
            ],
          ),
        ),
      );
}

/// Teal hero: balance, rupee value, next expiry.
class _BalanceHero extends StatelessWidget {
  final LoyaltyStore l;
  const _BalanceHero({required this.l});

  @override
  Widget build(BuildContext context) {
    final next = l.nextExpiry;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(gradient: AppColors.primaryGradient, borderRadius: BorderRadius.circular(24)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.stars_rounded, color: Colors.white, size: 20),
              const SizedBox(width: 6),
              Text('Available balance',
                  style: TextStyle(color: Colors.white.o(0.9), fontSize: 13, fontWeight: FontWeight.w600)),
              const Spacer(),
              if (!l.live)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white.o(0.18), borderRadius: BorderRadius.circular(20)),
                  child: const Text('Demo',
                      style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(groupDigits(l.balance),
                  style: const TextStyle(
                      color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -1)),
              const SizedBox(width: 6),
              Text('points', style: TextStyle(color: Colors.white.o(0.9), fontSize: 15, fontWeight: FontWeight.w600)),
            ],
          ),
          Text('Worth ${lkr(l.balanceValue)} at ${CustomerBackend.instance.garageName}',
              style: TextStyle(color: Colors.white.o(0.9), fontSize: 13)),
          if (next != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(color: Colors.white.o(0.16), borderRadius: BorderRadius.circular(12)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(l.expirySoon ? Icons.schedule_rounded : Icons.event_available_rounded, color: Colors.white, size: 16),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      '${next.points} pts expire on ${dayMonthYear(next.expiresAt!)}',
                      style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// What the next bill saves: the live invoice when there is one, otherwise the general rule.
class _NextInvoiceCard extends StatelessWidget {
  final LoyaltyStore l;
  final JobStore store;
  const _NextInvoiceCard({required this.l, required this.store});

  @override
  Widget build(BuildContext context) {
    final String title;
    final String body;
    if (!l.enabled) {
      title = 'Rewards are paused';
      body = 'The garage has turned off point discounts for now. Your points are kept.';
    } else if (store.invoiceIssued && store.status != JobStatus.paid) {
      title = store.loyaltyDiscount > 0
          ? '${lkr(store.loyaltyDiscount)} off ${store.invoiceNumber ?? 'your invoice'}'
          : 'No points used on ${store.invoiceNumber ?? 'this invoice'}';
      body = store.loyaltyDiscount > 0
          ? 'Already taken off your current bill. You pay ${lkr(store.total)}.'
          : 'You had no points to use when this invoice was issued.';
    } else if (l.balance <= 0) {
      title = 'No discount on your next invoice yet';
      body = 'Earn points from paid bills and gentle driving; they come off the next bill by themselves.';
    } else {
      final example = l.billForFullUse;
      title = 'Up to ${lkr(l.balanceValue < l.cap ? l.balanceValue : l.cap)} off your next invoice';
      body = 'Points come off automatically when the garage issues your bill: '
          'up to ${_pct(l.percent)} of the bill, max ${lkr(l.cap)} per invoice. '
          'A bill of ${lkr(example)} or more uses ${l.balanceValue < l.cap ? 'all your points' : 'the full ${lkr(l.cap)}'}; '
          'on ${lkr(10000)} you save ${lkr(l.discountFor(10000))}.';
    }
    return FxCard(
      padding: const EdgeInsets.all(14),
      color: AppColors.primarySofter,
      shadow: false,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconTile(icon: Icons.receipt_long_rounded, size: 44, background: AppColors.surfaceSolid, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.h3),
                const SizedBox(height: 4),
                Text(body, style: AppText.muted),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _pct(double p) => p == p.roundToDouble() ? '${p.toInt()}%' : '${p.toStringAsFixed(1)}%';
}

class _EntryRow extends StatelessWidget {
  final PointsEntry e;
  const _EntryRow({required this.e});

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (e.kind) {
      _ when e.expired => (Icons.hourglass_disabled_rounded, AppColors.textMuted),
      PointsKind.drive => (Icons.route_rounded, AppColors.success),
      PointsKind.spend => (Icons.payments_outlined, AppColors.primary),
      PointsKind.redeem => (Icons.redeem_rounded, AppColors.warning),
      PointsKind.other => (Icons.stars_rounded, AppColors.primary),
    };
    final String sub;
    if (!e.earned) {
      sub = 'Used ${dayMonthYear(e.createdAt)}';
    } else if (e.expired) {
      sub = 'Expired ${dayMonthYear(e.expiresAt!)}';
    } else if (e.expiresAt != null) {
      sub = '${dayMonthYear(e.createdAt)} · expires ${dayMonthYear(e.expiresAt!)}';
    } else {
      sub = dayMonthYear(e.createdAt);
    }
    final amount = '${e.earned ? '+' : '−'}${groupDigits(e.points.abs())}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          IconTile(icon: icon, size: 40, color: color, radius: 12),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.description, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.label),
                const SizedBox(height: 2),
                Text(sub, style: AppText.small),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(amount,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: e.expired
                    ? AppColors.textMuted
                    : e.earned
                        ? AppColors.successText
                        : AppColors.navy,
                decoration: e.expired ? TextDecoration.lineThrough : null,
              )),
        ],
      ),
    );
  }
}

class _HowToEarn extends StatelessWidget {
  final LoyaltyStore l;
  const _HowToEarn({required this.l});

  @override
  Widget build(BuildContext context) {
    final steps = <(IconData, String, String)>[
      (Icons.route_rounded, 'Drive gently with DriveSense',
          'A week with score 80+ over at least 20 km earns 100 points; score 90+ earns 200. Valid for 6 months.'),
      (Icons.payments_outlined, 'Pay your service bill',
          '1 point for every LKR 100 you pay at the garage. Valid for 12 months.'),
      (Icons.redeem_rounded, 'Save on the next invoice',
          '1 point = ${lkr(l.rupeesPerPoint)}. Up to ${_NextInvoiceCard._pct(l.percent)} of the bill and ${lkr(l.cap)} per invoice, applied for you.'),
    ];
    return FxCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0) const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: AppColors.primarySoft, shape: BoxShape.circle),
                  child: Text('${i + 1}',
                      style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.link, fontSize: 13)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(steps[i].$1, size: 16, color: AppColors.link),
                          const SizedBox(width: 6),
                          Flexible(child: Text(steps[i].$2, style: AppText.label.copyWith(color: AppColors.navy))),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(steps[i].$3, style: AppText.muted),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
