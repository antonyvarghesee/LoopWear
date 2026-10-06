"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { submitTrustSafetyReportAction } from "@/app/actions/trust-safety";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ReportTargetType = "user" | "listing" | "conversation" | "message";

export function ReportButton({
  targetType,
  targetId,
  label = "Report",
}: {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("safety");
  const [description, setDescription] = useState("");
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const result = await submitTrustSafetyReportAction({
        targetType,
        targetId,
        reason,
        description,
      });
      setFeedback({ success: result.success, message: result.success ? "Report submitted. Thank you." : result.error });
      if (result.success) setOpen(false);
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Flag className="mr-1 size-3.5" aria-hidden="true" />{label}
      </Button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`report-title-${targetId}`} className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-background p-6 shadow-xl">
            <div>
              <h2 id={`report-title-${targetId}`} className="text-lg font-semibold">Report {targetType}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Reports are reviewed privately by LoopWear.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`report-reason-${targetId}`} className="text-sm font-medium">Reason</label>
              <Select id={`report-reason-${targetId}`} value={reason} onChange={(event) => setReason(event.target.value)}>
                <option value="safety">Safety concern</option>
                <option value="harassment">Harassment</option>
                <option value="fraud">Fraud or scam</option>
                <option value="prohibited">Prohibited content</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`report-description-${targetId}`} className="text-sm font-medium">Details (optional)</label>
              <Textarea id={`report-description-${targetId}`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={4} />
            </div>
            {feedback && <p role={feedback.success ? "status" : "alert"} className="text-sm text-muted-foreground">{feedback.message}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" disabled={pending || !reason.trim()} onClick={submit}>{pending ? "Submitting..." : "Submit report"}</Button>
            </div>
          </section>
        </div>
      )}
      {feedback?.success && !open && <p role="status" className="sr-only">{feedback.message}</p>}
      {feedback && !feedback.success && !open && <p role="alert" className="sr-only">{feedback.message}</p>}
    </>
  );
}
