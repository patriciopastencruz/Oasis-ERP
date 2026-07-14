import { describe, expect, it } from "vitest";
import {
  approvalActionUrl,
  notificationActionPath,
  renderApprovalEmail,
} from "./approval-email-template";

describe("approval email notifications", () => {
  it("routes every current approval entity to its review module", () => {
    expect(notificationActionPath("payment_request", "abc")).toBe(
      "/finance/payment-control/approvals/abc",
    );
    expect(notificationActionPath("petty_cash_report", "abc")).toBe(
      "/finance/petty-cash/reviews/abc",
    );
    expect(notificationActionPath("inventory_change_request", "abc")).toBe(
      "/inventory/approvals",
    );
    expect(notificationActionPath("dist_change_request", "abc")).toBe(
      "/finance/distribution/requests",
    );
    expect(
      notificationActionPath(
        "payment_request",
        "abc",
        "payment_request.approved",
      ),
    ).toBe("/finance/payment-control/requests/abc");
  });

  it("builds stable production links without duplicate slashes", () => {
    expect(
      approvalActionUrl("https://oasis.example/", "payment_request", "1"),
    ).toBe("https://oasis.example/finance/payment-control/approvals/1");
  });

  it("escapes database content before rendering HTML", () => {
    const html = renderApprovalEmail({
      subject: "Aprobación <urgente>",
      body: '<script>alert("x")</script>',
      recipientName: "Ana & Pedro",
      actionUrl: "https://oasis.example/notifications?a=1&b=2",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Ana &amp; Pedro");
    expect(html).toContain("a=1&amp;b=2");
  });
});
