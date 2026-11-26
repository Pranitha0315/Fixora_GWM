import 'package:flutter/material.dart';

import '../../features/diagnosis/data/mock_diagnosis_service.dart';
import '../../features/diagnosis/domain/diagnosis_entities.dart';
import '../../features/inventory/domain/part.dart';
import '../../features/jobs/domain/job_entities.dart';
import '../../features/notifications/domain/app_notification.dart';
import '../../features/passport/domain/passport_entities.dart';
import '../../features/passport/presentation/passport_controller.dart';
import '../../features/sos/domain/sos_entities.dart';
import '../utils/hash_chain.dart';

/// Demo data for one working day at "Fixora Auto Care – Colombo 05".
class DemoSeed {
  DemoSeed._();

  static DateTime get _now => DateTime.now();
  static DateTime _today(int hour, int minute) {
    final n = _now;
    return DateTime(n.year, n.month, n.day, hour, minute);
  }

  // ---------------- Vehicles ----------------
  static const swift = Vehicle(
      id: 'V-101',
      make: 'Suzuki',
      model: 'Swift',
      year: 2019,
      plate: 'WP CAF-3390',
      mileageKm: 48210,
      fuel: 'Petrol',
      color: 'Red');
  static const prius = Vehicle(
      id: 'V-102',
      make: 'Toyota',
      model: 'Prius',
      year: 2015,
      plate: 'WP CAA-9012',
      mileageKm: 112400,
      fuel: 'Hybrid',
      color: 'Silver');
  static const aqua = Vehicle(
      id: 'V-103',
      make: 'Toyota',
      model: 'Aqua',
      year: 2016,
      plate: 'WP CAB-4521',
      mileageKm: 86750,
      fuel: 'Hybrid',
      color: 'White');
  static const vezel = Vehicle(
      id: 'V-104',
      make: 'Honda',
      model: 'Vezel',
      year: 2018,
      plate: 'WP CAR-7788',
      mileageKm: 64980,
      fuel: 'Hybrid',
      color: 'Grey');
  static const axio = Vehicle(
      id: 'V-105',
      make: 'Toyota',
      model: 'Axio',
      year: 2014,
      plate: 'WP CAD-1122',
      mileageKm: 131020,
      fuel: 'Petrol',
      color: 'Pearl white');
  static const xtrail = Vehicle(
      id: 'V-106',
      make: 'Nissan',
      model: 'X-Trail',
      year: 2017,
      plate: 'WP CAK-5560',
      mileageKm: 72340,
      fuel: 'Hybrid',
      color: 'Black');
  static const wagonR = Vehicle(
      id: 'V-107',
      make: 'Suzuki',
      model: 'Wagon R',
      year: 2017,
      plate: 'WP CBA-3344',
      mileageKm: 58900,
      fuel: 'Petrol',
      color: 'Blue');
  static const premio = Vehicle(
      id: 'V-108',
      make: 'Toyota',
      model: 'Premio',
      year: 2013,
      plate: 'WP KX-8841',
      mileageKm: 142300,
      fuel: 'Petrol',
      color: 'Black');

