enum InspectionSeverity { low, medium, high, critical }

extension InspectionSeverityX on InspectionSeverity {
  String get label => switch (this) {
        InspectionSeverity.low => 'Low',
        InspectionSeverity.medium => 'Medium',
        InspectionSeverity.high => 'High',
        InspectionSeverity.critical => 'Critical',
      };
}

/// Documented finding on a vehicle component during inspection.
class InspectionIssue {
  InspectionIssue({
    required this.component,
    required this.title,
    required this.description,
    required this.severity,
    String? id,
    DateTime? createdAt,
  })  : id = id ?? DateTime.now().millisecondsSinceEpoch.toString(),
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final String component;
  final String title;
  final String description;
  final InspectionSeverity severity;
  final DateTime createdAt;

  InspectionIssue copyWith({
    String? component,
    String? title,
    String? description,
    InspectionSeverity? severity,
  }) {
    return InspectionIssue(
      id: id,
      component: component ?? this.component,
      title: title ?? this.title,
      description: description ?? this.description,
      severity: severity ?? this.severity,
      createdAt: createdAt,
    );
  }
}

/// Known vehicle zones for diagrams and dropdowns.
const kVehicleComponents = <({String id, String label})>[
  (id: 'hood', label: 'Hood / bonnet'),
  (id: 'front_bumper', label: 'Front bumper'),
  (id: 'rear_bumper', label: 'Rear bumper'),
  (id: 'windshield', label: 'Windshield'),
  (id: 'roof', label: 'Roof'),
  (id: 'lf_wheel', label: 'Left front wheel'),
  (id: 'rf_wheel', label: 'Right front wheel'),
  (id: 'lr_wheel', label: 'Left rear wheel'),
  (id: 'rr_wheel', label: 'Right rear wheel'),
  (id: 'lf_door', label: 'Left front door'),
  (id: 'rf_door', label: 'Right front door'),
  (id: 'engine', label: 'Engine bay'),
  (id: 'underbody', label: 'Underbody'),
];

String componentLabel(String id) {
  for (final c in kVehicleComponents) {
    if (c.id == id) return c.label;
  }
  return id;
}