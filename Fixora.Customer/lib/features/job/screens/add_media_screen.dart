import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../../core/core.dart';
import '../widgets/job_widgets.dart';

enum _Type { photo, video, beforeAfter }

class _Picked {
  final String asset;
  final String name;
  final String size;
  final String? duration;
  final Uint8List? bytes;
  const _Picked(this.asset, this.name, this.size, [this.duration, this.bytes]);

  MediaItem toItem(MediaKind kind, MediaStage stage, String caption) => MediaItem(
        asset: asset,
        bytes: bytes,
        kind: kind,
        stage: stage,
        caption: caption,
        duration: duration,
        uploadedByMe: true,
      );
}

String _sizeOf(Uint8List b) => '${(b.length / (1024 * 1024)).toStringAsFixed(1)} MB';

/// "Add Media" - customer uploads photos / videos / before & after.
///
/// Photos come from the real gallery / camera (image_picker). Videos use demo
/// clips for now.
class AddMediaScreen extends StatefulWidget {
  const AddMediaScreen({super.key});

  @override
  State<AddMediaScreen> createState() => _AddMediaScreenState();
}

class _AddMediaScreenState extends State<AddMediaScreen> {
  static const _videoPool = [Img.brakeDisc, Img.wheelAlignment, Img.liveFrame];

  _Type _type = _Type.photo;
  bool _more = false;
  bool _loading = false;
  int _counter = 0;
  final List<_Picked> _photos = [];
  final List<_Picked> _videos = [];
  _Picked? _before;
  _Picked? _after;
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  int get _count {
    switch (_type) {
      case _Type.photo:
        return _photos.length;
      case _Type.video:
        return _videos.length;
      case _Type.beforeAfter:
        return (_before != null ? 1 : 0) + (_after != null ? 1 : 0);
    }
  }

  Future<void> _pickPhoto() async {
    if (_photos.length >= 6) {
      showFxSnack(context, 'You can add up to 6 photos at a time', icon: Icons.info_outline_rounded);
      return;
    }
    final bytes = await choosePhoto(context);
    if (!mounted || bytes == null) return;
    setState(() {
      _counter++;
      _photos.add(_Picked('', 'IMG_${1000 + _counter}.jpg', _sizeOf(bytes), null, bytes));
    });
  }

  void _pickVideo() {
    if (_videos.length >= 3) {
      showFxSnack(context, 'Up to 3 videos per upload', icon: Icons.info_outline_rounded);
      return;
    }
    setState(() {
      final asset = _videoPool[_videos.length % _videoPool.length];
      _counter++;
      _videos.add(_Picked(asset, 'VID_20${40 + _counter}.mp4', '${18 + _counter * 4} MB', '0${2 - _videos.length % 2}:${36 - _videos.length * 7}'));
    });
  }

