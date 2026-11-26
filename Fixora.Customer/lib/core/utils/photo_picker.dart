import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

/// Opens the gallery (or camera) and returns the picked image bytes.
/// Works on Android, iOS and web (Chrome).
Future<Uint8List?> pickPhoto({bool camera = false}) async {
  try {
    final file = await ImagePicker().pickImage(
      source: camera ? ImageSource.camera : ImageSource.gallery,
      maxWidth: 1400,
      imageQuality: 85,
    );
    if (file == null) return null;
    return await file.readAsBytes();
  } catch (_) {
    return null;
  }
}

/// Asks Gallery or Camera, then returns the picked bytes.
Future<Uint8List?> choosePhoto(BuildContext context) async {
  final camera = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (ctx) => Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(26)),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add photo', style: AppText.h1),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.photo_library_outlined, color: AppColors.primary),
              title: Text('Choose from gallery', style: AppText.label),
              onTap: () => Navigator.of(ctx).pop(false),
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.photo_camera_outlined, color: AppColors.primary),
              title: Text('Take a photo', style: AppText.label),
              onTap: () => Navigator.of(ctx).pop(true),
            ),
          ],
        ),
      ),
    ),
  );
  if (camera == null) return null;
  return pickPhoto(camera: camera);
}
