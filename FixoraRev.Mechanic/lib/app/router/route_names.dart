class RouteNames {
  RouteNames._();

  static const splash = '/';
  static const login = '/login';
  static const garagePin = '/garage-pin';
  static const quickLogin = '/quick-login';
  static const loading = '/loading';
  static const forgotPassword = '/forgot-password';
  static const register = '/register';
  static const otpVerification = '/verify-otp';
  static const acceptInvitation = '/invite/accept';
  static const expiredInvitation = '/invite/expired';
  static const shell = '/home';
  static const jobDetails = '/jobs/details';
  static const repair = '/jobs/repair';
  static const invoice = '/jobs/invoice';
  static const additionalRepair = '/jobs/additional-repair';
  static const inspectionCapture = '/fixproof/capture';
  static const reportReview = '/fixproof/review';
  static const repairProposal = '/jobs/proposal';
  static const evidencePassport = '/jobs/evidence';
  static const progressUpdate = '/jobs/progress';
  static const sosList = '/sos';
  static const sosDetail = '/sos/details';
  static const notifications = '/notifications';
  static const passport = '/passport';
  static const parts = '/parts';

  static String jobDetailsPath(String jobId) => '$jobDetails/$jobId';
  static String repairPath(String jobId) => '$repair/$jobId';
  static String invoicePath(String jobId) => '$invoice/$jobId';
  static String additionalRepairPath(String jobId) =>
      '$additionalRepair/$jobId';
  static String inspectionCapturePath(String jobId) =>
      '$inspectionCapture/$jobId';
  static String reportReviewPath(String jobId) => '$reportReview/$jobId';
  static String repairProposalPath(String jobId) => '$repairProposal/$jobId';
  static String evidencePassportPath(String jobId) =>
      '$evidencePassport/$jobId';
  static String progressUpdatePath(String jobId) => '$progressUpdate/$jobId';
  static String sosDetailPath(String requestId) => '$sosDetail/$requestId';
}
