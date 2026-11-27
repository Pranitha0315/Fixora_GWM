import 'package:flutter/material.dart';

import '../../../../app/router/route_names.dart';
import '../../../../app/theme/app_colors.dart';
import '../../../../app/theme/app_typography.dart';
import '../../../../core/backend/fixora_config.dart';
import '../../../../core/backend/mechanic_backend.dart';
import '../../../../core/di/app_services.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/utils/nav.dart';
import '../../../../core/widgets/action_sheet.dart';
import '../../../../core/widgets/rev_common.dart' show EmptyState;
import '../../../../core/widgets/warm_ui.dart';
import '../../../jobs/domain/job_entities.dart';
import '../../../shell/presentation/main_shell.dart';
import '../../../sos/domain/sos_entities.dart';

/// Home ("Lilac Soft"): big greeting, job search, filter pills and today's jobs as soft
/// cards with the car on the left, like a product list.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _Category {
  const _Category(this.label, this.image, this.words);
  final String label;
  final String image; // unused in the pill style, kept for a picture variant

  /// Matched against the service type and the customer's symptoms.
  final List<String> words;
}

class _HomeScreenState extends State<HomeScreen> {
  static const _categories = [
    _Category('All', '', []),
    _Category('Service', '', ['service', 'oil', 'tune']),
    _Category('Brakes', '', ['brake', 'pad', 'disc']),
    _Category('Filters', '', ['filter', 'ac ', 'air']),
    _Category('Body', '', ['body', 'bumper', 'dent', 'paint', 'scratch']),
    _Category('Diagnose', '', ['diagnos', 'engine', 'noise', 'light', 'check', 'start']),
  ];

  static const _maxOnHome = 2;

  /// A car needs inspection while its job card is Open (waiting) or Inspecting.
  static bool _needsInspection(Job j) => j.status == JobStatus.waiting || j.status == JobStatus.diagnosing;

