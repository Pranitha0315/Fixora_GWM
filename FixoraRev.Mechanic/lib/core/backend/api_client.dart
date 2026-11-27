import 'dart:convert';
import 'dart:math';

import 'package:dio/dio.dart';

import '../storage/secure_storage.dart';
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

/// JSON client for /api/v1 using Dio + flutter_secure_storage for JWT session.
class ApiClient {
  ApiClient(this._storageKey, {SecureStorage? storage, Dio? dio})
      : _storage = storage ?? SecureStorage(),
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: '${FixoraConfig.apiBase}/api/v1',
                connectTimeout: const Duration(seconds: 15),
                receiveTimeout: const Duration(seconds: 15),
                headers: {'Accept': 'application/json'},
              ),
            );

  final String _storageKey;
  final SecureStorage _storage;
  final Dio _dio;
  Session? session;
  Future<String?>? _refreshing;

  /// Called when the server rejects the refresh token (session expired or revoked).
  void Function()? onSessionExpired;

  Dio get dio => _dio;
  bool get signedIn => session != null;

  static final Random _rnd = Random.secure();

  /// Client-generated key that makes a repeated write safe (approvals, SOS, bookings).
  static String newIdempotencyKey() {
    String hex(int n) => List.generate(n, (_) => _rnd.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}';
  }

  Future<void> restore() async {
    final raw = await _storage.readMigratingFromPrefs(_storageKey);
    if (raw == null) return;
    try {
      session = Session.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      session = null;
    }
  }

  Future<void> saveSession(Map<String, dynamic> tokens) async {
    session = Session.fromJson(tokens);
    await _storage.write(_storageKey, jsonEncode(session!.toJson()));
  }

  Future<void> clear() async {
    session = null;
    await _storage.delete(_storageKey);
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
      final j = await _send(
        'POST',
        '/auth/refresh',
        body: {'refreshToken': refreshToken},
        retry: false,
        auth: false,
      );
      await saveSession(j as Map<String, dynamic>);
      return session!.accessToken;
    } on ApiException catch (e) {
      // Only a server rejection means the session is over. A network blip or a 5xx
      // keeps the saved session so the mechanic is not logged out by bad Wi-Fi.
      if (e.status == 400 || e.status == 401 || e.status == 403) {
        await clear();
        onSessionExpired?.call();
      }
      return null;
    } catch (_) {
      return null;
    } finally {
      _refreshing = null;
    }
  }

  Future<void> logout() async {
    final s = session;
    if (s != null) {
      try {
        await _send(
          'POST',
          '/auth/logout',
          body: {'refreshToken': s.refreshToken},
          retry: false,
          auth: false,
        );
      } catch (_) {}
    }
    await clear();
  }

  Future<dynamic> get(String path, {Map<String, String?>? query}) => _send('GET', path, query: query);

  Future<dynamic> post(String path, {Object? body, Map<String, String>? headers}) =>
      _send('POST', path, body: body ?? const <String, dynamic>{}, headers: headers);

  /// Multipart upload (one binary file + text fields), e.g. a voice note for speech-to-text.
  Future<dynamic> postFile(
    String path, {
    required String field,
    required List<int> bytes,
    required String filename,
    required String contentType,
    Map<String, String> fields = const {},
  }) {
    final form = FormData.fromMap({
      ...fields,
      field: MultipartFile.fromBytes(bytes, filename: filename, contentType: DioMediaType.parse(contentType)),
    });
    return _send('POST', path, body: form);
  }

  Future<dynamic> put(String path, {Object? body}) => _send('PUT', path, body: body ?? const <String, dynamic>{});

  Future<dynamic> delete(String path) => _send('DELETE', path);

  Map<String, dynamic>? _query(Map<String, String?>? query) {
    if (query == null) return null;
    final q = <String, dynamic>{};
    query.forEach((k, v) {
      if (v != null && v.isNotEmpty) q[k] = v;
    });
    return q.isEmpty ? null : q;
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
    final opts = Options(
      method: method,
      headers: <String, dynamic>{
        if (headers != null) ...headers,
        if (auth && session?.accessToken != null) 'Authorization': 'Bearer ${session!.accessToken}',
      },
    );

    try {
      final res = await _dio.request<dynamic>(
        path,
        data: body,
        queryParameters: _query(query),
        options: opts,
      );

      if (res.statusCode == 401 && retry && auth && session != null) {
        final fresh = await refresh();
        if (fresh != null) {
          return await _send(method, path, body: body, query: query, headers: headers, retry: false);
        }
      }

      final status = res.statusCode ?? 0;
      if (status >= 400) {
        throw _fromBody(status, res.data);
      }
      return res.data;
    } on ApiException {
      rethrow;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401 && retry && auth && session != null) {
        final fresh = await refresh();
        if (fresh != null) {
          return await _send(method, path, body: body, query: query, headers: headers, retry: false);
        }
      }
      throw _mapDio(e);
    }
  }

  ApiException _mapDio(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout) {
      return ApiException(0, 'timeout', 'The garage server did not answer in time. Check your connection.');
    }
    if (e.type == DioExceptionType.connectionError) {
      return ApiException(0, 'network', 'Cannot reach the Fixora server. Check your connection.');
    }
    final status = e.response?.statusCode ?? 0;
    if (status >= 400) return _fromBody(status, e.response?.data);
    return ApiException(0, 'network', 'Cannot reach the Fixora server. Check your connection.');
  }

  ApiException _fromBody(int status, dynamic data) {
    var code = 'error';
    var message = 'Something went wrong ($status).';
    if (data is Map) {
      code = (data['code'] ?? code).toString();
      message = (data['message'] ?? message).toString();
      final errors = data['errors'];
      if (errors is Map && errors.isNotEmpty) {
        message = errors.values.expand((v) => v is List ? v : [v]).map((e) => e.toString()).join(' ');
      }
    }
    return ApiException(status, code, message);
  }
}
