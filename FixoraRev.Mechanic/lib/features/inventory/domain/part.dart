import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// A stock item tracked in three states (BRD USP 4):
/// [available] free on the shelf, [reserved] held for approved jobs,
/// [incoming] ordered from a supplier and arriving on [incomingEta].
class Part {
  Part({
    required this.id,
    required this.name,
    required this.partNumber,
    required this.brand,
    required this.category,
    required this.unitPrice,
    required this.available,
    required this.reserved,
    this.incoming = 0,
    this.incomingEta,
    this.supplier,
    this.substituteIds = const [],
    this.reorderLevel = 2,
    this.fits = const [],
  });

  final String id;
  final String name;
  final String partNumber;
  final String brand;
  final String category;
  final double unitPrice;
  int available;
  int reserved;
  int incoming;
  DateTime? incomingEta;
  final String? supplier;
  final List<String> substituteIds;
  final int reorderLevel;
  final List<String> fits;

  int get total => available + reserved + incoming;
  bool get isLow => available <= reorderLevel;
}

/// Traffic-light availability shown on job cards.
enum PartAvailability { ready, partial, blocked }

extension PartAvailabilityX on PartAvailability {
  String get label => switch (this) {
        PartAvailability.ready => 'Parts ready',
        PartAvailability.partial => 'Partly available',
        PartAvailability.blocked => 'Parts blocked',
      };

  String get short => switch (this) {
        PartAvailability.ready => 'Ready',
        PartAvailability.partial => 'Incoming',
        PartAvailability.blocked => 'Out of stock',
      };

  Color get color => switch (this) {
        PartAvailability.ready => AppColors.success,
        PartAvailability.partial => AppColors.warning,
        PartAvailability.blocked => AppColors.danger,
      };

  Color get soft => switch (this) {
        PartAvailability.ready => AppColors.successSoft,
        PartAvailability.partial => AppColors.warningSoft,
        PartAvailability.blocked => AppColors.dangerSoft,
      };

  /// Higher = worse; used to find the worst line of a job.
  int get rank => index;
}

/// Small coloured dot + label.
class TrafficLight extends StatelessWidget {
  const TrafficLight(this.availability,
      {super.key, this.showLabel = true, this.short = false});
  final PartAvailability availability;
  final bool showLabel;
  final bool short;

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: availability.color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
              color: availability.color.withValues(alpha: 0.45), blurRadius: 6),
        ],
      ),
    );
    if (!showLabel) return dot;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: availability.soft,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          dot,
          const SizedBox(width: 6),
          Text(
            short ? availability.short : availability.label,
            style: TextStyle(
              color: availability.color,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
