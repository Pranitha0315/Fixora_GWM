enum BookingState { active, upcoming, completed, cancelled }

class Booking {
  final String id;
  final String vehicleId;
  final String service;
  final DateTime date;
  final BookingState state;
  final String statusLabel;
  final double? amount;
  final int? queuePosition;
  final String garage;
  final List<String> symptoms;
  final String? offer;
  const Booking({
    required this.id,
    required this.vehicleId,
    required this.service,
    required this.date,
    required this.state,
    required this.statusLabel,
    this.amount,
    this.queuePosition,
    this.garage = 'Fixora Garage',
    this.symptoms = const [],
    this.offer,
  });

  /// True for queue-facing bookings (requested / confirmed / in workshop).
  bool get upcoming => state == BookingState.upcoming || state == BookingState.active;

  Booking copyWith({BookingState? state, String? statusLabel, DateTime? date, int? queuePosition, String? garage}) =>
      Booking(
        id: id,
        vehicleId: vehicleId,
        service: service,
        date: date ?? this.date,
        state: state ?? this.state,
        statusLabel: statusLabel ?? this.statusLabel,
        amount: amount,
        queuePosition: queuePosition ?? this.queuePosition,
        garage: garage ?? this.garage,
        symptoms: symptoms,
        offer: offer,
      );
}
