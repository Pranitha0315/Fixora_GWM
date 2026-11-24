/// Logged-in mechanic identity.
class MechanicUser {
  const MechanicUser({
    required this.id,
    required this.employeeCode,
    this.name,
    this.email,
    this.phone,
    this.garageId,
  });

  final String id;
  final String employeeCode;
  final String? name;
  final String? email;
  final String? phone;
  final String? garageId;

  factory MechanicUser.fromJson(Map<String, dynamic> json) {
    return MechanicUser(
      id: (json['id'] ?? json['user_id'] ?? json['userId'] ?? '').toString(),
      employeeCode: (json['employee_code'] ??
              json['employeeCode'] ??
              json['login'] ??
              '')
          .toString(),
      name: json['name']?.toString() ?? json['full_name']?.toString(),
      email: json['email']?.toString(),
      phone: json['phone']?.toString(),
      garageId: (json['garage_id'] ?? json['garageId'])?.toString(),
    );
  }

  factory MechanicUser.fromSession({
    required String login,
    String? name,
    String? userId,
  }) {
    return MechanicUser(
      id: userId ?? login,
      employeeCode: login,
      name: name,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'employee_code': employeeCode,
        if (name != null) 'name': name,
        if (email != null) 'email': email,
        if (phone != null) 'phone': phone,
        if (garageId != null) 'garage_id': garageId,
      };
}
