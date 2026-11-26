import '../../features/evidence_passport/domain/entities/evidence_record.dart';
import '../../features/fixproof/domain/entities/inspection_issue.dart';
import '../../features/repair_proposal/domain/entities/repair_item.dart';

/// Sample data for the FixProof, item-approval and job-evidence screens.
/// Jobs, SOS, parts, passport and alerts come from `core/data/demo_seed.dart`.
/// Job ids match DemoSeed (JOB-2010 … JOB-2015).
class MockData {
  MockData._();

  /// FixProof report state per job id at app start.
  static const reportStates = <String, String>{
    'JOB-2010': 'published',
    'JOB-2011': 'published',
    'JOB-2014': 'published',
  };

  static const issues = <InspectionIssue>[
    InspectionIssue(
      id: 'i1',
      area: 'Brakes',
      title: 'Front brake pads worn out',
      titleTa: 'முன் பிரேக் பேட் தேய்ந்துள்ளது',
      detail: 'Front pads are about 2 mm thick (minimum is 3 mm). Metal is touching the disc, causing the grinding sound.',
      detailTa: 'முன் பேட் சுமார் 2 மி.மீ மட்டுமே உள்ளது (குறைந்தது 3 மி.மீ தேவை). உலோகம் டிஸ்கில் உரசுவதால் சத்தம் வருகிறது.',
      severity: IssueSeverity.critical,
      evidenceLabels: ['Front-left pad', 'Front-right pad', 'Disc surface'],
    ),
    InspectionIssue(
      id: 'i2',
      area: 'Brakes',
      title: 'Front disc has light scoring',
      titleTa: 'முன் டிஸ்கில் கீறல்கள்',
      detail: 'Disc can be skimmed instead of replaced. Recommended together with new pads.',
      detailTa: 'டிஸ்கை மாற்றாமல் சீர் செய்யலாம். புதிய பேட்களுடன் சேர்த்து செய்வது நல்லது.',
      severity: IssueSeverity.soon,
      evidenceLabels: ['Disc close-up'],
    ),
    InspectionIssue(
      id: 'i3',
      area: 'Tyres',
      title: 'Front wheels out of balance',
      titleTa: 'முன் சக்கரங்கள் சமநிலை இல்லை',
      detail: 'Explains steering shake above 60 km/h. Wheel balancing needed.',
      detailTa: '60 கி.மீ வேகத்துக்கு மேல் ஸ்டீயரிங் அதிர்வுக்கு இதுவே காரணம். வீல் பேலன்சிங் தேவை.',
      severity: IssueSeverity.soon,
      evidenceLabels: ['Balancer reading'],
    ),
    InspectionIssue(
      id: 'i4',
      area: 'Engine',
      title: 'Engine oil and filter',
      titleTa: 'என்ஜின் ஆயில் மற்றும் ஃபில்டர்',
      detail: 'Oil level fine, colour dark. Normal service change is enough.',
      detailTa: 'ஆயில் அளவு சரி, நிறம் கருமை. வழக்கமான சர்வீஸ் மாற்றம் போதும்.',
      severity: IssueSeverity.ok,
      evidenceLabels: ['Dipstick'],
    ),
  ];

  static const voiceTranscript =
      'முன் பிரேக் பேட் ரெண்டு மில்லிமீட்டர் தான் இருக்கு, உடனே மாத்தணும். டிஸ்க்ல கொஞ்சம் கீறல் இருக்கு, skim பண்ணலாம். '
      'அறுபதுக்கு மேல ஸ்டீயரிங் ஆடுறது வீல் பேலன்ஸ் இல்லாததால. ஆயில் சர்வீஸ் மாத்தினா போதும்.';

  static const repairItems = <String, List<RepairItem>>{
    'JOB-2011': [
      RepairItem(id: 'r1', title: 'A/C gas recharge', type: RepairItemType.labour, price: 7500, decision: ApprovalDecision.approved),
      RepairItem(id: 'r2', title: 'Cabin air filter', type: RepairItemType.part, price: 3800, decision: ApprovalDecision.approved),
      RepairItem(id: 'r3', title: 'Condenser cleaning', type: RepairItemType.labour, price: 2500, decision: ApprovalDecision.declined),
    ],
    'JOB-2013': [
      RepairItem(id: 'r4', title: 'Front brake pads (set)', type: RepairItemType.part, price: 9800, decision: ApprovalDecision.notSent, linkedIssue: 'Front brake pads worn out'),
      RepairItem(id: 'r5', title: 'Disc skimming (2 discs)', type: RepairItemType.labour, price: 4500, decision: ApprovalDecision.notSent, linkedIssue: 'Front disc has light scoring'),
      RepairItem(id: 'r6', title: 'Wheel balancing (4 wheels)', type: RepairItemType.labour, price: 3200, decision: ApprovalDecision.notSent, linkedIssue: 'Front wheels out of balance'),
    ],
    'JOB-2014': [
      RepairItem(id: 'r7', title: 'Radiator hose (upper)', type: RepairItemType.part, price: 6200, decision: ApprovalDecision.pending),
      RepairItem(id: 'r8', title: 'Coolant flush + refill', type: RepairItemType.labour, price: 5500, decision: ApprovalDecision.approved),
      RepairItem(id: 'r9', title: 'Thermostat', type: RepairItemType.part, price: 8900, decision: ApprovalDecision.pending),
    ],
  };

  static const evidence = <EvidenceRecord>[
    EvidenceRecord(id: 'e1', jobId: 'JOB-2011', label: 'Odometer at check-in', phase: EvidencePhase.before, kind: MediaKind.photo, time: '08:34'),
    EvidenceRecord(id: 'e2', jobId: 'JOB-2011', label: 'Body walk-around', phase: EvidencePhase.before, kind: MediaKind.video, time: '08:36'),
    EvidenceRecord(id: 'e3', jobId: 'JOB-2011', label: 'Vent temperature', phase: EvidencePhase.inspection, kind: MediaKind.photo, time: '09:05'),
    EvidenceRecord(id: 'e4', jobId: 'JOB-2011', label: 'Gas pressure gauge', phase: EvidencePhase.inspection, kind: MediaKind.photo, time: '09:07'),
    EvidenceRecord(id: 'e5', jobId: 'JOB-2011', label: 'Cold air after recharge', phase: EvidencePhase.after, kind: MediaKind.video, time: '11:20'),
    EvidenceRecord(id: 'e6', jobId: 'JOB-2014', label: 'Coolant level', phase: EvidencePhase.before, kind: MediaKind.photo, time: '09:40'),
    EvidenceRecord(id: 'e7', jobId: 'JOB-2014', label: 'Cracked upper hose', phase: EvidencePhase.inspection, kind: MediaKind.photo, time: '10:02'),
  ];
}
