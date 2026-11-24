import 'package:flutter/material.dart';

import '../../core/core.dart';
import 'my_rewards_screen.dart';

/// Points balance card for Home and Profile. Tap opens My Rewards.
class PointsBalanceCard extends StatelessWidget {
  /// Compact = one row (Profile); otherwise the taller Home card.
  final bool compact;
  const PointsBalanceCard({super.key, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final l = LoyaltyStore.instance;
    return ListenableBuilder(
      listenable: l,
      builder: (context, _) {
        final next = !l.enabled
            ? 'Rewards are paused by the garage'
            : l.balance <= 0
                ? 'Earn points on your next service'
                : 'Up to ${lkr(l.balanceValue < l.cap ? l.balanceValue : l.cap)} off your next invoice';
        return Semantics(
          button: true,
          label: 'Fixora points ${l.balance}. $next. Open My Rewards',
          excludeSemantics: true,
          child: FxCard(
            onTap: () {
              AppState.instance.feedback();
              context.push(const MyRewardsScreen());
            },
            padding: EdgeInsets.all(compact ? 14 : 16),
            color: AppColors.primarySoft,
            child: Row(
              children: [
                Container(
                  width: compact ? 42 : 52,
                  height: compact ? 42 : 52,
                  decoration: BoxDecoration(color: AppColors.surfaceSolid, shape: BoxShape.circle),
                  child: Icon(Icons.stars_rounded, color: AppColors.link, size: compact ? 24 : 28),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Fixora Points', style: AppText.small.copyWith(color: AppColors.text, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(groupDigits(l.balance),
                              style: TextStyle(
                                  fontSize: compact ? 22 : 26,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.navy,
                                  letterSpacing: -0.5)),
                          const SizedBox(width: 5),
                          Text('pts', style: AppText.label.copyWith(color: AppColors.textMuted)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(next,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.small.copyWith(color: AppColors.text)),
                      if (!compact && l.expirySoon) ...[
                        const SizedBox(height: 8),
                        StatusPill('${l.nextExpiry!.points} pts expire ${dayMonthYear(l.nextExpiry!.expiresAt!)}',
                            color: AppColors.warning, icon: Icons.schedule_rounded),
                      ],
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.navy),
              ],
            ),
          ),
        );
      },
    );
  }
}