  // ---------------- Inventory ----------------
  static List<Part> parts() => [
        Part(
            id: 'coil_denso',
            name: 'Ignition coil (Denso)',
            partNumber: 'DN-90919-02258',
            brand: 'Denso',
            category: 'Ignition',
            unitPrice: 18500,
            available: 3,
            reserved: 0,
            substituteIds: const ['coil_ngk'],
            supplier: 'Lanka Auto Parts',
            fits: const ['Aqua', 'Prius', 'Axio']),
        Part(
            id: 'coil_ngk',
            name: 'Ignition coil (NGK)',
            partNumber: 'NGK-U5155',
            brand: 'NGK',
            category: 'Ignition',
            unitPrice: 16200,
            available: 2,
            reserved: 0,
            supplier: 'Lanka Auto Parts'),
        Part(
            id: 'spark_iridium',
            name: 'Spark plug – iridium',
            partNumber: 'NGK-ILKAR7B11',
            brand: 'NGK',
            category: 'Ignition',
            unitPrice: 3200,
            available: 14,
            reserved: 4,
            reorderLevel: 8,
            supplier: 'Lanka Auto Parts'),
        Part(
            id: 'rotor_vezel',
            name: 'Front brake rotor (OEM)',
            partNumber: 'HN-45251-T5A',
            brand: 'Honda',
            category: 'Brakes',
            unitPrice: 21500,
            available: 0,
            reserved: 0,
            incoming: 2,
            incomingEta: _now.add(const Duration(days: 2)),
            substituteIds: const ['rotor_brembo'],
            supplier: 'Stafford Motors',
            fits: const ['Vezel']),
        Part(
            id: 'rotor_brembo',
            name: 'Front brake rotor (Brembo)',
            partNumber: 'BR-09.D527.11',
            brand: 'Brembo',
            category: 'Brakes',
            unitPrice: 19800,
            available: 2,
            reserved: 0,
            supplier: 'Brake Masters Lanka',
            fits: const ['Vezel']),
        Part(
            id: 'pads_vezel',
            name: 'Front brake pads',
            partNumber: 'AKB-AN-8137WK',
            brand: 'Akebono',
            category: 'Brakes',
            unitPrice: 9800,
            available: 4,
            reserved: 0,
            supplier: 'Brake Masters Lanka'),
        Part(
            id: 'battery_45',
            name: 'Battery 12V 45Ah',
            partNumber: 'AMR-NS60L',
            brand: 'Amaron',
            category: 'Electrical',
            unitPrice: 27500,
            available: 0,
            reserved: 1,
            incoming: 4,
            incomingEta: _now.add(const Duration(days: 1)),
            substituteIds: const ['battery_50'],
            supplier: 'Amaron Lanka'),
        Part(
            id: 'battery_50',
            name: 'Battery 12V 50Ah (Exide)',
            partNumber: 'EX-55B24L',
            brand: 'Exide',
            category: 'Electrical',
            unitPrice: 29900,
            available: 1,
            reserved: 0,
            reorderLevel: 1,
            supplier: 'Exide Lanka'),
        Part(
            id: 'thermostat_axio',
            name: 'Thermostat with gasket',
            partNumber: 'TY-90916-03129',
            brand: 'Toyota',
            category: 'Cooling',
            unitPrice: 6400,
            available: 1,
            reserved: 0,
            reorderLevel: 1,
            supplier: 'Toyota Lanka'),
        Part(
            id: 'coolant_4l',
            name: 'Coolant (long life) 4L',
            partNumber: 'TY-LLC-4L',
            brand: 'Toyota',
            category: 'Cooling',
            unitPrice: 5200,
            available: 6,
            reserved: 0,
            supplier: 'Toyota Lanka'),
        Part(
            id: 'radiator_hose',
            name: 'Upper radiator hose',
            partNumber: 'TY-16571-21180',
            brand: 'Toyota',
            category: 'Cooling',
            unitPrice: 4800,
            available: 0,
            reserved: 0,
            incoming: 3,
            incomingEta: _now.add(const Duration(days: 1)),
            supplier: 'Toyota Lanka'),
        Part(
            id: 'ac_expansion',
            name: 'A/C expansion valve',
            partNumber: 'DN-447500-2280',
            brand: 'Denso',
            category: 'A/C',
            unitPrice: 14200,
            available: 0,
            reserved: 1,
            reorderLevel: 1,
            supplier: 'Cool Air Lanka'),
        Part(
            id: 'ac_gas',
            name: 'Refrigerant R134a (500 g)',
            partNumber: 'R134A-500',
            brand: 'Honeywell',
            category: 'A/C',
            unitPrice: 4500,
            available: 6,
            reserved: 2,
            supplier: 'Cool Air Lanka'),
        Part(
            id: 'cabin_filter',
            name: 'Cabin air filter',
            partNumber: 'TY-87139-52040',
            brand: 'Toyota',
            category: 'Filters',
            unitPrice: 2400,
            available: 1,
            reserved: 1,
            supplier: 'Toyota Lanka'),
        Part(
            id: 'oil_5w30',
            name: 'Engine oil 5W-30 (4L)',
            partNumber: 'CAS-5W30-4L',
            brand: 'Castrol',
            category: 'Fluids',
            unitPrice: 11800,
            available: 9,
            reserved: 0,
            supplier: 'Castrol Lanka'),
        Part(
            id: 'oil_filter',
            name: 'Oil filter',
            partNumber: 'TY-90915-YZZE1',
            brand: 'Toyota',
            category: 'Filters',
            unitPrice: 1900,
            available: 2,
            reserved: 0,
            reorderLevel: 3,
            supplier: 'Toyota Lanka'),
        Part(
            id: 'wiper_set',
            name: 'Wiper blade set',
            partNumber: 'BOS-AERO-26',
            brand: 'Bosch',
            category: 'Body',
            unitPrice: 5600,
            available: 5,
            reserved: 0,
            supplier: 'Bosch Lanka'),
      ];

