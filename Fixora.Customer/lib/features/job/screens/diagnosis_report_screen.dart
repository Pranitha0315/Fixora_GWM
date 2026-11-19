import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/models.dart';

/// Diagnosis Report: fault code, problem location, evidence (USP 1).
class DiagnosisReportScreen extends StatefulWidget {
  const DiagnosisReportScreen({super.key});

  @override
  State<DiagnosisReportScreen> createState() => _DiagnosisReportScreenState();
}

class _DiagnosisReportScreenState extends State<DiagnosisReportScreen> {
  int _tab = 0;

  static const _evidence = [
    MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.during,
      caption: 'OBD-II scan - P0128 stored',
    ),
    MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.during,
      caption: 'Endoscope camera - thermostat housing',
    ),
    MediaItem(
      asset: '',
      kind: MediaKind.photo,
      stage: MediaStage.during,
      caption: 'Thermal image - radiator stays cold',
    ),
  ];

  static const _primary = DiagnosisFinding(
    code: 'P0128',
    title: 'Coolant Thermostat',
    description: 'Coolant temperature below regulating temperature',
    severity: 'High',
    confidence: 0.92,
  );

  static const _otherFindings = [
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

  static const _symptoms = [
    'Temperature gauge stays low',
    'Heater blows cold air',
    'Squeaking when braking',
    'Pulls to the left',
  ];

  static const _liveReadings = [
    LiveReading('Coolant Temp', '71', '°C', warning: true),
    LiveReading('Engine RPM', '820', 'rpm'),
    LiveReading('Battery', '13.9', 'V'),
    LiveReading('Fuel Trim', '+3.1', '%'),
  ];

  static const _evidenceLabels = ['OBD Data', 'Camera Image', 'Thermal Image'];
  static const _evidenceIcons = [
    Icons.analytics_outlined,
    Icons.photo_camera_outlined,
    Icons.thermostat_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Diagnosis Report'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
        actions: [
          TextButton.icon(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Diagnosis report saved as PDF'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            icon: const Icon(Icons.download_rounded, size: 18),
            label: const Text('PDF'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            decoration: BoxDecoration(
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.assignment_outlined, color: AppColors.link),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Diagnosis Report', style: AppText.h2),
                          Text(
                            'Detailed diagnostic results for your vehicle.',
                            style: AppText.muted.copyWith(fontSize: 13),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.primarySofter,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        'FX-1042',
                        style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w800, fontSize: 12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final e in const [
                        (0, 'Summary', null),
                        (1, 'Live Data', Icons.show_chart_rounded),
                        (2, 'Media', Icons.smart_display_outlined),
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            avatar: e.$3 == null ? null : Icon(e.$3, size: 16),
                            label: Text(e.$2),
                            selected: _tab == e.$1,
                            onSelected: (_) => setState(() => _tab = e.$1),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 280),
                  child: KeyedSubtree(
                    key: ValueKey(_tab),
                    child: switch (_tab) {
                      0 => _summary(context),
                      1 => _liveData(),
                      _ => _media(context),
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _summary(BuildContext context) {
    const f = _primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      gradient: AppColors.sosGradient,
                      borderRadius: BorderRadius.circular(30),
                      boxShadow: [
                        BoxShadow(color: AppColors.danger.o(0.3), blurRadius: 12, offset: const Offset(0, 5)),
                      ],
                    ),
                    child: Text(
                      f.code,
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f.title, style: AppText.h2),
                        const SizedBox(height: 2),
                        Text(f.description, style: AppText.muted.copyWith(fontSize: 13.5)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: AppColors.dangerSoft,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.warning_amber_rounded, color: AppColors.danger, size: 14),
                        const SizedBox(width: 4),
                        Text(
                          'Severity: High',
                          style: TextStyle(color: AppColors.dangerText, fontWeight: FontWeight.w700, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Row(
                      children: [
                        Text(
                          'Confidence ${(f.confidence * 100).round()}%',
                          style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: f.confidence,
                              minHeight: 6,
                              backgroundColor: AppColors.border,
                              color: AppColors.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        _section('Problem Location'),
        AspectRatio(
          aspectRatio: 1.9,
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.primarySofter,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Center(child: Icon(Icons.car_repair_outlined, size: 56, color: AppColors.link.o(0.5))),
                Positioned(
                  left: 12,
                  bottom: 10,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.o(0.55),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.location_on_rounded, color: Color(0xFFFF6B6B), size: 16),
                        SizedBox(width: 4),
                        Text(
                          'Thermostat housing · engine front',
                          style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        _section('Evidence'),
        Row(
          children: [
            for (var i = 0; i < _evidence.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: Column(
                  children: [
                    AspectRatio(
                      aspectRatio: 1.45,
                      child: _EvidenceTile(
                        icon: _evidenceIcons[i],
                        caption: _evidence[i].caption,
                        onTap: () => _openEvidence(context, i),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _evidenceLabels[i],
                      style: AppText.muted.copyWith(fontSize: 12.5, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
        _section('Symptoms you reported'),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in _symptoms)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: AppColors.primarySofter,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(s, style: AppText.label.copyWith(fontSize: 12)),
              ),
          ],
        ),
        _section('Other findings'),
        for (final o in _otherFindings)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: (o.severity == 'Medium' ? AppColors.warning : AppColors.primary).o(0.12),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    o.severity == 'Medium' ? Icons.error_outline_rounded : Icons.info_outline_rounded,
                    color: o.severity == 'Medium' ? AppColors.warning : AppColors.primary,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(o.title, style: AppText.h3.copyWith(fontSize: 14)),
                      const SizedBox(height: 2),
                      Text(o.description, style: AppText.small.copyWith(fontSize: 11.5)),
                    ],
                  ),
                ),
                Text(
                  o.severity,
                  style: TextStyle(
                    color: o.severity == 'Medium' ? AppColors.warning : AppColors.primary,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.purpleSoft,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.auto_awesome_rounded, color: AppColors.purple, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'AI Diagnosis Assistant suggested this cause from your symptoms, OBD code and thermal image. '
                  'Final diagnosis confirmed by Kasun Perera.',
                  style: AppText.muted.copyWith(color: AppColors.text, fontSize: 12.5),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 50,
          child: FilledButton.icon(
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Repair estimate coming soon'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            icon: const Icon(Icons.description_outlined),
            label: const Text('View Repair Estimate'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _liveData() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Freeze frame at fault', style: AppText.h3),
        const SizedBox(height: 10),
        for (final r in _liveReadings)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: r.warning ? AppColors.warningSoft : AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: r.warning ? AppColors.warning.o(0.35) : AppColors.border),
            ),
            child: Row(
              children: [
                Icon(
                  r.warning ? Icons.thermostat_rounded : Icons.speed_rounded,
                  color: r.warning ? AppColors.warning : AppColors.primary,
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(r.label, style: AppText.label)),
                Text(
                  '${r.value} ${r.unit}',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: r.warning ? AppColors.warningText : AppColors.navy,
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 6),
        Text(
          'Normal coolant temperature after 10 min idle is 85-95 °C. Your engine stayed at 71 °C, '
          'which points to a thermostat stuck open.',
          style: AppText.muted.copyWith(fontSize: 13),
        ),
      ],
    );
  }

  Widget _media(BuildContext context) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _evidence.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 1.3,
      ),
      itemBuilder: (_, i) => _EvidenceTile(
        icon: _evidenceIcons[i],
        caption: _evidence[i].caption,
        onTap: () => _openEvidence(context, i),
      ),
    );
  }

  Widget _section(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 16, 2, 10),
      child: Text(title, style: AppText.h2.copyWith(fontSize: 15)),
    );
  }

  void _openEvidence(BuildContext context, int index) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: Text(_evidenceLabels[index]),
        content: Text(_evidence[index].caption),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Close')),
        ],
      ),
    );
  }
}

class _EvidenceTile extends StatelessWidget {
  final IconData icon;
  final String caption;
  final VoidCallback onTap;
  const _EvidenceTile({required this.icon, required this.caption, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primarySofter,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: AppColors.link, size: 28),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Text(
                caption,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppText.small.copyWith(fontSize: 11),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
