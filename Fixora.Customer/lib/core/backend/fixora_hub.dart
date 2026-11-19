import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

import 'fixora_config.dart';

enum HubState { offline, connecting, live, reconnecting }

/// Minimal SignalR client (JSON hub protocol over WebSockets) for /hubs/fixora.
///
/// A realtime event never proves completion: listeners re-fetch authoritative
/// state from the API.
class FixoraHub {
  FixoraHub(this._token);

  final Future<String?> Function() _token;
  static const String _rs = '\u001e';
  static const List<int> _backoffSeconds = [0, 2, 5, 10, 20, 30];

  final ValueNotifier<HubState> state = ValueNotifier(HubState.offline);
  final Map<String, List<void Function(dynamic payload)>> _handlers = {};
  final List<VoidCallback> _onConnected = [];

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _sub;
  Timer? _ping;
  Timer? _retry;
  bool _stopped = true;
  int _attempt = 0;
  String _buffer = '';

  /// Subscribe to a server event, e.g. 'notification', 'approval.updated'.
  void on(String event, void Function(dynamic payload) handler) => (_handlers[event] ??= []).add(handler);

  /// Called after every (re)connect, so screens can re-sync anything they missed.
  void onConnected(VoidCallback cb) => _onConnected.add(cb);

  void clearHandlers() {
    _handlers.clear();
    _onConnected.clear();
  }

  Future<void> start() async {
    if (!_stopped) return;
    _stopped = false;
    _attempt = 0;
    await _connect();
  }

  Future<void> stop() async {
    _stopped = true;
    _retry?.cancel();
    await _teardown();
    state.value = HubState.offline;
  }

  Future<void> _teardown() async {
    _ping?.cancel();
    _ping = null;
    await _sub?.cancel();
    _sub = null;
    try {
      await _channel?.sink.close();
    } catch (_) {}
    _channel = null;
  }

  Future<void> _connect() async {
    if (_stopped) return;
    state.value = _attempt == 0 ? HubState.connecting : HubState.reconnecting;
    try {
      final token = await _token();
      if (token == null) {
        state.value = HubState.offline;
        return;
      }
      final negotiate = await http
          .post(
            Uri.parse('${FixoraConfig.hubUrl}/negotiate?negotiateVersion=1'),
            headers: {'Authorization': 'Bearer $token'},
          )
          .timeout(const Duration(seconds: 10));
      if (negotiate.statusCode != 200) throw StateError('negotiate ${negotiate.statusCode}');
      final connectionToken = (jsonDecode(negotiate.body) as Map<String, dynamic>)['connectionToken'] as String;

      final wsBase = FixoraConfig.hubUrl.replaceFirst(RegExp(r'^http'), 'ws');
      final uri = Uri.parse(
        '$wsBase?id=${Uri.encodeQueryComponent(connectionToken)}'
        '&access_token=${Uri.encodeQueryComponent(token)}',
      );
      final channel = WebSocketChannel.connect(uri);
      await channel.ready.timeout(const Duration(seconds: 10));

      _channel = channel;
      _buffer = '';
      _sub = channel.stream.listen(_onData, onDone: _onClosed, onError: (Object _) => _onClosed());
      channel.sink.add('${jsonEncode({'protocol': 'json', 'version': 1})}$_rs');
      _ping = Timer.periodic(const Duration(seconds: 15), (_) => _write({'type': 6}));

      _attempt = 0;
      state.value = HubState.live;
      for (final cb in List.of(_onConnected)) {
        cb();
      }
    } catch (_) {
      await _teardown();
      _scheduleRetry();
    }
  }

  void _write(Map<String, dynamic> message) {
    try {
      _channel?.sink.add('${jsonEncode(message)}$_rs');
    } catch (_) {}
  }

  void _onData(dynamic data) {
    _buffer += data is String ? data : utf8.decode(data as List<int>);
    while (_buffer.contains(_rs)) {
      final i = _buffer.indexOf(_rs);
      final frame = _buffer.substring(0, i);
      _buffer = _buffer.substring(i + 1);
      if (frame.isEmpty) continue;
      final msg = jsonDecode(frame);
      if (msg is! Map) continue;
      switch (msg['type']) {
        case 1:
          final target = msg['target'] as String?;
          final args = msg['arguments'];
          final payload = args is List && args.isNotEmpty ? args.first : null;
          for (final h in List.of(_handlers[target] ?? const <void Function(dynamic)>[])) {
            try {
              h(payload);
            } catch (e) {
              debugPrint('FixoraHub handler for $target failed: $e');
            }
          }
          break;
        case 6:
          break;
        case 7:
          _onClosed();
          break;
      }
    }
  }

  void _onClosed() {
    if (_stopped) return;
    _teardown();
    _scheduleRetry();
  }

  void _scheduleRetry() {
    if (_stopped) return;
    state.value = HubState.reconnecting;
    final wait = _backoffSeconds[_attempt.clamp(0, _backoffSeconds.length - 1)];
    _attempt++;
    _retry?.cancel();
    _retry = Timer(Duration(seconds: wait), _connect);
  }
}
