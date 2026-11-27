"use strict";

// `status` is the application outcome; `projectStatus` is what happens to the project afterwards.
const SENT_TO_FUNDING = "sentToFunding";
const GRANT_NOTICE = "grantNotice";
const REJECTION_NOTICE = "rejectionNotice";
const IN_IMPLEMENTATION = "inImplementation";
const COMPLETED = "completed";
const STOPPED = "stoppedOrPostponed";

const APPLICATION_STATUSES = [SENT_TO_FUNDING, GRANT_NOTICE, REJECTION_NOTICE];
const PROJECT_STATUSES = [IN_IMPLEMENTATION, COMPLETED, STOPPED];

const isStopped = (project) => project.projectStatus === STOPPED;

// Grant received and the project was not stopped afterwards.
const isApproved = (project) => project.status === GRANT_NOTICE && !isStopped(project);

// Still counted in totals and sums; null status means "in progress" on the platform.
const isCounted = (project) =>
  (project.status === null || project.status === SENT_TO_FUNDING || project.status === GRANT_NOTICE) &&
  !isStopped(project);

// Submitted for funding at some point, whatever the outcome.
const isSubmitted = (project) => project.status !== null && !isStopped(project);

const funnelKey = (project) => {
  if (isStopped(project)) return STOPPED;
  if (project.status === GRANT_NOTICE && project.projectStatus) return project.projectStatus;
  return project.status || "inProgress";
};

// The same rule as isCounted, as a Strapi filter.
const COUNTED_FILTER = {
  $and: [
    { $or: [{ status: null }, { status: { $in: [SENT_TO_FUNDING, GRANT_NOTICE] } }] },
    { $or: [{ projectStatus: null }, { projectStatus: { $ne: STOPPED } }] },
  ],
};

module.exports = {
  SENT_TO_FUNDING,
  GRANT_NOTICE,
  REJECTION_NOTICE,
  IN_IMPLEMENTATION,
  COMPLETED,
  STOPPED,
  APPLICATION_STATUSES,
  PROJECT_STATUSES,
  COUNTED_FILTER,
  isApproved,
  isCounted,
  isSubmitted,
  funnelKey,
};
