import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../../data/models/models.dart';
import '../navigation/nav.dart';
import '../theme/app_colors.dart';

String stageLabel(MediaStage s) {
  switch (s) {
    case MediaStage.before:
      return 'Before';
    case MediaStage.during:
      return 'During';
    case MediaStage.after:
      return 'After';
  }
}

Color stageColor(MediaStage s) {
  switch (s) {
    case MediaStage.before:
      return AppColors.danger;
    case MediaStage.during:
      return AppColors.primary;
    case MediaStage.after:
      return AppColors.success;
  }
}

/// Small coloured label on top of a photo (Before / During / After / LIVE).
class PhotoBadge extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;
  const PhotoBadge(this.text, {super.key, required this.color, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(7)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 8, color: Colors.white),
            const SizedBox(width: 4),
          ],
          Text(
            text,
            style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

/// Photo / video tile with badge and play overlay.
class MediaTile extends StatelessWidget {
  final MediaItem item;
  final double radius;
  final bool showBadge;
  final bool showExpand;
  final VoidCallback? onTap;

  const MediaTile({
    super.key,
    required this.item,
    this.radius = 14,
    this.showBadge = true,
    this.showExpand = true,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.primarySofter,
      borderRadius: BorderRadius.circular(radius),
      child: InkWell(
        borderRadius: BorderRadius.circular(radius),
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Center(
              child: Icon(
                item.kind == MediaKind.video ? Icons.play_circle_fill_rounded : Icons.photo_outlined,
                color: AppColors.link,
                size: item.kind == MediaKind.video ? 36 : 28,
              ),
            ),
            if (showBadge)
              Positioned(
                left: 6,
                top: 6,
                child: PhotoBadge(stageLabel(item.stage), color: stageColor(item.stage)),
              ),
            if (showExpand)
              Positioned(
                right: 6,
                top: 6,
                child: Icon(Icons.open_in_full_rounded, size: 14, color: AppColors.link.o(0.8)),
              ),
            Positioned(
              left: 6,
              right: 6,
              bottom: 6,
              child: Text(
                item.caption,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF2A3238)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Full-screen swipeable photo viewer with pinch zoom.
class PhotoViewerScreen extends StatefulWidget {
  final List<MediaItem> items;
  final int initial;
  const PhotoViewerScreen({super.key, required this.items, this.initial = 0});

  static void open(BuildContext context, List<MediaItem> items, int index) {
    context.push(PhotoViewerScreen(items: items, initial: index));
  }

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final PageController _pc = PageController(initialPage: widget.initial);
  late int _i = widget.initial;

  @override
  void dispose() {
    _pc.dispose();
    super.dispose();
  }

  Widget _imageFor(MediaItem item) {
    if (item.bytes != null) {
      return Image.memory(Uint8List.fromList(item.bytes!), fit: BoxFit.contain);
    }
    if (item.asset.isNotEmpty) {
      return Image.asset(
        item.asset,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 72),
      );
    }
    return Icon(
      item.kind == MediaKind.video ? Icons.play_circle_fill_rounded : Icons.photo_outlined,
      color: Colors.white70,
      size: 88,
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.items[_i];
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 4, 16, 4),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                  const Spacer(),
                  PhotoBadge(stageLabel(item.stage), color: stageColor(item.stage)),
                  const SizedBox(width: 10),
                  Text(
                    '${_i + 1} / ${widget.items.length}',
                    style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pc,
                itemCount: widget.items.length,
                onPageChanged: (v) => setState(() => _i = v),
                itemBuilder: (_, i) => InteractiveViewer(
                  minScale: 1,
                  maxScale: 4,
                  child: Center(
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        _imageFor(widget.items[i]),
                        if (widget.items[i].kind == MediaKind.video)
                          const Icon(Icons.play_circle_fill_rounded, color: Colors.white, size: 72),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 18),
              child: Text(
                item.caption,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
