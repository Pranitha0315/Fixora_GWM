//import 'dart:async';
//import 'dart:convert';
//import 'dart:math';

//import 'package:http/http.dart' as http;
//import 'package:shared_preferences/shared_preferences.dart';

//import 'fixora_config.dart';

/// Error from the shared ApiErrorResponse contract (status, code, message, correlationId).
class ApiException implements Exception {
  ApiException(this.status, this.code, this.message);

  /// 0 = the server could not be reached (no network, wrong address, server down).
  final int status;
  final String code;
  final String message;

  bool get isNetwork => status == 0;
  bool get isConflict => status == 409;

  @override
  String toString() => message;
}

/// Tokens returned by every login endpoint (AuthTokens on the backend).
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

  factory Session.fromJson(Map<String, dynamic> j) => Session(
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
        accessTokenExpiresAt: DateTime.parse(j['accessTokenExpiresAt'] as String),
        userId: j['userId'] as String,
        role: j['role'] as String,
        name: (j['name'] as String?) ?? '',
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'accessTokenExpiresAt': accessTokenExpiresAt.toIso8601String(),
        'userId': userId,
        'role': role,
        'name': name,
      };
}

/// JSON client for /api/v1. Short-lived JWT + rotating refresh token, refreshed once on 401.
/// Tokens are kept in shared_preferences for the demo; use flutter_secure_storage for release builds.
