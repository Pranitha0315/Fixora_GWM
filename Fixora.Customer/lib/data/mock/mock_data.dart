import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../models/models.dart';

/// Image asset paths.
class Img {
  Img._();
  static const _p = 'assets/images/';
  static const carHero = '${_p}car_hero.jpg';
  static const carThumb = '${_p}car_thumb.jpg';
  static const corollaThumb = '${_p}car_corolla_thumb.jpg';
  static const corollaHero = '${_p}car_corolla_hero.jpg';
  static const vezel = '${_p}car_vezel.jpg';
  static const xtrail = '${_p}car_xtrail.jpg';
  static const bikeFz = '${_p}bike_fz.jpg';
  static const bikeDio = '${_p}bike_dio.jpg';
  static const garageFixora = '${_p}garage_fixora.jpg';
  static const garageAutocare = '${_p}garage_autocare.jpg';
  static const bookingBay = '${_p}booking_bay.jpg';
  static const offerMechanic = '${_p}offer_mechanic.jpg';
  static const offerOil = '${_p}offer_oil.jpg';
  static const offerBrake = '${_p}offer_brake.jpg';
  static const mechanic = '${_p}mechanic.jpg';
  static const bumperBefore = '${_p}bumper_before.jpg';
  static const bumperAfter = '${_p}bumper_after.jpg';
  static const brakeDisc = '${_p}brake_disc.jpg';
  static const brakePads = '${_p}brake_pads.jpg';
  static const wheelAlignment = '${_p}wheel_alignment.jpg';
  static const engineBay = '${_p}engine_bay.jpg';
  static const obdData = '${_p}obd_data.jpg';
  static const cameraImage = '${_p}camera_image.jpg';
  static const thermalImage = '${_p}thermal_image.jpg';
  static const liveFrame = '${_p}live_frame.jpg';
  static const coolant = '${_p}coolant.jpg';
  static const airFilter = '${_p}air_filter.jpg';
  static const oil = '${_p}oil.jpg';
}

/// Demo data. Replace with API calls later.
class MockData {
  MockData._();

  static const customerName = 'Thanu';
  static const customerPhone = '+94 77 123 4567';
  static const customerEmail = 'thanu@example.com';
  static const garageName = 'Fixora Garage';
  static const garagePhone = '+94 81 222 3344';

  static const corolla = Vehicle(
    id: 'v1',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    plate: 'WP KC - 1234',
    image: Img.corollaThumb,
    mileageKm: 34860,
    fuel: 'Petrol',
    transmission: 'Automatic',
    color: 'White',
    bodyType: 'Sedan',
    engineCc: 1798,
    nextServiceNote: 'Engine oil change due in 1,200 km',
    healthScore: 0.82,
  );

  static const vezel = Vehicle(
    id: 'v2',
    make: 'Honda',
    model: 'Vezel',
    year: 2022,
    plate: 'WP AB - 5678',
    image: Img.vezel,
    mileageKm: 21400,
    fuel: 'Hybrid',
    transmission: 'Automatic',
    color: 'Blue',
    bodyType: 'SUV',
    engineCc: 1496,
    nextServiceNote: 'Hybrid battery check due this month',
    healthScore: 0.74,
  );

  static const xtrail = Vehicle(
    id: 'v3',
    make: 'Nissan',
    model: 'X-Trail',
    year: 2019,
    plate: 'WP CA - 9012',
    image: Img.xtrail,
    mileageKm: 68200,
    fuel: 'Diesel',
    transmission: 'Automatic',
    color: 'Grey',
    bodyType: 'SUV',
    engineCc: 1997,
    active: false,
    nextServiceNote: 'Not in use',
    healthScore: 0.61,
  );

  static const fz = Vehicle(
    id: 'v4',
    make: 'Yamaha',
    model: 'FZ',
    year: 2021,
    plate: 'WP BD - 3344',
    image: Img.bikeFz,
    mileageKm: 18900,
    fuel: 'Petrol',
    transmission: 'Manual',
    color: 'Blue',
    bodyType: 'Street',
    engineCc: 149,
    type: VehicleType.twoWheeler,
    nextServiceNote: 'Chain lube due in 300 km',
    healthScore: 0.88,
  );

