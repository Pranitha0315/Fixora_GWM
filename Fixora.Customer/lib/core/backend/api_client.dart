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
  ApiClient(this._storageKey);

  final String _storageKey;
  final http.Client _http = http.Client();
  Session? session;
  Future<String?>? _refreshing;

  bool get signedIn => session != null;

  static final Random _rnd = Random.secure();

  /// Client-generated key that makes a repeated write safe (approvals, SOS, bookings).
  static String newIdempotencyKey() {
    String hex(int n) => List.generate(n, (_) => _rnd.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}';
  }

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw == null) return;
    try {
      session = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      session = null;
    }
  }

  Future<void> saveSession(Map<String, dynamic> tokens) async {
    session = Session.fromJson(tokens);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(session!.toJson()));
  }

  Future<void> clear() async {
    session = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
  }

  /// A token that is valid for at least another minute (refreshing first when needed).
  Future<String?> freshToken() async {
    final s = session;
    if (s == null) return null;
    if (s.accessTokenExpiresAt.difference(DateTime.now().toUtc()).inSeconds > 60) return s.accessToken;
    return refresh();
  }

  Future<String?> refresh() {
    final s = session;
    if (s == null) return Future<String?>.value(null);
    return _refreshing ??= _doRefresh(s.refreshToken);
  }

  Future<String?> _doRefresh(String refreshToken) async {
    try {
      final j = await _send('POST', '/auth/refresh', body: {'refreshToken': refreshToken}, retry: false, auth: false);
      await saveSession(j as Map<String, dynamic>);
      return session!.accessToken;
    } catch (_) {
      await clear();
      return null;
    } finally {
      _refreshing = null;
    }
  }

  Future<void> logout() async {
    final s = session;
    if (s != null) {
      try {
        await _send('POST', '/auth/logout', body: {'refreshToken': s.refreshToken}, retry: false, auth: false);
      } catch (_) {}
    }
    await clear();
  }

  Future<dynamic> get(String path, {Map<String, String?>? query}) => _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, Map<String, String>? headers}) =>
      _send('POST', path, body: body ?? const <String, dynamic>{}, headers: headers);

  Future<dynamic> put(String path, {Object? body}) => _send('PUT', path, body: body ?? const <String, dynamic>{});

  Future<dynamic> delete(String path) => _send('DELETE', path);

  Uri _uri(String path, Map<String, String?>? query) {
    final uri = Uri.parse('${FixoraConfig.apiBase}/api/v1$path');
    if (query == null) return uri;
    final q = <String, String>{};
    query.forEach((k, v) {
      if (v != null && v.isNotEmpty) q[k] = v;
    });
    return q.isEmpty ? uri : uri.replace(queryParameters: q);
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Object? body,
    Map<String, String?>? query,
    Map<String, String>? headers,
    bool retry = true,
    bool auth = true,
  }) async {
    final req = http.Request(method, _uri(path, query));
    req.headers['Accept'] = 'application/json';
    final token = session?.accessToken;
    if (auth && token != null) req.headers['Authorization'] = 'Bearer $token';
    if (headers != null) req.headers.addAll(headers);
    if (body != null) {
      req.headers['Content-Type'] = 'application/json; charset=utf-8';
      req.body = jsonEncode(body);
    }

    http.Response res;
    try {
      final streamed = await _http.send(req).timeout(const Duration(seconds: 15));
      res = await http.Response.fromStream(streamed);
    } on TimeoutException {
      throw ApiException(0, 'timeout', 'The garage server did not answer in time. Check your connection.');
    } catch (_) {
      throw ApiException(0, 'network', 'Cannot reach the Fixora server. Check your connection.');
    }

    if (res.statusCode == 401 && retry && auth && session != null) {
      final fresh = await refresh();
      if (fresh != null) {
        return _send(method, path, body: body, query: query, headers: headers, retry: false);
      }
    }

    if (res.statusCode >= 400) {
      var code = 'error';
      var message = 'Something went wrong (${res.statusCode}).';
      try {
        final j = jsonDecode(utf8.decode(res.bodyBytes));
        if (j is Map) {
          code = (j['code'] ?? code).toString();
          message = (j['message'] ?? message).toString();
          final errors = j['errors'];
          if (errors is Map && errors.isNotEmpty) {
            message = errors.values.expand((v) => v is List ? v : [v]).map((e) => e.toString()).join(' ');
          }
        }
      } catch (_) {}
      throw ApiException(res.statusCode, code, message);
    }
    if (res.bodyBytes.isEmpty) return null;
    return jsonDecode(utf8.decode(res.bodyBytes));
  }
}