  // ---------------- Jobs ----------------
  static List<Job> jobs() {
    final ac = MockDiagnosisService.scenarioFor('ac');
    final heat = MockDiagnosisService.scenarioFor('overheat');

    final swiftJob = Job(
      id: 'JOB-2010',
      token: 10,
      vehicle: swift,
      customer:
          const Customer(name: 'Dilani Fernando', phone: '+94 71 223 4455'),
      serviceType: 'Periodic service',
      reportedSymptoms: const ['Service due'],
      slotTime: _today(8, 0),
      estimatedMinutes: 60,
      status: JobStatus.completed,
      bay: 'Bay 1',
      scenario: 'service',
      estimate: Estimate(
        lines: [
          EstimateLine(
              partId: 'oil_5w30',
              name: 'Engine oil 5W-30 (4L)',
              qty: 1,
              unitPrice: 11800),
          EstimateLine(
              partId: 'oil_filter',
              name: 'Oil filter',
              qty: 1,
              unitPrice: 1900),
        ],
        labourHours: 1,
        recommendedRepair: 'Oil and filter change with 30-point inspection.',
      ),
      partsReserved: true,
      startedAt: _today(8, 5),
      completedAt: _today(8, 58),
    )..log('Job completed · invoice generated',
        icon: Icons.receipt_long_outlined);

    final priusJob = Job(
      id: 'JOB-2011',
      token: 11,
      vehicle: prius,
      customer: const Customer(name: 'Kasun Silva', phone: '+94 77 889 1020'),
      serviceType: 'A/C repair',
      reportedSymptoms: const [
        'A/C blows warm air',
        'Hissing noise behind dashboard'
      ],
      slotTime: _today(9, 0),
      estimatedMinutes: 120,
      status: JobStatus.inProgress,
      bay: 'Bay 2',
      scenario: 'ac',
      diagnosis: DiagnosisReport(
        symptoms: const [
          'A/C blows warm air',
          'Hissing noise behind dashboard'
        ],
        scan: ac.scan,
        evidence: [
          EvidenceItem(
              id: 'E-1',
              type: EvidenceType.thermal,
              caption: 'Evaporator outlet 19 °C',
              capturedAt: _now.subtract(const Duration(minutes: 70))),
        ],
        cause: ac.causes.first.title,
        causeDetail: ac.causes.first.reason,
        zoneId: 'ac',
        severity: Severity.medium,
        aiAssisted: true,
        aiConfidence: ac.causes.first.confidence,
        createdAt: _now.subtract(const Duration(minutes: 65)),
      ),
      estimate: Estimate(
        lines: [
          EstimateLine(
              partId: 'ac_expansion',
              name: 'A/C expansion valve',
              qty: 1,
              unitPrice: 14200,
              reservedQty: 1),
          EstimateLine(
              partId: 'ac_gas',
              name: 'Refrigerant R134a (500 g)',
              qty: 2,
              unitPrice: 4500,
              reservedQty: 2),
          EstimateLine(
              partId: 'cabin_filter',
              name: 'Cabin air filter',
              qty: 1,
              unitPrice: 2400,
              reservedQty: 1),
        ],
        labourHours: 2,
        recommendedRepair: ac.causes.first.repair,
      ),
      partsReserved: true,
      tasks: [
        RepairTask('Recover old refrigerant', done: true),
        RepairTask('Fit A/C expansion valve ×1', done: true),
        RepairTask('Vacuum test 30 min'),
        RepairTask('Fit Refrigerant R134a (500 g) ×2'),
        RepairTask('Fit Cabin air filter ×1'),
        RepairTask('Vent temperature test'),
      ],
      startedAt: _now.subtract(const Duration(minutes: 50)),
      progressPhotos: 2,
    );
    priusJob
      ..log('Customer approved the estimate', icon: Icons.thumb_up_alt_outlined)
      ..log('Repair started',
          detail: 'Bay 2', icon: Icons.build_circle_outlined);

    final aquaJob = Job(
      id: 'JOB-2012',
      token: 12,
      vehicle: aqua,
      customer: const Customer(name: 'Nimal Perera', phone: '+94 76 554 3321'),
      serviceType: 'Engine check',
      reportedSymptoms: const [
        'Engine vibration at idle',
        'Check-engine light on',
        'Poor pickup'
      ],
      slotTime: _today(10, 30),
      estimatedMinutes: 60,
      status: JobStatus.waiting,
      bay: 'Bay 3',
      scenario: 'misfire',
      customerNote: 'Shaking started after filling fuel last week.',
    )..log('Checked in by service advisor', icon: Icons.how_to_reg_outlined);

    final vezelJob = Job(
      id: 'JOB-2013',
      token: 13,
      vehicle: vezel,
      customer: const Customer(name: 'Fathima Rizvi', phone: '+94 75 120 9988'),
      serviceType: 'Brake inspection',
      reportedSymptoms: const [
        'Grinding noise when braking',
        'Steering shakes when braking'
      ],
      slotTime: _today(11, 15),
      estimatedMinutes: 75,
      status: JobStatus.waiting,
      bay: 'Bay 3',
      scenario: 'brakes',
      priority: JobPriority.returning,
      customerNote: 'Same problem as August, now worse on the highway.',
    )..log('Flagged: open Passport entry PP-1001', icon: Icons.history_rounded);

    final axioJob = Job(
      id: 'JOB-2014',
      token: 14,
      vehicle: axio,
      customer:
          const Customer(name: 'Ruwan Jayasinghe', phone: '+94 70 300 7766'),
      serviceType: 'Overheating',
      reportedSymptoms: const [
        'Temperature gauge rises in traffic',
        'Coolant smell'
      ],
      slotTime: _today(9, 45),
      estimatedMinutes: 90,
      status: JobStatus.awaitingApproval,
      bay: 'Bay 4',
      scenario: 'overheat',
      priority: JobPriority.safety,
      diagnosis: DiagnosisReport(
        symptoms: const ['Temperature gauge rises in traffic', 'Coolant smell'],
        scan: heat.scan,
        evidence: [
          EvidenceItem(
              id: 'E-2',
              type: EvidenceType.thermal,
              caption: 'Engine side 108 °C, lower hose 41 °C',
              capturedAt: _now.subtract(const Duration(minutes: 30))),
          EvidenceItem(
              id: 'E-3',
              type: EvidenceType.photo,
              caption: 'Residue at upper hose clamp',
              capturedAt: _now.subtract(const Duration(minutes: 28))),
        ],
        cause: heat.causes.first.title,
        causeDetail: heat.causes.first.reason,
        zoneId: 'cooling',
        severity: Severity.high,
        aiAssisted: true,
        aiConfidence: heat.causes.first.confidence,
        createdAt: _now.subtract(const Duration(minutes: 20)),
      ),
      estimate: Estimate(
        lines: [
          EstimateLine(
              partId: 'thermostat_axio',
              name: 'Thermostat with gasket',
              qty: 1,
              unitPrice: 6400),
          EstimateLine(
              partId: 'coolant_4l',
              name: 'Coolant (long life) 4L',
              qty: 1,
              unitPrice: 5200),
          EstimateLine(
              partId: 'radiator_hose',
              name: 'Upper radiator hose',
              qty: 1,
              unitPrice: 4800),
        ],
        labourHours: 1.5,
        recommendedRepair: heat.causes.first.repair,
      ),
      tasks: [
        RepairTask('Fit Thermostat with gasket ×1'),
        RepairTask('Fit Coolant (long life) 4L ×1'),
        RepairTask('Fit Upper radiator hose ×1'),
        RepairTask('Clear fault codes & re-scan'),
        RepairTask('Road test / functional test'),
      ],
      startedAt: _now.subtract(const Duration(minutes: 45)),
    )..log('Diagnostic report sent to customer', icon: Icons.send_rounded);

    final xtrailJob = Job(
      id: 'JOB-2015',
      token: 15,
      vehicle: xtrail,
      customer:
          const Customer(name: 'Priya Shanmugam', phone: '+94 77 640 2211'),
      serviceType: 'Periodic service + front noise',
      reportedSymptoms: const [
        'Knocking over bumps',
        'Service reminder on dash'
      ],
      slotTime: _today(12, 30),
      estimatedMinutes: 90,
      status: JobStatus.waiting,
      bay: 'Bay 1',
      scenario: 'service',
    )..log('Booked via Customer app', icon: Icons.event_available_outlined);

    return [swiftJob, priusJob, aquaJob, vezelJob, axioJob, xtrailJob];
  }