  static const dio = Vehicle(
    id: 'v5',
    make: 'Honda',
    model: 'Dio',
    year: 2018,
    plate: 'WP BF - 7788',
    image: Img.bikeDio,
    mileageKm: 24300,
    fuel: 'Petrol',
    transmission: 'Automatic',
    color: 'White',
    bodyType: 'Scooter',
    engineCc: 110,
    type: VehicleType.twoWheeler,
    active: false,
    nextServiceNote: 'Not in use',
    healthScore: 0.66,
  );

  static const vehicles = [corolla, vezel, xtrail, fz, dio];

  static const brands = {
    VehicleType.fourWheeler: ['Toyota', 'Honda', 'Nissan', 'Suzuki', 'Mitsubishi', 'Hyundai', 'Kia', 'BMW', 'Mercedes-Benz', 'Other'],
    VehicleType.twoWheeler: ['Yamaha', 'Honda', 'Bajaj', 'TVS', 'Hero', 'Suzuki', 'Other'],
    VehicleType.threeWheeler: ['Bajaj', 'TVS', 'Piaggio', 'Other'],
  };
  static const fuels = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
  static const colors = ['White', 'Black', 'Silver', 'Grey', 'Blue', 'Dark Blue', 'Red', 'Green', 'Other'];

  static const jobId = 'JC-2026-00125';
  static const mechanicName = 'Kasun Perera';
  static const advisorName = 'Nimal Silva';

  static final checkInTime = DateTime(2026, 8, 27, 9, 15);

  static const estimateItems = [
    EstimateItem(
      name: 'Coolant Thermostat',
      subtitle: 'OEM Part (P0128)',
      qty: 1,
      unitPrice: 18000,
      type: ItemType.part,
      icon: Icons.settings_input_component_rounded,
      color: Color(0xFFB7791F),
    ),
    EstimateItem(
      name: 'Coolant (4 Litres)',
      subtitle: 'Engine Coolant',
      qty: 1,
      unitPrice: 2000,
      type: ItemType.part,
      icon: Icons.water_drop_rounded,
      color: AppColors.primary,
    ),
    EstimateItem(
      name: 'Brake Pads (Front)',
      subtitle: 'Worn to 3 mm - replace',
      qty: 1,
      unitPrice: 12500,
      type: ItemType.part,
      icon: Icons.album_rounded,
      color: Color(0xFF5B6680),
    ),
    EstimateItem(
      name: 'Labour Charge',
      subtitle: 'Replace & refill coolant, brake pads',
      qty: 1,
      unitPrice: 8000,
      type: ItemType.labour,
      icon: Icons.handyman_rounded,
      color: Color(0xFF3D5A80),
    ),
    EstimateItem(
      name: 'Wheel Alignment',
      subtitle: '4-wheel computerised',
      qty: 1,
      unitPrice: 6500,
      type: ItemType.labour,
      icon: Icons.tire_repair_rounded,
      color: AppColors.teal,
    ),
  ];

  static const vatRate = 0.15;

  static const progressSteps = [
    'Parts Ordered',
    'Repair Started',
    'Parts Installed',
    'Quality Check',
    'Ready for Pickup',
  ];

  static final progressTimes = [
    DateTime(2026, 8, 27, 13, 0),
    DateTime(2026, 8, 27, 14, 0),
    DateTime(2026, 8, 27, 14, 50),
    DateTime(2026, 8, 27, 15, 40),
    DateTime(2026, 8, 27, 16, 30),
  ];

  static const primaryFinding = DiagnosisFinding(
    code: 'P0128',
    title: 'Coolant Thermostat',
    description: 'Coolant temperature below regulating temperature',
    severity: 'High',
    confidence: 0.92,
  );

  static const otherFindings = [
    DiagnosisFinding(
      code: 'INSP',
      title: 'Front brake pads worn',
      description: 'Pad thickness 3 mm (minimum 4 mm). Squeal reported.',
      severity: 'Medium',
      confidence: 0.88,
    ),
    DiagnosisFinding(
      code: 'INSP',
      title: 'Wheel alignment off',
      description: 'Vehicle pulls to the left at 60 km/h.',
      severity: 'Low',
      confidence: 0.74,
    ),
  ];

