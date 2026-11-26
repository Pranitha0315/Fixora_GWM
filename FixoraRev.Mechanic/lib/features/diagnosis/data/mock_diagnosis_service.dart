import '../../jobs/domain/job_entities.dart';
import '../domain/diagnosis_entities.dart';

/// Simulation mode for the OBD-II adapter and the AI Diagnosis Assistant
/// (BRD: "otherwise simulated data is used"). The real version talks to an
/// ELM327 adapter over Bluetooth and calls the backend AI endpoint.
class MockDiagnosisService {
  static const String adapterName = 'ELM327 OBD-II v1.5';

  static const Map<String, DiagnosisScenario> scenarios = {
    'misfire': DiagnosisScenario(
      scan: ObdScanResult(
        codes: [
          DtcCode(
              'P0301',
              'Cylinder 1 misfire detected',
              'Cylinder 1 is not firing properly. This causes shaking at idle and loss of power.',
              Severity.high),
          DtcCode(
              'P0351',
              'Ignition coil A circuit',
              'The ignition coil on cylinder 1 is not responding correctly.',
              Severity.medium),
        ],
        readings: [
          LiveReading('Engine speed', '690–780', 'rpm', warning: true),
          LiveReading('Coolant temp', '88', '°C'),
          LiveReading('Battery voltage', '13.9', 'V'),
          LiveReading('Engine load', '34', '%'),
          LiveReading('Short-term fuel trim', '+9.4', '%', warning: true),
          LiveReading('Misfire count cyl. 1', '27', '/min', warning: true),
        ],
        freezeFrame:
            'Captured at 2,140 rpm · 42 km/h · coolant 86 °C · load 48 %',
      ),
      causes: [
        AiCause(
          title: 'Ignition coil failure – cylinder 1',
          reason:
              'P0301 + P0351 together, misfires only on cylinder 1 and rough idle '
              'match a failing coil. Fuel trim rise is a side effect of the misfire.',
          confidence: 0.82,
          zoneId: 'engine',
          severity: Severity.high,
          parts: [SuggestedPart('coil_denso', 1)],
          labourHours: 1.0,
          repair:
              'Replace cylinder 1 ignition coil, clear codes and re-scan misfire count.',
        ),
        AiCause(
          title: 'Worn spark plugs',
          reason:
              'Mileage is past the 60,000 km plug interval; worn plugs strain the coil.',
          confidence: 0.61,
          zoneId: 'engine',
          severity: Severity.medium,
          parts: [SuggestedPart('spark_iridium', 4)],
          labourHours: 0.8,
          repair: 'Replace all 4 spark plugs with iridium plugs.',
        ),
        AiCause(
          title: 'Clogged fuel injector – cylinder 1',
          reason:
              'Possible, but the coil circuit code points to ignition first.',
          confidence: 0.27,
          zoneId: 'fuel',
          severity: Severity.medium,
          parts: [],
          labourHours: 1.5,
          repair: 'Ultrasonic clean injector 1 and run a balance test.',
        ),
      ],
    ),
    'brakes': DiagnosisScenario(
      scan: ObdScanResult(
        codes: [],
        readings: [
          LiveReading('Wheel speed sensors', 'OK', ''),
          LiveReading('ABS module', 'No faults', ''),
          LiveReading('Brake fluid', 'Normal', ''),
          LiveReading('Battery voltage', '12.6', 'V'),
        ],
        freezeFrame: 'No freeze-frame data (no stored codes)',
      ),
      causes: [
        AiCause(
          title: 'Warped front brake rotors',
          reason:
              'Judder under braking with no ABS faults. Matches Passport PP-1001 '
              '(rotor run-out 0.04 mm in August) – the issue has progressed.',
          confidence: 0.76,
          zoneId: 'front_brakes',
          severity: Severity.high,
          parts: [
            SuggestedPart('rotor_vezel', 2),
            SuggestedPart('pads_vezel', 1)
          ],
          labourHours: 1.5,
          repair:
              'Replace both front rotors and pads, bed-in the brakes and road test.',
        ),
        AiCause(
          title: 'Worn front brake pads',
          reason: 'Grinding noise suggests pad material is low.',
          confidence: 0.58,
          zoneId: 'front_brakes',
          severity: Severity.medium,
          parts: [SuggestedPart('pads_vezel', 1)],
          labourHours: 0.8,
          repair: 'Replace front brake pads.',
        ),
        AiCause(
          title: 'Front wheel bearing play',
          reason: 'Less likely – no noise reported while cruising.',
          confidence: 0.21,
          zoneId: 'suspension',
          severity: Severity.medium,
          parts: [],
          labourHours: 1.2,
          repair: 'Check bearing play on a lift; replace if needed.',
        ),
      ],
    ),
    'battery': DiagnosisScenario(
      scan: ObdScanResult(
        codes: [
          DtcCode(
              'P0562',
              'System voltage low',
              'Battery voltage is below normal – the battery or charging system is weak.',
              Severity.high),
        ],
        readings: [
          LiveReading('Battery (engine off)', '11.6', 'V', warning: true),
          LiveReading('Cranking voltage', '8.9', 'V', warning: true),
          LiveReading('Alternator output', '14.1', 'V'),
          LiveReading('Battery health', '41', '%', warning: true),
        ],
        freezeFrame: 'Captured during cranking · 8.9 V',
      ),
      causes: [
        AiCause(
          title: 'Weak / failed battery',
          reason:
              'Cranking voltage under 9.6 V and 41 % health while the alternator charges normally.',
          confidence: 0.88,
          zoneId: 'battery',
          severity: Severity.high,
          parts: [SuggestedPart('battery_45', 1)],
          labourHours: 0.5,
          repair: 'Replace the battery and run a charging-system test.',
        ),
        AiCause(
          title: 'Alternator undercharging',
          reason: 'Output is 14.1 V, which is normal – unlikely.',
          confidence: 0.4,
          zoneId: 'battery',
          severity: Severity.medium,
          parts: [],
          labourHours: 1.0,
          repair: 'Load-test the alternator.',
        ),
        AiCause(
          title: 'Faulty starter motor',
          reason: 'Only if a new battery still cranks slowly.',
          confidence: 0.18,
          zoneId: 'engine',
          severity: Severity.medium,
          parts: [],
          labourHours: 1.5,
          repair: 'Bench-test the starter motor.',
        ),
      ],
    ),
    'overheat': DiagnosisScenario(
      scan: ObdScanResult(
        codes: [
          DtcCode(
              'P0217',
              'Engine over-temperature condition',
              'The engine got hotter than the safe limit. Driving like this can damage the head gasket.',
              Severity.critical),
        ],
        readings: [
          LiveReading('Coolant temp', '104', '°C', warning: true),
          LiveReading('Radiator fan', 'On', ''),
          LiveReading('Engine speed', '750', 'rpm'),
          LiveReading('Battery voltage', '14.0', 'V'),
        ],
        freezeFrame: 'Captured at 108 °C · idle in traffic',
      ),
      causes: [
        AiCause(
          title: 'Thermostat stuck closed',
          reason:
              'Thermal image shows a hot engine side and a cool lower radiator hose.',
          confidence: 0.71,
          zoneId: 'cooling',
          severity: Severity.high,
          parts: [
            SuggestedPart('thermostat_axio', 1),
            SuggestedPart('coolant_4l', 1)
          ],
          labourHours: 1.2,
          repair:
              'Replace thermostat and gasket, flush and refill coolant, bleed the system.',
        ),
        AiCause(
          title: 'Upper radiator hose seepage',
          reason: 'Coolant smell and dried residue near the hose clamp.',
          confidence: 0.55,
          zoneId: 'cooling',
          severity: Severity.medium,
          parts: [SuggestedPart('radiator_hose', 1)],
          labourHours: 0.5,
          repair: 'Replace upper radiator hose and clamps.',
        ),
        AiCause(
          title: 'Cooling fan relay',
          reason: 'Fan is running, so a relay fault is unlikely.',
          confidence: 0.24,
          zoneId: 'cooling',
          severity: Severity.medium,
          parts: [],
          labourHours: 0.7,
          repair: 'Test the fan relay and wiring.',
        ),
      ],
    ),
    'ac': DiagnosisScenario(
      scan: ObdScanResult(
        codes: [
          DtcCode(
              'B1479',
              'A/C refrigerant pressure low',
              'Refrigerant pressure is low, so the A/C cannot cool properly.',
              Severity.medium),
        ],
        readings: [
          LiveReading('A/C high side', '9.1', 'bar', warning: true),
          LiveReading('Vent temperature', '19', '°C', warning: true),
          LiveReading('Ambient', '32', '°C'),
          LiveReading('Compressor', 'Engaged', ''),
        ],
        freezeFrame: 'Captured with A/C on max · 1,500 rpm',
      ),
      causes: [
        AiCause(
          title: 'Low refrigerant + faulty expansion valve',
          reason: 'Low high-side pressure and hissing behind the dashboard.',
          confidence: 0.74,
          zoneId: 'ac',
          severity: Severity.medium,
          parts: [
            SuggestedPart('ac_expansion', 1),
            SuggestedPart('ac_gas', 2),
            SuggestedPart('cabin_filter', 1),
          ],
          labourHours: 2.0,
          repair:
              'Replace expansion valve, vacuum and recharge R134a, replace cabin filter.',
        ),
        AiCause(
          title: 'Compressor clutch wear',
          reason: 'Compressor engages normally – less likely.',
          confidence: 0.33,
          zoneId: 'ac',
          severity: Severity.medium,
          parts: [],
          labourHours: 2.5,
          repair: 'Inspect compressor clutch gap.',
        ),
      ],
    ),
    'service': DiagnosisScenario(
      scan: ObdScanResult(
        codes: [],
        readings: [
          LiveReading('Coolant temp', '89', '°C'),
          LiveReading('Battery voltage', '14.2', 'V'),
          LiveReading('Engine load', '22', '%'),
          LiveReading('Oil life (calc.)', '8', '%', warning: true),
        ],
        freezeFrame: 'No freeze-frame data (no stored codes)',
      ),
      causes: [
        AiCause(
          title: 'Periodic service due (oil & filter)',
          reason: 'Oil life at 8 % and 10,400 km since the last service.',
          confidence: 0.92,
          zoneId: 'engine',
          severity: Severity.low,
          parts: [SuggestedPart('oil_5w30', 1), SuggestedPart('oil_filter', 1)],
          labourHours: 1.0,
          repair: 'Change engine oil and oil filter, 30-point inspection.',
        ),
        AiCause(
          title: 'Worn front stabiliser link',
          reason: 'Knocking noise over bumps from the front.',
          confidence: 0.48,
          zoneId: 'suspension',
          severity: Severity.medium,
          parts: [],
          labourHours: 1.0,
          repair: 'Replace front stabiliser links.',
        ),
      ],
    ),
  };

