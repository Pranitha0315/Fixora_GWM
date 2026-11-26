import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';

enum MediaUploadKind { photo, video }

enum MediaUploadStatus { idle, picking, uploading, done, error }

class MediaUploadItem {
  MediaUploadItem({
    required this.id,
    required this.kind,
    required this.label,
    this.localPath,
    this.progress = 0,
    this.status = MediaUploadStatus.idle,
    this.error,
  });

  final String id;
  final MediaUploadKind kind;
  final String label;
  String? localPath;
  double progress;
  MediaUploadStatus status;
  String? error;
}

/// Camera / gallery capture + simulated upload with progress and retry.
class MediaUploadService extends ChangeNotifier {
  MediaUploadService({ImagePicker? picker}) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;
  final List<MediaUploadItem> items = [];

  Future<MediaUploadItem?> capturePhoto({bool fromCamera = true}) async {
    final file = await _picker.pickImage(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      imageQuality: 85,
    );
    if (file == null) return null;
    final item = MediaUploadItem(
      id: 'm-${DateTime.now().millisecondsSinceEpoch}',
      kind: MediaUploadKind.photo,
      label: 'Photo',
      localPath: file.path,
      status: MediaUploadStatus.picking,
    );
    items.add(item);
    notifyListeners();
    await upload(item);
    return item;
  }

  Future<MediaUploadItem?> captureVideo({bool fromCamera = true}) async {
    final file = await _picker.pickVideo(
      source: fromCamera ? ImageSource.camera : ImageSource.gallery,
      maxDuration: const Duration(minutes: 2),
    );
    if (file == null) return null;
    final item = MediaUploadItem(
      id: 'v-${DateTime.now().millisecondsSinceEpoch}',
      kind: MediaUploadKind.video,
      label: 'Video',
      localPath: file.path,
      status: MediaUploadStatus.picking,
    );
    items.add(item);
    notifyListeners();
    await upload(item);
    return item;
  }

  Future<void> upload(MediaUploadItem item, {bool failOnce = false}) async {
    item
      ..status = MediaUploadStatus.uploading
      ..progress = 0
      ..error = null;
    notifyListeners();
    try {
      for (var i = 1; i <= 10; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 80));
        item.progress = i / 10;
        notifyListeners();
      }
      if (failOnce && item.error == null && item.id.endsWith('0')) {
        throw StateError('Network blip');
      }
      item.status = MediaUploadStatus.done;
    } catch (e) {
      item
        ..status = MediaUploadStatus.error
        ..error = e.toString();
    }
    notifyListeners();
  }

  Future<void> retry(MediaUploadItem item) => upload(item);
}