  static const symptomsReported = [
    'Temperature gauge stays low',
    'Heater blows cold air',
    'Squeaking when braking',
    'Pulls to the left',
  ];

  static const liveReadings = [
    LiveReading('Coolant Temp', '71', '°C', warning: true),
    LiveReading('Engine RPM', '820', 'rpm'),
    LiveReading('Battery', '13.9', 'V'),
    LiveReading('Fuel Trim', '+3.1', '%'),
  ];

  static const initialMedia = [
    MediaItem(asset: Img.bumperBefore, kind: MediaKind.photo, stage: MediaStage.before, caption: 'Front bumper scratch at check-in'),
    MediaItem(asset: Img.brakeDisc, kind: MediaKind.photo, stage: MediaStage.during, caption: 'Brake disc inspection'),
    MediaItem(asset: Img.brakePads, kind: MediaKind.photo, stage: MediaStage.during, caption: 'Old vs new brake pads'),
    MediaItem(asset: Img.wheelAlignment, kind: MediaKind.photo, stage: MediaStage.during, caption: 'Wheel alignment in progress'),
    MediaItem(asset: Img.bumperAfter, kind: MediaKind.photo, stage: MediaStage.after, caption: 'Bumper after polishing'),
    MediaItem(asset: Img.brakeDisc, kind: MediaKind.video, stage: MediaStage.during, caption: 'Brake pad replacement', duration: '02:36'),
    MediaItem(asset: Img.wheelAlignment, kind: MediaKind.video, stage: MediaStage.during, caption: 'Alignment readings', duration: '01:48'),
  ];

