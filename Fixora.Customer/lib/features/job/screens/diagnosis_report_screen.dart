import 'package:flutter/material.dart';

import '../../../core/core.dart';
import 'estimate_price_screen.dart';

/// Diagnosis Report: fault code, problem location, evidence (USP 1).
class DiagnosisReportScreen extends StatefulWidget {
  const DiagnosisReportScreen({super.key});

  @override
  State<DiagnosisReportScreen> createState() => _DiagnosisReportScreenState();
}

class _DiagnosisReportScreenState extends State<DiagnosisReportScreen> {
  int _tab = 0;

  static const _evidence = [
    MediaItem(asset: Img.obdData, kind: MediaKind.photo, stage: MediaStage.during, caption: 'OBD-II scan - P0128 stored'),
    MediaItem(asset: Img.cameraImage, kind: MediaKind.photo, stage: MediaStage.during, caption: 'Endoscope camera - thermostat housing'),
    MediaItem(asset: Img.thermalImage, kind: MediaKind.photo, stage: MediaStage.during, caption: 'Thermal image - radiator stays cold'),
  ];

  @override
  Widget build(BuildContext context) {
    return FxPage(
      title: 'Diagnosis Report',
      topRight: PillButton(
        label: 'PDF',
        icon: Icons.download_rounded,
        onTap: () => showFxSnack(context, 'Diagnosis report saved as PDF'),
      ),
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const CardHeader(
                  icon: Icons.assignment_outlined,
                  title: 'Diagnosis Report',
                  subtitle: 'Detailed diagnostic results for your vehicle.',
                  chip: JobChip(MockData.jobId),
                ),
                const SizedBox(height: 16),
                FxSegmented(
                  index: _tab,
                  onChanged: (i) => setState(() => _tab = i),
                  items: const [
                    SegItem('Summary'),
                    SegItem('Live Data', Icons.show_chart_rounded),
                    SegItem('Media', Icons.smart_display_outlined),
                  ],
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
        ),
      ],
    );
  }

  Widget _summary(BuildContext context) {
    const f = MockData.primaryFinding;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surfaceSolid,
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
                    child: Text(f.code,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
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
                  const StatusPill('Severity: High', color: AppColors.danger, icon: Icons.warning_amber_rounded),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Row(
                      children: [
                        Text('Confidence ${(f.confidence * 100).round()}%',
                            style: AppText.small.copyWith(color: AppColors.navy, fontWeight: FontWeight.w700)),
                        const SizedBox(width: 8),
                        Expanded(child: FxProgressBar(value: f.confidence, color: AppColors.success, height: 6)),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SectionTitle('Problem Location', padding: EdgeInsets.fromLTRB(2, 16, 2, 10)),
        AspectRatio(
          aspectRatio: 1.9,
          child: Stack(
            fit: StackFit.expand,
            children: [
              const AssetPhoto(Img.engineBay, radius: 16),
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
                      Text('Thermostat housing · engine front',
                          style: TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SectionTitle('Evidence', padding: EdgeInsets.fromLTRB(2, 16, 2, 10)),
        Row(
          children: [
            for (var i = 0; i < _evidence.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              Expanded(
                child: Column(
                  children: [
                    AspectRatio(
                      aspectRatio: 1.45,
                      child: MediaTile(
                        item: _evidence[i],
                        showBadge: false,
                        radius: 12,
                        onTap: () => PhotoViewerScreen.open(context, _evidence, i),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(['OBD Data', 'Camera Image', 'Thermal Image'][i],
                        style: AppText.muted.copyWith(fontSize: 12.5, color: AppColors.textMuted)),
                  ],
                ),
              ),
            ],
          ],
        ),
        const SectionTitle('Symptoms you reported', padding: EdgeInsets.fromLTRB(2, 16, 2, 10)),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final s in MockData.symptomsReported)
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
        const SectionTitle('Other findings', padding: EdgeInsets.fromLTRB(2, 16, 2, 10)),
        for (final o in MockData.otherFindings)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              children: [
                IconTile(
                  icon: o.severity == 'Medium' ? Icons.error_outline_rounded : Icons.info_outline_rounded,
                  color: o.severity == 'Medium' ? AppColors.warning : AppColors.primary,
                  size: 40,
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
                StatusPill(o.severity,
                    color: o.severity == 'Medium' ? AppColors.warning : AppColors.primary),
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
                  'Final diagnosis confirmed by ${MockData.mechanicName}.',
                  style: AppText.muted.copyWith(color: AppColors.text, fontSize: 12.5),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        PrimaryButton(
          label: 'View Repair Estimate',
          icon: Icons.description_outlined,
          onPressed: () => context.push(const EstimatePriceScreen()),
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
        for (final r in MockData.liveReadings)
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
                Icon(r.warning ? Icons.thermostat_rounded : Icons.speed_rounded,
                    color: r.warning ? AppColors.warning : AppColors.primary),
                const SizedBox(width: 12),
                Expanded(child: Text(r.label, style: AppText.label)),
                Text('${r.value} ${r.unit}',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: r.warning ? AppColors.warningText : AppColors.navy)),
              ],
            ),
          ),
        const SizedBox(height: 6),
        Text('Normal coolant temperature after 10 min idle is 85-95 °C. Your engine stayed at 71 °C, '
            'which points to a thermostat stuck open.',
            style: AppText.muted.copyWith(fontSize: 13)),
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
      itemBuilder: (_, i) => MediaTile(
        item: _evidence[i],
        showBadge: false,
        onTap: () => PhotoViewerScreen.open(context, _evidence, i),
      ),
    );
  }
}