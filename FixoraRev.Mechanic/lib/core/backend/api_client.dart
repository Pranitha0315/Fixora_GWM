import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'session.dart';

/// JSON client for /api/v1 using Dio.
/// Short-lived JWT + rotating refresh token, refreshed once on 401.
/// Tokens are stored with [FlutterSecureStorage] (Keychain / Keystore).
class ApiClient {
  ApiClient(this._storageKey, {FlutterSecureStorage? secureStorage, Dio? dio})
      : _secure = secureStorage ?? const FlutterSecureStorage(),
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: _baseUrl,
                connectTimeout: _timeout,
                receiveTimeout: _timeout,
                headers: {'Accept': 'application/json'},
              ),
            );

  final String _storageKey;
  final FlutterSecureStorage _secure;
  final Dio _dio;

  Session? session;
  Future<String?>? _refreshing;

  bool get signedIn => session != null;
  Dio get dio => _dio;

  static const _timeout = Duration(seconds: 20);
  static const _baseUrl = 'https://api.fixora.local/api/v1';

  Future<void> restore() async {
    try {
      var raw = await _secure.read(key: _storageKey);
      // One-time migrate from older SharedPreferences demo storage.
      if (raw == null) {
        final prefs = await SharedPreferences.getInstance();
        raw = prefs.getString(_storageKey);
        if (raw != null) {
          await _secure.write(key: _storageKey, value: raw);
          await prefs.remove(_storageKey);
        }
      }
      if (raw == null) return;
      session = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      session = null;
    }
  }

  Future<void> saveSession(Map<String, dynamic> tokens) async {
    session = Session.fromJson(tokens);
    await _secure.write(
      key: _storageKey,
      value: jsonEncode(session!.toJson()),
    );
  }

  Future<void> clear() async {
    session = null;
    await _secure.delete(key: _storageKey);
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
    final normalized = path.startsWith('/') ? path : '/$path';
    final options = Options(
      method: method,
      headers: {
        ...?headers,
        if (body != null) 'Content-Type': 'application/json',
      },
    );

    final token = session?.accessToken;
    if (auth && token != null && token.isNotEmpty) {
      options.headers = {
        ...?options.headers,
        'Authorization': 'Bearer $token',
      };
    }

    final queryParameters = query == null
        ? null
        : <String, dynamic>{
            for (final e in query.entries)
              if (e.value != null) e.key: e.value!,
          };

    try {
      final response = await _dio.request<dynamic>(
        normalized,
        data: body,
        queryParameters: queryParameters,
        options: options,
      );
      return response.data;
    } on DioException catch (e) {
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.sendTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        throw ApiException('Request timed out', code: 'timeout', cause: e);
      }
      if (e.type == DioExceptionType.connectionError) {
        throw ApiException(
          e.message ?? 'Connection error',
          code: 'connection_error',
          cause: e,
        );
      }

      final status = e.response?.statusCode;
      if (status == 401 && auth && retry) {
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
        throw ApiException(
          'Session expired. Please sign in again.',
          code: 'unauthorized',
          statusCode: 401,
        );
      }

      throw _fromDio(e);
    }
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

  ApiException _fromDio(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    final message = data is Map && data['message'] is String
        ? data['message'] as String
        : e.message ?? 'Request failed (${status ?? 'network'})';
    return ApiException(
      message,
      statusCode: status,
      code: status != null ? 'http_$status' : 'dio_error',
      cause: data ?? e,
    );
  }

  void close() => _dio.close(force: true);
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