  static DiagnosisScenario scenarioFor(String key) =>
      scenarios[key] ?? scenarios['service']!;

  /// Simulated Bluetooth pairing with the adapter.
  Future<void> connectAdapter() =>
      Future<void>.delayed(const Duration(milliseconds: 1400));

  /// Reads stored codes, live data and freeze frame.
  Future<ObdScanResult> scan(Job job) async {
    await Future<void>.delayed(const Duration(milliseconds: 2800));
    return scenarioFor(job.scenario).scan;
  }

  /// Ranks probable causes from symptoms, codes and evidence. Results are
  /// advisory – the mechanic must confirm or correct them.
  Future<List<AiCause>> analyze(
    Job job, {
    required List<String> symptoms,
    required ObdScanResult? scan,
    required int evidenceCount,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 2400));
    final boost = evidenceCount > 0 ? 0.04 : 0.0;
    final causes = scenarioFor(job.scenario)
        .causes
        .map((c) => AiCause(
              title: c.title,
              reason: c.reason,
              confidence: (c.confidence +
                      (identical(c, scenarioFor(job.scenario).causes.first)
                          ? boost
                          : 0))
                  .clamp(0.0, 0.97)
                  .toDouble(),
              zoneId: c.zoneId,
              severity: c.severity,
              parts: c.parts,
              labourHours: c.labourHours,
              repair: c.repair,
            ))
        .toList()
      ..sort((a, b) => b.confidence.compareTo(a.confidence));
    return causes;
  }
}