  // ---------------- Passport ----------------
  static List<PassportEntry> passport() {
    PassportEntry build(String id, Vehicle v, String title,
        PassportStatus status, List<Map<String, Object?>> raw) {
      final records = <PassportRecord>[];
      var prev = HashChain.genesis;
      for (final r in raw) {
        final rec = PassportController.buildRecord(
          prevHash: prev,
          kind: r['kind']! as String,
          mechanic: r['mechanic']! as String,
          note: r['note']! as String,
          at: r['at']! as DateTime,
          mileageKm: r['km'] as int?,
          codes: (r['codes'] as List<String>?) ?? const [],
          symptoms: (r['symptoms'] as List<String>?) ?? const [],
          evidenceCount: (r['evidence'] as int?) ?? 0,
          jobId: r['job'] as String?,
        );
        records.add(rec);
        prev = rec.hash;
      }
      return PassportEntry(
          id: id, vehicle: v, title: title, status: status, records: records);
    }

    final y = _now.year;
    return [
      build('PP-1001', vezel, 'Intermittent steering judder when braking',
          PassportStatus.monitoring, [
        {
          'kind': 'Created',
          'mechanic': 'Arun Kumar',
          'note':
              'Front rotor run-out 0.04 mm (borderline). Could not reproduce on a short '
                  'test drive. Pads at 5 mm.',
          'at': DateTime(y, 8, 12, 15, 20),
          'km': 61200,
          'symptoms': ['Steering judder at 60–80 km/h'],
          'evidence': 3,
          'job': 'JOB-1874',
        },
        {
          'kind': 'Status → Monitoring',
          'mechanic': 'Arun Kumar',
          'note':
              'Customer reports judder returns after long downhill drives. Re-check on next visit.',
          'at': DateTime(y, 9, 14, 10, 5),
        },
      ]),
      build('PP-1002', swift, 'Head unit restarts randomly',
          PassportStatus.resolved, [
        {
          'kind': 'Created',
          'mechanic': 'Sahan De Silva',
          'note': 'No codes. Voltage drop seen once at 11.9 V while cranking.',
          'at': DateTime(y, 6, 3, 11, 40),
          'km': 41800,
          'symptoms': ['Radio / display resets'],
          'evidence': 2,
        },
        {
          'kind': 'Resolved',
          'mechanic': 'Arun Kumar',
          'note':
              'Corroded ground strap replaced. No resets in 2 weeks of monitoring.',
          'at': DateTime(y, 7, 21, 16, 10),
          'job': 'JOB-1790',
        },
      ]),
      build('PP-1003', premio, 'ABS warning light comes on intermittently',
          PassportStatus.escalated, [
        {
          'kind': 'Created',
          'mechanic': 'Arun Kumar',
          'note': 'C0035 stored once, cleared. Sensor resistance within spec.',
          'at': DateTime(y, 9, 2, 9, 30),
          'km': 140100,
          'codes': ['C0035'],
          'symptoms': ['ABS light on rough roads'],
          'evidence': 1,
        },
        {
          'kind': 'Status → Escalated',
          'mechanic': 'Arun Kumar',
          'note':
              'Escalated to electrical specialist – wiring harness inspection needed.',
          'at': DateTime(y, 10, 8, 14, 0),
        },
      ]),
    ];
  }

