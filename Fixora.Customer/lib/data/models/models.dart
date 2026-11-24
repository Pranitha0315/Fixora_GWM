import 'dart:typed_data';

import 'package:flutter/material.dart';

/// Domain models used by the customer app.
/// When the .NET backend is ready, map API JSON into these classes
/// inside a repository (see data/repositories) - screens stay the same.

enum VehicleType { fourWheeler, twoWheeler, threeWheeler }

extension VehicleTypeX on VehicleType {
  String get label {
    switch (this) {
      case VehicleType.fourWheeler:
        return 'Car';
      case VehicleType.twoWheeler:
        return 'Two Wheeler';
      case VehicleType.threeWheeler:
        return 'Three Wheeler';
    }
  }

  String get tabLabel {
    switch (this) {
      case VehicleType.fourWheeler:
        return '4 Wheeler';
      case VehicleType.twoWheeler:
        return '2 Wheeler';
      case VehicleType.threeWheeler:
        return '3 Wheeler';
    }
  }

  IconData get icon {
    switch (this) {
      case VehicleType.fourWheeler:
        return Icons.directions_car_outlined;
      case VehicleType.twoWheeler:
        return Icons.two_wheeler_rounded;
      case VehicleType.threeWheeler:
        return Icons.electric_rickshaw_outlined;
    }
  }
}

class Vehicle {
  final String id;
  final String make;
  final String model;
  final int year;
  final String plate;

  /// Asset path for demo vehicles.
  final String? image;

  /// Photo picked by the user (works on web and mobile).
  final Uint8List? photo;
  final int mileageKm;
  final String fuel;
  final String transmission;
  final String color;
  final String bodyType;
  final int engineCc;
  final VehicleType type;
  final bool active;
  final String nextServiceNote;
  final double healthScore; // 0..1

  const Vehicle({
    required this.id,
    required this.make,
    required this.model,
    required this.year,
    required this.plate,
    this.image,
    this.photo,
    required this.mileageKm,
    required this.fuel,
    required this.transmission,
    this.color = 'White',
    this.bodyType = 'Sedan',
    this.engineCc = 1500,
    this.type = VehicleType.fourWheeler,
    this.active = true,
    required this.nextServiceNote,
    required this.healthScore,
  });

  String get name => '$make $model';

  Vehicle copyWith({
    String? make,
    String? model,
    int? year,
    String? plate,
    String? image,
    bool clearImage = false,
    Uint8List? photo,
    bool clearPhoto = false,
    int? mileageKm,
    String? fuel,
    String? transmission,
    String? color,
    String? bodyType,
    int? engineCc,
    VehicleType? type,
    bool? active,
  }) {
    return Vehicle(
      id: id,
      make: make ?? this.make,
      model: model ?? this.model,
      year: year ?? this.year,
      plate: plate ?? this.plate,
      image: clearImage ? null : (image ?? this.image),
      photo: clearPhoto ? null : (photo ?? this.photo),
      mileageKm: mileageKm ?? this.mileageKm,
      fuel: fuel ?? this.fuel,
      transmission: transmission ?? this.transmission,
      color: color ?? this.color,
      bodyType: bodyType ?? this.bodyType,
      engineCc: engineCc ?? this.engineCc,
      type: type ?? this.type,
      active: active ?? this.active,
      nextServiceNote: nextServiceNote,
      healthScore: healthScore,
    );
  }
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
  final Uint8List? bytes;
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

class ChangeRequest {
  final String id;
  final List<String> changes;
  final String details;
  final DateTime createdAt;
  final String status;

