import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/buttons.dart';
import '../../../core/widgets/common.dart' show MediaRow;
import '../../../core/widgets/rev_common.dart';
import '../../auth/presentation/screens/status_screens.dart';
import '../../inventory/domain/part.dart';
import '../../jobs/domain/job_entities.dart';
import '../data/mock_diagnosis_service.dart';
import '../domain/diagnosis_entities.dart';
import 'widgets/evidence_thumb.dart';
import 'widgets/vehicle_diagram.dart';

enum _ObdState { idle, connecting, scanning, done, skipped }

/// Guided 6-step diagnosis (BRD USP 1):
/// Symptoms → OBD-II scan → Evidence → AI assistant → Location → Estimate.
class DiagnosisFlowScreen extends StatefulWidget {
  const DiagnosisFlowScreen({super.key, required this.jobId});
  final String jobId;

  @override
  State<DiagnosisFlowScreen> createState() => _DiagnosisFlowScreenState();
}

class _DiagnosisFlowScreenState extends State<DiagnosisFlowScreen> {
  static const _steps = [
    'Symptoms',
    'OBD-II scan',
    'Evidence',
    'AI assistant',
    'Problem location',
    'Estimate & report',
  ];

  static const _commonSymptoms = [
    "Won't start",
    'Engine vibration at idle',
    'Check-engine light on',
    'Unusual noise',
    'Overheating',
    'Grinding noise when braking',
    'Steering shakes when braking',
    'Smoke from exhaust',
    'Fuel smell',
    'A/C not cooling',
    'Battery warning light',
    'Poor pickup',
  ];

  late final Job job = AppServices.jobs.byId(widget.jobId);
  int _step = 0;

  // Step 1 – symptoms
  late final Set<String> _symptoms = {...job.reportedSymptoms};
  final _notes = TextEditingController();

  // Step 2 – OBD
  _ObdState _obd = _ObdState.idle;
  ObdScanResult? _scan;

  // Step 3 – evidence
  final List<EvidenceItem> _evidence = [];

  // Step 4 – AI
  bool _analyzing = false;
  List<AiCause>? _causes;
  final Set<int> _picked = {};
  bool _manual = false;
  final _manualCause = TextEditingController();

  // Step 5 – location
  String? _zoneId;
  String _zoneFor = '';
  Severity _severity = Severity.medium;

  // Step 6 – estimate
  final List<EstimateLine> _lines = [];
  double _labourHours = 1;
  final _repair = TextEditingController();
  String _builtFor = '';
  bool _sending = false;

