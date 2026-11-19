import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/media.dart';
import '../../../data/models/models.dart';
import '../../../data/repositories/job_store.dart';

/// "View Photos (5)" - filterable gallery with pager + thumbnails.
class ViewPhotosScreen extends StatefulWidget {
  const ViewPhotosScreen({super.key});

  @override
  State<ViewPhotosScreen> createState() => _ViewPhotosScreenState();
}

class _ViewPhotosScreenState extends State<ViewPhotosScreen> {
  int _filter = 0;
  int _selected = 0;
  final _thumbs = ScrollController();

  @override
  void dispose() {
    _thumbs.dispose();
    super.dispose();
  }

  List<MediaItem> get _all =>
      JobStore.instance.media.where((m) => m.kind == MediaKind.photo).toList();

  List<MediaItem> _filtered() {
    final all = _all;
    switch (_filter) {
      case 1:
        return all.where((m) => m.stage == MediaStage.before).toList();
      case 2:
        return all.where((m) => m.stage == MediaStage.during).toList();
      case 3:
        return all.where((m) => m.stage == MediaStage.after).toList();
      default:
        return all;
    }
  }

  void _select(int i, int count) {
    if (count == 0) return;
    setState(() => _selected = i.clamp(0, count - 1).toInt());
    if (_thumbs.hasClients) {
      _thumbs.animateTo(
        (_selected * 88.0 - 120).clamp(0.0, _thumbs.position.maxScrollExtent).toDouble(),
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = JobStore.instance;
    final all = _all;
    final items = _filtered();
    int count(MediaStage s) => all.where((m) => m.stage == s).length;
    if (_selected >= items.length) _selected = 0;

    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final hasPair = i + 1 < items.length;
      rows.add(
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: hasPair
              ? Row(
                  children: [
                    Expanded(child: _tile(items, i)),
                    const SizedBox(width: 10),
                    Expanded(child: _tile(items, i + 1)),
                  ],
                )
              : _tile(items, i, wide: true),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Text('View Photos (${all.length})'),
        backgroundColor: AppColors.bg,
        foregroundColor: AppColors.navy,
        elevation: 0,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.primarySofter,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  store.jobId,
                  style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Text('All photos related to this service job.', style: AppText.muted),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.surfaceSolid,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              children: [
                Icon(Icons.directions_car_outlined, color: AppColors.link),
                const SizedBox(width: 10),
                Expanded(child: Text('Current step', style: AppText.h3.copyWith(fontSize: 14))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.primarySoft,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    store.currentStepLabel,
                    style: TextStyle(color: AppColors.link, fontWeight: FontWeight.w700, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final e in [
                  (0, 'All (${all.length})'),
                  (1, 'Before (${count(MediaStage.before)})'),
                  (2, 'During (${count(MediaStage.during)})'),
                  (3, 'After (${count(MediaStage.after)})'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(e.$2),
                      selected: _filter == e.$1,
                      onSelected: (_) => setState(() {
                        _filter = e.$1;
                        _selected = 0;
                      }),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('No photos in this group yet.', style: AppText.muted)),
            )
          else
            AnimatedSwitcher(
              duration: const Duration(milliseconds: 250),
              child: Column(key: ValueKey(_filter), children: rows),
            ),
          if (items.isNotEmpty) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                _RoundArrow(
                  icon: Icons.chevron_left_rounded,
                  onTap: () => _select(_selected - 1, items.length),
                ),
                Expanded(
                  child: Center(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
                      decoration: BoxDecoration(
                        color: AppColors.primarySoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${_selected + 1} / ${items.length}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy),
                      ),
                    ),
                  ),
                ),
                _RoundArrow(
                  icon: Icons.chevron_right_rounded,
                  onTap: () => _select(_selected + 1, items.length),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 70,
              child: ListView.separated(
                controller: _thumbs,
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) => GestureDetector(
                  onTap: () => _select(i, items.length),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 80,
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: i == _selected ? AppColors.primary : Colors.transparent,
                        width: 2,
                      ),
                    ),
                    child: Container(
                      decoration: BoxDecoration(
                        color: AppColors.primarySofter,
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Icon(Icons.photo_outlined, color: AppColors.link, size: 22),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                items[_selected].caption,
                textAlign: TextAlign.center,
                style: AppText.muted.copyWith(fontSize: 13),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _tile(List<MediaItem> items, int i, {bool wide = false}) {
    final selected = i == _selected;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: selected ? AppColors.primary : Colors.transparent, width: 2),
      ),
      padding: const EdgeInsets.all(2),
      child: AspectRatio(
        aspectRatio: wide ? 2.6 : 1.55,
        child: Material(
          color: AppColors.primarySofter,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              _select(i, items.length);
              PhotoViewerScreen.open(context, items, i);
            },
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.photo_outlined, color: AppColors.link, size: 28),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Text(
                    items[i].caption,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: AppText.small.copyWith(fontSize: 11.5),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RoundArrow extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _RoundArrow({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.surface,
      shape: CircleBorder(side: BorderSide(color: AppColors.border)),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, color: AppColors.link),
        ),
      ),
    );
  }
}
