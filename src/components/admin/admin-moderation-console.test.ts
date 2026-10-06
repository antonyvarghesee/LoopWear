import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  join(process.cwd(), "src/components/admin/admin-moderation-console.tsx"),
  "utf8",
);

describe("admin moderation console UI contracts", () => {
  it("offers only valid report transitions and bounds resolution notes", () => {
    expect(component).toMatch(/report\.status === "pending"[\s\S]*?\["reviewed", "resolved", "dismissed"\]/);
    expect(component).toMatch(/report\.status === "reviewed"[\s\S]*?\["resolved", "dismissed"\]/);
    expect(component).toMatch(/maxLength=\{2000\}/);
    expect(component).toMatch(/disabled=\{pending/);
    expect(component).toMatch(/role="alert"/);
    expect(component).toMatch(/inFlight\.current/);
    expect(component).toMatch(/\{report\.description\}/);
    expect(component).not.toMatch(/dangerouslySetInnerHTML/);
  });

  it("displays lifecycle and moderation states separately without treating hidden as removed", () => {
    expect(component).toMatch(/\{listing\.status\}/);
    expect(component).toMatch(/Lifecycle status/);
    expect(component).toMatch(/listing\.moderationState/);
    expect(component).toMatch(/listing\.moderationState === "hidden" \? "HIDDEN" : "CLEAR"/);
    expect(component).toMatch(/Hide listing/);
    expect(component).toMatch(/Clear moderation hide/);
    expect(component).not.toMatch(/moderationState[^;\n]*REMOVED/);
  });

  it("renders history as read-only and does not load private conversation or message content", () => {
    expect(component).toMatch(/Moderation history[\s\S]*?Read-only record/);
    expect(component).not.toMatch(/getConversation|from\(["']messages|from\(["']conversations/);
    expect(component).toMatch(/report\.target_type === "listing" \|\| report\.target_type === "user"/);
    const history = component.slice(
      component.indexOf("function ModerationHistory"),
      component.indexOf("export function AdminModerationConsole"),
    );
    expect(history).not.toMatch(/<Button|<form|moderate(?:Listing|Report|User)Action/);
  });

  it("provides distinct user moderation controls and safe error output", () => {
    expect(component).toMatch(/user\.moderationState === "suspended" \? "normal" : "suspended"/);
    expect(component).toMatch(/"normal"/);
    expect(component).toMatch(/"suspended"/);
    expect(component).toMatch(/Suspend user/);
    expect(component).toMatch(/Restore user/);
    expect(component).toMatch(/The account moderation state could not be updated/);
  });
});
