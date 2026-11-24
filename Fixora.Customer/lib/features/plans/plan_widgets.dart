import 'package:flutter/material.dart';

import '../../core/core.dart';

class PlanStyle {
  final List<Color> bg;
  final Color accent;
  const PlanStyle(this.bg, this.accent);

  static PlanStyle of(PlanTier t) {
    switch (t) {
      case PlanTier.silver:
        return PlanStyle([AppColors.adapt(Color(0xFFF5FAF9)), AppColors.adapt(Color(0xFFE4EFEE))], Color(0xFF7C8798));
      case PlanTier.gold:
        return PlanStyle([AppColors.adapt(Color(0xFFFFF7E0)), AppColors.adapt(Color(0xFFFFE7B0))], Color(0xFFF08C00));
      case PlanTier.platinum:
        return PlanStyle([AppColors.adapt(Color(0xFFF4F0FF)), AppColors.adapt(Color(0xFFE3D9FF))], Color(0xFF6E4EF2));
    }
  }
}

String planDuration(ServicePlan p) => '${p.months} Months';

/// Big plan banner: medal, name badge, price and a car image.
class PlanHeaderCard extends StatelessWidget {
  final ServicePlan plan;
  final Widget? topRight;
  final bool showPopular;
  const PlanHeaderCard({super.key, required this.plan, this.topRight, this.showPopular = true});

  @override
  Widget build(BuildContext context) {
    final st = PlanStyle.of(plan.tier);
    return Container(
      height: 128,
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: st.bg, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: st.accent.o(0.25)),
        boxShadow: AppShadows.card,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Stack(
          children: [
            Positioned(
              right: -6,
              bottom: 8,
              width: 140,
              height: 84,
              child: const CutOutImage(Img.corollaThumb),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 130, 12),
              child: Row(
                children: [
                  PlanMedal(plan.tier, size: 54),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(color: st.accent, borderRadius: BorderRadius.circular(20)),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.workspace_premium_rounded, size: 15, color: Colors.white),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(plan.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5)),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text.rich(TextSpan(children: [
                            TextSpan(
                                text: lkr(plan.price),
                                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.navy)),
                            TextSpan(
                                text: ' / ${planDuration(plan)}',
                                style: TextStyle(fontSize: 12.5, color: AppColors.text)),
                          ])),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (topRight != null) Positioned(right: 10, top: 10, child: topRight!),
            if (topRight == null && showPopular && plan.popular)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(color: AppColors.warning, borderRadius: BorderRadius.circular(10)),
                  child: const Text('Most Popular',
                      style: TextStyle(color: Colors.white, fontSize: 10.5, fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Check-mark feature line.
class FeatureLine extends StatelessWidget {
  final String text;
  final double size;
  const FeatureLine(this.text, {super.key, this.size = 13});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_rounded, size: size + 4, color: AppColors.success),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: TextStyle(fontSize: size, color: AppColors.text, fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}

/// Label | value row with a leading icon (plan details tables).
class DetailRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final bool last;
  final Widget? trailing;
  const DetailRow({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.last = false,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 11),
      decoration: BoxDecoration(
        border: last ? null : Border(bottom: BorderSide(color: AppColors.divider)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 21, color: AppColors.link),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: AppText.body.copyWith(fontSize: 14))),
          const SizedBox(width: 8),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.end,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700, color: AppColors.navy)),
          ),
          if (trailing != null) ...[const SizedBox(width: 6), trailing!],
        ],
      ),
    );
  }
}
