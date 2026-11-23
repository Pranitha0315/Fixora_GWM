import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/remote/customer_backend.dart';
import '../../data/repositories/loyalty_store.dart';

/// My Rewards: points balance, ledger and how to earn (incl. DriveSense).
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
      if (!silent && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Demo mode: showing sample points'), behavior: SnackBarBehavior.floating),
        );
      }
      return;
    }
    setState(() => _refreshing = true);
    try {
      await backend.refreshLoyalty();
    } catch (_) {
      if (mounted && !silent) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Could not reach the garage. Showing saved points.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  static String _digits(num value) {
    final n = value.round().abs().toString();
    final buf = StringBuffer();
    for (var i = 0; i < n.length; i++) {
      final fromEnd = n.length - i;
      if (i > 0 && fromEnd % 3 == 0) buf.write(',');
      buf.write(n[i]);
    }
    return buf.toString();
  }

  static String _lkr(num value) => 'LKR ${_digits(value)}';

  @override
  Widget build(BuildContext context) {
    final l = LoyaltyStore.instance;
    return ListenableBuilder(
      listenable: l,
      builder: (context, _) {
        final list = switch (_tab) {
          1 => l.history.where((e) => e.earned).toList(),
          2 => l.history.where((e) => !e.earned).toList(),
          _ => l.history,
        };
        return Scaffold(
          backgroundColor: AppColors.bg,
          appBar: AppBar(
            title: const Text('My Rewards'),
            backgroundColor: AppColors.bg,
            foregroundColor: AppColors.navy,
            elevation: 0,
            actions: [
              TextButton.icon(
                onPressed: _refreshing ? null : () => _refresh(),
                icon: Icon(_refreshing ? Icons.hourglass_top_rounded : Icons.refresh_rounded, size: 18),
                label: Text(_refreshing ? 'Updating' : 'Refresh'),
              ),
            ],
          ),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
            children: [
              Text('Garage points that come off your bills', style: AppText.muted),
              const SizedBox(height: 14),
              _BalanceHero(l: l, digits: _digits, lkr: _lkr),
              const SizedBox(height: 12),
              Row(
                children: [
                  _stat(_digits(l.totalEarned), 'Earned', AppColors.successText),
                  _stat(_digits(l.totalUsed), 'Used', AppColors.link),
                  _stat(_digits(l.totalExpired), 'Expired', AppColors.textMuted),
                ],
              ),
              const SizedBox(height: 18),
              // Points history
              Text('Points history', style: AppText.h2.copyWith(fontSize: 15)),
              const SizedBox(height: 8),
              // All | Earned | Used
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final (i, label) in const [(0, 'All'), (1, 'Earned'), (2, 'Used')])
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(label),
                          selected: _tab == i,
                          selectedColor: AppColors.primarySoft,
                          onSelected: (_) => setState(() => _tab = i),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              if (list.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Column(
                    children: [
                      Icon(Icons.stars_outlined, size: 40, color: AppColors.textMuted),
                      const SizedBox(height: 8),
                      Text(
                        _tab == 2 ? 'No points used yet' : 'No points yet',
                        style: AppText.label,
                      ),
                      Text(
                        _tab == 2
                            ? 'Points come off your bill when the garage issues the invoice.'
                            : 'Pay a service bill or turn on DriveSense to start earning.',
                        style: AppText.muted,
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.surfaceSolid,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.border),
                  ),
                  child: Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        if (i > 0) Divider(height: 1, color: AppColors.divider),
                        _EntryRow(e: list[i], digits: _digits),
                      ],
                    ],
                  ),
                ),
              const SizedBox(height: 18),
              Text('How to earn', style: AppText.h2.copyWith(fontSize: 15)),
              const SizedBox(height: 8),
              _HowToEarn(l: l, lkr: _lkr),
            ],
          ),
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
  final String Function(num) digits;
  final String Function(num) lkr;
  const _BalanceHero({required this.l, required this.digits, required this.lkr});

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
              Text(
                'Available balance',
                style: TextStyle(color: Colors.white.o(0.9), fontSize: 13, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              if (!l.live)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: Colors.white.o(0.18), borderRadius: BorderRadius.circular(20)),
                  child: const Text('Demo', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                digits(l.balance),
                style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800, letterSpacing: -1),
              ),
              const SizedBox(width: 6),
              Text('points', style: TextStyle(color: Colors.white.o(0.9), fontSize: 15, fontWeight: FontWeight.w600)),
            ],
          ),
          Text('Worth ${lkr(l.balanceValue)} at your garage', style: TextStyle(color: Colors.white.o(0.9), fontSize: 13)),
          if (next != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(color: Colors.white.o(0.16), borderRadius: BorderRadius.circular(12)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    l.expirySoon ? Icons.schedule_rounded : Icons.event_available_rounded,
                    color: Colors.white,
                    size: 16,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      '${next.points} pts expire on ${next.expiresAt!.day}/${next.expiresAt!.month}/${next.expiresAt!.year}',
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

class _EntryRow extends StatelessWidget {
  final PointsEntry e;
  final String Function(num) digits;
  const _EntryRow({required this.e, required this.digits});

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (e.kind) {
      _ when e.expired => (Icons.hourglass_disabled_rounded, AppColors.textMuted),
      PointsKind.drive => (Icons.route_rounded, AppColors.success),
      PointsKind.spend => (Icons.payments_outlined, AppColors.primary),
      PointsKind.redeem => (Icons.redeem_rounded, AppColors.warning),
      PointsKind.other => (Icons.stars_rounded, AppColors.primary),
    };
    final amount = '${e.earned ? '+' : '−'}${digits(e.points.abs())}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(e.description, style: AppText.label),
                Text(e.source.split(':').first, style: AppText.small),
              ],
            ),
          ),
          Text(
            amount,
            style: TextStyle(
              fontWeight: FontWeight.w800,
              color: e.expired
                  ? AppColors.textMuted
                  : e.earned
                      ? AppColors.successText
                      : AppColors.navy,
              decoration: e.expired ? TextDecoration.lineThrough : null,
            ),
          ),
        ],
      ),
    );
  }
}

class _HowToEarn extends StatelessWidget {
  final LoyaltyStore l;
  final String Function(num) lkr;
  const _HowToEarn({required this.l, required this.lkr});

  @override
  Widget build(BuildContext context) {
    final pct = l.percent == l.percent.roundToDouble()
        ? '${l.percent.round()}'
        : l.percent.toStringAsFixed(1);
    final steps = <(IconData, String, String)>[
      (
        Icons.route_rounded,
        'Drive gently with DriveSense',
        'A week with score 80+ over at least 20 km earns 100 points; score 90+ earns 200. Valid for 6 months.',
      ),
      (
        Icons.payments_outlined,
        'Pay your service bill',
        '1 point for every LKR 100 you pay at the garage. Valid for 12 months.',
      ),
      (
        Icons.redeem_rounded,
        'Save on the next invoice',
        '1 point = ${lkr(l.rupeesPerPoint)}. Up to $pct% of the bill and ${lkr(l.cap)} per invoice, applied for you.',
      ),
    ];
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
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
                  child: Text(
                    '${i + 1}',
                    style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.link, fontSize: 13),
                  ),
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
                          Flexible(
                            child: Text(steps[i].$2, style: AppText.label.copyWith(color: AppColors.navy)),
                          ),
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
