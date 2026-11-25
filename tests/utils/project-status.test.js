"use strict";

const status = require("../../src/utils/project-status");

const project = (applicationStatus, projectStatus = null) => ({ status: applicationStatus, projectStatus });

describe("project-status helpers", () => {
  test("only a grant notice that was not stopped counts as approved", () => {
    expect(status.isApproved(project("grantNotice"))).toBe(true);
    expect(status.isApproved(project("grantNotice", "inImplementation"))).toBe(true);
    expect(status.isApproved(project("grantNotice", "completed"))).toBe(true);
    expect(status.isApproved(project("grantNotice", "stoppedOrPostponed"))).toBe(false);
    expect(status.isApproved(project("sentToFunding"))).toBe(false);
    expect(status.isApproved(project("rejectionNotice", "inImplementation"))).toBe(false);
    expect(status.isApproved(project(null))).toBe(false);
  });

  test("in progress, submitted and granted projects are counted, rejected and stopped are not", () => {
    expect(status.isCounted(project(null))).toBe(true);
    expect(status.isCounted(project("sentToFunding"))).toBe(true);
    expect(status.isCounted(project("grantNotice", "completed"))).toBe(true);
    expect(status.isCounted(project("rejectionNotice"))).toBe(false);
    expect(status.isCounted(project("grantNotice", "stoppedOrPostponed"))).toBe(false);
    expect(status.isCounted(project("sentToFunding", "stoppedOrPostponed"))).toBe(false);
  });

  test("a stopped project is not counted as submitted, a rejected one is", () => {
    expect(status.isSubmitted(project("rejectionNotice"))).toBe(true);
    expect(status.isSubmitted(project("grantNotice", "completed"))).toBe(true);
    expect(status.isSubmitted(project("grantNotice", "stoppedOrPostponed"))).toBe(false);
    expect(status.isSubmitted(project(null))).toBe(false);
  });

  test("the funnel puts each project in exactly one stage", () => {
    expect(status.funnelKey(project(null))).toBe("inProgress");
    expect(status.funnelKey(project("sentToFunding"))).toBe("sentToFunding");
    expect(status.funnelKey(project("grantNotice"))).toBe("grantNotice");
    expect(status.funnelKey(project("grantNotice", "inImplementation"))).toBe("inImplementation");
    expect(status.funnelKey(project("grantNotice", "completed"))).toBe("completed");
    expect(status.funnelKey(project("sentToFunding", "stoppedOrPostponed"))).toBe("stoppedOrPostponed");
    expect(status.funnelKey(project("rejectionNotice", "inImplementation"))).toBe("rejectionNotice");
  });
});