  @override
  void dispose() {
    _notes.dispose();
    _manualCause.dispose();
    _repair.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- logic

  List<String> get _symptomOptions {
    final all = <String>[...job.reportedSymptoms];
    for (final s in _commonSymptoms) {
      if (!all.contains(s)) all.add(s);
    }
    return all;
  }

  List<AiCause> get _pickedCauses {
    final causes = _causes;
    if (causes == null) return const [];
    final indexes = _picked.toList()..sort();
    return [for (final i in indexes) causes[i]];
  }

  bool get _canContinue => switch (_step) {
        0 => _symptoms.isNotEmpty,
        1 => _obd == _ObdState.done || _obd == _ObdState.skipped,
        2 => true,
        3 => _picked.isNotEmpty ||
            (_manual && _manualCause.text.trim().isNotEmpty),
        4 => _zoneId != null,
        _ => _lines.isNotEmpty || _labourHours > 0,
      };

  Future<void> _runObd() async {
    setState(() => _obd = _ObdState.connecting);
    await AppServices.diagnosis.connectAdapter();
    if (!mounted) return;
    setState(() => _obd = _ObdState.scanning);
    final result = await AppServices.diagnosis.scan(job);
    if (!mounted) return;
    setState(() {
      _scan = result;
      _obd = _ObdState.done;
    });
  }

  Future<void> _runAi() async {
    setState(() {
      _analyzing = true;
      _causes = null;
      _picked.clear();
    });
    final causes = await AppServices.diagnosis.analyze(
      job,
      symptoms: _symptoms.toList(),
      scan: _scan,
      evidenceCount: _evidence.length,
    );
    if (!mounted) return;
    setState(() {
      _analyzing = false;
      _causes = causes;
    });
  }

  void _addEvidence(EvidenceType type) {
    final n = _evidence.where((e) => e.type == type).length + 1;
    final caption = switch (type) {
      EvidenceType.photo => 'Photo $n – ${job.vehicle.title}',
      EvidenceType.endoscope => 'Endoscope view $n',
      EvidenceType.thermal => 'Thermal capture $n',
    };
    setState(() => _evidence.add(EvidenceItem(
          id: 'EV-${DateTime.now().millisecondsSinceEpoch}',
          type: type,
          caption: caption,
          capturedAt: DateTime.now(),
        )));
  }

  /// Long-press on a captured item: the same options as its buttons, in a bottom sheet.
  Future<void> _evidenceOptions(int i) {
    final item = _evidence[i];
    return showActionSheet(
      context,
      title: item.caption,
      subtitle: '${item.type.label} · ${Fmt.time(item.capturedAt)}',
      actions: [
        SheetAction(
          icon: item.type.icon,
          label: 'Capture another ${item.type.label.toLowerCase()}',
          onTap: () => _addEvidence(item.type),
        ),
        SheetAction(
          icon: Icons.delete_outline_rounded,
          label: 'Remove',
          danger: true,
          onTap: () => setState(() => _evidence.remove(item)),
        ),
      ],
    );
  }

  /// (Re)builds the estimate from the confirmed causes.
  void _prepareEstimate() {
    final key = _manual ? 'manual:${_manualCause.text}' : _picked.join(',');
    if (key == _builtFor) return;
    _builtFor = key;
    _lines.clear();
    final inv = AppServices.inventory;
    final qty = <String, int>{};
    double hours = 0;
    final repairs = <String>[];
    for (final c in _pickedCauses) {
      for (final p in c.parts) {
        qty[p.partId] = (qty[p.partId] ?? 0) + p.qty;
      }
      hours += c.labourHours;
      repairs.add(c.repair);
    }
    qty.forEach((id, q) {
      final part = inv.byId(id);
      if (part != null) {
        _lines.add(EstimateLine(
            partId: id, name: part.name, qty: q, unitPrice: part.unitPrice));
      }
    });
    _labourHours = hours == 0 ? 1 : hours;
    _repair.text = repairs.isEmpty ? '' : repairs.join(' ');
  }

  void _next() {
    FocusScope.of(context).unfocus();
    if (_step == 2 && _causes == null && !_analyzing) _runAi();
    if (_step == 3) {
      final primary = _pickedCauses.isNotEmpty ? _pickedCauses.first : null;
      final key = _picked.join(',');
      if (primary != null && key != _zoneFor) {
        _zoneFor = key;
        _zoneId = primary.zoneId;
        _severity = primary.severity;
      }
    }
    if (_step == 4) _prepareEstimate();
    if (_step == 1 && _obd == _ObdState.idle) return;
    setState(() => _step++);
  }

  Future<void> _back() async {
    if (_step > 0) {
      setState(() => _step--);
      return;
    }
    final leave = await confirmDialog(
      context,
      title: 'Leave diagnosis?',
      message:
          'The job stays in "Diagnosing". Answers on this screen will be cleared.',
      confirmLabel: 'Leave',
    );
    if (leave && mounted) Navigator.of(context).pop();
  }

  Future<void> _send() async {
    setState(() => _sending = true);
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    final primary = _pickedCauses.isNotEmpty ? _pickedCauses.first : null;
    final causeTitle = _manual && _manualCause.text.trim().isNotEmpty
        ? _manualCause.text.trim()
        : _pickedCauses.map((c) => c.title).join(' + ');
    final report = DiagnosisReport(
      symptoms: _symptoms.toList(),
      scan: _scan,
      evidence: List.of(_evidence),
      cause: causeTitle,
      causeDetail: _manual
          ? 'Confirmed by mechanic inspection.'
          : (primary?.reason ?? ''),
      zoneId: _zoneId ?? 'engine',
      severity: _severity,
      aiAssisted: !_manual && primary != null,
      aiConfidence: _manual ? null : primary?.confidence,
      createdAt: DateTime.now(),
      mechanicNotes: _notes.text.trim(),
    );
    final estimate = Estimate(
      lines: List.of(_lines),
      labourHours: _labourHours,
      recommendedRepair: _repair.text.trim(),
    );
    AppServices.jobs.submitDiagnosis(job, report, estimate);
    if (!mounted) return;
    context.replaceWith(ResultScreen(
      title: 'Report sent',
      message:
          '${job.customer.name} can now see the diagnosis, evidence and estimate of '
          '${Fmt.lkr(estimate.total)} in the Fixora app and approve it.',
      actionLabel: 'Back to job',
      icon: Icons.send_rounded,
      actionIcon: Icons.assignment_outlined,
      onAction: (ctx) => Navigator.of(ctx).pop(),
    ));
  }

  Future<void> _parkInPassport() async {
    final title = TextEditingController(
        text: _symptoms.isEmpty
            ? 'Unresolved issue'
            : 'Unresolved: ${_symptoms.first}');
    final note = TextEditingController();
    final confirmed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 0, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Park in Evidence Passport',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(
              'Use this when the problem cannot be confirmed today. Symptoms, codes and evidence are '
              'saved to the vehicle and re-surface on its next visit.',
              style: TextStyle(color: AppColors.inkSoft, height: 1.35),
            ),
            const SizedBox(height: 14),
            TextField(
                controller: title,
                decoration: const InputDecoration(labelText: 'Issue title')),
            const SizedBox(height: 10),
            TextField(
              controller: note,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Findings so far (required)',
                hintText: 'What you checked and what you saw',
              ),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: 'Save to Passport',
              icon: Icons.bookmark_add_outlined,
              onPressed: () {
                if (note.text.trim().isEmpty) return;
                Navigator.pop(ctx, true);
              },
            ),
          ],
        ),
      ),
    );
    if (confirmed == true && mounted) {
      final mechanic = AppServices.auth.user?.fullName ?? 'Mechanic';
      final entry = AppServices.passport.createFromDiagnosis(
        job: job,
        title:
            title.text.trim().isEmpty ? 'Unresolved issue' : title.text.trim(),
        note: note.text.trim(),
        mechanic: mechanic,
        symptoms: _symptoms.toList(),
        codes: _scan?.codes.map((c) => c.code).toList() ?? const [],
        evidenceCount: _evidence.length,
      );
      AppServices.jobs.parkInPassport(job, entry.id);
      if (!mounted) return;
      Navigator.of(context).pop();
      context.toast('Saved as ${entry.id} in the Evidence Passport',
          icon: Icons.bookmark_added);
    }
    // Dispose after the sheet's closing animation has finished.
    Future<void>.delayed(const Duration(milliseconds: 500), () {
      title.dispose();
      note.dispose();
    });
  }

  // ---------------------------------------------------------------- UI

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
              icon: const Icon(Icons.arrow_back_rounded), onPressed: _back),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Diagnosis · #${job.token}'),
              Text('${job.vehicle.title} · ${job.vehicle.plate}',
                  style: TextStyle(
                      fontSize: 12.5,
                      color: AppColors.inkSoft,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
        body: Column(
          children: [
            _StepHeader(step: _step, titles: _steps),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: KeyedSubtree(
                  key: ValueKey(_step),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    children: switch (_step) {
                      0 => _symptomsStep(),
                      1 => _obdStep(),
                      2 => _evidenceStep(),
                      3 => _aiStep(),
                      4 => _locationStep(),
                      _ => _estimateStep(),
                    },
                  ),
                ),
              ),
            ),
          ],
        ),
        bottomNavigationBar: BottomActionBar(
          child: Row(
            children: [
              if (_step > 0) ...[
                Expanded(
                    child: OutlineButtonX(
                        label: 'Back',
                        icon: Icons.arrow_back_rounded,
                        onPressed: _back)),
                const SizedBox(width: 12),
              ],
              Expanded(
                flex: 2,
                child: _step == _steps.length - 1
                    ? PrimaryButton(
                        label: 'Send to customer',
                        loadingLabel: 'Sending…',
                        icon: Icons.send_rounded,
                        loading: _sending,
                        onPressed: _canContinue ? _send : null,
                      )
                    : _step == 1 && _obd != _ObdState.done && _obd != _ObdState.skipped
                        // OBD step: the scan is this screen's one main action, so it lives
                        // here in the thumb zone instead of a second button in the page.
                        ? PrimaryButton(
                            label: 'Connect & scan',
                            loadingLabel: 'Scanning…',
                            icon: Icons.play_arrow_rounded,
                            loading: _obd == _ObdState.connecting || _obd == _ObdState.scanning,
                            onPressed: _runObd,
                          )
                        : PrimaryButton(
                            label: 'Next',
                            icon: Icons.arrow_forward_rounded,
                            onPressed: _canContinue ? _next : null,
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---- Step 1
  List<Widget> _symptomsStep() => [
        const _StepIntro(
          icon: Icons.record_voice_over_outlined,
          title: 'Confirm the symptoms',
          text:
              'Customer answers from the app are pre-selected. Add anything you observed.',
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in _symptomOptions)
              _SelectChip(
                label: s,
                selected: _symptoms.contains(s),
                fromCustomer: job.reportedSymptoms.contains(s),
                onTap: () => setState(() => _symptoms.contains(s)
                    ? _symptoms.remove(s)
                    : _symptoms.add(s)),
              ),
          ],
        ),
        const SizedBox(height: 18),
        TextField(
          controller: _notes,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Mechanic notes (optional)',
            hintText:
                'E.g. vibration felt at 700 rpm, goes away above 1,500 rpm',
          ),
        ),
      ];

  // ---- Step 2
  List<Widget> _obdStep() {
    final scan = _scan;
    final busy = _obd == _ObdState.connecting || _obd == _ObdState.scanning;
    return [
      AppCard(
        child: Column(
          children: [
            Row(
              children: [
                IconBadge(
                  icon: _obd == _ObdState.done
                      ? Icons.bluetooth_connected_rounded
                      : Icons.bluetooth_searching_rounded,
                  color: _obd == _ObdState.done
                      ? AppColors.success
                      : AppColors.info,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(MockDiagnosisService.adapterName,
                          style: TextStyle(fontWeight: FontWeight.w800)),
                      Text(
                        switch (_obd) {
                          _ObdState.idle =>
                            'Plug the adapter into the OBD port under the dashboard',
                          _ObdState.connecting => 'Connecting over Bluetooth…',
                          _ObdState.scanning =>
                            'Reading codes, live data and freeze frame…',
                          _ObdState.done =>
                            'Scan complete · ${scan?.codes.length ?? 0} code(s)',
                          _ObdState.skipped => 'Scan skipped',
                        },
                        style: TextStyle(
                            color: AppColors.inkSoft, fontSize: 13),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (busy) ...[
              const SizedBox(height: 14),
              ClipRRect(
                borderRadius: BorderRadius.all(Radius.circular(6)),
                child: LinearProgressIndicator(
                    minHeight: 6, backgroundColor: AppColors.primarySoft),
              ),
            ],
            if (_obd == _ObdState.idle) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() => _obd = _ObdState.skipped),
                child: const Text('No OBD port? Skip scan'),
              ),
            ],
            if (_obd == _ObdState.skipped) ...[
              const SizedBox(height: 14),
              OutlineButtonX(
                  label: 'Scan after all',
                  icon: Icons.play_arrow_rounded,
                  onPressed: _runObd),
            ],
          ],
        ),
      ),
      const SizedBox(height: 8),
      Text(
          'Simulation mode – sample data is used when no adapter is connected.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppColors.muted)),
      if (scan != null) ...[
        const SectionTitle('Fault codes'),
        if (scan.codes.isEmpty)
          AppCard(
            child: Row(
              children: [
                Icon(Icons.check_circle_outline_rounded,
                    color: AppColors.success),
                SizedBox(width: 10),
                Text('No fault codes stored',
                    style: TextStyle(fontWeight: FontWeight.w700)),
              ],
            ),
          )
        else
          for (final c in scan.codes) _DtcCard(code: c),
        const SectionTitle('Live data'),
        for (final r in scan.readings)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ReadingTile(reading: r),
          ),
        const SizedBox(height: 12),
        AppCard(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Icon(Icons.ac_unit_rounded,
                  size: 18, color: AppColors.info),
              const SizedBox(width: 8),
              Expanded(
                child: Text('Freeze frame: ${scan.freezeFrame}',
                    style: TextStyle(
                        fontSize: 13, color: AppColors.inkSoft)),
              ),
            ],
          ),
        ),
      ],
    ];
  }

  // ---- Step 3
  List<Widget> _evidenceStep() => [
        const _StepIntro(
          icon: Icons.photo_camera_outlined,
          title: 'Capture evidence',
          text:
              'Evidence is shown to the customer in the report. Optional, but it builds trust.',
        ),
        const SizedBox(height: 14),
        for (final t in EvidenceType.values)
          AppCard(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            onTap: () => _addEvidence(t),
            child: Row(
              children: [
                IconBadge(icon: t.icon),
                const SizedBox(width: 12),
                Expanded(
                  child: Text('Capture ${t.label.toLowerCase()}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                ),
                Icon(Icons.add_circle_outline_rounded, color: AppColors.primary),
              ],
            ),
          ),
        const SizedBox(height: 8),
        Text('Endoscope and thermal camera are simulated in this demo.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.muted)),
        SectionTitle('Captured (${_evidence.length})'),
        if (_evidence.isEmpty)
          const AppCard(
            child: EmptyState(
              compact: true,
              icon: Icons.photo_camera_outlined,
              title: 'Nothing captured yet',
              message: 'Tap Capture photo above. Photos are shown to the customer and build trust.',
            ),
          )
        else
          // One evidence item per row (vertical list, 48px remove button).
          for (var i = 0; i < _evidence.length; i++)
            MediaRow(
              thumbnail: EvidenceThumb(type: _evidence[i].type, seed: i, showLabel: false),
              title: _evidence[i].caption,
              subtitle: '${_evidence[i].type.label} · ${Fmt.time(_evidence[i].capturedAt)}',
              onLongPress: () => _evidenceOptions(i),
              onRemove: () => setState(() => _evidence.removeAt(i)),
            ),
      ];

  // ---- Step 4
  List<Widget> _aiStep() {
    final causes = _causes;
    return [
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
              colors: [Color(0xFF7B5CE0), Color(0xFFF26B1D)]),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          children: [
            const Icon(Icons.auto_awesome, color: Colors.white, size: 30),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('AI Diagnosis Assistant',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16)),
                  Text(
                    '${_symptoms.length} symptoms · ${_scan?.codes.length ?? 0} codes · ${_evidence.length} evidence',
                    style:
                        const TextStyle(color: Colors.white70, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            if (!_analyzing)
              IconButton(
                tooltip: 'Run again',
                onPressed: _runAi,
                icon: const Icon(Icons.refresh_rounded, color: Colors.white),
              ),
          ],
        ),
      ),
      const SizedBox(height: 14),
      if (_analyzing || causes == null)
        AppCard(
          child: Column(
            children: [
              const SizedBox(height: 8),
              const CircularProgressIndicator(),
              const SizedBox(height: 14),
              const Text('Analysing symptoms, codes and evidence…',
                  style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('Ranking probable causes by likelihood',
                  style: TextStyle(color: AppColors.inkSoft, fontSize: 13)),
              if (!_analyzing) ...[
                const SizedBox(height: 12),
                OutlineButtonX(
                    label: 'Start analysis',
                    icon: Icons.auto_awesome,
                    onPressed: _runAi),
              ],
            ],
          ),
        )
      else ...[
        const Text('Tap to confirm the cause(s) you agree with:',
            style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        for (var i = 0; i < causes.length; i++)
          _CauseCard(
            rank: i + 1,
            cause: causes[i],
            selected: _picked.contains(i),
            onTap: () => setState(() {
              _manual = false;
              _picked.contains(i) ? _picked.remove(i) : _picked.add(i);
            }),
          ),
        const SizedBox(height: 4),
        AppCard(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 12),
          child: Column(
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _manual,
                title: const Text('None of these – I found the cause',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                onChanged: (v) => setState(() {
                  _manual = v;
                  if (v) _picked.clear();
                }),
              ),
              if (_manual)
                TextField(
                  controller: _manualCause,
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                      hintText: 'Describe the confirmed cause'),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Icon(Icons.shield_outlined, size: 16, color: AppColors.muted),
            SizedBox(width: 6),
            Expanded(
              child: Text(
                  'AI suggestions are advisory. You confirm the final cause.',
                  style: TextStyle(fontSize: 12.5, color: AppColors.muted)),
            ),
          ],
        ),
        const SizedBox(height: 14),
        OutlineButtonX(
          label: "Can't confirm today? Park in Passport",
          icon: Icons.bookmark_add_outlined,
          color: AppColors.purple,
          borderColor: AppColors.purple.withValues(alpha: 0.35),
          onPressed: _parkInPassport,
        ),
      ],
    ];
  }

  // ---- Step 5
  List<Widget> _locationStep() => [
        const _StepIntro(
          icon: Icons.place_outlined,
          title: 'Mark the problem location',
          text:
              'The highlighted area is shown to the customer. Tap a point to change it.',
        ),
        const SizedBox(height: 10),
        AppCard(
          child: Column(
            children: [
              VehicleDiagram(
                selectedZoneId: _zoneId,
                onZoneTap: (id) => setState(() => _zoneId = id),
              ),
              const SizedBox(height: 12),
              Text(
                _zoneId == null
                    ? 'Tap a point on the car'
                    : zoneById(_zoneId!).label,
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryDark),
              ),
            ],
          ),
        ),
        const SectionTitle('Severity'),
        Row(
          children: [
            for (final s in Severity.values)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: GestureDetector(
                    onTap: () => setState(() => _severity = s),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 160),
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: _severity == s ? s.color : AppColors.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: _severity == s ? s.color : AppColors.border),
                      ),
                      child: Text(
                        s.label,
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color:
                              _severity == s ? AppColors.onPrimary : AppColors.inkSoft,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ];

  // ---- Step 6
  List<Widget> _estimateStep() {
    final inv = AppServices.inventory;
    final partsTotal = _lines.fold<double>(0, (s, l) => s + l.total);
    const rate = 3500.0;
    final labourTotal = _labourHours * rate;
    var worst = PartAvailability.ready;
    for (final l in _lines) {
      final a = inv.lineAvailability(l);
      if (a.rank > worst.rank) worst = a;
    }
    return [
      AppCard(
        color: AppColors.primarySoft,
        borderColor: AppColors.primaryBorder,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _manual
                  ? _manualCause.text.trim()
                  : _pickedCauses.map((c) => c.title).join(' + '),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                Pill(
                    label: zoneById(_zoneId ?? 'engine').label,
                    color: AppColors.primaryDark,
                    icon: Icons.place_outlined,
                    dense: true),
                Pill(
                    label: _severity.label,
                    color: _severity.color,
                    dense: true),
                Pill(
                    label: '${_evidence.length} evidence',
                    color: AppColors.info,
                    dense: true),
              ],
            ),
          ],
        ),
      ),
      SectionTitle('Parts', action: '+ Add part', onAction: _pickPart),
      if (_lines.isEmpty)
        AppCard(
          child: EmptyState(
            compact: true,
            icon: Icons.inventory_2_outlined,
            title: 'No parts on this estimate',
            message: 'Labour only? That is fine. Otherwise add the parts the repair needs.',
            actionLabel: 'Add part',
            actionIcon: Icons.add_rounded,
            onAction: _pickPart,
          ),
        )
      else
        AppCard(
          padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
          child: Column(
            children: [
              for (final l in List.of(_lines)) _draftLine(l),
              const Divider(),
              Row(
                children: [
                  const Text('Job parts status',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  const Spacer(),
                  TrafficLight(worst),
                  const SizedBox(width: 6),
                ],
              ),
            ],
          ),
        ),
      const SectionTitle('Labour'),
      AppCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${Fmt.hours(_labourHours)} × ${Fmt.lkr(rate)}',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(Fmt.lkr(labourTotal),
                      style: TextStyle(color: AppColors.inkSoft)),
                ],
              ),
            ),
            _Stepper(
              onMinus: _labourHours > 0.5
                  ? () => setState(() => _labourHours -= 0.5)
                  : null,
              onPlus: () => setState(() => _labourHours += 0.5),
            ),
          ],
        ),
      ),
      const SectionTitle('Recommended repair'),
      TextField(controller: _repair, minLines: 2, maxLines: 4),
      const SizedBox(height: 16),
      AppCard(
        child: Column(
          children: [
            InfoRow('Parts', Fmt.lkr(partsTotal)),
            InfoRow('Labour', Fmt.lkr(labourTotal)),
            const Divider(),
            InfoRow('Estimated total', Fmt.lkr(partsTotal + labourTotal),
                bold: true, valueColor: AppColors.primaryDark),
          ],
        ),
      ),
      const SizedBox(height: 10),
      Text(
        'The customer sees the problem, location, evidence, severity and this estimate before approving.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12.5, color: AppColors.muted),
      ),
    ];
  }

  Widget _draftLine(EstimateLine l) {
    final inv = AppServices.inventory;
    final a = inv.lineAvailability(l);
    final subs = a == PartAvailability.ready
        ? const <Part>[]
        : inv.substitutesFor(l.partId, qty: l.qty);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              TrafficLight(a, showLabel: false),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.name,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    Text('${Fmt.lkr(l.unitPrice)} · ${a.short}',
                        style: TextStyle(
                            fontSize: 12,
                            color: a.color,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              _Stepper(
                value: l.qty,
                onMinus: () => setState(() {
                  if (l.qty > 1) {
                    l.qty--;
                  } else {
                    _lines.remove(l);
                  }
                }),
                onPlus: () => setState(() => l.qty++),
              ),
            ],
          ),
          if (subs.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 20, top: 6),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => setState(() {
                  final s = subs.first;
                  l
                    ..partId = s.id
                    ..name = s.name
                    ..unitPrice = s.unitPrice;
                }),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(minHeight: 44),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    widthFactor: 1,
                    child: Pill(
                      label: 'Use ${subs.first.name} (in stock)',
                      color: AppColors.success,
                      icon: Icons.swap_horiz_rounded,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _pickPart() async {
    final inv = AppServices.inventory;
    final picked = await showModalBottomSheet<Part>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SizedBox(
        height: MediaQuery.sizeOf(ctx).height * 0.7,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: [
            const Text('Add part',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            for (final p in inv.parts)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: TrafficLight(
                  p.available > 0
                      ? PartAvailability.ready
                      : p.incoming > 0
                          ? PartAvailability.partial
                          : PartAvailability.blocked,
                  showLabel: false,
                ),
                title: Text(p.name,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(
                    '${p.brand} · ${p.available} available · ${Fmt.lkr(p.unitPrice)}'),
                onTap: () => Navigator.pop(ctx, p),
              ),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      final existing = _lines.where((l) => l.partId == picked.id).toList();
      if (existing.isNotEmpty) {
        existing.first.qty++;
      } else {
        _lines.add(EstimateLine(
            partId: picked.id,
            name: picked.name,
            qty: 1,
            unitPrice: picked.unitPrice));
      }
    });
  }
}

// ==================================================================== widgets

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step, required this.titles});
  final int step;
  final List<String> titles;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.surface,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Step ${step + 1} of ${titles.length}',
                  style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                      fontSize: 12.5)),
              const SizedBox(width: 8),
              Text(titles[step],
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var i = 0; i < titles.length; i++)
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    height: 5,
                    margin:
                        EdgeInsets.only(right: i == titles.length - 1 ? 0 : 4),
                    decoration: BoxDecoration(
                      color:
                          i <= step ? AppColors.primary : AppColors.primarySoft,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StepIntro extends StatelessWidget {
  const _StepIntro(
      {required this.icon, required this.title, required this.text});
  final IconData icon;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        IconBadge(icon: icon),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(text,
                  style:
                      TextStyle(color: AppColors.inkSoft, height: 1.35)),
            ],
          ),
        ),
      ],
    );
  }
}

