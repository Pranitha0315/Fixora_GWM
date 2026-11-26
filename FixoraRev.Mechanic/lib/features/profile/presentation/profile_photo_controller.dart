import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Stores a mechanic's selected profile photo on this device/browser.
class ProfilePhotoController extends ChangeNotifier {
  ProfilePhotoController(
      {ImagePicker? picker, SharedPreferencesAsync? preferences})
      : _picker = picker ?? ImagePicker(),
        _preferences = preferences ?? SharedPreferencesAsync() {
    unawaited(load());
  }

  static const _storageKey = 'fixora_rev.profile_photo';

  final ImagePicker _picker;
  final SharedPreferencesAsync _preferences;
  Uint8List? _bytes;
  bool _loaded = false;

  Uint8List? get bytes => _bytes;
  bool get loaded => _loaded;
  bool get hasPhoto => _bytes != null;

  Future<void> load() async {
    try {
      final encoded = await _preferences.getString(_storageKey);
      if (encoded != null && encoded.isNotEmpty) {
        _bytes = base64Decode(encoded);
      }
    } catch (_) {
      // A corrupt or unavailable browser preference should not block the app.
      _bytes = null;
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }

  Future<bool> choosePhoto() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 82,
      maxWidth: 640,
      maxHeight: 640,
    );
    if (file == null) return false;

    final bytes = await file.readAsBytes();
    if (bytes.isEmpty) return false;
    await _preferences.setString(_storageKey, base64Encode(bytes));
    _bytes = bytes;
    _loaded = true;
    notifyListeners();
    return true;
  }

  Future<void> removePhoto() async {
    await _preferences.remove(_storageKey);
    _bytes = null;
    _loaded = true;
    notifyListeners();
  }
}