  static List<AppNotification> buildNotifications() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return [
      AppNotification(
        id: 'n1',
        title: 'Service Reminder',
        body: 'Engine oil change due in 1,200 km',
        time: now.subtract(const Duration(minutes: 10)),
        kind: NotificationKind.serviceDue,
        unread: true,
      ),
      AppNotification(
        id: 'n2',
        title: 'Estimate ready for approval',
        body: 'Your estimate for $jobId is ready. Review and approve to start the repair.',
        time: now.subtract(const Duration(minutes: 35)),
        kind: NotificationKind.estimate,
        unread: true,
      ),
      AppNotification(
        id: 'n3',
        title: 'Offer Alert',
        body: '20% off on selected service packages this week',
        time: now.subtract(const Duration(minutes: 50)),
        kind: NotificationKind.offer,
        unread: true,
      ),
      AppNotification(
        id: 'n4',
        title: 'Vehicle Received',
        body: 'Your vehicle has been received at Fixora Garage',
        time: today.add(const Duration(hours: 9, minutes: 10)),
        kind: NotificationKind.received,
      ),
      AppNotification(
        id: 'n5',
        title: 'Booking Confirmed',
        body: 'Your diagnosis booking for Toyota Corolla is confirmed',
        time: today.add(const Duration(hours: 8, minutes: 30)),
        kind: NotificationKind.booking,
      ),
      AppNotification(
        id: 'n6',
        title: 'Premium Wash Deal',
        body: 'Get a free interior cleaning with premium wash',
        time: today.add(const Duration(hours: 7, minutes: 30)),
        kind: NotificationKind.offer,
      ),
      AppNotification(
        id: 'n7',
        title: '3 new photos added',
        body: 'Kasun added photos of the brake inspection.',
        time: today.subtract(const Duration(hours: 3)),
        kind: NotificationKind.media,
      ),
      AppNotification(
        id: 'n8',
        title: 'Brake Service Discount',
        body: 'Save LKR 5,000 on brake pad replacement',
        time: today.subtract(const Duration(hours: 6)),
        kind: NotificationKind.offer,
      ),
      AppNotification(
        id: 'n9',
        title: 'Subscription Offer',
        body: 'Upgrade your plan and get 1 month free',
        time: today.subtract(const Duration(hours: 8)),
        kind: NotificationKind.subscription,
      ),
      AppNotification(
        id: 'n10',
        title: 'Queue update',
        body: 'Honda Vezel: you are #2 in the queue for your next visit.',
        time: today.subtract(const Duration(hours: 10)),
        kind: NotificationKind.queue,
      ),
      AppNotification(
        id: 'n11',
        title: 'Next Service Due',
        body: 'Honda Vezel hybrid battery check is due this month',
        time: today.subtract(const Duration(days: 2)),
        kind: NotificationKind.reminder,
      ),
      AppNotification(
        id: 'n12',
        title: 'Payment received',
        body: 'LKR 18,630 paid for JC-2026-00087. Thank you!',
        time: today.subtract(const Duration(days: 5)),
        kind: NotificationKind.payment,
      ),
    ];
  }

  static List<Booking> buildBookings() {
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    return [
      Booking(
        id: jobId,
        vehicleId: 'v1',
        service: 'Diagnosis & Repair',
        date: day.add(const Duration(hours: 8, minutes: 30)),
        state: BookingState.active,
        statusLabel: 'In Service',
      ),
      Booking(
        id: 'BK-2026-00412',
        vehicleId: 'v2',
        service: 'Hybrid Check',
        date: day.add(const Duration(days: 3, hours: 10, minutes: 30)),
        state: BookingState.upcoming,
        statusLabel: 'Confirmed',
        queuePosition: 2,
      ),
      Booking(
        id: 'JC-2026-00087',
        vehicleId: 'v1',
        service: 'General Service',
        date: DateTime(2026, 6, 14, 8, 30),
        state: BookingState.completed,
        statusLabel: 'Completed',
        amount: 18630,
      ),
      Booking(
        id: 'JC-2026-00031',
        vehicleId: 'v2',
        service: 'AC Repair',
        date: DateTime(2026, 3, 2, 11, 0),
        state: BookingState.completed,
        statusLabel: 'Completed',
        amount: 24150,
        garage: 'AutoCare Workshop',
      ),
      Booking(
        id: 'BK-2026-00198',
        vehicleId: 'v4',
        service: 'General Service',
        date: DateTime(2026, 2, 10, 15, 0),
        state: BookingState.cancelled,
        statusLabel: 'Cancelled',
      ),
    ];
  }

  static final history = <String, List<ServiceRecord>>{
    'v1': [
      ServiceRecord(
        title: 'General Service',
        subtitle: 'Oil change, filters, full inspection',
        jobId: 'JC-2026-00087',
        date: DateTime(2026, 6, 14),
        mileageKm: 32500,
        amount: 18630,
        work: ['Engine oil & filter', 'Air filter', '21-point inspection'],
        icon: Icons.handyman_outlined,
      ),
      ServiceRecord(
        title: 'Brake Inspection',
        subtitle: 'Front brake pad check and cleaning',
        jobId: 'JC-2026-00044',
        date: DateTime(2026, 3, 10),
        mileageKm: 29900,
        amount: 6500,
        work: ['Front pads cleaned', 'Brake fluid checked'],
        icon: Icons.album_outlined,
      ),
      ServiceRecord(
        title: 'Wheel Alignment',
        subtitle: 'Alignment and balancing',
        jobId: 'JC-2025-00980',
        date: DateTime(2025, 12, 22),
        mileageKm: 25200,
        amount: 7800,
        work: ['4-wheel alignment', 'Wheel balancing'],
        garage: 'AutoCare Workshop',
        icon: Icons.tire_repair_rounded,
      ),
      ServiceRecord(
        title: 'Battery Check',
        subtitle: 'Battery health test and terminal cleaning',
        jobId: 'JC-2025-00731',
        date: DateTime(2025, 9, 5),
        mileageKm: 21800,
        amount: 2500,
        work: ['Battery load test', 'Terminal cleaning'],
        icon: Icons.battery_charging_full_rounded,
      ),
    ],
    'v2': [
      ServiceRecord(
        title: 'AC Repair',
        subtitle: 'AC gas refill and leak test',
        jobId: 'JC-2026-00031',
        date: DateTime(2026, 3, 2),
        mileageKm: 18020,
        amount: 24150,
        work: ['AC gas refill', 'Cabin filter', 'Leak test'],
        garage: 'AutoCare Workshop',
        icon: Icons.ac_unit_rounded,
      ),
    ],
    'v4': [
      ServiceRecord(
        title: 'General Service',
        subtitle: 'Oil change and chain adjustment',
        jobId: 'JC-2026-00012',
        date: DateTime(2026, 1, 20),
        mileageKm: 16200,
        amount: 4200,
        work: ['Engine oil', 'Chain adjust & lube'],
        icon: Icons.two_wheeler_rounded,
      ),
    ],
  };

  static final upcoming = <String, List<UpcomingService>>{
    'v1': [
      UpcomingService(
        title: 'Engine Oil Change',
        subtitle: 'Oil and filter replacement',
        date: DateTime(2026, 11, 27),
        icon: Icons.oil_barrel_outlined,
        service: 'General Service',
      ),
      UpcomingService(
        title: 'General Service',
        subtitle: 'Full vehicle inspection and maintenance',
        date: DateTime(2027, 1, 27),
        icon: Icons.handyman_outlined,
        service: 'General Service',
      ),
      UpcomingService(
        title: 'Brake Service',
        subtitle: 'Brake pad check and replacement (if needed)',
        date: DateTime(2027, 3, 27),
        icon: Icons.album_outlined,
        service: 'Brakes',
      ),
      UpcomingService(
        title: 'Wheel Alignment',
        subtitle: 'Alignment and wheel balancing',
        date: DateTime(2027, 5, 27),
        icon: Icons.tire_repair_rounded,
        service: 'Tyres & Alignment',
      ),
    ],
    'v2': [
      UpcomingService(
        title: 'Hybrid System Check',
        subtitle: 'Hybrid battery and inverter health',
        date: DateTime(2026, 11, 8),
        icon: Icons.battery_charging_full_rounded,
        service: 'Hybrid Check',
      ),
    ],
  };

  static const passport = {
    'v1': [
      PassportEntry(
        title: 'Radiator cap seal weak',
        detail: 'Pressure test borderline (0.9 bar). Could cause slow coolant loss.',
        foundOn: '27 Aug 2026',
        jobId: jobId,
        status: PassportStatus.unresolved,
        linkedSymptom: 'Coolant level dropping',
      ),
      PassportEntry(
        title: 'Rear left wheel bearing noise',
        detail: 'Faint hum above 80 km/h. Not confirmed on lift.',
        foundOn: '14 Jun 2026',
        jobId: 'JC-2026-00087',
        status: PassportStatus.stillUnresolved,
        linkedSymptom: 'Humming noise at speed',
      ),
      PassportEntry(
        title: 'Alternator undercharging',
        detail: 'Output measured 14.1 V after battery check - within range.',
        foundOn: '05 Sep 2025',
        jobId: 'JC-2025-00731',
        status: PassportStatus.ruledOut,
        linkedSymptom: 'Battery drains overnight',
      ),
      PassportEntry(
        title: 'Thermostat stuck open',
        detail: 'Suspected in June, confirmed by OBD P0128 + thermal image in August.',
        foundOn: '14 Jun 2026',
        jobId: jobId,
        status: PassportStatus.confirmed,
        linkedSymptom: 'Heater blows cold air',
      ),
    ],
    'v2': [
      PassportEntry(
        title: 'Hybrid battery cell imbalance',
        detail: 'Block 7 voltage 0.3 V lower than average. Monitor next visit.',
        foundOn: '02 Mar 2026',
        jobId: 'JC-2026-00031',
        status: PassportStatus.unresolved,
        linkedSymptom: 'Reduced EV mode range',
      ),
    ],
  };

  static const garages = [
    NearbyGarage(
      name: 'Fixora Garage',
      distanceKm: 2.4,
      etaMin: 12,
      rating: 4.7,
      reviews: 320,
      capabilities: ['Engine', 'Hybrid', 'Battery', 'Towing'],
      towing: true,
      image: Img.garageFixora,
      address: '45 Peradeniya Rd, Kandy',
    ),
    NearbyGarage(
      name: 'AutoCare Workshop',
      distanceKm: 3.8,
      etaMin: 18,
      rating: 4.5,
      reviews: 210,
      capabilities: ['Tyres', 'Alignment', 'AC'],
      towing: false,
      image: Img.garageAutocare,
      address: '12 William Gopallawa Mw, Kandy',
      hours: 'Open · 8:30 AM - 5:30 PM',
    ),
    NearbyGarage(
      name: 'Hill Capital Service Centre',
      distanceKm: 6.8,
      etaMin: 25,
      rating: 4.6,
      reviews: 145,
      capabilities: ['Engine', 'Electrical', 'Towing'],
      towing: true,
      image: Img.bookingBay,
      address: 'Katugastota Rd, Kandy',
    ),
    NearbyGarage(
      name: 'Peradeniya Motor Works',
      distanceKm: 7.9,
      etaMin: 28,
      rating: 4.4,
      reviews: 98,
      capabilities: ['Tyres', 'Electrical'],
      towing: false,
      image: Img.garageAutocare,
      address: 'Peradeniya Rd, Peradeniya',
      hours: 'Open · 8:00 AM - 5:00 PM',
    ),
    NearbyGarage(
      name: 'Kandy Lanka Motors',
      distanceKm: 9.2,
      etaMin: 32,
      rating: 4.3,
      reviews: 76,
      capabilities: ['Body & Paint', 'AC', 'Engine'],
      towing: true,
      image: Img.garageFixora,
      address: 'Kurunegala Rd, Kandy',
    ),
  ];

  static const plans = [
    ServicePlan(
      id: 'silver',
      name: 'Silver Plan',
      tier: PlanTier.silver,
      price: 2500,
      months: 6,
      features: ['2 General Services', 'Basic Inspection', 'Service Reminder'],
    ),
    ServicePlan(
      id: 'gold',
      name: 'Gold Plan',
      tier: PlanTier.gold,
      price: 4500,
      months: 12,
      popular: true,
      discountPercent: 10,
      features: ['4 General Services', 'Priority Booking', '10% Service Discount', 'Service Reminder'],
    ),
    ServicePlan(
      id: 'platinum',
      name: 'Platinum Plan',
      tier: PlanTier.platinum,
      price: 7500,
      months: 12,
      discountPercent: 15,
      features: [
        '6 General Services',
        'Priority Service',
        '15% Service Discount',
        'Free Vehicle Health Check',
        'Service Reminder',
      ],
    ),
  ];

  static ServicePlan planById(String id) => plans.firstWhere((p) => p.id == id, orElse: () => plans[1]);

  static const offers = [
    ServiceOffer(
      id: 'o1',
      title: 'Engine Oil Change',
      subtitle: 'Oil change + Filter replacement',
      image: Img.offerOil,
      percent: 15,
      service: 'General Service',
    ),
    ServiceOffer(
      id: 'o2',
      title: 'Brake Service',
      subtitle: 'Brake pad check + Cleaning',
      image: Img.offerBrake,
      percent: 10,
      service: 'Brakes',
    ),
    ServiceOffer(
      id: 'o3',
      title: 'Special Service Offer',
      subtitle: 'Up to 20% OFF on General Service',
      image: Img.offerMechanic,
      percent: 20,
      service: 'General Service',
    ),
    ServiceOffer(
      id: 'o4',
      title: 'Wheel Alignment',
      subtitle: '3D alignment + Wheel balancing',
      image: Img.wheelAlignment,
      percent: 12,
      service: 'Tyres & Alignment',
    ),
    ServiceOffer(
      id: 'o10',
      title: 'Hybrid Battery Check',
      subtitle: 'Battery health test + Cooling fan clean',
      image: Img.engineBay,
      percent: 15,
      service: 'Hybrid Check',
    ),
    ServiceOffer(
      id: 'o11',
      title: 'Scratch & Dent Repair',
      subtitle: 'Bumper scratch repair + Polish',
      image: Img.bumperBefore,
      percent: 10,
      service: 'Body & Paint',
    ),
  ];

  static List<Subscription> buildPastSubscriptions() => [
        Subscription(
          plan: plans[0],
          start: DateTime(2026, 2, 27),
          end: DateTime(2026, 8, 26),
          paymentMethod: 'Credit / Debit Card',
          transactionId: 'FXR6612034',
        ),
        Subscription(
          plan: plans[1],
          start: DateTime(2025, 2, 27),
          end: DateTime(2026, 2, 26),
          paymentMethod: 'Mobile Payment',
          transactionId: 'FXR5120987',
        ),
        Subscription(
          plan: plans[2],
          start: DateTime(2024, 2, 27),
          end: DateTime(2025, 2, 26),
          paymentMethod: 'Bank Transfer',
          transactionId: 'FXR4087211',
        ),
      ];
}
