import { z } from "zod";
import type { AdBuilderState } from "@/components/ads/builder/types";

const urlSchema = z.string().trim().url({ message: "Must be a valid URL" }).max(2048);

export interface PublishIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
  section: "identity" | "creative" | "leadform" | "targeting" | "budget" | "destination";
}

export function validateForPublish(state: AdBuilderState): PublishIssue[] {
  const issues: PublishIssue[] = [];

  // Identity
  if (!state.pageId) issues.push({ field: "pageId", message: "Facebook Page is required", severity: "error", section: "identity" });
  if (!state.adAccountId) issues.push({ field: "adAccountId", message: "Ad Account is required", severity: "error", section: "identity" });

  // Creative
  const hasImage = state.media.some((m) => m.type === "image") || state.bankImages.some((m) => m.type === "image");
  if (!hasImage) issues.push({ field: "media", message: "At least one image creative is required", severity: "error", section: "creative" });

  const hasCopy = (state.primaryTexts ?? []).some((t) => (t ?? "").trim().length > 0) || (state.bankCopy ?? []).some((t) => t.trim().length > 0);
  if (!hasCopy) issues.push({ field: "primaryTexts", message: "Add at least one primary text", severity: "error", section: "creative" });

  for (const [i, t] of (state.primaryTexts ?? []).entries()) {
    if (t && t.length > 2000) issues.push({ field: `primaryTexts.${i}`, message: `Primary text #${i + 1} exceeds 2000 characters`, severity: "error", section: "creative" });
  }
  for (const [i, h] of (state.headlines ?? []).entries()) {
    if (h && h.length > 255) issues.push({ field: `headlines.${i}`, message: `Headline #${i + 1} exceeds 255 characters`, severity: "error", section: "creative" });
  }

  // Destination
  if (state.objective === "website") {
    if (!state.websiteUrl) {
      issues.push({ field: "websiteUrl", message: "Website URL is required for Website / Conversions ads", severity: "error", section: "destination" });
    } else if (!urlSchema.safeParse(state.websiteUrl).success) {
      issues.push({ field: "websiteUrl", message: "Website URL must be a valid https URL", severity: "error", section: "destination" });
    }
  }

  // Lead form
  if (state.objective === "leads") {
    const lf = state.leadForm;
    if (!lf) {
      issues.push({ field: "leadForm", message: "Lead form is required", severity: "error", section: "leadform" });
    } else if (lf.mode === "existing") {
      if (!lf.existingFormId) issues.push({ field: "leadForm.existingFormId", message: "Pick an existing lead form (or switch to Create new)", severity: "error", section: "leadform" });
    } else {
      if (!lf.name || lf.name.trim().length < 2) {
        issues.push({ field: "leadForm.name", message: "Lead form name is required", severity: "error", section: "leadform" });
      } else if (lf.name.length > 100) {
        issues.push({ field: "leadForm.name", message: "Lead form name must be under 100 characters", severity: "error", section: "leadform" });
      }
      if (!lf.privacyUrl) {
        issues.push({ field: "leadForm.privacyUrl", message: "Privacy Policy URL is required by Meta", severity: "error", section: "leadform" });
      } else if (!urlSchema.safeParse(lf.privacyUrl).success) {
        issues.push({ field: "leadForm.privacyUrl", message: "Privacy Policy URL must be a valid URL", severity: "error", section: "leadform" });
      }
      if (lf.followUpUrl && !urlSchema.safeParse(lf.followUpUrl).success) {
        issues.push({ field: "leadForm.followUpUrl", message: "Follow-up URL must be valid", severity: "error", section: "leadform" });
      }
      const qs = lf.questions ?? [];
      if (qs.length === 0) {
        issues.push({ field: "leadForm.questions", message: "Add at least one lead form question", severity: "error", section: "leadform" });
      } else {
        for (const [i, q] of qs.entries()) {
          if (!q.label || q.label.trim().length === 0) {
            issues.push({ field: `leadForm.questions.${i}`, message: `Question #${i + 1} is missing a label`, severity: "error", section: "leadform" });
          } else if (q.label.length > 100) {
            issues.push({ field: `leadForm.questions.${i}`, message: `Question #${i + 1} label exceeds 100 characters`, severity: "error", section: "leadform" });
          }
          if (q.type === "MULTIPLE_CHOICE" && (!q.options || q.options.length < 2)) {
            issues.push({ field: `leadForm.questions.${i}.options`, message: `Question #${i + 1}: multiple-choice requires at least 2 options`, severity: "error", section: "leadform" });
          }
        }
        const labels = qs.map((q) => q.label.trim().toLowerCase());
        if (new Set(labels).size !== labels.length) {
          issues.push({ field: "leadForm.questions", message: "Lead form questions must be unique", severity: "error", section: "leadform" });
        }
      }
      if (!lf.thankYou || lf.thankYou.trim().length === 0) {
        issues.push({ field: "leadForm.thankYou", message: "Thank-you message is recommended", severity: "warning", section: "leadform" });
      }
    }
  }

  // Targeting
  if (!state.countries || state.countries.length === 0) {
    issues.push({ field: "countries", message: "Select at least one country", severity: "error", section: "targeting" });
  }
  if (!state.specialAdCategory) {
    if (state.ageMin < 13 || state.ageMax > 65 || state.ageMin > state.ageMax) {
      issues.push({ field: "age", message: "Age range must be between 13–65 with min ≤ max", severity: "error", section: "targeting" });
    }
  }

  // Budget
  if (!state.budgetAmount || state.budgetAmount <= 0) {
    issues.push({ field: "budgetAmount", message: "Budget must be greater than 0", severity: "error", section: "budget" });
  } else if (state.budgetType === "daily" && state.budgetAmount < 1) {
    issues.push({ field: "budgetAmount", message: "Daily budget must be at least 1", severity: "error", section: "budget" });
  } else if (state.budgetType === "lifetime" && state.budgetAmount < 5) {
    issues.push({ field: "budgetAmount", message: "Lifetime budget must be at least 5", severity: "error", section: "budget" });
  } else if (state.budgetAmount < 5 && state.budgetType === "daily") {
    issues.push({ field: "budgetAmount", message: "Daily budgets below 5 may underperform", severity: "warning", section: "budget" });
  }

  return issues;
}

export const SECTION_LABELS: Record<PublishIssue["section"], string> = {
  identity: "Connected accounts",
  creative: "Creative",
  leadform: "Lead form",
  targeting: "Targeting",
  budget: "Budget",
  destination: "Destination",
};
