import 'package:fixora_rev/core/backend/repositories/mechanic_job_repository.dart';
import 'package:fixora_rev/core/notifications/fcm_notification_service.dart';
import 'package:fixora_rev/features/drivesense/data/drivesense_repository.dart';
import 'package:fixora_rev/features/fixproof/data/voice_recording_service.dart';
import 'package:fixora_rev/features/fixproof/domain/entities/inspection_issue.dart';
import 'package:fixora_rev/features/sos/domain/sos_entities.dart';
import 'package:fixora_rev/features/jobs/domain/job_entities.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('DriveSense empty when not opted in', () async {
    final snap = await DriveSenseRepository().forJob('j1', customerOptedIn: false);
    expect(snap.optedIn, isFalse);
    expect(snap.hasData, isFalse);
  });

  test('Voice recording Tamil/English status flow', () async {
    final v = VoiceRecordingService()..setLanguage(VoiceLanguage.tamil);
    expect(v.language, VoiceLanguage.tamil);
    v.start();
    expect(v.isRecording, isTrue);
    v.stop();
    expect(v.status, VoiceRecordStatus.stopped);
    v.setLanguage(VoiceLanguage.english);
    expect(v.language, VoiceLanguage.english);
    v.dispose();
  });

  test('SOS permission blocks other mechanic', () {
    final r = SosRequest(
      id: 's1',
      customer: const Customer(name: 'A', phone: '1'),
      vehicle: Vehicle(
        id: 'v',
        make: 'Toyota',
        model: 'Aqua',
        year: 2018,
        plate: 'CAA-1234',
        mileageKm: 1,
        fuel: 'Petrol',
        color: 'White',
      ),
      issue: 'Flat',
      locationLabel: 'Galle Rd',
      distanceKm: 2,
      channel: SosChannel.online,
      receivedAt: DateTime.now(),
    )..assignedMechanicId = 'mech-1';
    expect(r.canMechanicAct('mech-1'), isTrue);
    expect(r.canMechanicAct('mech-2'), isFalse);
  });

  test('Inspection severity labels exist', () {
    expect(IssueSeverity.critical.label, isNotEmpty);
    expect(IssueSeverity.soon.labelTa, isNotEmpty);
  });

  test('FCM service badge clears', () {
    final fcm = FcmNotificationService.instance;
    fcm.badgeCount = 3;
    fcm.badge.value = 3;
    fcm.clearBadge();
    expect(fcm.badgeCount, 0);
  });

  test('Job repository type exists', () {
    expect(MechanicJobRepository.new, isA<Function>());
  });
}
