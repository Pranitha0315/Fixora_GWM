import 'package:flutter/material.dart';

import '../../../core/di/app_services.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/utils/hash_chain.dart';
import '../../../core/utils/nav.dart';
import '../../../core/widgets/action_sheet.dart';
import '../../../core/widgets/buttons.dart';
import '../../../core/widgets/rev_common.dart';
import '../../jobs/domain/job_entities.dart';
import '../../jobs/presentation/widgets/job_card.dart';
import '../domain/passport_entities.dart';

class PassportDetailScreen extends StatelessWidget {
  const PassportDetailScreen({super.key, required this.entryId});
  final String entryId;

  String get _mechanic => AppServices.auth.user?.fullName ?? 'Mechanic';

  Future<String?> _askNote(BuildContext context,
      {required String title, required String hint, String action = 'Save'}) {
    final controller = TextEditingController();
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            20, 0, 20, 20 + MediaQuery.viewInsetsOf(ctx).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title,
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(hintText: hint),
            ),
            const SizedBox(height: 16),
            PrimaryButton(
              label: action,
              onPressed: () {
                final text = controller.text.trim();
                if (text.isNotEmpty) Navigator.pop(ctx, text);
              },
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _changeStatus(BuildContext context, PassportEntry entry) async {
    final status = await showModalBottomSheet<PassportStatus>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final s in [
              PassportStatus.unresolved,
              PassportStatus.monitoring,
              PassportStatus.escalated
            ])
              ListTile(
                leading: Icon(s.icon, color: s.color),
                title: Text(s.label,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                trailing: entry.status == s
                    ? Icon(Icons.check_rounded, color: AppColors.primary)
                    : null,
                onTap: () => Navigator.pop(ctx, s),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (status == null || status == entry.status || !context.mounted) return;
    final note = await _askNote(context,
        title: 'Reason for "${status.label}"',
        hint: 'Why is the status changing?');
    if (note == null) return;
    AppServices.passport.changeStatus(entry, status, _mechanic, note);
  }

  Future<void> _resolve(BuildContext context, PassportEntry entry) async {
    final jobs = AppServices.jobs.all
        .where((j) => j.vehicle.plate == entry.vehicle.plate)
        .toList();
    if (jobs.isEmpty) {
      context.toast('Resolving needs a job for this vehicle to link to.',
          icon: Icons.info_outline);
      return;
    }
    final job = await showModalBottomSheet<Job>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('Link the job that fixed it',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ),
            for (final j in jobs)
              ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.primarySoft,
                  child: Text('#${j.token}',
                      style: TextStyle(
                          color: AppColors.primaryDark,
                          fontWeight: FontWeight.w800,
                          fontSize: 12)),
                ),
                title: Text(j.serviceType,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${j.id} · ${j.status.label}'),
                onTap: () => Navigator.pop(ctx, j),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (job == null || !context.mounted) return;
    final note = await _askNote(
      context,
      title: 'Verification note',
      hint:
          'How did you confirm the issue is fixed? (e.g. 20 km road test, no judder)',
      action: 'Resolve entry',
    );
    if (note == null) return;
    AppServices.passport.resolve(entry, job.id, _mechanic, note);
    if (context.mounted) {
      context.toast('${entry.id} resolved', icon: Icons.verified);
    }
  }

  /// The ⋯ button and a long-press both open the same options sheet.
  Future<void> _moreOptions(BuildContext context, PassportEntry entry) {
    return showActionSheet(
      context,
      title: entry.title,
      subtitle: 'Passport entry options',
      actions: [
        SheetAction(
          icon: Icons.note_add_outlined,
          label: 'Add a note',
          subtitle: 'A new observation for the next mechanic',
          onTap: () async {
            final note = await _askNote(context, title: 'Add a note', hint: 'New observation');
            if (note != null) AppServices.passport.addNote(entry, _mechanic, note);
          },
        ),
        SheetAction(
          icon: Icons.swap_vert_rounded,
          label: 'Change status',
          onTap: () => _changeStatus(context, entry),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: AppServices.passport,
      builder: (context, _) {
        final entry = AppServices.passport.byId(entryId);
        final verified = AppServices.passport.verify(entry);
        return Scaffold(
          appBar: AppBar(title: Text(entry.id)),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(entry.title,
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.w800)),
                        ),
                        Pill(
                            label: entry.status.label,
                            color: entry.status.color,
                            icon: entry.status.icon),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Text('${entry.vehicle.title} · ${entry.vehicle.year}  ',
                            style: TextStyle(color: AppColors.inkSoft)),
                        PlateBadge(entry.vehicle.plate),
                      ],
                    ),
                    if (entry.resolvedByJobId != null) ...[
                      const SizedBox(height: 8),
                      Text('Resolved by ${entry.resolvedByJobId}',
                          style: TextStyle(
                              color: AppColors.success,
                              fontWeight: FontWeight.w700)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              AppCard(
                color: verified ? AppColors.successSoft : AppColors.dangerSoft,
                borderColor: (verified ? AppColors.success : AppColors.danger)
                    .withValues(alpha: 0.3),
                child: Row(
                  children: [
                    Icon(
                        verified
                            ? Icons.verified_rounded
                            : Icons.gpp_bad_outlined,
                        color: verified ? AppColors.success : AppColors.danger),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        verified
                            ? 'Hash chain verified · ${entry.records.length} records, none edited'
                            : 'Hash chain broken – a record was changed',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color:
                              verified ? AppColors.success : AppColors.danger,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SectionTitle('Records'),
              for (var i = entry.records.length - 1; i >= 0; i--)
                _RecordCard(record: entry.records[i]),
            ],
          ),
          bottomNavigationBar: entry.status.isOpen
              ? BottomActionBar(
                  // One main action (Resolve). Note and status live in the ⋯ options sheet.
                  child: Row(
                    children: [
                      SizedBox(
                        width: 56,
                        height: 52,
                        child: OutlinedButton(
                          onPressed: () => _moreOptions(context, entry),
                          style: OutlinedButton.styleFrom(
                            padding: EdgeInsets.zero,
                            minimumSize: const Size(56, 52),
                          ),
                          child: Semantics(
                            label: 'More options',
                            child: const Icon(Icons.more_horiz_rounded),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: PrimaryButton(
                          label: 'Resolve issue',
                          icon: Icons.check_circle_outline_rounded,
                          height: 52,
                          onPressed: () => _resolve(context, entry),
                        ),
                      ),
                    ],
                  ),
                )
              : null,
        );
      },
    );
  }
}

class _RecordCard extends StatelessWidget {
  const _RecordCard({required this.record});
  final PassportRecord record;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Pill(
                  label: record.kind,
                  color: AppColors.primaryDark,
                  dense: true),
              const Spacer(),
              Text(Fmt.dateTime(record.at),
                  style: TextStyle(color: AppColors.muted, fontSize: 12)),
            ],
          ),
          const SizedBox(height: 8),
          Text(record.note, style: const TextStyle(height: 1.4)),
          if (record.symptoms.isNotEmpty ||
              record.codes.isNotEmpty ||
              record.evidenceCount > 0) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final s in record.symptoms)
                  Pill(
                      label: s,
                      color: AppColors.ink,
                      background: AppColors.field,
                      dense: true),
                for (final c in record.codes)
                  Pill(label: c, color: AppColors.danger, dense: true),
                if (record.evidenceCount > 0)
                  Pill(
                    label: '${record.evidenceCount} evidence',
                    color: AppColors.info,
                    icon: Icons.photo_library_outlined,
                    dense: true,
                  ),
              ],
            ),
          ],
          const SizedBox(height: 8),
          Text(
            '${record.mechanic}${record.mileageKm != null ? ' · ${Fmt.km(record.mileageKm!)}' : ''}'
            '${record.jobId != null ? ' · ${record.jobId}' : ''}',
            style: TextStyle(color: AppColors.inkSoft, fontSize: 12.5),
          ),
          const SizedBox(height: 4),
          Text(
            'hash ${HashChain.short(record.hash)} ← prev ${HashChain.short(record.prevHash)}',
            style: TextStyle(
                fontFamily: 'monospace', fontSize: 11, color: AppColors.muted),
          ),
        ],
      ),
    );
  }
}