  final _search = TextEditingController();
  int _category = 0;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  bool _matches(Job j) {
    final text = '${j.serviceType} ${j.reportedSymptoms.join(' ')} ${j.vehicle.title} ${j.vehicle.plate} ${j.customer.name}'.toLowerCase();
    final q = _search.text.trim().toLowerCase();
    if (q.isNotEmpty && !text.contains(q)) return false;
    final words = _categories[_category].words;
    return words.isEmpty || words.any(text.contains);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        AppServices.auth,
        AppServices.jobs,
        AppServices.sos,
        AppServices.notifications,
        MechanicBackend.instance,
      ]),
      builder: (context, _) {
        final user = AppServices.auth.user;
        final jobsCtrl = AppServices.jobs;
        final current = jobsCtrl.currentJob;
        final sos = AppServices.sos.open;
        final onDuty = AppServices.auth.onDuty;
        final active = jobsCtrl.all.where((j) => j.status.isActive).length;
        // Home shows only the cars still waiting for their inspection, two at a time.
        // The full list lives on the Proof and Jobs tabs.
        final toInspect = jobsCtrl.queue.where(_needsInspection).where(_matches).toList();
        final today = toInspect.take(_maxOnHome).toList();

        return ColoredBox(
          color: AppColors.background,
          child: SafeArea(
            bottom: false,
            child: RefreshIndicator(
              color: AppColors.primaryStrong,
              onRefresh: MechanicBackend.instance.pullRefresh,
              child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 14, 20, MainShell.contentBottomGap),
              children: [
                // ---------------------------------------------------- top bar
                Row(
                  children: [
                    WarmIconButton(
                      icon: Icons.menu_rounded,
                      label: 'Profile and settings',
                      onTap: () => MainShell.switchTab(context, MainShell.profile),
                    ),
                    const Expanded(child: Center(child: FixoraRevWordmark(size: 15))),
                    WarmIconButton(
                      icon: Icons.notifications_none_rounded,
                      label: 'Alerts',
                      badge: AppServices.notifications.unread,
                      onTap: () => MainShell.openAlerts(context),
                    ),
                  ],
                ),
                const SizedBox(height: 22),

                // ---------------------------------------------------- title
                Semantics(
                  header: true,
                  child: Text('Hi ${user?.firstName ?? 'there'},\njobs for today', style: AppText.hero),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '$active open${current != null ? ' · ${current.bay}' : ''} · fix right, no comebacks.',
                        style: AppText.body.copyWith(color: AppColors.muted, fontSize: 14),
                      ),
                    ),
                    _DutyToggle(onDuty: onDuty),
                  ],
                ),
                const SizedBox(height: 16),

                // ---------------------------------------------------- search
                DecoratedBox(
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(26), boxShadow: AppColors.cardShadow),
                  child: TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Search job, plate or customer…',
                      filled: true,
                      fillColor: AppColors.surface,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(26), borderSide: BorderSide.none),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(26), borderSide: BorderSide.none),
                      contentPadding: const EdgeInsets.symmetric(vertical: 14),
                      prefixIcon: Icon(Icons.search_rounded, color: AppColors.ink),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear search',
                              icon: Icon(Icons.close_rounded, color: AppColors.muted),
                              onPressed: () => setState(_search.clear),
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 14),

                // ---------------------------------------------------- filters
                SizedBox(
                  height: 48,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    clipBehavior: Clip.none,
                    itemCount: _categories.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (context, i) => _FilterPill(
                      label: _categories[i].label,
                      selected: i == _category,
                      onTap: () => setState(() => _category = i),
                    ),
                  ),
                ),

                if (!MechanicBackend.instance.live) ...[
                  const SizedBox(height: 16),
                  const _DemoBanner(),
                ],
                if (sos.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  _SosCard(request: sos.first),
                ],
                const SizedBox(height: 18),

                // ---------------------------------------------------- jobs (cars to inspect)
                WarmSection(
                  'Needs inspection',
                  action: toInspect.length > _maxOnHome ? 'View all ${toInspect.length}' : null,
                  onAction: () => MainShell.switchTab(context, MainShell.fixProof),
                ),
                if (today.isEmpty)
                  SoftCard(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: _search.text.isNotEmpty || _category != 0
                        ? EmptyState(
                            compact: true,
                            icon: Icons.search_off_rounded,
                            title: 'No jobs match',
                            message: 'Nothing for "${_search.text.isEmpty ? _categories[_category].label : _search.text.trim()}" today.',
                            actionLabel: 'Show all jobs',
                            actionIcon: Icons.filter_alt_off_rounded,
                            onAction: () => setState(() {
                              _search.clear();
                              _category = 0;
                            }),
                          )
                        : !onDuty
                            ? EmptyState(
                                compact: true,
                                icon: Icons.bedtime_outlined,
                                title: 'You are off duty',
                                message: 'Go on duty so the manager can assign jobs to you.',
                                actionLabel: 'Go on duty',
                                actionIcon: Icons.play_arrow_rounded,
                                onAction: () => AppServices.auth.setOnDuty(true),
                              )
                            : EmptyState(
                                compact: true,
                                icon: Icons.car_repair_outlined,
                                title: 'No vehicles to inspect',
                                message: 'Cars waiting for inspection appear here by themselves. Pull down to check now.',
                                actionLabel: 'Check for jobs',
                                actionIcon: Icons.refresh_rounded,
                                onAction: MechanicBackend.instance.pullRefresh,
                              ),
                  )
                else ...[
                  Builder(builder: (_) {
                    final cutouts = Vehicle.uniqueCutoutsForJobs(
                      today.map((j) => (id: j.id, preferred: j.vehicle.preferredCutout)),
                    );
                    return Column(
                      children: [
                        for (final j in today) ...[
                          _JobTile(
                            job: j,
                            current: j.id == current?.id,
                            cutoutAsset: cutouts[j.id] ?? j.vehicle.cutoutAsset,
                          ),
                          const SizedBox(height: 14),
                        ],
                      ],
                    );
                  }),
                ],

                // ---------------------------------------------------- tools
                const WarmSection('Tools'),
                _ToolCard(
                  icon: Icons.sos_rounded,
                  title: 'Roadside SOS',
                  subtitle: sos.isEmpty ? 'No open calls' : '${sos.length} open call${sos.length == 1 ? '' : 's'}',
                  danger: sos.isNotEmpty,
                  onTap: () => context.pushRoute(RouteNames.sosList),
                ),
                const SizedBox(height: 8),
                Text('Tip: press and hold a job for quick actions. Pull down to refresh.',
                    textAlign: TextAlign.center, style: AppText.caption),
              ],
            ),
            ),
          ),
        );
      },
    );
  }
}

// ------------------------------------------------------------------ small parts

class _DutyToggle extends StatelessWidget {
  const _DutyToggle({required this.onDuty});
  final bool onDuty;

  @override
  Widget build(BuildContext context) {
    final fg = onDuty ? const Color(0xFF1D6B33) : AppColors.body;
    return Semantics(
      toggled: onDuty,
      button: true,
      label: onDuty ? 'On duty. Tap to go off duty' : 'Off duty. Tap to go on duty',
      excludeSemantics: true,
      child: Material(
        color: onDuty ? (AppColors.isDark ? const Color(0xFF12301C) : const Color(0xFFE3F4E6)) : AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: () => AppServices.auth.setOnDuty(!onDuty),
          child: Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 9,
                  height: 9,
                  decoration: BoxDecoration(color: onDuty ? const Color(0xFF22A355) : AppColors.muted, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Text(onDuty ? 'On duty' : 'Off duty', style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 13)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: 'Show $label jobs',
      excludeSemantics: true,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryStrong : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
          boxShadow: selected ? null : AppColors.cardShadow,
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
              child: Text(label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: selected ? (AppColors.isDark ? AppColors.background : Colors.white) : AppColors.body,
                  )),
            ),
          ),
        ),
      ),
    );
  }
}

