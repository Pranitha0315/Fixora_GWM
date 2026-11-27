/// Logged-in mechanic (from the Fixora backend, PIN login or invitation accept).
class MechanicUser {
  const MechanicUser({
    required this.id,
    required this.fullName,
    required this.email,
    required this.phone,
    required this.garageName,
    required this.garageBranch,
    required this.employeeId,
    required this.skills,
  });

  final String id;
  final String fullName;
  final String email;
  final String phone;
  final String garageName;
  final String garageBranch;
  final String employeeId;
  final List<String> skills;

  String get firstName => fullName.split(' ').first;
}
