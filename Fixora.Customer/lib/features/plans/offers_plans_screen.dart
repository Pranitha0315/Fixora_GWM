import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/core.dart';
import '../bookings/book_service_screen.dart';
import 'confirm_plan_screen.dart';
import 'plan_widgets.dart';

/// Offers & Plans: Offers tab (banner carousel + all current offers) and
/// Plans tab (service plans).
class OffersPlansScreen extends StatefulWidget {
  final int initialTab;
  const OffersPlansScreen({super.key, this.initialTab = 0});

  @override
  State<OffersPlansScreen> createState() => _OffersPlansScreenState();
}

class _OffersPlansScreenState extends State<OffersPlansScreen> {
  late int _tab = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    return FxPage(
      title: 'Offers & Plans',
      subtitle: _tab == 0 ? 'Exclusive service offers and subscription plans' : 'Choose the best service plan for your vehicle',
      compactHeader: true,
      children: [
        FxPillTabs(
          labels: const ['Offers', 'Plans'],
          index: _tab,
          onChanged: (i) => setState(() => _tab = i),
        ),
        const SizedBox(height: 14),
        AnimatedSwitcher(
          duration: const Duration(milliseconds: 280),
          child: _tab == 0
              ? _OffersTab(key: const ValueKey('offers'), onSeePlans: () => setState(() => _tab = 1))
              : const _PlansTab(key: ValueKey('plans')),
        ),
      ],
    );
  }
}

void openOffer(BuildContext context, ServiceOffer o) {
  context.push(BookServiceScreen(
    vehicleId: AppState.instance.selectedVehicle.id,
    service: o.service,
    offer: o,
  ));
}

// ---------------------------------------------------------------- Offers tab

class _OffersTab extends StatelessWidget {
  final VoidCallback onSeePlans;
  const _OffersTab({super.key, required this.onSeePlans});

  @override
  Widget build(BuildContext context) {
    final offers = MockData.offers.where((o) => o.id != 'o3').toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _BannerCarousel(onSeePlans: onSeePlans),
        SectionTitle('Current Offers', action: 'View All', onAction: () => _allOffers(context)),
        // Service plans live in the "Plans" tab only; this tab is all offers.
        for (final o in offers) _OfferCard(offer: o),
      ],
    );
  }

  void _allOffers(BuildContext context) {
    showFxSheet<void>(
      context,
      builder: (ctx) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('All Offers', style: AppText.h1),
          const SizedBox(height: 12),
          for (final o in MockData.offers) _OfferCard(offer: o, onBook: () => Navigator.of(ctx).pop()),
        ],
      ),
    );
  }
}

class _BannerCarousel extends StatefulWidget {
  final VoidCallback onSeePlans;
  const _BannerCarousel({required this.onSeePlans});

  @override
  State<_BannerCarousel> createState() => _BannerCarouselState();
}