  const ChangeRequest({
    required this.id,
    required this.changes,
    required this.details,
    required this.createdAt,
    this.status = 'Under Review',
  });
}

enum JobStatus {
  diagnosis,
  awaitingApproval,
  changesRequested,
  inProgress,
  completed,
  paid,
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

enum PassportStatus { unresolved, confirmed, ruledOut, stillUnresolved }

class PassportEntry {
  final String title;
  final String detail;
  final String foundOn;
  final String jobId;
  final PassportStatus status;
  final String linkedSymptom;
  const PassportEntry({
    required this.title,
    required this.detail,
    required this.foundOn,
    required this.jobId,
    required this.status,
    required this.linkedSymptom,
  });
}

class ServiceRecord {
  final String title;
  final String subtitle;
  final String jobId;
  final DateTime date;
  final int mileageKm;
  final double amount;
  final List<String> work;
  final String garage;
  final IconData icon;
  const ServiceRecord({
    required this.title,
    this.subtitle = '',
    required this.jobId,
    required this.date,
    required this.mileageKm,
    required this.amount,
    required this.work,
    this.garage = 'Fixora Garage',
    this.icon = Icons.handyman_outlined,
  });
}

class UpcomingService {
  final String title;
  final String subtitle;
  final DateTime date;
  final String garage;
  final IconData icon;
  final String service; // maps to a Book Service type
  const UpcomingService({
    required this.title,
    required this.subtitle,
    required this.date,
    this.garage = 'Fixora Garage',
    required this.icon,
    required this.service,
  });
}

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

  Booking copyWith({BookingState? state, String? statusLabel, DateTime? date}) => Booking(
        id: id,
        vehicleId: vehicleId,
        service: service,
        date: date ?? this.date,
        state: state ?? this.state,
        statusLabel: statusLabel ?? this.statusLabel,
        amount: amount,
        queuePosition: queuePosition,
        garage: garage,
        symptoms: symptoms,
        offer: offer,
      );
}

class NearbyGarage {
  final String name;
  final double distanceKm;
  final int etaMin;
  final double rating;
  final int reviews;
  final List<String> capabilities;
  final bool towing;
  final String? image;
  final String address;
  final String hours;
  const NearbyGarage({
    required this.name,
    required this.distanceKm,
    required this.etaMin,
    required this.rating,
    this.reviews = 120,
    required this.capabilities,
    required this.towing,
    this.image,
    this.address = 'Kandy',
    this.hours = 'Open · 8:00 AM - 6:00 PM',
  });
}

enum PlanTier { silver, gold, platinum }

class ServicePlan {
  final String id;
  final String name;
  final PlanTier tier;
  final double price;
  final int months;
  final List<String> features;
  final bool popular;
  final int discountPercent;
  const ServicePlan({
    required this.id,
    required this.name,
    required this.tier,
    required this.price,
    required this.months,
    required this.features,
    this.popular = false,
    this.discountPercent = 0,
  });
}

class Subscription {
  final ServicePlan plan;
  final DateTime start;
  final DateTime end;
  final String paymentMethod;
  final String transactionId;
  const Subscription({
    required this.plan,
    required this.start,
    required this.end,
    required this.paymentMethod,
    required this.transactionId,
  });

  bool get isActive => end.isAfter(DateTime.now());
}

class ServiceOffer {
  final String id;
  final String title;
  final String subtitle;
  final String image;
  final int percent;
  final String service; // maps to a Book Service type
  const ServiceOffer({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.image,
    required this.percent,
    required this.service,
  });
}

class UserProfile {
  final String name;
  final String email;
  final String phone;
  final Uint8List? photo;
  const UserProfile({
    required this.name,
    required this.email,
    required this.phone,
    this.photo,
  });

  UserProfile copyWith({String? name, String? email, String? phone, Uint8List? photo}) => UserProfile(
        name: name ?? this.name,
        email: email ?? this.email,
        phone: phone ?? this.phone,
        photo: photo ?? this.photo,
      );
}

class GoogleAccount {
  final String name;
  final String email;
  const GoogleAccount({required this.name, required this.email});
}

/// Demo account record (replace with your .NET Identity / JWT API).
class Account {
  String name;
  String email;
  String phone;
  String password;
  final bool google;
  Account({
    required this.name,
    required this.email,
    required this.phone,
    required this.password,
    this.google = false,
  });
}