class _SelectChip extends StatelessWidget {
  const _SelectChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.fromCustomer = false,
  });
  final String label;
  final bool selected;
  final bool fromCustomer;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : AppColors.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
              color: selected ? AppColors.primary : AppColors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (fromCustomer) ...[
              Icon(Icons.person_rounded,
                  size: 14, color: selected ? AppColors.onPrimary : AppColors.primary),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                color: selected ? AppColors.onPrimary : AppColors.ink,
                fontWeight: FontWeight.w600,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DtcCard extends StatelessWidget {
  const _DtcCard({required this.code});
  final DtcCode code;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            decoration: BoxDecoration(
              color: code.severity.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(code.code,
                style: TextStyle(
                    fontWeight: FontWeight.w900,
                    color: code.severity.color,
                    fontSize: 13)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                        child: Text(code.title,
                            style:
                                const TextStyle(fontWeight: FontWeight.w700))),
                    Pill(
                        label: code.severity.label,
                        color: code.severity.color,
                        dense: true),
                  ],
                ),
                const SizedBox(height: 4),
                Text(code.plainMeaning,
                    style: TextStyle(
                        color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadingTile extends StatelessWidget {
  const _ReadingTile({required this.reading});
  final LiveReading reading;

  @override
  Widget build(BuildContext context) {
    final warn = reading.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: warn ? AppColors.warningSoft : AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: warn
                ? AppColors.warning.withValues(alpha: 0.4)
                : AppColors.border),
      ),
      constraints: const BoxConstraints(minHeight: 52),
      child: Row(
        children: [
          if (warn) ...[
            Icon(Icons.warning_amber_rounded, size: 20, color: AppColors.warning),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(reading.label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, color: AppColors.inkSoft)),
          ),
          const SizedBox(width: 10),
          Text.rich(
            TextSpan(
              text: reading.value,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w900,
                color: warn ? AppColors.warning : AppColors.ink,
              ),
              children: [
                TextSpan(
                  text: reading.unit.isEmpty ? '' : ' ${reading.unit}',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppColors.inkSoft),
                ),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _CauseCard extends StatelessWidget {
  const _CauseCard(
      {required this.rank,
      required this.cause,
      required this.selected,
      required this.onTap});
  final int rank;
  final AiCause cause;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final pct = (cause.confidence * 100).round();
    final barColor = cause.confidence >= 0.7
        ? AppColors.success
        : cause.confidence >= 0.45
            ? AppColors.warning
            : AppColors.muted;
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      borderColor: selected ? AppColors.primary : AppColors.border,
      color: selected ? AppColors.primarySoft : AppColors.surface,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 13,
                backgroundColor: selected ? AppColors.primary : AppColors.field,
                child: selected
                    ? Icon(Icons.check_rounded,
                        size: 16, color: AppColors.onPrimary)
                    : Text('$rank',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: AppColors.inkSoft)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(cause.title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
              ),
              Text('$pct%',
                  style: TextStyle(
                      fontWeight: FontWeight.w900,
                      color: barColor,
                      fontSize: 16)),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: cause.confidence,
              minHeight: 6,
              color: barColor,
              backgroundColor: AppColors.field,
            ),
          ),
          const SizedBox(height: 8),
          Text(cause.reason,
              style: TextStyle(
                  color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Pill(
                  label: zoneById(cause.zoneId).label,
                  color: AppColors.primaryDark,
                  icon: Icons.place_outlined,
                  dense: true),
              Pill(
                  label: cause.severity.label,
                  color: cause.severity.color,
                  dense: true),
              Pill(
                  label: Fmt.hours(cause.labourHours),
                  color: AppColors.inkSoft,
                  icon: Icons.timer_outlined,
                  dense: true),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({this.value, required this.onMinus, required this.onPlus});
  final int? value;
  final VoidCallback? onMinus;
  final VoidCallback onPlus;

  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, VoidCallback? onTap) => InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: onTap == null ? AppColors.field : AppColors.primarySoft,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon,
                size: 18,
                color: onTap == null ? AppColors.muted : AppColors.primary),
          ),
        );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        btn(Icons.remove_rounded, onMinus),
        if (value != null)
          SizedBox(
            width: 32,
            child: Text('$value',
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w800)),
          )
        else
          const SizedBox(width: 8),
        btn(Icons.add_rounded, onPlus),
      ],
    );
  }
}
