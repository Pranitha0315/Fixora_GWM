import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'fixora_config.dart';

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
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const _sessionKey = 'fixora.session';

  final http.Client _http = http.Client();
  Session? session;

  bool get signedIn => session != null;

  /// Dedupes concurrent refresh calls so only one POST /auth/refresh is in flight.
  Future<String?>? _refreshInFlight;

  static String newIdempotencyKey() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  Uri _uri(String path) {
    final base = FixoraConfig.apiV1;
    final cleaned = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$base$cleaned');
  }

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_sessionKey);
    if (raw == null || raw.isEmpty) {
      session = null;
      return;
    }
    try {
      session = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      session = null;
      await prefs.remove(_sessionKey);
    }
  }

  Future<void> saveSession(Map<String, dynamic> tokens) async {
    session = Session.fromJson(tokens);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_sessionKey, jsonEncode(session!.toJson()));
  }

  Future<void> clear() async {
    session = null;
    _refreshInFlight = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
  }

  /// Returns a usable access token, refreshing if it expires within 60 seconds.
  Future<String?> freshToken() async {
    final s = session;
    if (s == null) return null;
    final remaining = s.accessTokenExpiresAt.difference(DateTime.now());
    if (remaining > const Duration(seconds: 60)) return s.accessToken;
    return refresh();
  }

  /// POST /auth/refresh with the current refresh token (single in-flight).
  Future<String?> refresh() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;

    final future = _doRefresh();
    _refreshInFlight = future.whenComplete(() => _refreshInFlight = null);
    return _refreshInFlight!;
  }

  Future<String?> _doRefresh() async {
    final s = session;
    if (s == null) return null;
    try {
      final res = await _http
          .post(
            _uri('/auth/refresh'),
            headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
            body: jsonEncode({'refreshToken': s.refreshToken}),
          )
          .timeout(const Duration(seconds: 20));

      if (res.statusCode < 200 || res.statusCode >= 300) {
        await clear();
        return null;
      }
      final body = jsonDecode(res.body);
      if (body is! Map<String, dynamic>) {
        await clear();
        return null;
      }
      await saveSession(body);
      return session?.accessToken;
    } catch (_) {
      await clear();
      return null;
    }
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, String>? query}) async {
    final r = await _send('GET', path, query: query);
    if (r is Map<String, dynamic>) return r;
    return <String, dynamic>{};
  }

  Future<List<dynamic>> getList(String path, {Map<String, String>? query}) async {
    final r = await _send('GET', path, query: query);
    if (r is List) return r;
    if (r is Map<String, dynamic>) {
      return (r['items'] as List<dynamic>?) ??
          (r['services'] as List<dynamic>?) ??
          const [];
    }
    return const [];
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Object? body,
    Map<String, String>? headers,
  }) async {
    final r = await _send('POST', path, body: body, extraHeaders: headers);
    if (r is Map<String, dynamic>) return r;
    return <String, dynamic>{};
  }

  Future<Map<String, dynamic>> put(String path, {Object? body}) async {
    final r = await _send('PUT', path, body: body);
    if (r is Map<String, dynamic>) return r;
    return <String, dynamic>{};
  }

  Future<Map<String, dynamic>> patch(String path, {Object? body}) async {
    final r = await _send('PATCH', path, body: body);
    if (r is Map<String, dynamic>) return r;
    return <String, dynamic>{};
  }

  Future<Map<String, dynamic>> delete(String path) async {
    final r = await _send('DELETE', path);
    if (r is Map<String, dynamic>) return r;
    return <String, dynamic>{};
  }

  Future<Object> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String>? query,
    Map<String, String>? extraHeaders,
    bool retried = false,
  }) async {
    final token = await freshToken();
    var uri = _uri(path);
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: {...uri.queryParameters, ...query});
    }

    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
      if (extraHeaders != null) ...extraHeaders,
    };

    late http.Response res;
    try {
      final encoded = body == null ? null : jsonEncode(body);
      switch (method) {
        case 'GET':
          res = await _http.get(uri, headers: headers).timeout(const Duration(seconds: 20));
        case 'POST':
          res = await _http
              .post(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 20));
        case 'PUT':
          res = await _http
              .put(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 20));
        case 'PATCH':
          res = await _http
              .patch(uri, headers: headers, body: encoded)
              .timeout(const Duration(seconds: 20));
        case 'DELETE':
          res = await _http.delete(uri, headers: headers).timeout(const Duration(seconds: 20));
        default:
          throw ApiException(0, 'METHOD', 'Unsupported method $method');
      }
    } on TimeoutException {
      throw ApiException(0, 'TIMEOUT', 'Request timed out. Check your connection.');
    } on http.ClientException catch (e) {
      throw ApiException(0, 'NETWORK', e.message);
    } catch (e) {
      if (e is ApiException) rethrow;
      throw ApiException(0, 'NETWORK', e.toString());
    }

    // On 401 → refresh once, then retry the request.
    if (res.statusCode == 401 && !retried) {
      final refreshed = await refresh();
      if (refreshed != null) {
        return _send(
          method,
          path,
          body: body,
          query: query,
          extraHeaders: extraHeaders,
          retried: true,
        );
      }
    }

    return _decode(res);
  }

  Object _decode(http.Response res) {
    Object? decoded;
    Map<String, dynamic>? asMap;
    if (res.body.isNotEmpty) {
      try {
        decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) asMap = decoded;
      } catch (_) {
        decoded = null;
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return decoded ?? <String, dynamic>{};
    }

    final code = (asMap?['code'] as String?) ?? 'HTTP_${res.statusCode}';
    final message = (asMap?['message'] as String?) ??
        (res.body.isNotEmpty ? res.body : 'Request failed (${res.statusCode})');
    throw ApiException(res.statusCode, code, message);
  }
}
