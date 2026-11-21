import 'dart:math' as math;

import 'package:flutter/foundation.dart';

/// Where a ledger line came from (the server's `source` prefix).
enum PointsKind { drive, spend, redeem, other }

/// One line of the garage loyalty ledger (LoyaltyEntryDto).
class PointsEntry {
  final int points;
  final String description;
  final String source;
  final DateTime createdAt;
  final DateTime? expiresAt;

  const PointsEntry({
    required this.points,
    required this.description,
    required this.source,
    required this.createdAt,
    this.expiresAt,
  });

  PointsKind get kind => switch (source.split(':').first) {
        'drivescore' => PointsKind.drive,
        'spend' => PointsKind.spend,
        'redeem' => PointsKind.redeem,
        _ => PointsKind.other,
      };

  bool get earned => points > 0;
  bool get expired => earned && expiresAt != null && !expiresAt!.isAfter(DateTime.now());

  factory PointsEntry.fromJson(Map<String, dynamic> j) => PointsEntry(
        points: (j['points'] as num?)?.toInt() ?? 0,
        description: (j['description'] as String?) ?? '',
        source: (j['source'] as String?) ?? '',
        createdAt: DateTime.tryParse((j['createdAt'] as String?) ?? '')?.toLocal() ?? DateTime.now(),
        expiresAt: DateTime.tryParse((j['expiresAt'] as String?) ?? '')?.toLocal(),
      );
}

/// Garage loyalty points. DriveSense week score 80+/20 km → 100 pts; 90+ → 200.
class LoyaltyStore extends ChangeNotifier {
  LoyaltyStore._() {
    resetDemo();
  }
  static final LoyaltyStore instance = LoyaltyStore._();

  int balance = 0;
  final List<PointsEntry> history = [];
  double rupeesPerPoint = 1;
  bool enabled = true;
  double percent = 2;
  double cap = 1500;
  bool live = false;
  DateTime? updatedAt;

  double get balanceValue => balance * rupeesPerPoint;

  double discountFor(double subtotal) {
    if (!enabled || balance <= 0 || percent <= 0 || subtotal <= 0) return 0;
    final maxDiscount = math.min(cap, (subtotal * percent / 100).roundToDouble());
    final points = math.min(balance.toDouble(), (maxDiscount / rupeesPerPoint).floorToDouble());
    return points <= 0 ? 0 : points * rupeesPerPoint;
  }

  int get totalEarned => history.where((e) => e.earned).fold(0, (s, e) => s + e.points);
  int get totalUsed => history.where((e) => !e.earned).fold(0, (s, e) => s - e.points);
  int get totalExpired => history.where((e) => e.expired).fold(0, (s, e) => s + e.points);

  void applyRemote(Map<String, dynamic> dto) {
    balance = (dto['balance'] as num?)?.toInt() ?? 0;
    rupeesPerPoint = (dto['rupeesPerPoint'] as num?)?.toDouble() ?? 1;
    history
      ..clear()
      ..addAll(((dto['history'] as List?) ?? const []).cast<Map<String, dynamic>>().map(PointsEntry.fromJson));
    live = true;
    updatedAt = DateTime.now();
    notifyListeners();
  }

  void applyGarage(Map<String, dynamic> garage) {
    enabled = garage['loyaltyEnabled'] as bool? ?? enabled;
    percent = (garage['loyaltyPercent'] as num?)?.toDouble() ?? percent;
    cap = (garage['loyaltyCapRupees'] as num?)?.toDouble() ?? cap;
    notifyListeners();
  }

  void resetDemo() {
    final now = DateTime.now();
    live = false;
    enabled = true;
    percent = 2;
    cap = 1500;
    rupeesPerPoint = 1;
    history
      ..clear()
      ..addAll([
        PointsEntry(
          points: 100,
          description: 'Gentle driving week · score 80',
          source: 'drivescore:seed2',
          createdAt: now.subtract(const Duration(days: 21)),
          expiresAt: DateTime(now.year, now.month + 5, now.day),
        ),
        PointsEntry(
          points: 200,
          description: 'Gentle driving week · score 84',
          source: 'drivescore:seed1',
          createdAt: now.subtract(const Duration(days: 28)),
          expiresAt: DateTime(now.year, now.month + 5, now.day),
        ),
        PointsEntry(
          points: 45,
          description: 'Spend on INV-DEMO-0007',
          source: 'spend:INV-DEMO-0007',
          createdAt: DateTime(now.year, now.month - 11, now.day),
          expiresAt: now.add(const Duration(days: 24)),
        ),
        PointsEntry(
          points: -60,
          description: 'Discount on INV-DEMO-0007',
          source: 'redeem:INV-DEMO-0007',
          createdAt: DateTime(now.year, now.month - 11, now.day),
        ),
      ]);
    balance = history.where((e) => !e.expired).fold(0, (s, e) => s + e.points);
    updatedAt = null;
    notifyListeners();
  }
}
