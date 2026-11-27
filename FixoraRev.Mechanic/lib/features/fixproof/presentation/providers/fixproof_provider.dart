import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/backend/mechanic_backend.dart';
import '../../domain/entities/inspection_issue.dart';
import '../../domain/entities/report_state.dart';

export '../../domain/entities/report_state.dart';

/// true = FixProof uses the garage backend (uploads, drafts, publish). false = demo data only.
bool get liveFixProof => MechanicBackend.instance.live;

/// App severity ↔ backend severity (the backend stores Safe / Attention / Urgent).
String backendSeverity(IssueSeverity s) => switch (s) {
      IssueSeverity.critical => 'Urgent',
      IssueSeverity.soon => 'Attention',
      IssueSeverity.ok => 'Safe',
    };

IssueSeverity appSeverity(String s) => switch (s) {
      'Urgent' => IssueSeverity.critical,
      'Safe' => IssueSeverity.ok,
      _ => IssueSeverity.soon,
    };

/// Capture state for one FixProof inspection session.
class CaptureState {
  const CaptureState({
    required this.media,
    required this.voiceNotes,
    required this.areas,
  });

  final List<CapturedMedia> media;
  final List<VoiceNote> voiceNotes;
  final Set<String> areas;

  /// Live: every photo must be uploaded and every voice note transcribed before drafting.
  bool get canGenerate {
    final mediaReady = liveFixProof ? media.any((m) => m.mediaRef != null) : media.isNotEmpty;
    final busy = media.any((m) => m.uploading) || voiceNotes.any((v) => v.busy);
    return mediaReady && voiceNotes.isNotEmpty && !busy;
  }

  CaptureState copyWith({
    List<CapturedMedia>? media,
    List<VoiceNote>? voiceNotes,
    Set<String>? areas,
  }) {
    return CaptureState(
      media: media ?? this.media,
      voiceNotes: voiceNotes ?? this.voiceNotes,
      areas: areas ?? this.areas,
    );
  }
}

class CapturedMedia {
  const CapturedMedia({
    required this.id,
    required this.label,
    required this.isVideo,
    this.mediaRef,
    this.previewUrl,
    this.uploading = false,
    this.error,
  });

  final String id;
  final String label;
  final bool isVideo;

  /// Server reference once the file is uploaded (live mode).
  final String? mediaRef;

  /// Signed link from GET /media/{mediaRef} used to show the picture.
  final String? previewUrl;
  final bool uploading;
  final String? error;

  CapturedMedia copyWith({String? mediaRef, String? previewUrl, bool? uploading, String? error}) => CapturedMedia(
        id: id,
        label: label,
        isVideo: isVideo,
        mediaRef: mediaRef ?? this.mediaRef,
        previewUrl: previewUrl ?? this.previewUrl,
        uploading: uploading ?? this.uploading,
        error: error,
      );
}

class VoiceNote {
  const VoiceNote({
    required this.id,
    required this.seconds,
    this.transcript,
    this.sttReason,
    this.busy = false,
  });

  final String id;
  final int seconds;

  /// Tamil transcript from the garage speech-to-text, once it has answered.
  final String? transcript;

  /// Why there is no transcript (server off, STT disabled, unclear audio…).
  final String? sttReason;

  /// Being sent to the server for transcription.
  final bool busy;

  String get duration {
    final m = (seconds ~/ 60).toString();
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  VoiceNote copyWith({String? transcript, String? sttReason, bool? busy}) => VoiceNote(
        id: id,
        seconds: seconds,
        transcript: transcript ?? this.transcript,
        sttReason: sttReason ?? this.sttReason,
        busy: busy ?? this.busy,
      );
}

class CaptureNotifier extends Notifier<CaptureState> {
  int _counter = 3;

