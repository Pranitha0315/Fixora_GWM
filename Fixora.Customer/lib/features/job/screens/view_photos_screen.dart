import 'package:flutter/material.dart';

import '../../../core/core.dart';

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

    // Build rows: pairs, and a last single item spans full width.
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final hasPair = i + 1 < items.length;
      rows.add(Padding(
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
      ));
    }

    return FxPage(
      title: 'View Photos (${all.length})',
      subtitle: 'All photos related to this service job.',
      trailing: JobChip(store.jobId),
      children: [
        VehicleStrip(
          vehicle: store.vehicle,
          compact: true,
          trailing: CurrentStepBadge(value: store.currentStepLabel),
        ),
        const SizedBox(height: 14),
        FxChipTabs(
          labels: [
            'All (${all.length})',
            'Before (${count(MediaStage.before)})',
            'During (${count(MediaStage.during)})',
            'After (${count(MediaStage.after)})',
          ],
          index: _filter,
          onChanged: (i) => setState(() {
            _filter = i;
            _selected = 0;
          }),
        ),
        const SizedBox(height: 14),
        if (items.isEmpty)
          Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
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
                    child: Text('${_selected + 1} / ${items.length}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.navy)),
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
                  child: AssetPhoto(items[i].asset, radius: 9),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(items[_selected].caption,
                textAlign: TextAlign.center, style: AppText.muted.copyWith(fontSize: 13)),
          ),
        ],
      ],
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
        child: MediaTile(
          item: items[i],
          onTap: () {
            _select(i, items.length);
            PhotoViewerScreen.open(context, items, i);
          },
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
