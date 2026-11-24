/// Auth session: short-lived JWT + rotating refresh token.
class Session {
  Session({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresAt,
    required this.userId,
    required this.role,
    required this.name,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime accessTokenExpiresAt;
  final String userId;
  final String role;
  final String name;

  factory Session.fromJson(Map<String, dynamic> json) {
    final expiresRaw = json['accessTokenExpiresAt'] ??
        json['access_token_expires_at'] ??
        json['expiresAt'];
    DateTime expiresAt;
    if (expiresRaw is String) {
      expiresAt = DateTime.tryParse(expiresRaw) ??
          DateTime.now().add(const Duration(hours: 1));
    } else if (expiresRaw is int) {
      expiresAt = DateTime.fromMillisecondsSinceEpoch(expiresRaw);
    } else {
      expiresAt = DateTime.now().add(const Duration(hours: 1));
    }

    return Session(
      accessToken: (json['accessToken'] ?? json['access_token'] ?? '') as String,
      refreshToken:
          (json['refreshToken'] ?? json['refresh_token'] ?? '') as String,
      accessTokenExpiresAt: expiresAt,
      userId: (json['userId'] ?? json['user_id'] ?? '') as String,
      role: (json['role'] ?? 'mechanic') as String,
      name: (json['name'] ?? '') as String,
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toIso8601String(),
        'userId': userId,
        'role': role,
        'name': name,
      };
}