  @override
  CaptureState build() => CaptureState(
        // Live: start empty, every photo is uploaded. Demo: sample items so the screen is not blank.
        media: liveFixProof
            ? const []
            : const [
                CapturedMedia(id: 'm1', label: 'Front-left pad', isVideo: false),
                CapturedMedia(id: 'm2', label: 'Disc surface', isVideo: false),
                CapturedMedia(id: 'm3', label: 'Brake test', isVideo: true),
              ],
        voiceNotes: const [],
        areas: const {'Brakes'},
      );

  void toggleArea(String area) {
    final next = Set<String>.from(state.areas);
    if (!next.remove(area)) next.add(area);
    state = state.copyWith(areas: next);
  }

  /// Takes a photo or video and uploads it to the job card (live). Demo: adds a placeholder.
  Future<void> addMedia({required String jobId, required bool isVideo, bool fromCamera = true}) async {
    final source = fromCamera ? ImageSource.camera : ImageSource.gallery;
    final picker = ImagePicker();
    final XFile? file = isVideo
        ? await picker.pickVideo(source: source, maxDuration: const Duration(minutes: 2))
        : await picker.pickImage(source: source, imageQuality: 85);
    if (file == null) return;

    _counter++;
    final id = 'm$_counter';
    final label = '${isVideo ? 'Video' : 'Photo'} $_counter';
    state = state.copyWith(
      media: [...state.media, CapturedMedia(id: id, label: label, isVideo: isVideo, uploading: liveFixProof)],
    );
    if (!liveFixProof) return;

    try {
      final bytes = await file.readAsBytes();
      final up = await MechanicBackend.instance.uploadFixProofMedia(
        jobId,
        bytes,
        filename: file.name,
        contentType: file.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg'),
      );
      _patchMedia(id, (m) => m.copyWith(mediaRef: up.mediaRef, previewUrl: up.previewUrl, uploading: false));
    } catch (e) {
      _patchMedia(id, (m) => m.copyWith(uploading: false, error: '$e'));
    }
  }

  void _patchMedia(String id, CapturedMedia Function(CapturedMedia) change) {
    state = state.copyWith(media: [for (final m in state.media) m.id == id ? change(m) : m]);
  }

  void removeMedia(String id) {
    state = state.copyWith(media: state.media.where((m) => m.id != id).toList());
  }

  /// Adds a recorded voice note. Live: the audio goes to the garage for Tamil speech-to-text.
  Future<void> addVoiceNote({required String jobId, required int seconds, List<int>? audio}) async {
    _counter++;
    final id = 'v$_counter';
    final wav = liveFixProof ? audio : null;
    state = state.copyWith(voiceNotes: [...state.voiceNotes, VoiceNote(id: id, seconds: seconds, busy: wav != null)]);
    if (wav == null) return;

    try {
      final (text, reason) = await MechanicBackend.instance.transcribe(jobId, wav);
      _patchVoice(id, (v) => v.copyWith(transcript: text, sttReason: reason, busy: false));
    } catch (e) {
      _patchVoice(id, (v) => v.copyWith(sttReason: '$e', busy: false));
    }
  }

  void _patchVoice(String id, VoiceNote Function(VoiceNote) change) {
    state = state.copyWith(voiceNotes: [for (final v in state.voiceNotes) v.id == id ? change(v) : v]);
  }

  void removeVoiceNote(String id) {
    state = state.copyWith(voiceNotes: state.voiceNotes.where((v) => v.id != id).toList());
  }

  /// Live: one AI draft per voice note, using the uploaded photos, then loads the drafts for review.
  Future<void> createDrafts(String jobId) async {
    final refs = [for (final m in state.media) if (m.mediaRef != null) m.mediaRef!];
    final component = state.areas.isEmpty ? 'General' : state.areas.first;
    for (final v in state.voiceNotes) {
      await MechanicBackend.instance.createDraft(
        jobId,
        component: component,
        transcript: v.transcript,
        language: 'ta',
        severity: 'Attention',
        mediaRefs: refs,
      );
    }
    await ref.read(reportDraftProvider.notifier).loadRemote(jobId);
  }