  Future<void> _upload() async {
    if (_count == 0) return;
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;

    final note = _note.text.trim();
    final uploaded = <_Picked>[];
    final items = <MediaItem>[];
    switch (_type) {
      case _Type.photo:
        uploaded.addAll(_photos);
        items.addAll(_photos.map((p) =>
            p.toItem(MediaKind.photo, MediaStage.during, note.isEmpty ? 'Photo added by you' : note)));
      case _Type.video:
        uploaded.addAll(_videos);
        items.addAll(_videos.map((p) =>
            p.toItem(MediaKind.video, MediaStage.during, note.isEmpty ? 'Video added by you' : note)));
      case _Type.beforeAfter:
        if (_before != null) {
          uploaded.add(_before!);
          items.add(_before!.toItem(MediaKind.photo, MediaStage.before, note.isEmpty ? 'Before (added by you)' : note));
        }
        if (_after != null) {
          uploaded.add(_after!);
          items.add(_after!.toItem(MediaKind.photo, MediaStage.after, note.isEmpty ? 'After (added by you)' : note));
        }
    }
    JobStore.instance.addMedia(items);
    setState(() => _loading = false);

    final typeLabel = switch (_type) {
      _Type.photo => 'Photos',
      _Type.video => 'Videos',
      _Type.beforeAfter => 'Before & After',
    };

    final addMore = await showSuccessDialog<bool>(
      context,
      title: 'Upload Successful!',
      message: '${uploaded.length} file${uploaded.length == 1 ? '' : 's'} uploaded for $typeLabel.',
      extra: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.primarySofter,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            for (final p in uploaded.take(4))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  children: [
                    p.bytes != null
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.memory(p.bytes!, width: 52, height: 38, fit: BoxFit.cover),
                          )
                        : AssetPhoto(p.asset, width: 52, height: 38, radius: 8),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.name, style: AppText.label),
                          Text(p.size, style: AppText.small),
                        ],
                      ),
                    ),
                    const Icon(Icons.check_circle_rounded, color: AppColors.success),
                  ],
                ),
              ),
            if (uploaded.length > 4)
              Text('+ ${uploaded.length - 4} more', style: AppText.small),
          ],
        ),
      ),
      actions: (dialogContext) => [
        Expanded(
          child: OutlineButton2(
            label: 'Add More',
            height: 48,
            fontSize: 14.5,
            onPressed: () => Navigator.of(dialogContext).pop(true),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: PrimaryButton(
            label: 'Back to Media',
            height: 48,
            fontSize: 14.5,
            onPressed: () => Navigator.of(dialogContext).pop(false),
          ),
        ),
      ],
    );
    if (!mounted) return;
    if (addMore == true) {
      setState(() {
        _more = true;
        _photos.clear();
        _videos.clear();
        _before = null;
        _after = null;
        _note.clear();
      });
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    return FxPage(
      title: 'Estimate & Approval',
      children: [
        FadeSlide(
          child: FxCard(
            padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CardHeader(
                  icon: Icons.add_photo_alternate_outlined,
                  title: _more ? 'Add More Media' : 'Add Media',
                  subtitle: _more
                      ? 'Upload additional photos or videos for this service job.'
                      : 'Upload photos or videos related to this service job.',
                  trailing: GestureDetector(
                    onTap: () => Navigator.of(context).pop(),
                    child: Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        color: AppColors.primarySofter,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.close_rounded, size: 18, color: AppColors.navy),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                VehicleStrip(
                  vehicle: store.vehicle,
                  compact: true,
                  trailing: CurrentStepBadge(value: store.currentStepLabel),
                ),
                const SizedBox(height: 14),
                Text('Select Media Type', style: AppText.h3),
                const SizedBox(height: 10),
                Row(
                  children: [
                    _typeBox(_Type.photo, Icons.image_outlined, 'Photo'),
                    const SizedBox(width: 8),
                    _typeBox(_Type.video, Icons.smart_display_outlined, 'Video'),
                    const SizedBox(width: 8),
                    _typeBox(_Type.beforeAfter, Icons.compare_outlined, 'Before & After'),
                  ],
                ),
                const SizedBox(height: 14),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  child: KeyedSubtree(
                    key: ValueKey(_type),
                    child: switch (_type) {
                      _Type.photo => _photoSection(),
                      _Type.video => _videoSection(),
                      _Type.beforeAfter => _beforeAfterSection(),
                    },
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Icon(Icons.edit_note_rounded, size: 18, color: AppColors.navy),
                    SizedBox(width: 6),
                    Text('Add Note (Optional)', style: AppText.label),
                  ],
                ),
                const SizedBox(height: 8),
                FxTextField(
                  controller: _note,
                  hint: _type == _Type.video
                      ? 'Add a short description for this video...'
                      : _type == _Type.beforeAfter
                          ? 'Add a short description for this before & after work...'
                          : 'Add a short description for these photos...',
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlineButton2(
                        label: 'Cancel',
                        height: 50,
                        onPressed: () => Navigator.of(context).pop(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: PrimaryButton(
                        label: 'Upload ($_count)',
                        icon: Icons.cloud_upload_outlined,
                        height: 50,
                        loading: _loading,
                        onPressed: _count == 0 ? null : _upload,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _typeBox(_Type t, IconData icon, String label) {
    final sel = _type == t;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _type = t),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          height: 78,
          decoration: BoxDecoration(
            color: sel ? AppColors.primarySoft : AppColors.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: sel ? AppColors.primary : AppColors.border, width: sel ? 1.6 : 1),
            boxShadow: AppShadows.soft,
          ),
          child: Stack(
            children: [
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(icon, color: AppColors.link, size: 26),
                    const SizedBox(height: 6),
                    Text(label,
                        style: TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.navy)),
                  ],
                ),
              ),
              if (sel)
                const Positioned(
                  right: 6,
                  top: 6,
                  child: CircleAvatar(
                    radius: 9,
                    backgroundColor: AppColors.primary,
                    child: Icon(Icons.check_rounded, size: 13, color: Colors.white),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dropZone({
    required String title,
    required String button,
    required IconData buttonIcon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: DashedBorder(
        fill: AppColors.primarySofter,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
          child: Column(
            children: [
              Icon(Icons.cloud_upload_outlined, color: AppColors.link, size: 38),
              const SizedBox(height: 6),
              Text(title, style: AppText.h3),
              const SizedBox(height: 2),
              Text('or drag and drop files here', style: AppText.muted.copyWith(fontSize: 12)),
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(30),
                  border: Border.all(color: AppColors.primary.o(0.6)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(buttonIcon, size: 18, color: AppColors.link),
                    const SizedBox(width: 6),
                    Text(button,
                        style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600, color: AppColors.link)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _addTile({required VoidCallback onTap, String? label}) {
    return GestureDetector(
      onTap: onTap,
      child: DashedBorder(
        radius: 12,
        child: SizedBox.expand(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add_rounded, color: AppColors.link, size: 28),
              if (label != null)
                Text(label,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w600, color: AppColors.navy)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _photoSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _dropZone(
          title: 'Tap to Add Photos',
          button: 'Choose from Gallery',
          buttonIcon: Icons.image_outlined,
          onTap: _pickPhoto,
        ),
        const SizedBox(height: 8),
        Text('Supported formats: JPG, PNG, HEIC (Max 10 MB per file)',
            textAlign: TextAlign.center, style: AppText.small.copyWith(fontSize: 10.5)),
        if (_photos.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(_more ? 'New Selections (${_photos.length})' : 'Added Photos (${_photos.length})',
              style: AppText.h3.copyWith(fontSize: 14.5)),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 4,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            children: [
              for (var i = 0; i < _photos.length; i++)
                MediaTile(
                  item: MediaItem(
                      asset: _photos[i].asset,
                      bytes: _photos[i].bytes,
                      kind: MediaKind.photo,
                      stage: MediaStage.during,
                      caption: _photos[i].name),
                  radius: 12,
                  showBadge: false,
                  onRemove: () => setState(() => _photos.removeAt(i)),
                ),
              _addTile(onTap: _pickPhoto),
            ],
          ),
        ],
      ],
    );
  }

  Widget _videoSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _dropZone(
          title: 'Tap to Add Video',
          button: 'Choose Video from Gallery',
          buttonIcon: Icons.smart_display_outlined,
          onTap: _pickVideo,
        ),
        const SizedBox(height: 8),
        Text('Supported formats: MP4, MOV, AVI, MKV (Max 100 MB per video, up to 3 minutes)',
            textAlign: TextAlign.center, style: AppText.small.copyWith(fontSize: 10.5)),
        if (_videos.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text('Added Videos (${_videos.length})', style: AppText.h3.copyWith(fontSize: 14.5)),
          const SizedBox(height: 8),
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 8,
            crossAxisSpacing: 8,
            childAspectRatio: 1.6,
            children: [
              for (var i = 0; i < _videos.length; i++)
                MediaTile(
                  item: MediaItem(
                      asset: _videos[i].asset,
                      kind: MediaKind.video,
                      stage: MediaStage.during,
                      caption: _videos[i].name,
                      duration: _videos[i].duration),
                  radius: 12,
                  onRemove: () => setState(() => _videos.removeAt(i)),
                ),
              if (_videos.length < 3) _addTile(onTap: _pickVideo, label: 'Add Another\nVideo'),
            ],
          ),
        ],
      ],
    );
  }

  Widget _beforeAfterSection() {
    Widget slot({required bool before}) {
      final picked = before ? _before : _after;
      final color = before ? AppColors.danger : AppColors.success;
      final tag = before ? 'Before' : 'After';
      if (picked != null) {
        return AspectRatio(
          aspectRatio: 1.15,
          child: MediaTile(
            item: MediaItem(
                asset: picked.asset,
                bytes: picked.bytes,
                kind: MediaKind.photo,
                stage: before ? MediaStage.before : MediaStage.after,
                caption: picked.name),
            radius: 14,
            onRemove: () => setState(() {
              if (before) {
                _before = null;
              } else {
                _after = null;
              }
            }),
          ),
        );
      }
      return AspectRatio(
        aspectRatio: 1.15,
        child: GestureDetector(
          onTap: () async {
            final bytes = await choosePhoto(context);
            if (!mounted || bytes == null) return;
            setState(() {
              _counter++;
              final p = _Picked('', '$tag.jpg', _sizeOf(bytes), null, bytes);
              if (before) {
                _before = p;
              } else {
                _after = p;
              }
            });
          },
          child: DashedBorder(
            fill: AppColors.primarySofter,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.o(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(tag,
                      style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(height: 6),
                Icon(Icons.add_photo_alternate_outlined, color: AppColors.link, size: 30),
                const SizedBox(height: 4),
                Text('Add $tag Photo',
                    style: TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700, color: AppColors.navy)),
                Text(before ? '(e.g., damage, old part)' : '(e.g., repaired, new part)',
                    textAlign: TextAlign.center,
                    style: AppText.small.copyWith(fontSize: 10)),
              ],
            ),
          ),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Add Before & After Media', style: AppText.h3),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(child: slot(before: true)),
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 6),
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: AppColors.surfaceSolid,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.arrow_forward_rounded, size: 16, color: AppColors.link),
            ),
            Expanded(child: slot(before: false)),
          ],
        ),
        const SizedBox(height: 8),
        Text('Tip: take both photos from the same angle so the difference is clear.',
            textAlign: TextAlign.center, style: AppText.small.copyWith(fontSize: 10.5)),
      ],
    );
  }
}