class _BannerCarouselState extends State<_BannerCarousel> {
  final _pc = PageController();
  int _page = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!mounted || !_pc.hasClients) return;
      _pc.animateToPage((_page + 1) % 3, duration: const Duration(milliseconds: 500), curve: Curves.easeOutCubic);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final slides = [
      _Banner(
        kicker: 'Special',
        title: 'Service Offer',
        body: 'Get up to 20% OFF on General Service',
        image: Img.offerMechanic,
        badge: '20%\nOFF',
        button: 'Book Now',
        onTap: () => openOffer(context, MockData.offers.firstWhere((o) => o.id == 'o3')),
      ),
      _Banner(
        kicker: 'Most Popular',
        title: 'Gold Plan',
        body: '4 services + priority booking for LKR 4,500 / year',
        image: Img.corollaHero,
        button: 'Choose Plan',
        onTap: () => context.push(ConfirmPlanScreen(plan: MockData.planById('gold'))),
      ),
      _Banner(
        kicker: 'Platinum',
        title: 'Free Health Check',
        body: 'Full vehicle health check included with Platinum',
        image: Img.engineBay,
        button: 'See Plans',
        onTap: widget.onSeePlans,
      ),
    ];
    return Column(
      children: [
        SizedBox(
          height: 168,
          child: PageView(
            controller: _pc,
            onPageChanged: (i) => setState(() => _page = i),
            children: [for (final s in slides) Padding(padding: const EdgeInsets.symmetric(horizontal: 2), child: s)],
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(slides.length, (i) {
            return AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: i == _page ? 18 : 7,
              height: 7,
              decoration: BoxDecoration(
                color: i == _page ? AppColors.primary : AppColors.border,
                borderRadius: BorderRadius.circular(7),
              ),
            );
          }),
        ),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  final String kicker;
  final String title;
  final String body;
  final String image;
  final String? badge;
  final String button;
  final VoidCallback onTap;
  const _Banner({
    required this.kicker,
    required this.title,
    required this.body,
    required this.image,
    this.badge,
    required this.button,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: Container(
          // Flat mint pastel card (no border), like the Home cards.
          decoration: BoxDecoration(
            color: AppColors.primarySoft,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Stack(
            children: [
              Positioned(
                right: 0,
                top: 0,
                bottom: 0,
                width: 190,
                child: ShaderMask(
                  shaderCallback: (r) => const LinearGradient(
                    colors: [Colors.transparent, Colors.white],
                    stops: [0, 0.35],
                  ).createShader(r),
                  blendMode: BlendMode.dstIn,
                  child: Image.asset(image, fit: BoxFit.cover),
                ),
              ),
              if (badge != null)
                Positioned(
                  right: 10,
                  top: 10,
                  // White pill badge (no yellow sticker).
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceSolid,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(badge!.replaceAll('\n', ' '),
                        style: TextStyle(
                            fontSize: 12.5, height: 1, fontWeight: FontWeight.w800, color: AppColors.dangerText)),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 150, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(kicker,
                        style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: AppColors.navy, height: 1.1)),
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Text(title,
                          maxLines: 1,
                          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: AppColors.link, height: 1.15)),
                    ),
                    const SizedBox(height: 4),
                    Text(body, maxLines: 2, style: AppText.muted.copyWith(fontSize: 12, color: AppColors.text)),
                    const SizedBox(height: 10),
                    // Teal pill button (same shape as every other button).
                    Container(
                      height: 36,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.buttonBg,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(button,
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  final ServiceOffer offer;
  final VoidCallback? onBook;
  const _OfferCard({required this.offer, this.onBook});

  @override
  Widget build(BuildContext context) {
    void book() {
      onBook?.call();
      openOffer(context, offer);
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: FxCard(
        padding: const EdgeInsets.all(10),
        radius: 22,
        onTap: book,
        child: Row(
          children: [
            SizedBox(width: 76, height: 76, child: AssetPhoto(offer.image, radius: 16)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.h3.copyWith(fontSize: 14.5, height: 1.2)),
                  const SizedBox(height: 2),
                  Text(offer.subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppText.small.copyWith(fontSize: 12, height: 1.3)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                        decoration: BoxDecoration(color: AppColors.dangerSoft, borderRadius: BorderRadius.circular(999)),
                        child: Text('${offer.percent}% OFF',
                            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: AppColors.dangerText)),
                      ),
                      const Spacer(),
                      // Small teal pill – its own tap target (≥ 36 px tall).
                      Semantics(
                        button: true,
                        label: 'Book ${offer.title}',
                        excludeSemantics: true,
                        child: GestureDetector(
                          onTap: book,
                          child: Container(
                            height: 36,
                            padding: const EdgeInsets.symmetric(horizontal: 14),
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: AppColors.buttonBg, borderRadius: BorderRadius.circular(999)),
                            child: const Text('Book Now',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- Plans tab

class _PlansTab extends StatelessWidget {
  const _PlansTab({super.key});

  @override
  Widget build(BuildContext context) {
    final sub = AppState.instance.subscription;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          height: 150,
          decoration: BoxDecoration(
            color: AppColors.primarySoft,
            borderRadius: BorderRadius.circular(24),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Stack(
              children: [
                Positioned(
                  right: -10,
                  top: 6,
                  width: 170,
                  height: 92,
                  child: const CutOutImage(Img.corollaThumb),
                ),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Service Plans',
                          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.link)),
                      Text('Save more with\nFixora service plans', style: AppText.muted.copyWith(color: AppColors.text)),
                      const Spacer(),
                      const Row(
                        children: [
                          _MiniBenefit(Icons.savings_outlined, 'Lower\nService Cost'),
                          _MiniBenefit(Icons.event_available_outlined, 'Priority\nBooking'),
                          _MiniBenefit(Icons.verified_user_outlined, 'Complete\nVehicle Care'),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        for (final p in MockData.plans)
          _PlanRowCard(plan: p, current: sub != null && sub.isActive && sub.plan.id == p.id),
        const SectionTitle('Plan Benefits'),
        const Row(
          children: [
            _BenefitTile(Icons.handyman_outlined, 'Regular\nMaintenance'),
            SizedBox(width: 8),
            _BenefitTile(Icons.percent_rounded, 'Service\nDiscounts'),
            SizedBox(width: 8),
            _BenefitTile(Icons.event_available_outlined, 'Priority\nBooking'),
            SizedBox(width: 8),
            _BenefitTile(Icons.verified_user_outlined, 'Better\nVehicle Health'),
          ],
        ),
      ],
    );
  }
}

class _MiniBenefit extends StatelessWidget {
  final IconData icon;
  final String text;
  const _MiniBenefit(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppColors.link),
          const SizedBox(width: 4),
          Flexible(child: Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: AppColors.navy))),
        ],
      ),
    );
  }
}

class _BenefitTile extends StatelessWidget {
  final IconData icon;
  final String text;
  const _BenefitTile(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Column(
          children: [
            Icon(icon, color: AppColors.link, size: 28),
            const SizedBox(height: 6),
            Text(text,
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600, color: AppColors.navy)),
          ],
        ),
      ),
    );
  }
}

class _PlanRowCard extends StatelessWidget {
  final ServicePlan plan;
  final bool current;
  const _PlanRowCard({required this.plan, required this.current});

  @override
  Widget build(BuildContext context) {
    final st = PlanStyle.of(plan.tier);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(12),
        // Flat pastel card tinted by tier (silver grey / gold cream / platinum lilac).
        decoration: BoxDecoration(
          color: AppColors.adapt(st.bg.first),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 112,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (plan.popular)
                    Container(
                      margin: const EdgeInsets.only(bottom: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(999)),
                      child: Text('Most Popular',
                          style: TextStyle(color: AppColors.warningText, fontSize: 10, fontWeight: FontWeight.w800)),
                    ),
                  PlanMedal(plan.tier, size: 40),
                  const SizedBox(height: 4),
                  Text(plan.name, style: AppText.h3.copyWith(fontSize: 15.5)),
                  Text.rich(
                    TextSpan(children: [
                      TextSpan(text: lkr(plan.price), style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.navy)),
                      TextSpan(text: ' / ${plan.months} Mo', style: const TextStyle(fontSize: 10.5)),
                    ]),
                    style: TextStyle(fontSize: 12.5, color: AppColors.text),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final f in plan.features) FeatureLine(f, size: 11.5),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: 36,
                    child: plan.popular && !current
                        ? PrimaryButton(
                            label: 'Choose Plan',
                            height: 36,
                            fontSize: 13,
                            onPressed: () => context.push(ConfirmPlanScreen(plan: plan)),
                          )
                        : OutlineButton2(
                            label: current ? 'Current Plan' : 'Choose Plan',
                            height: 36,
                            fontSize: 13,
                            onPressed: current ? null : () => context.push(ConfirmPlanScreen(plan: plan)),
                          ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