  /// Live: photos already uploaded for this job (GET .../fixproof/media), so they show after an app restart.
  Future<void> loadRemoteMedia(String jobId) async {
    if (!liveFixProof) return;
    try {
      final rows = await MechanicBackend.instance.listFixProofMedia(jobId);
      final urls = {
        for (final r in rows) r['mediaRef'] as String: MechanicBackend.absoluteMediaUrl(r['previewUrl'] as String?),
      };
      final known = state.media.map((m) => m.mediaRef).whereType<String>().toSet();
      final fresh = [
        for (final r in rows)
          if (!known.contains(r['mediaRef'])) CapturedMedia(
            id: 'srv-${r['id']}',
            label: (r['phase'] as String?) ?? 'Photo',
            isVideo: _looksLikeVideo(r['mediaRef'] as String?),
            mediaRef: r['mediaRef'] as String?,
            previewUrl: MechanicBackend.absoluteMediaUrl(r['previewUrl'] as String?),
          ),
      ];
      // Signed links expire after 15 minutes, so refresh the ones already on screen too.
      final refreshed = [
        for (final m in state.media)
          (m.mediaRef != null && urls[m.mediaRef] != null) ? m.copyWith(previewUrl: urls[m.mediaRef]) : m,
      ];
      state = state.copyWith(media: [...fresh, ...refreshed]);
    } catch (_) {
      // Offline or server error: keep what is on screen.
    }
  }

  static bool _looksLikeVideo(String? mediaRef) {
    final r = (mediaRef ?? '').toLowerCase();
    return const ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.3gp'].any(r.endsWith);
  }

  void reset() => state = build();
}

final captureProvider = NotifierProvider<CaptureNotifier, CaptureState>(CaptureNotifier.new);

/// The AI-drafted issues the mechanic reviews, edits and verifies.
/// Live: these are the job's FixProof drafts on the server. Demo: sample issues.
class ReportDraftNotifier extends Notifier<List<InspectionIssue>> {
  /// Server draft rows by id, kept for the fields the screen does not show (recommendation, component).
  final Map<String, Map<String, dynamic>> _remote = {};
  String? _jobId;

  @override
  List<InspectionIssue> build() => const [];

  String _requireJob() => _jobId ?? (throw StateError('No FixProof job is open.'));

  InspectionIssue _fromRemote(Map<String, dynamic> d) {
    final id = d['id'] as String;
    _remote[id] = d;
    final component = (d['component'] as String?) ?? 'General';
    final en = (d['findingEn'] as String?) ?? '';
    final ta = (d['findingTa'] as String?) ?? '';
    final photos = (d['mediaRefs'] as List?) ?? const [];
    final confirmed = d['status'] == 'Confirmed';
    return InspectionIssue(
      id: id,
      area: component,
      title: component,
      titleTa: component,
      detail: en.isEmpty ? ((d['transcript'] as String?) ?? '') : en,
      detailTa: ta.isEmpty ? en : ta,
      severity: appSeverity((d['severity'] as String?) ?? 'Attention'),
      evidenceLabels: [for (var i = 0; i < photos.length; i++) 'Photo ${i + 1}'],
      verified: confirmed,
      published: confirmed,
    );
  }

  /// Loads the job's drafts from the server into the review list.
  Future<void> loadRemote(String jobId) async {
    _jobId = jobId;
    if (!liveFixProof) return;
    final rows = await MechanicBackend.instance.listDrafts(jobId);
    state = [for (final d in rows) _fromRemote(d)];
  }