/// One job as a soft card: car on the left, what to do, when, and a round arrow.
class _JobTile extends StatelessWidget {
  const _JobTile({required this.job, required this.current, required this.cutoutAsset});
  final Job job;
  final bool current;
  final String cutoutAsset;

  (String, WarmTone) get _badge => switch (job.status) {
        JobStatus.inProgress => ('In progress', WarmTone.amber),
        JobStatus.diagnosing => ('Inspecting', WarmTone.amber),
        JobStatus.awaitingApproval => ('Awaiting review', WarmTone.red),
        JobStatus.waiting => (current ? 'Now' : 'Next', WarmTone.neutral),
        JobStatus.completed => ('Done', WarmTone.green),
      };

  @override
  Widget build(BuildContext context) {
    final eta = AppServices.jobs.etaFor(job);
    final when = !job.status.isActive
        ? 'Done'
        : current
            ? 'Now'
            : Fmt.time(eta ?? job.slotTime);
    final (badge, tone) = _badge;
    void open() => context.pushRoute(RouteNames.jobDetails, extra: job.id);
    void more() => showJobQuickActions(context, job);

    return Semantics(
      button: true,
      label: '${job.vehicle.title}, ${job.serviceType}, ${job.vehicle.plate}, $badge, $when',
      excludeSemantics: true,
      onLongPress: more,
      onLongPressHint: 'Quick actions',
      child: GestureDetector(
        onLongPress: more,
        child: SoftCard(
        onTap: open,
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 112,
              height: 104,
              decoration: BoxDecoration(color: AppColors.surfaceAlt, borderRadius: BorderRadius.circular(20)),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: CarOnPedestal(asset: cutoutAsset, height: 104),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  WarmBadge(badge, tone: tone),
                  const SizedBox(height: 6),
                  Text(job.vehicle.title,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: AppColors.ink, letterSpacing: -0.2)),
                  const SizedBox(height: 2),
                  Text('${job.serviceType} · ${job.vehicle.plate}',
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, height: 1.3, color: AppColors.body)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(child: Text(when, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.ink))),
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(color: AppColors.primaryStrong, shape: BoxShape.circle),
                        child: Icon(Icons.arrow_forward_rounded, color: AppColors.isDark ? AppColors.background : Colors.white, size: 20),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  const _ToolCard({required this.icon, required this.title, required this.subtitle, required this.onTap, this.danger = false});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '$title, $subtitle',
      excludeSemantics: true,
      child: Container(
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppColors.cardShadow),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: danger ? AppColors.dangerBright : AppColors.primarySoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, size: 22, color: danger ? Colors.white : AppColors.onPrimarySoft),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.ink)),
                        Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.caption),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right_rounded, color: AppColors.muted),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SosCard extends StatelessWidget {
  const _SosCard({required this.request});
  final SosRequest request;

  @override
  Widget build(BuildContext context) {
    final dark = AppColors.isDark;
    return Semantics(
      button: true,
      label: 'Roadside SOS, ${request.issue}, ${request.locationLabel}',
      excludeSemantics: true,
      child: Material(
        color: dark ? const Color(0xFF2A1215) : const Color(0xFFFDE8E4),
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => context.pushRoute(RouteNames.sosDetail, extra: request.id),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: AppColors.dangerBright, borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.sos_rounded, color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Roadside SOS · ${request.status.label}',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: AppColors.danger)),
                      const SizedBox(height: 2),
                      Text('${request.issue} · ${request.locationLabel}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppColors.ink)),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right_rounded, color: AppColors.danger),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Shown while the app runs on demo data: nothing reaches the manager or the customer.
class _DemoBanner extends StatelessWidget {
  const _DemoBanner();

  @override
  Widget build(BuildContext context) {
    final dark = AppColors.isDark;
    return Semantics(
      container: true,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: dark ? const Color(0xFF33270A) : const Color(0xFFFDEBD3),
          borderRadius: BorderRadius.circular(22),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.cloud_off_rounded, color: dark ? const Color(0xFFFCD34D) : const Color(0xFF8A4A0A)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Demo mode: not connected to the garage',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: AppColors.ink)),
                  const SizedBox(height: 3),
                  Text(
                    'Jobs and updates are not reaching the manager. '
                        'Start the server (${FixoraConfig.apiBase}) and sign in with your employee ID.',
                    style: TextStyle(fontSize: 12.5, height: 1.35, color: AppColors.body),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Long-press menu for a job (Home and Jobs): the common next steps in one bottom sheet.
Future<void> showJobQuickActions(BuildContext context, Job job) {
  return showActionSheet(
    context,
    title: '${job.vehicle.title} · ${job.vehicle.plate}',
    subtitle: '${job.serviceType} · ${job.customer.name}',
    actions: [
      SheetAction(
        icon: Icons.open_in_new_rounded,
        label: 'Open job card',
        onTap: () => context.pushRoute(RouteNames.jobDetails, extra: job.id),
      ),
    ],
  );
}
