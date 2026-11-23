import 'package:flutter/material.dart';

import '../../core/navigation/nav.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/vehicle.dart';
import '../../data/repositories/app_state.dart';
import '../bookings/book_service_screen.dart';

/// A possible cause with its weight, related service and cost hint.
class _Cause {
  final String name;
  final double weight;
  final String service;
  final String cost;
  final int severity; // 0 safe, 1 careful, 2 stop
  const _Cause(this.name, this.weight, this.service, this.cost, this.severity);
}

class _Result {
  final _Cause cause;
  final double confidence;
  const _Result(this.cause, this.confidence);
}

/// Instant Diagnosis: rule-based symptom checker (USP 1, before the visit).
class InstantDiagnosisScreen extends StatefulWidget {
  final String vehicleId;
  const InstantDiagnosisScreen({super.key, required this.vehicleId});

  @override
  State<InstantDiagnosisScreen> createState() => _InstantDiagnosisScreenState();
}

class _InstantDiagnosisScreenState extends State<InstantDiagnosisScreen> {
  static const _symptoms = [
    (Icons.power_settings_new_rounded, "Won't start"),
    (Icons.thermostat_rounded, 'Overheating'),
    (Icons.graphic_eq_rounded, 'Strange noise'),
    (Icons.vibration_rounded, 'Vibration'),
    (Icons.album_outlined, 'Brake issue'),
    (Icons.alt_route_rounded, 'Pulls to one side'),
    (Icons.cloud_outlined, 'Smoke'),
    (Icons.ac_unit_rounded, 'AC not cooling'),
    (Icons.battery_alert_rounded, 'Battery drains'),
    (Icons.local_gas_station_outlined, 'High fuel use'),
  ];

  static const _lights = [
    (Icons.engineering_outlined, 'Check engine'),
    (Icons.battery_charging_full_rounded, 'Battery'),
    (Icons.oil_barrel_outlined, 'Oil pressure'),
    (Icons.device_thermostat_rounded, 'Temperature'),
    (Icons.error_outline_rounded, 'ABS'),
  ];

  static const _when = ['Always', 'Cold start', 'While driving', 'When braking', 'At high speed', 'When turning'];

  static const _rules = <String, List<_Cause>>{
    "Won't start": [
      _Cause('Weak or dead battery', 0.55, 'Electrical', 'LKR 3,000 - 35,000', 1),
      _Cause('Starter motor fault', 0.3, 'Electrical', 'LKR 12,000 - 40,000', 1),
      _Cause('Fuel pump problem', 0.2, 'Diagnosis', 'LKR 15,000 - 45,000', 1),
    ],
    'Overheating': [
      _Cause('Low coolant or leak', 0.45, 'Diagnosis', 'LKR 2,000 - 15,000', 2),
      _Cause('Thermostat stuck', 0.35, 'Diagnosis', 'LKR 18,000 - 25,000', 2),
      _Cause('Radiator fan failure', 0.25, 'Electrical', 'LKR 10,000 - 30,000', 2),
    ],
    'Strange noise': [
      _Cause('Worn brake pads', 0.3, 'Brakes', 'LKR 8,000 - 15,000', 1),
      _Cause('Wheel bearing wear', 0.3, 'Diagnosis', 'LKR 9,000 - 22,000', 1),
      _Cause('Loose exhaust / heat shield', 0.2, 'Diagnosis', 'LKR 2,500 - 8,000', 0),
    ],
    'Vibration': [
      _Cause('Wheel balancing needed', 0.45, 'Tyres & Alignment', 'LKR 2,500 - 5,000', 0),
      _Cause('Worn engine mounts', 0.3, 'Diagnosis', 'LKR 12,000 - 30,000', 1),
      _Cause('Spark plug misfire', 0.25, 'General Service', 'LKR 4,000 - 12,000', 1),
    ],
    'Brake issue': [
      _Cause('Worn brake pads', 0.55, 'Brakes', 'LKR 8,000 - 15,000', 2),
      _Cause('Warped brake discs', 0.25, 'Brakes', 'LKR 15,000 - 35,000', 2),
      _Cause('Low brake fluid', 0.2, 'Brakes', 'LKR 1,500 - 4,000', 2),
    ],
    'Pulls to one side': [
      _Cause('Wheel alignment off', 0.6, 'Tyres & Alignment', 'LKR 4,500 - 7,000', 0),
      _Cause('Uneven tyre pressure', 0.3, 'Tyres & Alignment', 'Free check', 0),
      _Cause('Sticking brake caliper', 0.15, 'Brakes', 'LKR 6,000 - 18,000', 1),
    ],
    'Smoke': [
      _Cause('Oil leak on hot engine', 0.45, 'Diagnosis', 'LKR 5,000 - 25,000', 2),
      _Cause('Coolant burning (head gasket)', 0.3, 'Diagnosis', 'LKR 35,000 - 90,000', 2),
      _Cause('Rich fuel mixture', 0.2, 'Diagnosis', 'LKR 6,000 - 20,000', 1),
    ],
    'AC not cooling': [
      _Cause('Low AC gas', 0.55, 'AC Repair', 'LKR 6,000 - 12,000', 0),
      _Cause('Blocked cabin filter', 0.25, 'AC Repair', 'LKR 2,500 - 5,000', 0),
      _Cause('Compressor clutch fault', 0.2, 'AC Repair', 'LKR 25,000 - 70,000', 0),
    ],
    'Battery drains': [
      _Cause('Old battery', 0.45, 'Electrical', 'LKR 25,000 - 40,000', 1),
      _Cause('Alternator undercharging', 0.35, 'Electrical', 'LKR 15,000 - 45,000', 1),
      _Cause('Parasitic drain (accessory)', 0.2, 'Electrical', 'LKR 3,500 - 10,000', 0),
    ],
    'High fuel use': [
      _Cause('Dirty air filter', 0.35, 'General Service', 'LKR 2,500 - 6,000', 0),
      _Cause('Faulty O2 sensor', 0.3, 'Diagnosis', 'LKR 9,000 - 25,000', 0),
      _Cause('Low tyre pressure', 0.25, 'Tyres & Alignment', 'Free check', 0),
    ],
    'Check engine': [
      _Cause('Engine sensor fault (needs OBD scan)', 0.5, 'Diagnosis', 'LKR 3,500 scan', 1),
    ],
    'Battery': [
      _Cause('Alternator undercharging', 0.5, 'Electrical', 'LKR 15,000 - 45,000', 1),
    ],
    'Oil pressure': [
      _Cause('Low engine oil pressure', 0.6, 'General Service', 'LKR 4,000 - 30,000', 2),
    ],
    'Temperature': [
      _Cause('Thermostat stuck', 0.4, 'Diagnosis', 'LKR 18,000 - 25,000', 2),
      _Cause('Low coolant or leak', 0.35, 'Diagnosis', 'LKR 2,000 - 15,000', 2),
    ],
    'ABS': [
      _Cause('ABS wheel speed sensor', 0.55, 'Brakes', 'LKR 8,000 - 20,000', 1),
    ],
    'When braking': [
      _Cause('Worn brake pads', 0.25, 'Brakes', 'LKR 8,000 - 15,000', 1),
    ],
    'At high speed': [
      _Cause('Wheel balancing needed', 0.2, 'Tyres & Alignment', 'LKR 2,500 - 5,000', 0),
    ],
    'Cold start': [
      _Cause('Weak or dead battery', 0.2, 'Electrical', 'LKR 3,000 - 35,000', 1),
    ],
  };

