import 'package:flutter/material.dart';

enum NotificationKind {
  estimate,
  progress,
  media,
  payment,
  reminder,
  queue,
  sos,
  booking,
  received,
  completed,
  serviceDue,
  offer,
  subscription,
}

class AppNotification {
  final String id;
  final String title;
  final String body;
  final DateTime time;
  final NotificationKind kind;
  final bool unread;
  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.time,
    required this.kind,
    this.unread = false,
  });

  bool get isOffer => kind == NotificationKind.offer || kind == NotificationKind.subscription;

  AppNotification copyWith({bool? unread}) => AppNotification(
        id: id,
        title: title,
        body: body,
        time: time,
        kind: kind,
        unread: unread ?? this.unread,
      );
}

enum ItemType { part, labour }

class EstimateItem {
  final String name;
  final String subtitle;
  final int qty;
  final double unitPrice;
  final ItemType type;
  final IconData icon;
  final Color color;
  final bool inStock;

  /// Backend RepairItem id, version and status (empty in demo mode).
  final String id;
  final int version;
  final String status;

  const EstimateItem({
    this.id = '',
    this.version = 1,
    this.status = '',
    required this.name,
    required this.subtitle,
    required this.qty,
    required this.unitPrice,
    required this.type,
    required this.icon,
    required this.color,
    this.inStock = true,
  });

  double get amount => qty * unitPrice;
}

enum MediaKind { photo, video }

enum MediaStage { before, during, after }

class MediaItem {
  final String asset;

  /// Photo picked from the gallery / camera (empty [asset] then).
  final List<int>? bytes;
  final MediaKind kind;
  final MediaStage stage;
  final String caption;
  final String? duration;
  final bool uploadedByMe;

  const MediaItem({
    required this.asset,
    this.bytes,
    required this.kind,
    required this.stage,
    required this.caption,
    this.duration,
    this.uploadedByMe = false,
  });
}

class DiagnosisFinding {
  final String code;
  final String title;
  final String description;
  final String severity; // High / Medium / Low
  final double confidence; // 0..1
  const DiagnosisFinding({
    required this.code,
    required this.title,
    required this.description,
    required this.severity,
    required this.confidence,
  });
}

class LiveReading {
  final String label;
  final String value;
  final String unit;
  final bool warning;
  const LiveReading(this.label, this.value, this.unit, {this.warning = false});
}

enum JobStatus {
  diagnosis,
  awaitingApproval,
  changesRequested,
  inProgress,
  completed,
  paid,
}

enum BookingState { active, upcoming, completed, cancelled }

class Booking {
  final String id;
  final String vehicleId;
  final String service;
  final DateTime date;
  final BookingState state;
  final String statusLabel;
  final double? amount;
  final int? queuePosition;
  final String garage;
  final List<String> symptoms;
  final String? offer;
  const Booking({
    required this.id,
    required this.vehicleId,
    required this.service,
    required this.date,
    required this.state,
    required this.statusLabel,
    this.amount,
    this.queuePosition,
    this.garage = 'Fixora Garage',
    this.symptoms = const [],
    this.offer,
  });

  /// True for queue-facing bookings (requested / confirmed / in workshop).
  bool get upcoming => state == BookingState.upcoming || state == BookingState.active;

  Booking copyWith({BookingState? state, String? statusLabel, DateTime? date, int? queuePosition, String? garage}) =>
      Booking(
        id: id,
        vehicleId: vehicleId,
        service: service,
        date: date ?? this.date,
        state: state ?? this.state,
        statusLabel: statusLabel ?? this.statusLabel,
        amount: amount,
        queuePosition: queuePosition ?? this.queuePosition,
        garage: garage ?? this.garage,
        symptoms: symptoms,
        offer: offer,
      );
}
