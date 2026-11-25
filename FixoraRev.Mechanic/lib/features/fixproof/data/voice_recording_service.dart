import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

enum VoiceLanguage { tamil, english }

extension VoiceLanguageX on VoiceLanguage {
  String get label => switch (this) {
        VoiceLanguage.tamil => 'Tamil',
        VoiceLanguage.english => 'English',
      };
}

enum VoiceRecordStatus { idle, recording, stopped, uploading, uploaded, error }

/// Simulated voice note capture for inspection narration (no native recorder).
class VoiceRecordingService extends ChangeNotifier {
  VoiceLanguage _language = VoiceLanguage.english;
  VoiceRecordStatus _status = VoiceRecordStatus.idle;
  String? _localPath;
  Duration _duration = Duration.zero;
  Timer? _tick;
  DateTime? _startedAt;

  VoiceLanguage get language => _language;
  VoiceRecordStatus get status => _status;
  String? get localPath => _localPath;
  Duration get duration => _duration;

  void setLanguage(VoiceLanguage lang) {
    _language = lang;
    notifyListeners();
  }

  Future<void> start() async {
    if (_status == VoiceRecordStatus.recording) return;
    _status = VoiceRecordStatus.recording;
    _duration = Duration.zero;
    _startedAt = DateTime.now();
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      _duration = DateTime.now().difference(_startedAt!);
      notifyListeners();
    });
    notifyListeners();
  }

  Future<void> stop() async {
    if (_status != VoiceRecordStatus.recording) return;
    _tick?.cancel();
    _tick = null;
    try {
      final dir = await getTemporaryDirectory();
      final stamp = DateTime.now().millisecondsSinceEpoch;
      _localPath = '${dir.path}/voice_$stamp.m4a';
    } catch (_) {
      _localPath = '/tmp/voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
    }
    _status = VoiceRecordStatus.stopped;
    notifyListeners();
  }

  /// Local playback stub — toggles back to stopped after a short delay.
  Future<void> play() async {
    if (_localPath == null) return;
    notifyListeners();
    await Future<void>.delayed(const Duration(milliseconds: 400));
    notifyListeners();
  }

  Future<void> upload() async {
    if (_localPath == null) {
      _status = VoiceRecordStatus.error;
      notifyListeners();
      return;
    }
    _status = VoiceRecordStatus.uploading;
    notifyListeners();
    await Future<void>.delayed(const Duration(milliseconds: 600));
    _status = VoiceRecordStatus.uploaded;
    notifyListeners();
  }

  void reset() {
    _tick?.cancel();
    _tick = null;
    _status = VoiceRecordStatus.idle;
    _localPath = null;
    _duration = Duration.zero;
    _startedAt = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }
}