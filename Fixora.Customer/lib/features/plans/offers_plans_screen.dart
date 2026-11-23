import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../data/repositories/app_state.dart';
import '../bookings/book_service_screen.dart';

/// Demo offers (image paths optional — icon fallback used).
const _demoOffers = <ServiceOffer>[
  ServiceOffer(
    id: 'o1',
    title: 'Engine Oil Change',
    subtitle: 'Oil change + Filter replacement',
    image: '',
    percent: 15,
    service: 'General Service',
  ),
  ServiceOffer(
    id: 'o2',
    title: 'Brake Service',
    subtitle: 'Brake pad check + Cleaning',
    image: '',
    percent: 10,
    service: 'Brakes',
  ),
  ServiceOffer(
    id: 'o3',
    title: 'Special Service Offer',
    subtitle: 'Up to 20% OFF on General Service',
    image: '',
    percent: 20,
    service: 'General Service',
  ),
  ServiceOffer(
    id: 'o4',
    title: 'Wheel Alignment',
    subtitle: '3D alignment + Wheel balancing',
    image: '',
    percent: 12,
    service: 'Tyres & Alignment',
  ),
  ServiceOffer(
    id: 'o10',
    title: 'Hybrid Battery Check',
    subtitle: 'Battery health test + Cooling fan clean',
    image: '',
    percent: 15,
    service: 'Hybrid Check',
  ),
  ServiceOffer(
    id: 'o11',
    title: 'Scratch & Dent Repair',
    subtitle: 'Bumper scratch repair + Polish',
    image: '',
    percent: 10,
    service: 'Body & Paint',
  ),
];

void openOffer(BuildContext context, ServiceOffer o) {
  context.push(BookServiceScreen(
    vehicleId: AppState.instance.selectedVehicle.id,
    service: o.service,
    offer: o,
  ));
}

/// Offers & Plans: Offers tab books via [BookServiceScreen] with the offer attached.
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
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Offers & Plans'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text(
            _tab == 0
                ? 'Exclusive service offers and subscription plans'
                : 'Choose the best service plan for your vehicle',
            style: AppText.muted,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final (i, label) in const [(0, 'Offers'), (1, 'Plans')])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(label),
                    selected: _tab == i,
                    onSelected: (_) => setState(() => _tab = i),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          if (_tab == 0) ...[
            Text('Current Offers', style: AppText.h2.copyWith(fontSize: 15)),
            const SizedBox(height: 10),
            for (final o in _demoOffers.where((o) => o.id != 'o3')) _OfferCard(offer: o),
          ] else ...[
            Text('Service plans', style: AppText.h2.copyWith(fontSize: 15)),
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppColors.border),
              ),
              child: Text(
                'Subscription plans coming soon. Meanwhile, book with a current offer for an instant discount.',
                style: AppText.muted,
              ),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: () => setState(() => _tab = 0),
              child: const Text('See offers'),
            ),
          ],
        ],
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
      child: Material(
        color: AppColors.surfaceSolid,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: book,
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.local_offer_outlined, color: AppColors.link),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(offer.title, style: AppText.h3.copyWith(fontSize: 14.5, height: 1.2)),
                      const SizedBox(height: 2),
                      Text(offer.subtitle, style: AppText.small.copyWith(fontSize: 12, height: 1.3)),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                            decoration: BoxDecoration(
                              color: AppColors.danger.o(0.12),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Text(
                              '${offer.percent}% OFF',
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                color: AppColors.dangerText,
                              ),
                            ),
                          ),
                          const Spacer(),
                          GestureDetector(
                            onTap: book,
                            child: Container(
                              height: 36,
                              padding: const EdgeInsets.symmetric(horizontal: 14),
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: AppColors.buttonBg,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: const Text(
                                'Book Now',
                                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5),
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
        ),
      ),
    );
  }
}