  late String _vehicleId = widget.vehicleId;
  final Set<String> _picked = {};
  final Set<String> _pickedLights = {};
  String? _whenPicked;
  final _note = TextEditingController();
  bool _analysing = false;
  List<_Result>? _results;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  List<_Result> _analyse() {
    final inputs = [..._picked, ..._pickedLights, if (_whenPicked != null) _whenPicked!];
    final scores = <String, double>{};
    final causes = <String, _Cause>{};
    for (final i in inputs) {
      for (final c in _rules[i] ?? const <_Cause>[]) {
        scores[c.name] = (scores[c.name] ?? 0) + c.weight;
        causes.putIfAbsent(c.name, () => c);
      }
    }
    final main = (_picked.length + _pickedLights.length).clamp(1, 99).toInt();
    final list = scores.entries
        .map((e) => _Result(causes[e.key]!, (0.15 + e.value / main * 0.85).clamp(0.2, 0.95).toDouble()))
        .toList()
      ..sort((a, b) => b.confidence.compareTo(a.confidence));
    return list.take(3).toList();
  }

  Future<void> _run() async {
    if (_picked.isEmpty && _pickedLights.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Pick at least one symptom or warning light'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    setState(() {
      _analysing = true;
      _results = null;
    });
    await Future<void>.delayed(const Duration(milliseconds: 1600));
    if (!mounted) return;
    setState(() {
      _analysing = false;
      _results = _analyse();
    });
  }

  Future<void> _pickVehicle() async {
    final app = AppState.instance;
    final names = {for (final x in app.vehicles) '${x.name} · ${x.plate}': x.id};
    final picked = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: AppColors.surfaceSolid, borderRadius: BorderRadius.circular(24)),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Choose vehicle', style: AppText.h1),
              const SizedBox(height: 12),
              for (final e in names.entries)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(e.key, style: AppText.label),
                  trailing: Icon(
                    e.value == _vehicleId ? Icons.radio_button_checked : Icons.radio_button_off,
                    color: e.value == _vehicleId ? AppColors.link : AppColors.textMuted,
                  ),
                  onTap: () => Navigator.of(ctx).pop(e.value),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) setState(() => _vehicleId = picked);
  }

  @override
  Widget build(BuildContext context) {
    final app = AppState.instance;
    final v = app.vehicleById(_vehicleId);
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: const Text('Instant Diagnosis'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('Tell us what you feel. We suggest likely causes.', style: AppText.muted),
          const SizedBox(height: 12),
          ListTile(
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            tileColor: AppColors.surface,
            leading: Icon(v.type.icon, color: AppColors.link),
            title: Text(v.name, style: AppText.label),
            subtitle: Text(v.plate, style: AppText.small),
            trailing: TextButton(onPressed: _pickVehicle, child: const Text('Change')),
            onTap: _pickVehicle,
          ),
          const SizedBox(height: 16),
          Text("What's happening?", style: AppText.h2.copyWith(fontSize: 15)),
          const SizedBox(height: 8),
          _chips(_symptoms, _picked),
          const SizedBox(height: 16),
          Text('Any warning light on?', style: AppText.h2.copyWith(fontSize: 15)),
          const SizedBox(height: 8),
          _chips(_lights, _pickedLights, color: AppColors.warning),
          const SizedBox(height: 16),
          Text('When does it happen?', style: AppText.h2.copyWith(fontSize: 15)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final w in _when)
                ChoiceChip(
                  label: Text(w),
                  selected: _whenPicked == w,
                  showCheckmark: false,
                  selectedColor: AppColors.primary,
                  backgroundColor: AppColors.surface,
                  side: BorderSide(color: AppColors.border),
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: _whenPicked == w ? Colors.white : AppColors.navy,
                  ),
                  onSelected: (s) => setState(() => _whenPicked = s ? w : null),
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Anything else? (e.g. started after a long drive)',
              filled: true,
              fillColor: AppColors.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: AppColors.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: AppColors.border)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            height: 52,
            child: FilledButton.icon(
              onPressed: _analysing ? null : _run,
              icon: _analysing
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.auto_awesome_rounded),
              label: Text(_results == null ? 'Analyse Symptoms' : 'Analyse Again'),
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primary,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOutCubic,
            child: _results == null ? const SizedBox(width: double.infinity) : _resultsView(context, v),
          ),
        ],
      ),
    );
  }

  Widget _chips(List<(IconData, String)> items, Set<String> picked, {Color color = AppColors.primary}) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final it in items)
          GestureDetector(
            onTap: () {
              setState(() => picked.contains(it.$2) ? picked.remove(it.$2) : picked.add(it.$2));
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: picked.contains(it.$2) ? color : AppColors.surface,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: picked.contains(it.$2) ? color : AppColors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(it.$1, size: 17, color: picked.contains(it.$2) ? Colors.white : color),
                  const SizedBox(width: 6),
                  Text(
                    it.$2,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: picked.contains(it.$2) ? Colors.white : AppColors.navy,
                    ),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  Widget _resultsView(BuildContext context, Vehicle v) {
    final results = _results!;
    final worst = results.fold<int>(0, (m, r) => r.cause.severity > m ? r.cause.severity : m);
    final (label, color, icon) = switch (worst) {
      2 => ('Stop driving - get help', AppColors.danger, Icons.do_not_disturb_on_rounded),
      1 => ('Drive carefully to a garage', AppColors.warning, Icons.warning_amber_rounded),
      _ => ('Safe to drive', AppColors.success, Icons.check_circle_rounded),
    };
    final service = results.first.cause.service;
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.surfaceSolid,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome_rounded, color: AppColors.purple),
                const SizedBox(width: 8),
                Expanded(child: Text('Likely causes', style: AppText.h2)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color.o(0.12), borderRadius: BorderRadius.circular(20)),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 14, color: color),
                      const SizedBox(width: 4),
                      Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < results.length; i++)
              Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: i == 0 ? AppColors.primarySofter : AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: i == 0 ? AppColors.primary.o(0.4) : AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text(results[i].cause.name, style: AppText.h3.copyWith(fontSize: 14.5))),
                        Text(
                          '${(results[i].confidence * 100).round()}%',
                          style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.link),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: results[i].confidence,
                        minHeight: 6,
                        backgroundColor: AppColors.border,
                        color: AppColors.primary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Service: ${results[i].cause.service} · Est. ${results[i].cause.cost}',
                      style: AppText.small.copyWith(fontSize: 11.5),
                    ),
                  ],
                ),
              ),
            Text(
              'This is a guide, not a final diagnosis. A mechanic confirms it with an OBD scan and inspection.',
              style: AppText.small.copyWith(fontSize: 11.5),
            ),
            const SizedBox(height: 14),
            if (worst == 2) ...[
              SizedBox(
                height: 48,
                child: FilledButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Roadside SOS screen coming soon'),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
                  icon: const Icon(Icons.sos_rounded),
                  label: const Text('Get Roadside Help'),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.danger,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
            SizedBox(
              height: 48,
              child: FilledButton.icon(
                onPressed: () => context.push(BookServiceScreen(
                  vehicleId: v.id,
                  service: service,
                  symptoms: [..._picked, ..._pickedLights.map((l) => '$l light')],
                  note: _note.text.trim(),
                )),
                icon: const Icon(Icons.event_available_rounded),
                label: Text('Book $service'),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