  // ---------------- SOS ----------------
  static List<SosRequest> sos() => [
        SosRequest(
          id: 'SOS-311',
          customer: const Customer(
              name: 'Sajith Rathnayake', phone: '+94 71 909 4433'),
          vehicle: wagonR,
          issue: "Car won't start – battery dead",
          locationLabel: 'Galle Road, Wellawatte (near Savoy)',
          distanceKm: 2.4,
          channel: SosChannel.bleRelay,
          hops: 2,
          receivedAt: _now.subtract(const Duration(minutes: 3)),
        ),
      ];

  // ---------------- Notifications ----------------
  static List<AppNotification> notifications() => [
        AppNotification(
          kind: NotificationKind.sos,
          title: 'Roadside SOS nearby',
          body: "Suzuki Wagon R won't start · 2.4 km · received via BLE relay.",
          time: _now.subtract(const Duration(minutes: 3)),
        ),
        AppNotification(
          kind: NotificationKind.passport,
          title: 'Returning issue in your queue',
          body:
              'Honda Vezel WP CAR-7788 has an open Passport entry. Review the evidence first.',
          time: _now.subtract(const Duration(minutes: 40)),
          jobId: 'JOB-2013',
        ),
        AppNotification(
          kind: NotificationKind.job,
          title: 'New job assigned',
          body: 'Token #15 · Nissan X-Trail periodic service + front noise.',
          time: _now.subtract(const Duration(minutes: 55)),
          jobId: 'JOB-2015',
        ),
        AppNotification(
          kind: NotificationKind.parts,
          title: 'Delivery arriving tomorrow',
          body: 'Battery 12V 45Ah ×4 from Amaron Lanka.',
          time: _now.subtract(const Duration(hours: 2)),
          read: true,
        ),
      ];
}
