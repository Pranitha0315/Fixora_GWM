import 'package:flutter/material.dart';

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
  const Vehicle({
    required this.id,
    required this.make,
    required this.model,
    required this.year,
    required this.plate,
    this.type = VehicleType.fourWheeler,
    this.active = true,
    this.fuel = 'Petrol',
    this.color = 'White',
    this.mileageKm = 0,
    this.transmission = 'Automatic',
    this.bodyType = 'Sedan',
    this.engineCc = 1500,
    this.healthScore = 0.9,
    this.nextServiceNote = 'General Service due soon',
  });

  final String id;
  final String make;
  final String model;
  final int year;
  final String plate;
  final VehicleType type;
  final bool active;
  final String fuel;
  final String color;
  final int mileageKm;
  final String transmission;
  final String bodyType;
  final int engineCc;
  final double healthScore;
  final String nextServiceNote;

  String get name => '$make $model';

  Vehicle copyWith({
    String? make,
    String? model,
    int? year,
    String? plate,
    VehicleType? type,
    bool? active,
    String? fuel,
    String? color,
    int? mileageKm,
    String? transmission,
    String? bodyType,
    int? engineCc,
    double? healthScore,
    String? nextServiceNote,
  }) {
    return Vehicle(
      id: id,
      make: make ?? this.make,
      model: model ?? this.model,
      year: year ?? this.year,
      plate: plate ?? this.plate,
      type: type ?? this.type,
      active: active ?? this.active,
      fuel: fuel ?? this.fuel,
      color: color ?? this.color,
      mileageKm: mileageKm ?? this.mileageKm,
      transmission: transmission ?? this.transmission,
      bodyType: bodyType ?? this.bodyType,
      engineCc: engineCc ?? this.engineCc,
      healthScore: healthScore ?? this.healthScore,
      nextServiceNote: nextServiceNote ?? this.nextServiceNote,
    );
  }
}