  /// Saves the draft's text to the server and returns the refreshed issue.
  Future<InspectionIssue> _putRemote(String id, {String? findingEn, String? findingTa, String? severity}) async {
    final cur = _remote[id]!;
    final body = await MechanicBackend.instance.updateDraft(
      _requireJob(),
      id,
      component: cur['component'] as String,
      findingEn: findingEn ?? (cur['findingEn'] as String? ?? ''),
      findingTa: findingTa ?? (cur['findingTa'] as String? ?? ''),
      recommendationEn: (cur['recommendationEn'] as String?) ?? '',
      recommendationTa: (cur['recommendationTa'] as String?) ?? '',
      severity: severity ?? (cur['severity'] as String? ?? 'Attention'),
    );
    return _fromRemote(body);
  }

  /// Local-only tick: "I checked this on the vehicle". Publishing confirms the ticked ones.
  void toggleVerified(String id) {
    state = [
      for (final i in state) i.id == id && !i.published ? i.copyWith(verified: !i.verified) : i,
    ];
  }

  Future<void> updateDetail(String id, {required bool tamil, required String text}) async {
    if (!liveFixProof) {
      state = [
        for (final i in state)
          i.id == id
              ? (tamil ? i.copyWith(detailTa: text, verified: false) : i.copyWith(detail: text, verified: false))
              : i,
      ];
      return;
    }
    final next = await _putRemote(id, findingEn: tamil ? null : text, findingTa: tamil ? text : null);
    state = [for (final i in state) i.id == id ? next : i];
  }

  Future<void> remove(String id) async {
    if (liveFixProof) await MechanicBackend.instance.discardDraft(_requireJob(), id);
    state = state.where((i) => i.id != id).toList();
  }

  /// Manual fallback when the AI draft is empty or the mechanic adds an extra finding.
  /// The server keeps one finding text, so the title is stored in front of the detail.
  Future<void> addManual({
    required String area,
    required String title,
    required String detail,
    required IssueSeverity severity,
  }) async {
    if (!liveFixProof) {
      final id = 'manual-${DateTime.now().millisecondsSinceEpoch}';
      state = [
        ...state,
        InspectionIssue(
          id: id,
          area: area,
          title: title,
          titleTa: title,
          detail: detail,
          detailTa: detail,
          severity: severity,
          evidenceLabels: const [],
        ),
      ];
      return;
    }
    final jobId = _requireJob();
    final created = await MechanicBackend.instance.createDraft(
      jobId,
      component: area,
      language: 'en',
      severity: backendSeverity(severity),
    );
    _remote[created['id'] as String] = created;
    final finding = '$title: $detail';
    final next = await _putRemote(created['id'] as String, findingEn: finding, findingTa: finding, severity: backendSeverity(severity));
    state = [...state, next];
  }

  /// Publishes every ticked issue. Live: confirms each draft on the server, so the manager and customer get it.
  /// Returns how many issues were published.
  Future<int> publishChecked() async {
    final ticked = [for (final i in state) if (i.verified && !i.published) i];
    if (!liveFixProof) return ticked.length;
    final jobId = _requireJob();
    for (final issue in ticked) {
      final body = await MechanicBackend.instance.confirmDraft(jobId, issue.id);
      final next = _fromRemote(body);
      state = [for (final i in state) i.id == issue.id ? next : i];
    }
    // The job's status moves on the server after publishing; pull the new state.
    if (ticked.isNotEmpty) MechanicBackend.instance.refreshJobs().catchError((Object _) {});
    return ticked.length;
  }
}

final reportDraftProvider =
    NotifierProvider<ReportDraftNotifier, List<InspectionIssue>>(ReportDraftNotifier.new);

/// true = show report in Tamil.
final reportTamilProvider = StateProvider<bool>((ref) => true);

/// FixProof report state per job id.
class ReportStateNotifier extends Notifier<Map<String, ReportState>> {
  @override
  Map<String, ReportState> build() => {};

  ReportState of(String jobId) => state[jobId] ?? ReportState.notStarted;

  void set(String jobId, ReportState value) => state = {...state, jobId: value};
}

final reportStateProvider =
    NotifierProvider<ReportStateNotifier, Map<String, ReportState>>(ReportStateNotifier.new);
