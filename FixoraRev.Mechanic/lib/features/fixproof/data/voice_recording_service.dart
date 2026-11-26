import 'dart:async';

import 'package:flutter/foundation.dart';

enum VoiceLanguage { tamil, english }

enum VoiceRecordStatus { idle, recording, stopped, uploading, uploaded, error }

/// Tamil / English voice capture scaffold with playback timer + upload status.
/// (Device mic plugins can replace the timer simulation later.)
class VoiceRecordingService extends ChangeNotifier {
  VoiceLanguage language = VoiceLanguage.tamil;
  VoiceRecordStatus status = VoiceRecordStatus.idle;
  int elapsedSeconds = 0;
  String? lastError;
  Timer? _tick;

  bool get isRecording => status == VoiceRecordStatus.recording;

  void setLanguage(VoiceLanguage lang) {
    if (isRecording) return;
    language = lang;
    notifyListeners();
  }

  void start() {
    if (isRecording) return;
    elapsedSeconds = 0;
    lastError = null;
    status = VoiceRecordStatus.recording;
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      elapsedSeconds++;
      notifyListeners();
    });
    notifyListeners();
  }

  void stop() {
    _tick?.cancel();
    if (status == VoiceRecordStatus.recording) {
      status = VoiceRecordStatus.stopped;
      notifyListeners();
    }
  }

  /// Simulated local playback (seconds already recorded).
  Future<void> play() async {
    if (elapsedSeconds <= 0) return;
    final playFor = elapsedSeconds.clamp(1, 8);
    for (var i = 0; i < playFor; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
    }
  }

  Future<void> upload() async {
    if (elapsedSeconds <= 0) return;
    status = VoiceRecordStatus.uploading;
    lastError = null;
    notifyListeners();
    try {
      await Future<void>.delayed(const Duration(milliseconds: 900));
      status = VoiceRecordStatus.uploaded;
    } catch (e) {
      status = VoiceRecordStatus.error;
      lastError = e.toString();
    }
    notifyListeners();
  }

  void reset() {
    _tick?.cancel();
    status = VoiceRecordStatus.idle;
    elapsedSeconds = 0;
    lastError = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }
}
