import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'session.dart';

/// JSON client for /api/v1. Short-lived JWT + rotating refresh token, refreshed once on 401.
/// Tokens are kept in shared_preferences for the demo; use flutter_secure_storage for release builds.
class ApiClient {
  ApiClient(this._storageKey);

  final String _storageKey;
  final http.Client _http = http.Client();

  Session? session;
  Future<String?>? _refreshing;

  bool get signedIn => session != null;

  static const _timeout = Duration(seconds: 20);
  static const _baseUrl = 'https://api.fixora.local/api/v1';

  Uri _uri(String path, [Map<String, String?>? query]) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return Uri.parse('$_baseUrl$normalized').replace(
      queryParameters: query == null
          ? null
          : {
              for (final e in query.entries)
                if (e.value != null) e.key: e.value!,
            },
    );
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

  Future<dynamic> get(String path, {Map<String, String?>? query}) =>
      _send('GET', path, query: query);

  Future<dynamic> post(
    String path, {
    Object? body,
    Map<String, String>? headers,
  }) =>
      _send(
        'POST',
        path,
        body: body ?? const <String, dynamic>{},
        headers: headers,
      );

  Future<dynamic> put(String path, {Object? body}) =>
      _send('PUT', path, body: body ?? const <String, dynamic>{});

  Future<dynamic> delete(String path) => _send('DELETE', path);

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
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    if (headers != null) req.headers.addAll(headers);

    final token = session?.accessToken;
    if (auth && token != null && token.isNotEmpty) {
      req.headers['Authorization'] = 'Bearer $token';
    }

    late http.StreamedResponse streamed;
    try {
      streamed = await _http.send(req).timeout(_timeout);
    } on TimeoutException {
      throw ApiException('Request timed out', code: 'timeout');
    } on http.ClientException catch (e) {
      throw ApiException(e.message, code: 'connection_error', cause: e);
    }

    final response = await http.Response.fromStream(streamed);
    if (response.statusCode == 401 && auth && retry) {
      final refreshed = await _refreshAccessToken();
      if (refreshed) {
        return _send(
          method,
          path,
          body: body,
          query: query,
          headers: headers,
          retry: false,
          auth: auth,
        );
      }
      await clear();
      throw ApiException('Session expired. Please sign in again.', code: 'unauthorized', statusCode: 401);
    }

    return _decode(response);
  }

  Future<bool> _refreshAccessToken() async {
    final existing = _refreshing;
    if (existing != null) {
      final token = await existing;
      return token != null && token.isNotEmpty;
    }

    final refresh = session?.refreshToken;
    if (refresh == null || refresh.isEmpty) return false;

    _refreshing = () async {
      try {
        final raw = await _send(
          'POST',
          '/auth/refresh',
          body: {'refreshToken': refresh},
          retry: false,
          auth: false,
        );
        if (raw is Map<String, dynamic>) {
          await saveSession(raw);
          return session?.accessToken;
        }
      } catch (_) {
        return null;
      } finally {
        _refreshing = null;
      }
      return null;
    }();

    final token = await _refreshing;
    return token != null && token.isNotEmpty;
  }

  dynamic _decode(http.Response response) {
    final status = response.statusCode;
    dynamic data;
    if (response.body.isNotEmpty) {
      try {
        data = jsonDecode(response.body);
      } catch (_) {
        data = response.body;
      }
    }

    if (status >= 200 && status < 300) return data;

    final message = data is Map && data['message'] is String
        ? data['message'] as String
        : 'Request failed ($status)';
    throw ApiException(message, statusCode: status, code: 'http_$status', cause: data);
  }

  void close() => _http.close();
}

class ApiException implements Exception {
  ApiException(
    this.message, {
    this.statusCode,
    this.code,
    this.cause,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final Object? cause;

  @override
  String toString() =>
      'ApiException(code: $code, statusCode: $statusCode, message: $message)';
}
