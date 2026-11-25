import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

enum MediaUploadKind { photo, video }

enum MediaUploadStatus { local, uploading, uploaded, failed }

class MediaUploadItem {
  MediaUploadItem({
    required this.id,
    required this.localPath,
    required this.kind,
    this.progress = 0,
    this.status = MediaUploadStatus.local,
  });

  final String id;
  final String localPath;
  final MediaUploadKind kind;
  double progress;
  MediaUploadStatus status;

  MediaUploadItem copyWith({
    double? progress,
    MediaUploadStatus? status,
  }) {
    return MediaUploadItem(
      id: id,
      localPath: localPath,
      kind: kind,
      progress: progress ?? this.progress,
      status: status ?? this.status,
    );
  }
}

/// Capture and simulate cloud upload for inspection media.
class MediaUploadService extends ChangeNotifier {
  final ImagePicker _picker = ImagePicker();
  final List<MediaUploadItem> _items = [];

  List<MediaUploadItem> get items => List.unmodifiable(_items);

  List<MediaUploadItem> forJob(String jobId) =>
      _items.where((i) => i.id.startsWith('$jobId-')).toList(growable: false);

  Future<String> _simulatedPath(String jobId, String suffix) async {
    try {
      final dir = await getTemporaryDirectory();
      final stamp = DateTime.now().millisecondsSinceEpoch;
      return '${dir.path}/fixproof_${jobId}_$stamp.$suffix';
    } catch (_) {
      return '/tmp/fixproof_${jobId}_${DateTime.now().millisecondsSinceEpoch}.$suffix';
    }
  }

  Future<MediaUploadItem?> capturePhoto(String jobId, {ImageSource source = ImageSource.camera}) async {
    try {
      final file = await _picker.pickImage(source: source, imageQuality: 85);
      final path = file?.path ?? await _simulatedPath(jobId, 'jpg');
      final item = MediaUploadItem(
        id: '$jobId-${DateTime.now().millisecondsSinceEpoch}',
        localPath: path,
        kind: MediaUploadKind.photo,
      );
      _items.insert(0, item);
      notifyListeners();
      return item;
    } catch (_) {
      final path = await _simulatedPath(jobId, 'jpg');
      final item = MediaUploadItem(
        id: '$jobId-${DateTime.now().millisecondsSinceEpoch}',
        localPath: path,
        kind: MediaUploadKind.photo,
      );
      _items.insert(0, item);
      notifyListeners();
      return item;
    }
  }

  Future<MediaUploadItem?> captureVideo(String jobId) async {
    try {
      final file = await _picker.pickVideo(source: ImageSource.camera);
      final path = file?.path ?? await _simulatedPath(jobId, 'mp4');
      final item = MediaUploadItem(
        id: '$jobId-${DateTime.now().millisecondsSinceEpoch}',
        localPath: path,
        kind: MediaUploadKind.video,
      );
      _items.insert(0, item);
      notifyListeners();
      return item;
    } catch (_) {
      final path = await _simulatedPath(jobId, 'mp4');
      final item = MediaUploadItem(
        id: '$jobId-${DateTime.now().millisecondsSinceEpoch}',
        localPath: path,
        kind: MediaUploadKind.video,
      );
      _items.insert(0, item);
      notifyListeners();
      return item;
    }
  }

  Future<void> upload(MediaUploadItem item) async {
    final index = _items.indexWhere((i) => i.id == item.id);
    if (index < 0) return;
    _items[index].status = MediaUploadStatus.uploading;
    _items[index].progress = 0;
    notifyListeners();

    for (var step = 1; step <= 5; step++) {
      await Future<void>.delayed(const Duration(milliseconds: 120));
      if (index >= _items.length) return;
      _items[index].progress = step / 5;
      notifyListeners();
    }

    if (index < _items.length) {
      _items[index].status = MediaUploadStatus.uploaded;
      _items[index].progress = 1;
      notifyListeners();
    }
  }

  Future<void> retry(MediaUploadItem item) => upload(item);
}